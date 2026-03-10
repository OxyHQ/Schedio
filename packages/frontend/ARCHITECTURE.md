# Architecture & Best Practices

This document outlines the architecture and best practices followed in the Schedio frontend (Expo SDK 55).

## Expo Router Best Practices

### 1. File-Based Routing
- Routes are defined by the file system structure
- Use route groups `(main)` for organization without affecting URLs
- Dynamic routes use `[id].tsx` syntax
- Nested routes are created through folder structure

### 2. Code Splitting & Performance
- **React.lazy()** for dynamic imports of heavy components
- **Suspense** boundaries with proper loading fallbacks (`LoadingFallback` component)
- Components are split at route boundaries for optimal bundle size
- Shared components in `components/shared/` for reusability

### 3. Route Detection
- Custom hook `useRouteDetection()` centralizes route detection logic
- Uses `usePathname()` and `useSegments()` from Expo Router
- Type-safe route matching through utility functions
- Route patterns defined in `utils/routeUtils.ts` with `ROUTE_PATTERNS`

### 4. Layout Structure
- Layouts use `Stack` and `Slot` components appropriately
- Responsive layouts handle mobile/tablet/desktop breakpoints
- Breakpoints defined in `constants/responsive.ts`
- Two-pane layouts for large screens, stack navigation for mobile

### 5. Component Organization
- Clear separation of concerns
- Reusable components extracted to `components/shared/`
- Types defined in dedicated `types/` directory
- Utils for business logic in `utils/` directory
- Constants in `constants/` directory

## Route Structure

```
app/
├── _layout.tsx              # Root layout
├── (main)/
│   ├── _layout.tsx          # Main layout (responsive sidebar + content)
│   ├── index.tsx            # Dashboard — upcoming posts overview
│   ├── compose.tsx          # Post composer
│   ├── queue.tsx            # Queue / calendar view
│   ├── analytics.tsx        # Analytics dashboard
│   ├── accounts.tsx         # Social accounts management
│   ├── settings/
│   │   ├── index.tsx        # Settings main screen
│   │   ├── appearance.tsx   # Theme, color, app icon
│   │   ├── language.tsx     # Language selection
│   │   └── privacy.tsx      # Privacy settings
│   └── post/
│       └── [id].tsx         # Post detail/edit
├── (auth)/
│   ├── _layout.tsx          # Auth layout
│   └── index.tsx            # Sign in / sign up
└── +not-found.tsx           # 404 screen
```

## Navigation

### Desktop (>= 768px)
- **SideBar** (`components/SideBar/index.tsx`) with nav items:
  Dashboard, Compose, Queue, Analytics, Accounts, Settings

### Mobile (< 768px)
- **BottomBar** (`components/layout/BottomBar.tsx`) with nav items:
  Dashboard, Compose, Queue, Analytics, Settings

### Route Utilities (`utils/routeUtils.ts`)
- Route constants (`ROUTES`) — all main app routes
- Route pattern matching (`ROUTE_PATTERNS`) for dynamic routes like `/post/:id`
- Route matching utilities (`routeMatchers`) — `isComposeRoute`, `isQueueRoute`, `isAnalyticsRoute`, `isAccountsRoute`, `isSettingsRoute`

### Route Detection Hook (`hooks/useRouteDetection.ts`)
- Returns typed `RouteDetectionResult` with boolean flags for each route
- Memoized for performance
- Used by layouts to determine active navigation state

## Key Utilities & Constants

### `constants/responsive.ts`
- Breakpoint constants (`BREAKPOINTS`)
- Screen size utilities
- Consistent responsive values across app

### `components/shared/`
- **LoadingFallback.tsx**: Suspense fallback component
- **EmptyState.tsx**: Reusable empty state component

## Performance Optimizations

1. **Memoization**: Heavy computations with `useMemo`, callbacks with `useCallback`
2. **Code Splitting**: Route-based code splitting with `React.lazy()`
3. **Conditional Rendering**: Components only render when needed based on screen size
4. **Type Safety**: Full TypeScript coverage prevents runtime errors

## Responsive Design

- **Mobile (< 768px)**: Stack navigation, single-pane, bottom bar
- **Tablet/Desktop (>= 768px)**: Two-pane layout with sidebar

Breakpoints defined in `constants/responsive.ts` for consistency.
