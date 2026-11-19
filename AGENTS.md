# Repository Guidelines

## Development Workflow

Create a separate Git worktree under `.worktrees/` for every development task. Use a dedicated branch for changes, tests, commits, and pull requests. Keep the main worktree available for the `main` branch.

## Project Structure & Module Organization

Famo is a local daily todo app with a Go/SQLite backend and React/TypeScript frontend.

- `cmd/famo/`: executable entry point, flags, and shutdown handling.
- `internal/tasks/`: domain models, settings, SQLite persistence, and migrations.
- `internal/server/`: chi HTTP API, local access guards, and static serving.
- `web/src/`: components, API helpers, and styles; reusable UI primitives live in `components/ui/`.
- `web/e2e/`: Playwright browser tests. Go tests live beside their implementation.
- `web/embed.go`: embeds generated `web/dist/` assets into the executable.

Use `README.md` for current behavior and `TODO.md` for planned work.

## Build, Test, and Development Commands

Requires Go 1.26.5+, Node.js 24 LTS+, and npm. Run commands from the repository root unless specified.

- `cd web && npm ci`: install frontend dependencies.
- `make dev-api` and `make dev-web`: run in separate terminals; API uses port 8787, Vite uses 5173 and proxies `/api`.
- `make build`: install dependencies, build the frontend, and compile `bin/famo`; run with `./bin/famo`.
- `make test`: run Go tests with race detection, TypeScript checks, and the production frontend build.
- From `web/`, `npx playwright install chromium` then `npm run test:e2e`: install the browser and run acceptance tests.
- From `web/`, `npm run format:check` or `npm run format`: check or apply Prettier formatting.

## Coding Style & Naming Conventions

Format Go with `gofmt` and tab indentation. Follow existing package boundaries and exported-name conventions. Use strict TypeScript, two-space indentation, single quotes, no semicolons, and trailing commas through Prettier. Name component files in kebab-case, such as `quick-capture.tsx`, and React components in PascalCase.

## Testing Guidelines

Use Go's `testing` package with `*_test.go` files and `Test...` functions. Name browser tests `web/e2e/*.spec.ts`. Cover changed behavior, especially migrations, atomic writes, version conflicts, dates, and editing failures. No numeric coverage threshold is configured. Playwright starts an isolated server on port 8788 with a temporary SQLite database.

## Commit & Pull Request Guidelines

Write commit messages, PR titles, descriptions, and Git/PR communication in English. Recent commits use imperative subjects with `feat:`, `refactor:`, and `docs:` prefixes. Describe behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Data & Configuration

Keep SQLite files and generated artifacts untracked. Use `-db` for an alternate database and `-addr` for the listening address. Preserve legacy API fields and optimistic version checks when changing task behavior.
