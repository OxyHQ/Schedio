import { usePathname, useSegments } from 'expo-router';
import { useMemo } from 'react';
import { routeMatchers, ROUTE_PATTERNS } from '@/utils/routeUtils';

export interface RouteDetectionResult {
  pathname: string | null;
  segments: string[];
  isSettingsRoute: boolean;
  isSettingsIndexRoute: boolean;
  isNestedSettingsRoute: boolean;
  isComposeRoute: boolean;
  isQueueRoute: boolean;
  isAnalyticsRoute: boolean;
  isAccountsRoute: boolean;
  isIndexRoute: boolean;
  postId: string | null;
}

export function useRouteDetection(): RouteDetectionResult {
  const pathname = usePathname();
  const segments = useSegments();

  return useMemo(() => {
    const isSettingsRoute = routeMatchers.isSettingsRoute(pathname);
    const isSettingsIndexRoute =
      pathname === '/(main)/settings' ||
      pathname?.endsWith('/settings');
    const isNestedSettingsRoute = isSettingsRoute && !isSettingsIndexRoute;
    const isComposeRoute = routeMatchers.isComposeRoute(pathname);
    const isQueueRoute = routeMatchers.isQueueRoute(pathname);
    const isAnalyticsRoute = routeMatchers.isAnalyticsRoute(pathname);
    const isAccountsRoute = routeMatchers.isAccountsRoute(pathname);

    const lastSegment = segments[segments.length - 1];
    const isIndexRoute = (
      pathname === '/(main)' ||
      pathname === '/(main)/' ||
      pathname === '/' ||
      (String(lastSegment) === 'index' && !isSettingsRoute)
    ) && !isComposeRoute;

    const postIdMatch = pathname?.match(ROUTE_PATTERNS.POST);
    const postId = postIdMatch?.[1] || null;

    return {
      pathname: pathname || null,
      segments,
      isSettingsRoute,
      isSettingsIndexRoute,
      isNestedSettingsRoute,
      isComposeRoute,
      isQueueRoute,
      isAnalyticsRoute,
      isAccountsRoute,
      isIndexRoute,
      postId,
    };
  }, [pathname, segments]);
}
