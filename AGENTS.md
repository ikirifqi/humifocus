# AGENTS.md

Guidance for AI agents and human contributors working on HumiFocus.

## Project

HumiFocus is a simple timer for people who constantly switch context, keeping their to-dos organized and tracked.

- Framework: SvelteKit (Svelte 5 runes mode) with TypeScript in strict mode.
- Package manager: pnpm. Do not use npm or yarn, and do not commit other lockfiles.
- Output: a static single-page app built by `@sveltejs/adapter-static` into `build/`.

## Commands

| Command        | Purpose                                       |
| -------------- | --------------------------------------------- |
| `pnpm install` | Install dependencies                          |
| `pnpm dev`     | Start the dev server                          |
| `pnpm build`   | Build the static SPA into `build/`            |
| `pnpm preview` | Serve the production build locally            |
| `pnpm check`   | Type-check Svelte and TypeScript sources      |
| `pnpm lint`    | Check formatting (Prettier) and lint (ESLint) |
| `pnpm format`  | Format all files with Prettier                |

## Linting and formatting

- Prettier (`prettier.config.js`) owns formatting: tabs, single quotes, no trailing commas, 100-column width.
- ESLint (`eslint.config.js`) owns code quality, with the recommended JS, typescript-eslint, and eslint-plugin-svelte rules. Formatting rules are disabled in favor of Prettier.
- Both tools skip anything in `.gitignore`.
- Before every commit, `pnpm lint`, `pnpm check`, and `pnpm build` must pass.
- Do not silence a rule with `eslint-disable` or `@ts-ignore` without a comment explaining why.

## Architecture rules

- The app must stay a static SPA that can be hosted on Firebase Hosting or Cloudflare Pages.
  - `ssr = false` is set in `src/routes/+layout.ts`. Do not re-enable it.
  - Do not add server-only code: no `+page.server.ts`, `+layout.server.ts`, `+server.ts`, `hooks.server.ts`, or `$app/env/private`.
  - The adapter fallback is `index.html` (configured in `vite.config.ts`). Keep it unless the hosting target changes.
- SvelteKit config lives in `vite.config.ts`. There is no `svelte.config.js`.
- Shared code goes in `src/lib` and is imported through the `#lib` alias.
- The backend is Firebase Authentication and Cloud Firestore, initialized once in `src/lib/firebase.ts`. Talk to Firebase only from the client SDK; there is no server.
- Never hardcode the Firebase config. It comes from the JSON in `PUBLIC_FIREBASE_CONFIG`, declared and validated in `src/env.ts`, set in `.env` locally (see `.env.example`) and as a GitHub repository variable in CI.
- App state in `src/lib/app.svelte.ts` mirrors Firestore snapshots. Change data by writing to Firestore, not by mutating state; the local cache feeds the write back through the listeners.
- `firestore.rules` validates every document shape. When a stored field changes, update the rules in the same commit and deploy them with `pnpm dlx firebase-tools deploy --only firestore:rules`.
- Prefer the Svelte CLI (`pnpm dlx sv ...`) over hand-writing boilerplate when adding official integrations.

## Commit conventions

Commits must be **atomic and semantic**. This is a hard rule.

### Atomic

- One commit = one logical change. If the message needs "and", it is probably two commits.
- Never bundle unrelated changes or dump a large change into a few commits. Split by context: config, dependency, feature, docs, formatting, and so on.
- Each commit should leave the project buildable.
- Keep generated output (from `sv create`, `sv add`, a formatter) in its own commit, separate from hand-written changes, so the history shows what was generated and what was authored.
- Mechanical changes (formatting, renames) go in their own commit, never mixed with behavior changes.
- Stage files explicitly (`git add <path>`). Avoid `git add -A` or `git add .`, which pull in unrelated changes.

### Semantic

Use [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <imperative summary, lower case, no period>

<optional body explaining what and why>
```

| Type       | Use for                                                 |
| ---------- | ------------------------------------------------------- |
| `feat`     | User-facing functionality                               |
| `fix`      | Bug fixes                                               |
| `docs`     | Documentation only                                      |
| `style`    | Formatting with no code meaning change                  |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvements                                |
| `test`     | Adding or fixing tests                                  |
| `build`    | Build system, adapters, dependencies                    |
| `ci`       | CI configuration                                        |
| `chore`    | Tooling and maintenance that touches no app code        |
| `revert`   | Reverting a previous commit                             |

- Keep the summary at 72 characters or fewer, in the imperative mood ("add", not "added").
- Mark breaking changes with `!` after the type (`feat!: ...`) and a `BREAKING CHANGE:` footer.

Examples from this repository:

```
build: replace adapter-auto with adapter-static
build: emit index.html as spa fallback page
feat: disable ssr to render entirely client-side
feat: show hello world centered on home page
docs: add project readme
```
