// Base URLs
export const API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.schedio.app/api'
    : (process.env.API_URL ?? 'http://localhost:3000/api');

export const OXY_BASE_URL =
  process.env.EXPO_PUBLIC_OXY_BASE_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.oxy.so' : 'http://localhost:3001');

// Schedio's registered Oxy OAuth client id (ApplicationCredential publicKey).
// Required by @oxyhq/services >=10 for the web cold-boot / cross-app SSO flow:
// without it the SDK falls back to the page origin as client_id, which the Oxy
// IdP rejects with `invalid_request`. Public and safe to commit; set per-env via
// EXPO_PUBLIC_OXY_CLIENT_ID. Register the app (and allowed origins) at console.oxy.so.
export const OXY_CLIENT_ID =
  process.env.EXPO_PUBLIC_OXY_CLIENT_ID ??
  'oxy_dk_7ff4d2ae48044a4abe5e914cf5055520c71ce964d7f84098';

// Stripe Payment Links (open in browser)
export const STRIPE_LINK_PLUS = process.env.EXPO_PUBLIC_STRIPE_LINK_PLUS || '';
export const STRIPE_LINK_FILE = process.env.EXPO_PUBLIC_STRIPE_LINK_FILE || '';
