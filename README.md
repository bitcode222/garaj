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
