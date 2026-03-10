# @schedio/shared-types

Shared TypeScript types for the Schedio social media scheduling platform. This package contains all the interfaces, enums, and types shared between the frontend and backend applications to ensure type consistency.

## Overview

Schedio is a Buffer-style social media scheduling tool where users can compose, schedule, and publish posts across multiple social networks. This package provides comprehensive type definitions for all core functionality.

## Architecture

The platform uses **Oxy** for user authentication and user data management. All user-related data is linked to Oxy users via `oxyUserId` fields.

## Package Structure

```
src/
├── common.ts          # Common utility types and enums
├── profile.ts         # Profile-related types
├── post.ts           # Post types (content, scheduling, publishing)
├── interaction.ts    # User interaction types (likes, reposts, etc.)
├── feed.ts          # Feed and timeline types
├── media.ts         # Media content types
├── notification.ts  # Notification system types
├── list.ts          # User list types
├── analytics.ts     # Analytics and metrics types
└── index.ts         # Main export file
```

## Core Types

### Post Types (`post.ts`)
- **Post**: Main post interface (content, scheduling, multi-platform publishing)
- **PostType**: Text, Image, Video, Poll, Repost, Quote
- **PostContent**: Text, images, videos, polls, location
- **PostVisibility**: Public, Followers Only, Private
- **PollData**: Poll questions, options, and voting data

### Profile Types (`profile.ts`)
- **Profile**: Main profile interface linked to Oxy users
- **ProfileType**: Personal, Business, Creator, Verified
- **ProfileVisibility**: Public, Private, Followers Only

### Analytics Types (`analytics.ts`)
- **AnalyticsData**: Generic analytics data points
- **UserAnalytics**: User-specific metrics and insights
- **PostAnalytics**: Post performance metrics
- **AudienceAnalytics**: Follower demographics and behavior

### Interaction Types (`interaction.ts`)
- **Like**, **Repost**, **Comment**, **Follow**, **Block/Mute**, **Bookmark**, **Report**

### Feed Types (`feed.ts`)
- **Feed**: Generic feed interface
- **FeedType**: Home, Explore, Trending, User Profile, etc.

### Notification Types (`notification.ts`)
- **Notification**: Generic notification interface
- **NotificationType**: Like, Repost, Comment, Follow, Mention, etc.

## Oxy Integration

All user-related data is linked to Oxy users via `oxyUserId` fields:
- Profiles are linked to Oxy users
- Posts are authored by Oxy users
- Interactions are performed by Oxy users
- Notifications are sent to Oxy users

## Usage

### Installation

```bash
npm install @schedio/shared-types
```

### Import Types

```typescript
import {
  Post,
  Profile,
  InteractionType,
  FeedType,
  NotificationType
} from '@schedio/shared-types';
```

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

## Contributing

When adding new types:
1. Follow the existing naming conventions
2. Use `oxyUserId` for user references
3. Add comprehensive JSDoc comments
4. Update this README if adding new major features
5. Ensure all types are exported from `index.ts`

## License

UNLICENSED - Private package for Schedio platform
