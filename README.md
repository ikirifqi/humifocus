# HumiFocus

A simple timer for people who constantly switch context, helping keep their to-dos organized and tracked.

Built with [SvelteKit](https://svelte.dev/docs/kit) and compiled to a static single-page app.

## Requirements

- Node.js 26+ (pinned in `.node-version`)
- [pnpm](https://pnpm.io)

## Getting started

```sh
pnpm install
pnpm dev
```

## Backend

HumiFocus uses [Firebase](https://firebase.google.com) as its backend, configured in `src/lib/firebase.ts` for the `shinobi-rengo` project:

- **Authentication** signs users in with email and password.
- **Cloud Firestore** stores each user's data under `users/{uid}`: the user document holds settings and the running timer, and the `projects` and `sessions` subcollections hold the rest. A persistent local cache keeps the app usable offline.

Before the app can sign anyone in, in the [Firebase console](https://console.firebase.google.com/project/shinobi-rengo):

1. Enable the **Email/Password** sign-in provider under Authentication.
2. Create a Cloud Firestore database.
3. Add the production domain to Authentication's authorized domains (`localhost` is allowed by default).

Then deploy the security rules in `firestore.rules`:

```sh
pnpm dlx firebase-tools login
pnpm dlx firebase-tools deploy --only firestore:rules
```

## Building

```sh
pnpm build    # outputs the static SPA to build/
pnpm preview  # serves the production build locally
```

The `build/` directory can be deployed to any static host, such as Firebase Hosting or Cloudflare Pages. Configure the host to serve `index.html` for unknown routes.

## Contributing

See [AGENTS.md](AGENTS.md) for project conventions, including commit rules.
