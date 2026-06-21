/**
 * Navigation-related type definitions
 */

import type { RouteValue } from '@/utils/routeUtils';

export interface NavigationItem {
  title: string;
  icon: React.ReactNode;
  iconActive: React.ReactNode;
  route: RouteValue;
  onPress?: () => void;
}

export interface NavigationItemConfig {
  title: string;
  route: string;
  getIcon: (isActive: boolean) => React.ReactNode;
  onPress?: () => void;
}




