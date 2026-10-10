/**
 * Performance Hooks
 * Common performance optimization patterns used throughout the app
 */

import { useCallback, useMemo, useRef } from 'react';

/**
 * Debounce hook for expensive operations
 * Prevents function calls until delay has passed since last call
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => unknown,
  delay: number,
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay],
  );
}

/**
 * Throttle hook for frequent events
 * Limits function calls to once per delay period
 */
export function useThrottle<Args extends unknown[]>(
  callback: (...args: Args) => unknown,
  delay: number,
): (...args: Args) => void {
  const lastRunRef = useRef<number>(0);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      if (now - lastRunRef.current >= delay) {
        lastRunRef.current = now;
        callback(...args);
      }
    },
    [callback, delay],
  );
}

/**
 * Stable reference hook
 * Returns a stable reference that only changes when dependencies change
 */
export function useStableRef<T>(value: T, deps: React.DependencyList): T {
  // biome-ignore lint/correctness/useExhaustiveDependencies: forwards the caller-supplied dependency list, like the React hook it wraps
  return useMemo(() => value, deps);
}

/**
 * Memoized callback that only changes when dependencies change
 * Similar to useCallback but with better type inference
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps: React.DependencyList,
): T {
  // biome-ignore lint/correctness/useExhaustiveDependencies: forwards the caller-supplied dependency list, like the React hook it wraps
  return useCallback(callback, deps);
}
