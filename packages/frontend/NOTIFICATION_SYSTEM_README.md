# Notification System

This document describes the notification system implemented for Schedio, including database schema, API endpoints, frontend components, and integration patterns.

## Overview

The notification system is designed to:
- Store minimal data in the database (action, content ID, user ID, etc.)
- Transform notifications on the frontend using translations
- Provide comprehensive internationalization (i18n) support

## Database Schema

The notification model stores minimal data that gets transformed on the frontend:

```typescript
interface INotification {
  recipientId: string;    // User receiving the notification
  actorId: string;        // User who performed the action
  type: string;           // like, reply, mention, follow, repost, quote, welcome
  entityId: string;       // ID of the post/reply/profile
  entityType: string;     // post, reply, profile
  read: boolean;          // Whether notification has been read
  createdAt: Date;        // Timestamp
}
```

## Backend Implementation

### API Endpoints

- `GET /notifications` — Fetch user notifications with pagination
- `POST /notifications` — Create a new notification
- `PUT /notifications/:id/read` — Mark notification as read
- `PUT /notifications/read-all` — Mark all notifications as read
- `DELETE /notifications/:id` — Delete a notification

## Frontend Implementation

### Components

#### NotificationItem
Displays individual notifications with proper formatting and translations.

#### Notifications Screen
Main screen for viewing notifications — handles fetching, mark-as-read, and translations.

### Hooks

#### useNotificationActions
Hook for creating notifications when user actions occur:

```tsx
const { notifyLike, notifyReply, notifyRepost, notifyFollow } = useNotificationActions();
```

### Services

#### notificationService
Handles API communication for notifications:

```typescript
const { notifications, unreadCount } = await notificationService.getNotifications();
await notificationService.markAsRead(notificationId);
```

## Internationalization (i18n)

### Supported Languages
- English (en)
- Spanish (es)
- Italian (it)

### Translation Keys

```json
{
  "notification.like": "{{actorName}} liked your post",
  "notification.reply": "{{actorName}} replied to your post",
  "notification.mention": "{{actorName}} mentioned you",
  "notification.follow": "{{actorName}} started following you",
  "notification.repost": "{{actorName}} reposted your post",
  "notification.quote": "{{actorName}} quoted your post",
  "notification.mark_all_read": "Mark all as read",
  "notification.empty.title": "No notifications yet"
}
```

## Best Practices

### Database
- Keep notification data minimal
- Use indexes for performance
- Handle duplicate prevention
- Don't create notifications for self-actions

### Frontend
- Always use translations for user-facing text
- Handle notification failures gracefully
- Use the provided hooks for consistency

### User Experience
- Show unread counts in navigation
- Allow bulk actions (mark all read)
- Provide clear notification types with distinct icons
- Support multiple languages
