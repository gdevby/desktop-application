# AGENTS.md

Instructions for AI coding agents working in this repository.

> **Monorepo:** shared context and Cursor rules live in [AGENTS.md](../AGENTS.md) and [`.cursor/rules/`](../.cursor/rules/).
>
> **Cursor tip:** If project context seems missing, start your chat with `@AGENTS.md`.

## Project overview

**Cattr Desktop** — cross-platform Electron desktop client for [Cattr](https://cattr.app) time tracking.

- **License:** SSPL-1.0
- **Stable version:** see `stableVersion` in [package.json](package.json)
- **Purpose:** Track time on tasks, capture screenshots/activity, sync with a Cattr server, work offline with deferred sync.

Human-oriented setup and packaging: [README.md](README.md).

## Architecture

Two-process Electron app with IPC between main and renderer.

```mermaid
flowchart LR
  subgraph main [Main process app/src]
    Routes[routes/ IPC handlers]
    Controllers[controller/]
    Base[base/ services]
    Models[models/ Sequelize]
    Components[components/ tray menu etc]
  end
  subgraph renderer [Renderer app/renderer]
    Vue[Vue 2 + Vuex + Router]
    UI[Element UI components]
  end
  subgraph build [build/ webpack output]
    Bundle[app.js app.css app.html]
  end
  Vue -->|"$ipc.request"| Routes
  Routes --> Controllers
  Controllers --> Models
  Controllers --> Base
  Base -->|@cattr/node| API[Cattr API]
  main -->|loads| Bundle
```

**Startup flow:**

1. [app/src/app.js](app/src/app.js) — single-instance lock, SSO protocol `cattr://`, init DB, create `BrowserWindow`, load `build/app.html`
2. [app/src/models/index.js](app/src/models/index.js) — SQLite + Umzug migrations, register Sequelize models
3. [app/src/routes/index.js](app/src/routes/index.js) — register IPC routes via `@amazingcat/electron-ipc-router`
4. [app/renderer/js/app.js](app/renderer/js/app.js) — Vue app, Sentry, i18n, mount UI

## Directory map

| Path | Role |
|------|------|
| [app/src/app.js](app/src/app.js) | Electron main entry (`package.json` → `main`) |
| [app/src/base/](app/src/base/) | Core services: `api`, `authentication`, `config`, `task-tracker`, `offline-mode`, `user-preferences` |
| [app/src/routes/](app/src/routes/) | IPC route handlers (`router.serve('namespace/action', ...)`) |
| [app/src/controller/](app/src/controller/) | Business logic (tasks, projects, time, intervals) |
| [app/src/models/](app/src/models/) | Sequelize models (`Project`, `Task`, `Interval`, `Track`, `Property`) |
| [app/src/migrations/](app/src/migrations/) | Umzug/Sequelize schema migrations |
| [app/src/components/](app/src/components/) | Main-process side effects (tray, power manager, inactivity, log rotation) |
| [app/src/utils/](app/src/utils/) | Shared utilities (log, keychain, screenshot, errors, sentry) |
| [app/src/translations/](app/src/translations/) | Backend i18n JSON (`en.json`, `ru.json`) |
| [app/renderer/js/](app/renderer/js/) | Vue 2 frontend (ES modules) |
| [app/renderer/scss/](app/renderer/scss/) | Styles (Sass, Element UI theme) |
| [build/](build/) | Webpack output — loaded by Electron at runtime (not source) |
| [tools/](tools/) | Packaging helpers (notarization, artifact manifest, clean dev data) |
| [resources/](resources/) | Icons, macOS entitlements |
| [webpack.mix.js](webpack.mix.js) | Laravel Mix build config |

## Tech stack

| Layer | Stack |
|-------|-------|
| Runtime | **Node.js 14.19.0**, **Yarn 3.2.1**, **Electron 14.2.9** |
| Main process | CommonJS (`require`), Sequelize 6 + SQLite, Umzug migrations |
| Renderer | **Vue 2.7**, Vuex 3, Vue Router 3, Element UI 2, vue-i18n 8 |
| IPC | `@amazingcat/electron-ipc-router` |
| API client | `@cattr/node` (tokens/credentials via `keytar`) |
| Build | Laravel Mix 6 → single `build/app.js` bundle |
| Lint | ESLint 7 — `eslint:recommended`, `airbnb-base`, `plugin:vue/recommended` |
| Monitoring | `@sentry/electron` (main), `@sentry/browser` (renderer) |
| Packaging | `electron-builder` → `target/` |

## IPC conventions

Routes use `namespace/action` naming. Pattern in main process:

```javascript
router.serve('tasks/create', async request => {
  try {
    const result = await Tasks.createTask(request.packet.body);
    return request.send(200, { task: result });
  } catch (error) {
    if (error instanceof UIError)
      return request.send(error.code, { message: error.message, id: error.errorId, error: error.error });
    log.error('...', error);
    return request.send(500, { message: 'Internal error occured', id: 'ERTT500' });
  }
});
```

Renderer calls via `Vue.prototype.$ipc`:

```javascript
const { body } = await this.$ipc.request('tasks/list', { /* payload */ });
```

When adding a feature, wire **both** sides: route in `app/src/routes/`, consumer in Vue component or Vuex action.

## Data and persistence

- Local DB: SQLite at `{userData}/db/main.db` (dev: `userData-develop`)
- New schema changes: add Umzug migration in `app/src/migrations/`, update model in `app/src/models/`
- Credentials: `keytar` via [app/src/utils/keychain.js](app/src/utils/keychain.js)
- User settings: JSON file via [app/src/base/user-preferences.js](app/src/base/user-preferences.js)

## Development

```bash
yarn                          # install deps (runs electron-rebuild postinstall)
npm version v1.0.0            # set version before build (see README)
yarn build-development        # webpack → build/
yarn dev                      # AT_DEVMODE=meow, opens DevTools
yarn build-watch              # webpack watch mode
yarn lint                     # ESLint
yarn clean-development        # wipe dev userData / keychain
```

Useful env flags:

| Variable | Effect |
|----------|--------|
| `AT_DEVMODE=meow` | Dev mode: separate app data dir, DevTools, relaxed Sentry |
| `AT_MOCK_SCR=yes` | Mock screenshots (`no-scr`, `dev-no-scr` scripts) |
| `AT_SENTRY=force` | Enable Sentry in dev builds |
| `DISABLE_DEVTOOLS=y` | Skip opening DevTools in dev |

Dev mode uses package id `cattr-develop` and `userData-develop` suffix — safe to experiment without touching production data.

## Production build

```bash
yarn build-production         # or build-release with MAKE_RELEASE=yes for Sentry upload
yarn package-linux            # AppImage, deb, tar.gz → target/
yarn package-windows          # portable + NSIS
yarn package-mac              # signed + notarized DMG (macOS only)
```

Platform constraints: macOS hosts build macOS only; Linux can build Linux + Windows (Wine); Windows builds Windows only (often via Docker — see README).

## Agent guidelines

### Scope and style

- Prefer **minimal diffs**; match existing patterns in the file you edit.
- Main process: **CommonJS** (`require`/`module.exports`). Renderer: **ES modules** (`import`/`export`).
- Follow ESLint rules in [package.json](package.json) — padded blocks, `object-curly-spacing: always`, max line 120.
- Do not edit `build/` or `target/` — they are generated artifacts.

### Layering

- **routes/** — IPC wiring, input validation, `UIError` → HTTP-like status codes, logging unexpected errors
- **controller/** — business logic, orchestration
- **base/** — long-lived services and cross-cutting concerns
- **models/** — Sequelize definitions and associations only
- **renderer** — UI state in Vuex ([app/renderer/js/storage/store.js](app/renderer/js/storage/store.js)), thin components

### Error handling

- `UIError` — expected errors shown to the user (pass through IPC with `errorId`)
- `AppError` — internal errors auto-reported to Sentry
- See [app/src/utils/errors.js](app/src/utils/errors.js)

### Security and Electron

- `webPreferences`: `nodeIntegration: true`, `contextIsolation: false` — legacy setup; do not casually change without a dedicated security review.
- External links: intercepted in `app.js`, opened via `shell.openExternal` with protocol allowlist.
- CSP is injected in main process — update if adding new script/connect sources.

### Translations

- Backend strings: `app/src/translations/{en,ru}.json`
- Frontend uses vue-i18n; locale loaded via `translation/get-configuration` IPC route.
- Add keys to **both** language files when introducing user-visible text.

### Dependencies

- Pin major versions conservatively — Electron 14 and Node 14 are intentional.
- `active-win` is optional (native module); `postinstall` runs `electron-rebuild`.
- Avoid new dependencies without strong reason.

### Testing

No automated test suite exists. After changes, run `yarn lint` and manually verify affected flows in `yarn dev`.

### Interval sync and offline queue

When the network is unstable, interval capture follows this flow:

1. `task-tracker.captureCurrentInterval` saves local time, then calls `pushTimeInterval`.
2. On transient failure (`retryable-error.js`: network errors, timeouts, HTTP 502/503/504/429), the interval is stored in SQLite (`synced: false`) and offline mode is enabled.
3. When connectivity is restored, `deferred-handler` pushes the queue sequentially with exponential backoff (up to 5 attempts per interval).
4. Manual sync: refresh button in the task list (`ControlBar`) or **Send to server** on the Offline Sync page (`interval/push-deferred`).

Screenshot uploads use a longer read timeout (90s) via dedicated HTTP agents in `base/api.js`.

**Known limitation (no server changes):** if the server creates an interval but the response is lost, the client may send a duplicate on the next sync. Full idempotency requires server-side `client_id` support.

Manual verification checklist:

- Track with network disabled → `notSyncedAmount` increases.
- Restore network → queue syncs automatically.
- Manual sync with flaky network → partial success message in UI.
- Interval with screenshot on a slow connection does not fail at 30s.

## Documentation map

| Resource | Purpose |
|----------|---------|
| [README.md](README.md) | Human onboarding, system requirements, packaging |
| [package.json](package.json) | Scripts, ESLint config, electron-builder settings |
| `.cursor/rules/*.mdc` | Cursor-specific patterns per layer |

## Cursor context layers

When workspace is monorepo root (`cattr/`):

| File | When it applies |
|------|-----------------|
| [AGENTS.md](../AGENTS.md) | Monorepo index |
| `.cursor/rules/monorepo-core.mdc` | Every session |
| `.cursor/rules/desktop-stack.mdc` | `desktop-application/**` |
| `.cursor/rules/desktop-electron-main.mdc` | `desktop-application/app/src/**` |
| `.cursor/rules/desktop-vue-renderer.mdc` | `desktop-application/app/renderer/**` |

When workspace is this directory only, local `.cursor/rules/` apply with relative globs.
