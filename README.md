# Garaj

Shop-management app for independent car repair shops: appointments → work orders (estimates) → invoices → payments → reminders.
Romanian UI, local-first (data lives on the device), works on the web and as a native iPhone app from the same code.

- Plan, business rules, edge cases, reviews: [`docs/PLAN.md`](docs/PLAN.md)
- Design system: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) · live at `/design/`

## Run

```bash
npm install
npm run dev          # http://localhost:3000 — first load seeds a demo shop
npm test             # business-rule unit tests (node:test)
npm run lint
npm run build        # static export → out/ (the website and the iOS bundle)
```

## iPhone

Requirements: Xcode, an Apple ID signed in to Xcode (the free Personal Team works), iPhone connected and trusted, Developer Mode on.

```bash
npm run ios:device   # build → sync → sign → install → launch on the connected iPhone
npm run ios:open     # open the Xcode project
```

Live reload on the phone while developing:

```bash
npm run dev:lan                                          # serves on your Mac's LAN IP
CAP_SERVER_URL=http://<mac-ip>:3000 npm run ios:device   # app loads from the dev server
npm run ios:device                                       # back to the bundled, offline build
```

Free Personal Team limits: the app expires after 7 days (run `npm run ios:device` again), max 3 such apps on the phone.
First install: on the iPhone, Settings → General → VPN & Device Management → trust the developer.

## Keep a Mac on the latest `main`

```bash
npm run autopull:install     # once: checks origin/main every 2 min and at login
npm run autopull:uninstall   # remove it
npm run autopull             # one manual pass
```

A launchd agent (macOS; a crontab entry on Linux) runs `scripts/auto-pull.sh`, which only ever **fast-forwards** and stays out of the way: it does nothing while you are on another branch, have uncommitted changes, or have local commits that are not on `origin/main`. When `package.json` / `package-lock.json` change it runs `npm ci`, and it shows a macOS notification after an update. Log: `~/.garaj-auto-pull.log`. Change the interval with `INTERVAL=300 npm run autopull:install`.

It pulls the code only; to put a new build on the phone, run `npm run ios:device` as usual.

## CI/CD and containers

Every PR is tested on GitHub (`.github/workflows/ci.yml`); every merge to `main` is built into an nginx container and deployed on the Mac by a self-hosted runner. Setup and rollback: [`docs/DEPLOY.md`](docs/DEPLOY.md). Locally: `npm run docker:up` (production image on :8080) or `npm run docker:dev`.

## Structure

```
src/domain/          business rules — pure JS, unit-tested (money, VAT, invoices, work orders, reminders, reports)
src/lib/store/       local-first store: memory + IndexedDB, atomic numbering, tab sync, demo seed, actions
src/components/ui/   shadcn primitives, restyled by the design tokens
src/components/ds/   design-system components (Page, Card, Stat, Money, Plate, Sheet, DataList…)
src/components/shell/ sidebar · rail · top bar · tab bar · ⌘K search · quick create
src/features/        one folder per module (calendar, work-orders, invoices, customers, vehicles…)
src/app/             routes (static export; detail pages use ?id=)
ios/                 Capacitor 8 project (SPM) with a static-export router and a native print plugin
```
