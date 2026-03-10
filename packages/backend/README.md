# @schedio/backend

> The backend package of the Schedio monorepo — A social media scheduling API built with Express.js and TypeScript.

---

## Overview

This is the **backend package** of the **Schedio** monorepo. Schedio is a Buffer-style social media scheduling platform. The backend provides the API service for post management, social account connections, analytics, queue management, and user settings. Authentication is handled by the Oxy platform.

### Key Features

- **Post Management** — Create, schedule, publish, and manage posts across multiple platforms
- **Social Account Connections** — Connect and manage Twitter/X, Instagram, Facebook, LinkedIn, Mastodon accounts
- **Analytics** — Track post performance and engagement metrics per platform
- **Queue Management** — Manage posting queues with custom publishing schedules
- **Publishing Schedules** — Define time slots for automatic post publishing

## Tech Stack

- Node.js with TypeScript
- Express.js for REST API
- MongoDB with Mongoose for data storage
- Oxy Services for authentication (users managed by Oxy platform)

## Getting Started

### Prerequisites

- Node.js 18+ and npm 8+
- MongoDB instance
- Git

### Development Setup

#### Option 1: From the Monorepo Root (Recommended)
```bash
git clone https://github.com/OxyHQ/Schedio.git
cd Schedio
npm run install:all
npm run dev:backend
```

#### Option 2: From This Package Directory
```bash
cd packages/backend
npm install
npm run dev
```

### Environment Configuration

Create a `.env` file in this package directory:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# Authentication
OXY_API_URL=https://api.oxy.so

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=https://schedio.app
```

### Running the API

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

All authenticated endpoints require a Bearer token from Oxy. The backend uses `@oxyhq/services` for authentication middleware.

### Health Check

#### GET /api/health
- Public endpoint
- Returns: `{ status: "ok", service: "schedio-backend" }`

### Posts

#### GET /api/posts
- Get all posts for the authenticated user
- Query params: `status` (draft|scheduled|published|failed), `limit`, `offset`
- Returns: `{ posts: Post[] }`

#### GET /api/posts/:id
- Get a specific post by ID
- Returns: `Post`

#### POST /api/posts
- Create a new post
- Body:
```json
{
  "content": {
    "text": "Post content here",
    "media": [{ "id": "media_id", "type": "image" }],
    "poll": {
      "question": "Poll question",
      "options": ["Option 1", "Option 2"],
      "endTime": "2024-01-22T00:00:00.000Z"
    },
    "location": {
      "type": "Point",
      "coordinates": [-73.935242, 40.730610],
      "address": "New York, NY"
    }
  },
  "platforms": ["social_account_id_1", "social_account_id_2"],
  "status": "draft",
  "scheduledAt": "2024-01-15T10:00:00.000Z",
  "hashtags": ["social", "marketing"]
}
```

#### PUT /api/posts/:id
- Update a post
- Body: Partial post fields

#### DELETE /api/posts/:id
- Delete a post

#### POST /api/posts/:id/publish
- Publish a post immediately to connected platforms

### Social Accounts

#### GET /api/accounts
- Get all connected social accounts for the authenticated user
- Returns: `{ accounts: SocialAccount[] }`

#### POST /api/accounts
- Connect a new social account
- Body:
```json
{
  "platform": "twitter",
  "platformUserId": "12345",
  "platformUsername": "myhandle",
  "accessToken": "...",
  "refreshToken": "...",
  "tokenExpiresAt": "2024-06-01T00:00:00.000Z",
  "profileImageUrl": "https://..."
}
```

#### DELETE /api/accounts/:id
- Disconnect a social account

### Analytics

#### GET /api/analytics/overview
- Get aggregated analytics for the authenticated user
- Query params: `period` (7d|30d|90d)
- Returns: `{ overview: AnalyticsOverview }`

#### GET /api/analytics/posts/:id
- Get analytics for a specific post
- Returns: `{ analytics: PostAnalytics[] }`

### Queue

#### GET /api/queue
- Get the posting queue for the authenticated user
- Returns: `{ queue: Post[], schedule: PublishingSchedule }`

#### PUT /api/queue/reorder
- Reorder posts in the queue
- Body: `{ postIds: ["id1", "id2", "id3"] }`

### Profile Settings

#### GET /api/profile/settings/me
- Get current user's settings
- Returns: `UserSettings`

#### PUT /api/profile/settings
- Update current user's settings
- Body:
```json
{
  "appearance": {
    "themeMode": "light" | "dark" | "system",
    "primaryColor": "#000000",
    "colorTheme": "classic"
  },
  "privacy": {
    "profileVisibility": "public" | "private" | "followers_only",
    "allowMentions": true,
    "showOnlineStatus": true
  }
}
```

#### GET /api/profile/blocks
- Get list of blocked users

#### POST /api/profile/blocks
- Block a user — Body: `{ "blockedId": "user_id" }`

#### DELETE /api/profile/blocks/:blockedId
- Unblock a user

## Database Schema

### Post

```typescript
{
  userId: string,           // Oxy user ID
  content: {
    text: string,
    media: MediaItem[],
    poll?: PollData,
    location?: GeoJSONPoint,
    sources?: Source[],
    article?: ArticleData,
    attachments?: Attachment[]
  },
  platforms: ObjectId[],    // Refs to SocialAccount
  status: "draft" | "scheduled" | "published" | "failed",
  scheduledAt?: Date,
  publishedAt?: Date,
  hashtags: string[],
  retryCount: number,
  createdAt: Date,
  updatedAt: Date
}
```

### SocialAccount

```typescript
{
  userId: string,           // Oxy user ID
  platform: "twitter" | "instagram" | "facebook" | "linkedin" | "mastodon",
  platformUserId: string,
  platformUsername: string,
  accessToken: string,
  refreshToken?: string,
  tokenExpiresAt?: Date,
  profileImageUrl?: string,
  isActive: boolean,
  connectedAt: Date
}
```

### PostAnalytics

```typescript
{
  postId: ObjectId,
  platform: string,
  metrics: {
    likes: number,
    shares: number,
    comments: number,
    impressions: number,
    reach: number,
    clicks: number
  },
  fetchedAt: Date
}
```

### PublishingSchedule

```typescript
{
  userId: string,
  name: string,
  slots: [{ dayOfWeek: number, time: string }],
  timezone: string,
  isDefault: boolean
}
```

## Development Scripts

- `npm run dev` — Start development server with hot reload
- `npm run build` — Build the project
- `npm run start` — Start production server
- `npm run lint` — Lint codebase
- `npm run clean` — Clean build artifacts

## Monorepo Integration

This package is part of the Schedio monorepo and integrates with:

- **@schedio/frontend**: React Native application
- **@schedio/shared-types**: Shared TypeScript type definitions

### Shared Dependencies
- Uses `@schedio/shared-types` for type safety across packages
- Integrates with `@oxyhq/services` for authentication

## Notes

- **No User Management**: Users are managed by the Oxy platform. The backend only stores Oxy user IDs.
- **Authentication**: All authenticated endpoints use Oxy's authentication middleware.
- **Database**: MongoDB with database name `schedio-{NODE_ENV}` (e.g., `schedio-production`).
