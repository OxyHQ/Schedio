# @schedio/frontend

> The frontend package of the Schedio monorepo — A cross-platform social media scheduling app built with Expo, React Native, and TypeScript.

---

## About

This is the **frontend package** of the **Schedio** monorepo. Schedio is a Buffer-style social media scheduling platform. This package contains the complete React Native application that runs on Android, iOS, and Web.

## Features

### Content Management
- **Post Composer** — Rich text editor with media attachments, polls, location, threads, and articles
- **Draft Management** — Save, organize, and resume drafts
- **Post Queue** — Visual queue and calendar for scheduling content
- **Multi-Platform Publishing** — Schedule posts to multiple social accounts at once

### Dashboard & Analytics
- **Dashboard** — Overview of upcoming scheduled posts and recent activity
- **Analytics** — Track engagement metrics, impressions, reach, and clicks per post and platform
- **Social Accounts** — Connect and manage Twitter/X, Instagram, Facebook, LinkedIn, Mastodon

### User Experience
- **Universal App** — Android, iOS, and Web from a single codebase
- **Responsive Design** — Sidebar navigation on desktop, bottom bar on mobile
- **Theming** — Light, dark, and system modes with multiple color themes
- **Multi-Language** — English, Spanish, Italian via i18next
- **Notifications** — Push and in-app notifications

## Tech Stack
- [Expo](https://expo.dev/) SDK 55 & React Native
- TypeScript
- NativeWind (Tailwind CSS for React Native)
- Zustand (state management)
- React Query (server state)
- i18next (internationalization)
- Expo Router (file-based routing)

## Project Structure
```
├── app/                # Screens and routing
│   ├── (main)/         # Main app screens
│   │   ├── index.tsx       # Dashboard
│   │   ├── compose.tsx     # Post composer
│   │   ├── queue.tsx       # Queue / calendar
│   │   ├── analytics.tsx   # Analytics dashboard
│   │   ├── accounts.tsx    # Social accounts
│   │   ├── settings/       # Settings (appearance, language, privacy)
│   │   └── post/[id].tsx   # Post detail/edit
│   └── (auth)/         # Authentication screens
├── components/         # UI components
│   ├── layout/         # Header, BottomBar, FloatingActionButton
│   ├── SideBar/        # Desktop sidebar navigation
│   ├── post/           # Post composer components
│   ├── notifications/  # Notification components
│   ├── common/         # Common UI components
│   ├── shared/         # EmptyState, LoadingFallback
│   └── ui/             # Base UI primitives
├── hooks/              # Custom React hooks
├── stores/             # Zustand state stores
├── styles/             # Theme, colors, color themes
├── locales/            # i18n translation files (en, es, it)
├── utils/              # Utility functions
├── lib/                # Library code
├── assets/             # Images, icons, fonts
└── constants/          # App-wide constants
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm 8+
- Expo CLI (optional, but recommended)
- For iOS: macOS with Xcode
- For Android: Android Studio

### Development Setup

#### From the Monorepo Root (Recommended)
```bash
git clone https://github.com/OxyHQ/Schedio.git
cd Schedio
npm run install:all
npm run dev:frontend
```

#### From This Package Directory
```bash
cd packages/frontend
npm install
npm start
```

### Running the App

- **Web**: Press `w` in the terminal or run `npm run web`
- **iOS**: Press `i` or run `npm run ios` (requires macOS)
- **Android**: Press `a` or run `npm run android`
- **Expo Go**: Scan the QR code with the Expo Go app

### Environment Setup

Create a `.env` file in this package directory:

```env
# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3000

# Analytics (optional)
EXPO_PUBLIC_POSTHOG_KEY=your_posthog_key
```

## Development Scripts

- `npm start` — Start Expo development server
- `npm run android` — Run on Android device/emulator
- `npm run ios` — Run on iOS simulator
- `npm run web` — Run in web browser
- `npm run build-web` — Build static web output
- `npm run lint` — Lint codebase
- `npm run test` — Run tests

## Navigation

### Desktop (>= 768px)
Sidebar with: Dashboard, Compose, Queue, Analytics, Accounts, Settings

### Mobile (< 768px)
Bottom bar with: Dashboard, Compose, Queue, Analytics, Settings

## Monorepo Integration

This package is part of the Schedio monorepo and integrates with:

- **@schedio/backend**: API server for data and scheduling
- **@schedio/shared-types**: Shared TypeScript type definitions
- **@oxyhq/services**: Oxy platform authentication and user management

## Contributing

Contributions are welcome! Please see the [main README](../../README.md) for contributing guidelines.

## License

This project is licensed under the MIT License.
