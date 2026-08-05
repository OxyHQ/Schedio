<h1 align="center">Schedio</h1>

<p align="center">
  Compose once, queue it, and let it publish across every social account you have connected.
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/bun-workspaces-440151?style=flat-square&logo=bun&logoColor=white">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-56-440151?style=flat-square&logo=expo&logoColor=white">
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.85-440151?style=flat-square&logo=react&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-440151?style=flat-square&logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Mongoose-440151?style=flat-square&logo=mongodb&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-440151?style=flat-square&logo=typescript&logoColor=white">
</p>

<p align="center">
  <b>One codebase, three targets.</b><br>
  The same Expo app runs on web, iOS and Android, against an Express API<br>
  that never stores a password because identity comes from Oxy.
</p>

---

<table>
<tr>
<td valign="top" width="50%">

### 📮 Scheduling that survives a bad night

A post moves through `draft`, `scheduled`, `published` or `failed`, and carries a retry count so a provider outage does not silently swallow it.

`PublishingSchedule` holds the time slots, so you set the rhythm once and drop posts into the queue rather than picking a timestamp every time.

</td>
<td valign="top" width="50%">

### 🔗 Five networks, one composer

`SocialAccount` connects Twitter, Instagram, Facebook, LinkedIn and Mastodon, each with its own tokens and refresh window.

One post targets several accounts at once. `PostAnalytics` records what each of them did with it afterwards.

</td>
</tr>
</table>

## Packages

Bun workspaces, three of them:

| Package | What it is |
|---|---|
| [`@schedio/frontend`](packages/frontend/) | The Expo app. Expo Router, NativeWind 5, Zustand, i18next, and [`@oxyhq/bloom`](https://www.npmjs.com/package/@oxyhq/bloom) for tokens and primitives |
| [`@schedio/backend`](packages/backend/) | The Express API. Mongoose models, rate limiting, validation, and route level Oxy auth |
| [`@schedio/shared-types`](packages/shared-types/) | The DTOs both sides agree on. Compiled by `postinstall`, before anything else runs |

Sign in, sessions and user records come from the Oxy platform through [`@oxyhq/services`](https://www.npmjs.com/package/@oxyhq/services) in the app and [`@oxyhq/core`](https://www.npmjs.com/package/@oxyhq/core) on the server. Every protected route resolves its user with `getRequiredOxyUserId` from `@oxyhq/core/server`, so no user id is ever taken from the request body. See [github.com/OxyHQ/oxy](https://github.com/OxyHQ/oxy).

## Quick start

```bash
bun install            # postinstall builds @schedio/shared-types
bun run dev            # frontend and backend together
```

Or one at a time:

```bash
bun run dev:frontend   # Expo
bun run dev:backend    # Express with nodemon
bun run web            # Expo straight to the browser
```

You will need Node 18 or newer and a MongoDB instance. Environment variables are documented in the [backend](packages/backend/README.md) and [frontend](packages/frontend/README.md) package READMEs.

> [!NOTE]
> Schedio is a Bun workspace. Use `bun`, not `npm` or `yarn`: the root scripts are all `bun run --filter`, and the lockfile is `bun.lock`.

<details>
<summary><b>All workspace scripts</b></summary>

<br>

```bash
bun run build               # every package
bun run build:shared-types
bun run build:frontend      # static web export
bun run build:backend
bun run start:frontend
bun run start:backend
bun run lint
bun run clean               # build artifacts and node_modules
```

Per package scripts live in each package's own `package.json`. The frontend adds `ios`, `android` and `web`; the backend adds `migrate`.

</details>

<details>
<summary><b>What is in the app</b></summary>

<br>

Routes under `packages/frontend/app/`:

| Screen | Path |
|---|---|
| Dashboard | `(main)/index.tsx` |
| Composer | `(main)/compose.tsx` |
| Queue and calendar | `(main)/queue.tsx` |
| Analytics | `(main)/analytics.tsx` |
| Connected accounts | `(main)/accounts.tsx` |
| Post detail | `(main)/post/` |
| Search | `(main)/search/` |
| Profile | `(main)/@[username].tsx` |
| Settings | `(main)/settings/` (appearance, language, privacy, profile customisation) |
| Sign in | `(auth)/` |

The interface ships in English, Spanish and Italian (`packages/frontend/locales/`), and follows the system light or dark theme through the appearance store.

</details>

<details>
<summary><b>What is in the API</b></summary>

<br>

Routes in `packages/backend/src/routes/`: `posts`, `queue`, `analytics`, `socialAccounts`, `profileSettings`.

Models in `packages/backend/src/models/`: `Post`, `PostAnalytics`, `PublishingSchedule`, `SocialAccount`, `UserSettings`, `UserBehavior`, `Block`, `Restrict`.

Full endpoint documentation is in the [backend README](packages/backend/README.md).

</details>

## Contributing

Issues and pull requests are welcome. Branch, change one thing, run `bun run lint`, open the pull request.

<br>

<div align="center">
<sub>built by <a href="https://oxy.so">Oxy</a></sub>
</div>
