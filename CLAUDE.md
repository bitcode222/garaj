# Garaj — working notes

Car repair shop app (Romania). Next.js 16 static export + Capacitor 8 iOS, local-first (IndexedDB), Romanian UI.
Read [`docs/PLAN.md`](docs/PLAN.md) before changing business rules and [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) before changing UI.

## Rules

- Business rules live in `src/domain/` — pure JS, relative imports with `.js`, covered by `npm test`. The UI never computes money or VAT itself.
- Money is integer bani. Date-only values are `"YYYY-MM-DD"` strings; instants are `toISOString()`.
- Every write goes through `src/lib/store/actions.js`; anything that allocates a number or moves stock uses `atomic()`.
- Pages show a skeleton until `useIsReady()`; nothing data- or date-dependent is rendered at build time.
- Compose UI from `src/components/ds/*`. Statuses: `StatusBadge` + `src/lib/labels.js`. Colors: tones from `src/lib/tones.js`, never raw palette classes in features.
- Phone: inputs 16 px, targets 44 px, forms in `Sheet`, no hover-only actions.
- Detail routes take `?id=` (static export) and are wrapped in `<Suspense>`.
- Before calling work done: `npm test && npm run lint && npm run build`; on the iPhone: `npm run ios:device`.
- Delivery: work on the session branch and open a pull request into `main` (`base: main`). If the previous PR was already merged, restart the branch from `origin/main` first (`git fetch origin main && git checkout -B <branch> origin/main`) so the new PR carries only new work. Fetch and rebase before pushing, since `main` moves.
- CI/CD: `.github/workflows/ci.yml` runs `check` (tests, lint, build) and `image` (container smoke test) on every PR; a push to `main` deploys the nginx container to the owner's Mac through a self-hosted runner ([`docs/DEPLOY.md`](docs/DEPLOY.md)). Never make the deploy job run on `pull_request`.
- Merging: the owner wants every pull request merged automatically. After `npm test && npm run lint && npm run build` pass locally and the PR is open and mergeable, merge it into `main` (merge commit) without asking, once the PR's `check` and `image` runs are green. If auto-merge is enabled on the repo, prefer it.
