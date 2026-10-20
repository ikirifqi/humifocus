# HumiFocus

[![CI](https://github.com/ikirifqi/humifocus/actions/workflows/ci.yml/badge.svg)](https://github.com/ikirifqi/humifocus/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

A simple focus timer for people who constantly switch context. Pick what you are working on, and HumiFocus keeps time, notes, and history for every switch, so your day stays organized and tracked.

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/home-dark.png" />
	<img alt="HumiFocus timing a project, with today's totals below the clock" src="docs/screenshots/home-light.png" />
</picture>

## Features

- **One-click context switching.** Choose a project and the timer starts; switching closes the previous session automatically.
- **Pause and resume** without losing the session.
- **Session notes.** Jot down what you did or where you left off, attached to the running session.
- **Projects** with colors and the time logged on each.
- **Analytics** over 7, 30, or 90 days: total focus, daily average, time per project, a day-by-day history with notes, and CSV export.
- **Prayer timetable** for the next prayer and the whole month, with regional calculation methods for Jakarta, Kuala Lumpur, Dubai, Cairo, Istanbul, London, and New York.
- **Synced and offline-ready.** Your data follows your account across devices, and keeps working without a connection.
- **Light and dark themes.**

## Screenshots

| Switch projects                                                              | Notes for the running session                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ![Project picker with today's time per project](docs/screenshots/picker.png) | ![Notes added during the session](docs/screenshots/notes.png) |

| Analytics                                                                               | Prayer timetable                                         |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ![Analytics with totals, time per project, and history](docs/screenshots/analytics.png) | ![Monthly prayer timetable](docs/screenshots/prayer.png) |

## Tech stack

- [SvelteKit](https://svelte.dev/docs/kit) with Svelte 5 runes and TypeScript, compiled to a static single-page app
- [Firebase Authentication](https://firebase.google.com/docs/auth) for email and password sign-in
- [Cloud Firestore](https://firebase.google.com/docs/firestore) for data, with an offline cache
- [Cloudflare Pages](https://pages.cloudflare.com) for hosting, deployed from GitHub Actions

## Getting started

You need [Node.js](https://nodejs.org) 26 or later (pinned in `.node-version`) and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/ikirifqi/humifocus.git
cd humifocus
pnpm install
pnpm dev
```

The app opens at <http://localhost:5173>. Create an account on the sign-in screen to start.

> [!NOTE]
> Out of the box the app talks to the project's own Firebase backend. To develop against your own data, [use your own Firebase project](#use-your-own-firebase-project).

### Scripts

| Command        | Purpose                                       |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Start the dev server                          |
| `pnpm build`   | Build the static SPA into `build/`            |
| `pnpm preview` | Serve the production build locally            |
| `pnpm check`   | Type-check Svelte and TypeScript sources      |
| `pnpm lint`    | Check formatting (Prettier) and lint (ESLint) |
| `pnpm format`  | Format all files with Prettier                |

## How it works

HumiFocus has no server of its own. The browser talks to Firebase directly, and `firestore.rules` makes sure each signed-in user can only read and write their own data.

Each user's data lives under `users/{uid}` in Firestore:

| Path                        | Holds                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `users/{uid}`               | Settings and the running timer, so a timer started on one device shows on all of them |
| `users/{uid}/projects/{id}` | Project name, color, and creation time                                                |
| `users/{uid}/sessions/{id}` | Finished sessions: project, start and end, time counted, and notes                    |

The app state in `src/lib/app.svelte.ts` mirrors live Firestore snapshots, and Firestore's local cache applies writes immediately, so the app stays responsive offline and catches up when the connection returns.

## Use your own Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com) and add a web app to it.
2. Under **Authentication**, enable the **Email/Password** sign-in provider.
3. Create a **Cloud Firestore** database.
4. Replace the config in `src/lib/firebase.ts` with your web app's config, and the project ID in `.firebaserc` with yours.
5. Deploy the security rules:

   ```sh
   pnpm dlx firebase-tools login
   pnpm dlx firebase-tools deploy --only firestore:rules
   ```

6. When you deploy the app, add its domain to **Authentication > Settings > Authorized domains**. `localhost` is allowed by default.

## Deployment

`pnpm build` writes a static SPA to `build/`, which any static host can serve if it falls back to `index.html` for unknown routes.

This repository deploys to [Cloudflare Pages](https://pages.cloudflare.com) with GitHub Actions:

- **CI** (`.github/workflows/ci.yml`) lints, type-checks, and builds every push and pull request.
- **Deploy** (`.github/workflows/deploy.yml`) runs by hand from the **Actions** tab on `main`. Enter a version such as `1.2.0` and it runs the checks, deploys the build to Cloudflare Pages, tags the commit `v1.2.0`, and publishes a GitHub release with the build attached. Versions with a suffix, such as `1.3.0-beta.1`, become prereleases.

To deploy a fork, add these repository secrets under **Settings > Secrets and variables > Actions**:

| Secret                  | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token with the **Account > Cloudflare Pages > Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                                                       |

The Pages project is named `humifocus` and is created on the first release. To use another name, set a `CLOUDFLARE_PROJECT_NAME` repository variable.

## Contributing

Contributions are welcome. Please read [AGENTS.md](AGENTS.md) first: it covers the project's architecture rules and its commit conventions (atomic [Conventional Commits](https://www.conventionalcommits.org)). Before opening a pull request, make sure `pnpm lint`, `pnpm check`, and `pnpm build` pass.

## License

HumiFocus is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version for others over a network, you must make its source available to them.
