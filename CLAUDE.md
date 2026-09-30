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
