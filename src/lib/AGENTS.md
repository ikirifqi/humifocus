# src/lib

App state, Firebase access, domain logic, and UI components. Imported as `#lib/<file>.js` (the `imports` map in `package.json`). `prayer.ts` and `timetable.ts` import relatively and stay free of Svelte and Firebase, so they remain plain domain code.

## Files

| File               | Role                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `app.svelte.ts`    | The `app` singleton: auth, Firestore listeners, timer actions, session saving       |
| `firebase.ts`      | `auth` and `db`; Firestore with a persistent multi-tab IndexedDB cache              |
| `format.ts`        | Duration and clock formatting, `startOfDay` / `endOfDay`                            |
| `prayer.ts`        | Built-in `CITIES`, prayer time math, `Place` (uploads beat calculation), `citySlug` |
| `timetable.ts`     | CSV parsing with user-facing errors, `encodeMonths` / `decodeMonths` for Firestore  |
| `click-outside.ts` | `{@attach clickOutside(fn)}` closes popovers on outside press or Escape             |
| `components/`      | Popovers and dialogs used by the home page, plus the `SignIn` screen                |

## The app singleton

- One `App` instance, created at module load. In the browser the same module starts auth, the 250 ms clock (`app.now`), the minute save, midnight rollover, and `visibilitychange` / `pagehide` / `online` hooks. Do not create another instance or move these into components.
- `projects`, `sessions`, `timer`, `timetables` are `$state.raw` and replaced whole from snapshots. Never mutate them; write to Firestore and let the listener update state.
- `selected` is the only device-local choice (project picked while no timer runs). The theme lives in `localStorage`, not Firestore, so it applies before sign-in.
- Read `allSessions` for anything shown to the user: it is the stored sessions with the running one's stored copy replaced by a live row (`id: 'live'`). `sessions` alone lags up to a minute.
- `ready` stays false until all five listeners report, a failed one included, so the layout renders nothing instead of flashing sign-in.

## Timer and session invariants

- A session's document id is `String(timer.startedAt)`. Close, save, and midnight rollover from any device write the same id, so duplicates collapse.
- `sessionOf` is the only place that turns a timer into a session: clamps `end` to `[startedAt, endOfDay(startedAt)]`, drops sessions under a second. Every session write goes through it.
- `save()` runs in a transaction and never moves a session backwards (`end` and `totalMs` only grow), never writes the timer, skips sessions this device closed (`#closed`), and does nothing offline. Keep all of that when touching it.
- Closing a session (`#run`, `deleteProject`) is a `writeBatch` that writes the session and the new timer together.
- `endDay` closes an earlier day's timer in a transaction, only if the server's timer is still the one this device saw. A device opened after days away holds a stale cached timer, and clearing it blindly wipes the timer another device started today. Offline, the rollover waits.
- Timer edits (`togglePause`, notes) are field updates on `users/{uid}`; `editNote` rewrites the whole notes list by design (transactions cannot run offline).
- Write failures go to `fail` (console). Most actions are fire-and-forget; only `uploadTimetable` returns its promise so the dialog can show errors.

## Components

- Scoped `<style>` per component using the CSS variables from `src/app.css` (`--bg`, `--fg2`, `--accent`, `--mono`, ...). No CSS framework; do not hardcode colors outside `PALETTE`.
- Popovers keep their own `open` state and close through `clickOutside`. `PrayerDialog` is a native `<dialog>` driven by a bindable `open` prop.
- Components read and call `app` directly; there are no stores or context.

## Anti-patterns

- Importing `firebase/*` from routes or components for data access (only `app.svelte.ts` writes data; `SignIn` uses `FirebaseError` for messages only).
- Adding 24 hours to step a day, or comparing days other than through `startOfDay` / `endOfDay`.
- Storing `Date` or Firestore `Timestamp` values in user documents: the rules require integer milliseconds.
