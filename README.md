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

## Building

```sh
pnpm build    # outputs the static SPA to build/
pnpm preview  # serves the production build locally
```

The `build/` directory can be deployed to any static host, such as Firebase Hosting or Cloudflare Pages. Configure the host to serve `index.html` for unknown routes.

## Contributing

See [AGENTS.md](AGENTS.md) for project conventions, including commit rules.
