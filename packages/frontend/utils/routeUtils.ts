export const ROUTES = {
  HOME: '/',
  COMPOSE: '/(main)/compose',
  QUEUE: '/(main)/queue',
  ANALYTICS: '/(main)/analytics',
  ACCOUNTS: '/(main)/accounts',
  SETTINGS: '/(main)/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RouteValue = (typeof ROUTES)[RouteKey];

export interface RouteMatchOptions {
  exact?: boolean;
  startsWith?: boolean;
  endsWith?: boolean;
  includes?: boolean;
}

export const isRouteActive = (
  pathname: string | null | undefined,
  route: string,
  options: RouteMatchOptions = {}
): boolean => {
  if (!pathname) return false;
  const { exact = false, startsWith = false, endsWith = false, includes = false } = options;
  if (route === ROUTES.HOME) {
    return pathname === '/' || pathname === '';
  }
  if (exact || (!startsWith && !endsWith && !includes)) {
    return pathname === route;
  }
  if (startsWith) return pathname.startsWith(route);
  if (endsWith) return pathname.endsWith(route);
  if (includes) return pathname.includes(route);
  return false;
};

export const ROUTE_PATTERNS = {
  COMPOSE: /\/compose/,
  QUEUE: /\/queue/,
  ANALYTICS: /\/analytics/,
  ACCOUNTS: /\/accounts/,
  PROFILE: /^\/@([^/]+)$/,
  SETTINGS: /\/settings/,
  POST: /\/post\/([^/]+)$/,
} as const;

export const routeMatchers = {
  isHomeRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return pathname === '/' || pathname === '';
  },
  isComposeRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.COMPOSE.test(pathname);
  },
  isQueueRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.QUEUE.test(pathname);
  },
  isAnalyticsRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.ANALYTICS.test(pathname);
  },
  isAccountsRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.ACCOUNTS.test(pathname);
  },
  isSettingsRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.SETTINGS.test(pathname);
  },
  isProfileRoute: (pathname: string | null | undefined): boolean => {
    if (!pathname) return false;
    return ROUTE_PATTERNS.PROFILE.test(pathname);
  },
};
