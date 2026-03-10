# Schedio

> A modern, cross-platform social media scheduling tool built with Expo, React Native, TypeScript, and a Node.js/Express backend in a monorepo structure.

---

## Table of Contents
- [About](#about)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development Scripts](#development-scripts)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## About

**Schedio** is a Buffer-style social media scheduling platform that lets you compose, schedule, and publish posts across multiple social networks from a single dashboard. Built with Expo, React Native, and a Node.js backend in a modern monorepo structure, it supports file-based routing, multi-language support, and a responsive UI that works on web, iOS, and Android.

### Key Features

- **Multi-Platform Publishing** — Connect Twitter/X, Instagram, Facebook, LinkedIn, Mastodon and schedule posts across all of them
- **Post Queue & Calendar** — Visual calendar and drag-and-drop queue for managing scheduled content
- **Analytics Dashboard** — Track post performance, engagement metrics, and audience growth
- **Post Composer** — Rich composer with media attachments, polls, location, threads, and article content
- **Publishing Schedules** — Create custom time slot schedules for automatic posting
- **Draft Management** — Save and organize drafts for later
- **Responsive Design** — Sidebar on desktop, bottom bar on mobile — works everywhere
- **Theming** — Light/dark/system modes with multiple color themes
- **Multi-Language** — English, Spanish, Italian supported via i18next

## Project Structure

This is a **monorepo** using npm workspaces:

```
/
├── packages/
│   ├── frontend/        # Expo React Native app
│   │   ├── app/         # Screens and routing
│   │   │   ├── (main)/  # Main app screens
│   │   │   │   ├── index.tsx       # Dashboard
│   │   │   │   ├── compose.tsx     # Post composer
│   │   │   │   ├── queue.tsx       # Queue / calendar
│   │   │   │   ├── analytics.tsx   # Analytics
│   │   │   │   ├── accounts.tsx    # Social accounts
│   │   │   │   ├── settings/       # Settings screens
│   │   │   │   └── post/[id].tsx   # Post detail/edit
│   │   │   ├── (auth)/  # Authentication screens
│   │   │   └── ...
│   │   ├── components/  # UI components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── stores/      # State management (Zustand)
│   │   ├── styles/      # Theme and color system
│   │   ├── locales/     # i18n translation files
│   │   └── utils/       # Utility functions
│   ├── backend/         # Node.js/Express API server
│   │   └── src/
│   │       ├── models/      # MongoDB models (Post, SocialAccount, etc.)
│   │       ├── routes/      # API routes (posts, accounts, analytics, queue)
│   │       ├── middleware/  # Express middleware
│   │       └── utils/       # Utility functions
│   └── shared-types/    # Shared TypeScript types
├── package.json         # Root package.json with workspaces
└── tsconfig.json        # Root TypeScript config
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm 8+
- MongoDB instance
- Expo CLI for mobile development

### Initial Setup
1. **Clone the repository**
   ```bash
   git clone https://github.com/OxyHQ/Schedio.git
   cd Schedio
   ```

2. **Install all dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables** — See backend and frontend READMEs for required env vars.

### Development

#### Start All Services
```bash
npm run dev
```

#### Start Individual Services
```bash
# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```

#### Frontend Development
The frontend is an Expo React Native app that can run on:
- **Web**: `npm run web` (or `npm run dev:frontend` then press 'w')
- **iOS**: `npm run ios` (requires macOS and Xcode)
- **Android**: `npm run android` (requires Android Studio)

#### Backend Development
```bash
npm run dev:backend
```

## Development Scripts

### Root Level (Monorepo)
- `npm run dev` — Start all services in development mode
- `npm run dev:frontend` — Start frontend development server
- `npm run dev:backend` — Start backend development server
- `npm run build` — Build all packages
- `npm run build:shared-types` — Build shared types package
- `npm run build:frontend` — Build frontend for production
- `npm run build:backend` — Build backend for production
- `npm run test` — Run tests across all packages
- `npm run lint` — Lint all packages
- `npm run clean` — Clean all build artifacts
- `npm run install:all` — Install dependencies for all packages

### Frontend (`@schedio/frontend`)
- `npm start` — Start Expo development server
- `npm run android` — Run on Android device/emulator
- `npm run ios` — Run on iOS simulator
- `npm run web` — Run in web browser
- `npm run build-web` — Build static web output
- `npm run lint` — Lint codebase

### Backend (`@schedio/backend`)
- `npm run dev` — Start development server with hot reload
- `npm run build` — Build the project
- `npm run start` — Start production server
- `npm run lint` — Lint codebase

### Shared Types (`@schedio/shared-types`)
- `npm run build` — Build TypeScript types
- `npm run dev` — Watch and rebuild types

## API Documentation

The Schedio API is a REST backend built with Express.js and TypeScript, providing endpoints for post management, social account connections, analytics, and queue management. Authentication is handled by the Oxy platform.

For detailed API information, see:
- [Backend README](packages/backend/README.md) — Complete API documentation
- [Frontend README](packages/frontend/README.md) — Frontend implementation details

## Contributing

Contributions are welcome! Please open issues or pull requests for bug fixes, features, or improvements.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting: `npm run test && npm run lint`
5. Submit a pull request

## License

This project is licensed under the MIT License.
