import { oxyClient } from '@oxyhq/core';
import { Platform } from 'react-native';
import axios from 'axios';
import { API_URL } from '@/config';
import { CircuitBreaker } from '@/lib/api/retryLogic';

// API Configuration
const API_CONFIG = {
  baseURL: API_URL,
};

// Authenticated client for the Schedio backend. The SDK linked client carries the
// device-first session and transparently re-mints the access token on 401, so no
// app-local Authorization header plumbing is needed (Oxy SDK rule). It is bound to
// the backend's own base URL (not the Oxy API that oxyClient itself targets).
// Explicit annotation keeps the emitted type portable under composite builds
// (the HttpService type isn't exported from the @oxyhq/core barrel).
const backendClient: ReturnType<typeof oxyClient.getClient> =
  oxyClient.createLinkedClient({ baseURL: API_CONFIG.baseURL }).client;

// Same linked client, exported for callers that talk to the backend directly.
const authenticatedClient: ReturnType<typeof oxyClient.getClient> = backendClient;

// Circuit breaker to prevent cascading failures
// Opens after 5 consecutive failures, stays open for 30 seconds
const apiCircuitBreaker = new CircuitBreaker(5, 60000, 30000);

// Request deduplication cache - prevents duplicate simultaneous requests
// WhatsApp/Telegram pattern: if same request is in flight, return same promise
const pendingRequests = new Map<string, Promise<unknown>>();

function createRequestKey(method: string, endpoint: string, params?: unknown): string {
  return `${method}:${endpoint}:${JSON.stringify(params || {})}`;
}

async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // Check if this exact request is already in flight
  const pending = pendingRequests.get(key);
  if (pending) {
    // The cache is heterogeneous; the key guarantees this is the same request type.
    return pending as Promise<T>;
  }

  // Execute new request and cache the promise
  const promise = requestFn().finally(() => {
    // Clean up after request completes (success or error)
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

// Public API client (no authentication required)
const publicClient = axios.create({
  baseURL: API_CONFIG.baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout to prevent indefinite hangs
});

// API methods using backendClient for local backend (conversations, messages, etc.)
// NOTE: This calls your local backend at http://localhost:3000/api, NOT the Oxy API
export const api = {
  // The linked client returns the parsed response body directly (not an axios
  // envelope), so wrap it back into `{ data }` to preserve this module's contract.
  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<{ data: T }> {
    const key = createRequestKey('GET', endpoint, params);
    const data = await deduplicateRequest(key, () =>
      apiCircuitBreaker.execute(() =>
        backendClient.get<T>(endpoint, { params })
      )
    );
    return { data };
  },

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    // Don't deduplicate POST requests as they may have side effects
    const data = await apiCircuitBreaker.execute(() =>
      backendClient.post<T>(endpoint, body)
    );
    return { data };
  },

  async put<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    // Don't deduplicate PUT requests as they may have side effects
    const data = await apiCircuitBreaker.execute(() =>
      backendClient.put<T>(endpoint, body)
    );
    return { data };
  },

  async delete<T = unknown>(endpoint: string): Promise<{ data: T }> {
    // Don't deduplicate DELETE requests as they may have side effects
    const data = await apiCircuitBreaker.execute(() =>
      backendClient.delete<T>(endpoint)
    );
    return { data };
  },

  async patch<T = unknown>(endpoint: string, body?: unknown): Promise<{ data: T }> {
    // Don't deduplicate PATCH requests as they may have side effects
    const data = await apiCircuitBreaker.execute(() =>
      backendClient.patch<T>(endpoint, body)
    );
    return { data };
  },
};

export class ApiError extends Error {
  constructor(message: string, public status?: number, public response?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export function webAlert(
  title: string,
  message: string,
  buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }>
) {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      const result = window.confirm(`${title}\n\n${message}`);
      if (result) {
        const confirmButton = buttons.find(btn => btn.style !== 'cancel');
        confirmButton?.onPress?.();
      } else {
        const cancelButton = buttons.find(btn => btn.style === 'cancel');
        cancelButton?.onPress?.();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      buttons?.[0]?.onPress?.();
    }
  } else {
    const { Alert } = require('react-native');
    Alert.alert(title, message, buttons);
  }
}

export const healthApi = {
  async checkHealth<T = unknown>(): Promise<T> {
    const response = await api.get<T>('/api/health');
    return response.data;
  },
};

// Profiles API - Telegram-style: Frontend calls backend, backend calls Oxy
export const profilesApi = {
  async getByUsername<T = unknown>(username: string): Promise<T> {
    const response = await api.get<T>(`/api/profiles/username/${username}`);
    return response.data;
  },

  async getById<T = unknown>(id: string): Promise<T> {
    const response = await api.get<T>(`/api/profiles/${id}`);
    return response.data;
  },

  async search<T = unknown>(query: string, limit: number = 20): Promise<T> {
    const response = await api.get<T>('/api/profiles/search', { q: query, limit });
    return response.data;
  },

  async getRecommendations<T = unknown>(): Promise<T> {
    const response = await api.get<T>('/api/profiles/recommendations');
    return response.data;
  },
};

// Files API - Telegram-style: Frontend calls backend, backend calls Oxy
export const filesApi = {
  async getFileUrl(fileId: string, size: 'thumb' | 'full' | string = 'full'): Promise<string> {
    const response = await api.get<{ url: string }>(`/api/files/url/${fileId}`, { size });
    return response.data.url;
  },

  async uploadFile<T = unknown>(file: unknown, options?: unknown): Promise<T> {
    const response = await api.post<T>('/api/files/upload', { file, options });
    return response.data;
  },
};

// Public API methods (no authentication required)
export const publicApi = {
  async get<T = unknown>(endpoint: string, params?: Record<string, unknown>): Promise<{ data: T }> {
    const response = await publicClient.get(endpoint, { params });
    return { data: response.data };
  },
};

export { API_CONFIG, authenticatedClient, publicClient };
