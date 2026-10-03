# Garaj — MVP plan

> Shop-management app for independent car repair shops (Romania first).
> **Core loop:** `Programare → Lucrare (deviz) → Factură → Plată → Reamintire → Programare`
> Web (Next.js static export) + iPhone app (Capacitor 8, same code, works offline).

Status legend: ✅ done in this MVP · 🟡 partial / stubbed · ⏭ later

---

## 1. Audit — what exists today

| Area | Found |
|---|---|
| Stack | Next 16.0.3, React 19.2 + React Compiler, Tailwind 4, shadcn/ui (new-york, neutral), plain JS |
| Pages | 1 — `/` renders a calendar |
| Calendar features | Day / Week / Month / Year / Agenda views · drag & drop move · resize (day/week) · add / edit / delete dialog · filter by color and by user · settings (dot vs colored badges, 24h clock, agenda group-by, confirm-on-drop, dark mode) · "Today" tile · date navigator with event count |
| Data | 80 random generic events ("Doctor's appointment"…), 4 fake users, in memory only; calendar settings in `localStorage` |
| Missing | Domain model, persistence, navigation, invoices, customers, vehicles, stock, reports, mobile shell, iOS app |

### Defects found in the existing code

| # | Problem | Impact | Fix in MVP |
|---|---|---|---|
| 1 | **Private SSH key committed** (`eval "$(ssh-agent -s)"` file at repo root, pushed to GitHub) | Anyone with repo access can use the key | User must revoke on GitHub + delete file + purge history (not done automatically) |
| 2 | Week view mounts ~336 `AddEditEventDialog`s (each a `useForm`) + ~170 animated `motion.div`s | Slow first render, janky on iPhone | One shared dialog; click position → time; CSS instead of motion |
| 3 | Undefined tokens: `text-t-*`, `bg-bg-secondary`, `text-xxs`, `border-b-tertiary`, `bg-bg` | Text renders unstyled | Replaced by design-system tokens |
| 4 | No `ThemeProvider` | Dark-mode switch does nothing | Provider + no-flash theme script |
| 5 | `ui/day-picker.jsx` uses react-day-picker **v8** class names on **v9** | Mini calendar unstyled | Use the v9 `ui/calendar.jsx` |
| 6 | Week starts Sunday in views, Monday in helpers | Wrong columns | Monday everywhere (RO) |
| 7 | `isMultiDay: startDate !== endDate` is always true | Wrong ordering in month cells | Compare calendar days |
| 8 | Resize writes global state on every pointer move | Re-renders everything while dragging | Preview locally, commit on release |
| 9 | Mixed date formats (local string vs UTC ISO) | Off-by-hours bugs | ISO instants for times, `YYYY-MM-DD` for dates |
| 10 | `.sort()` on prop arrays | Mutates parent data | Copy before sort |
| 11 | Delete without confirmation (details dialog) | Data loss | Confirm dialog |
| 12 | `framer-motion` **and** `motion` installed, metadata "Create Next App" | Bundle weight, branding | Removed; real metadata |
| 13 | Next 16.0.3 / React 19.2.0 are in the Dec-2025 RSC advisory range | Security | Upgraded to Next 16.3.8 / React 19.3.0 |

---

## 2. The customer and the business layer

**Customer:** independent garage, 1–8 mechanics, 2–6 lifts. The owner often runs the front desk too. Today they use paper job sheets, Excel, WhatsApp and a separate invoicing app.

### Jobs to be done → features

| # | The mechanic needs to… | Feature (business rule) | MVP |
|---|---|---|---|
| 1 | See today at a glance | **Azi** dashboard: cars in shop by status, today's bookings, ready for pickup, money in/outstanding | ✅ |
| 2 | Book without double-booking a lift or mechanic | Calendar with mechanic + bay; overlap **warning** (not block — quick jobs overlap on purpose) | ✅ |
| 3 | Open a job in 30 s when a car arrives | **Check-in** from appointment or plate search → work order prefilled (owner, car, complaint, km) | ✅ |
| 4 | Quote fast and get approval | Line editor with catalog (labor norms, parts, packages) → send estimate text on WhatsApp/SMS | ✅ |
| 5 | Invoice correctly | Gapless numbering per series, VAT per rate, non-VAT-payer mode, immutable issued invoices, storno | ✅ |
| 6 | Know who owes money | Payments (cash / card / transfer, partial), overdue derived from due date, balance per customer | ✅ |
| 7 | **Bring customers back** (recurring revenue) | Reminders: ITP, RCA, service due (date + estimated km), unpaid, ready-not-collected, tomorrow's bookings → one tap WhatsApp / SMS / call with templates | ✅ |
| 8 | Not run out of oil and filters | Stock with reserved (open jobs) vs available, low-stock list, receive stock | ✅ |
| 9 | Know if the shop makes money | Reports: revenue by month (labor vs parts), parts margin, avg ticket, top services, mechanic billed hours, receivables aging | ✅ |
| 10 | Catch upsell during inspection | Inspection checklist on the work order (OK / attention / urgent) that feeds the estimate | ✅ |
| 11 | e-Factura (ANAF SPV) upload | Data model ready (CUI, address, UBL-compatible totals); upload later | ⏭ |
| 12 | Online booking link for customers | Needs a backend | ⏭ |

### Business rules (source of truth: `src/domain/*`, pure JS, unit-tested)

- **Money** — integers in *bani* (1 leu = 100 bani). No floats in totals. Quantities up to 3 decimals, discount % up to 2 decimals.
- **VAT** — computed per VAT rate on the sum of net line amounts (EN 16931 / e-Factura compatible), default **21 %** (RO since 1 Aug 2025), configurable. **Non-VAT-payer** mode: 0 % and the mention "Neplătitor de TVA".
- **Invoice lifecycle** — `draft → issued → (paid | partial | overdue: derived) → cancelled (storno only)`. The number is assigned at issue time inside one IndexedDB transaction (atomic across tabs), gapless per series. Issued invoices are immutable snapshots (seller, buyer, vehicle, lines). Cancelling creates a **storno** invoice with negative lines that references the original. Drafts can be deleted, issued ones never.
- **Work order state machine**

  ```
  estimate ──► approved ──► in_progress ◄──► waiting_parts
      │            │             │
      │            │             ▼
      │            │           ready ──► delivered (final)
      └────────────┴─────────────┴──► cancelled (final)
  ready ──► in_progress (rework) is allowed
  ```
  One active invoice per work order (a cancelled one frees the slot).
- **Appointments** — `scheduled → confirmed → arrived (checked-in, linked to a work order) → done`; also `no_show`, `cancelled`. Conflicts = same mechanic or same bay with overlapping time → warning badge.
- **Stock** — consumed when an invoice is **issued** (part lines linked to the catalog); storno restores it. *Reserved* = part lines on open work orders. *Available* = stock − reserved. Low stock when available ≤ min.
- **Mileage** — logged at each check-in. Lower than the last reading → warning, still allowed (cluster replaced / typo), kept in history.
- **Service due** — next due = last service + interval (months) **or** + interval (km), whichever comes first. Km is estimated from the average daily km of the mileage history.
- **Deletion** — anything referenced by an issued invoice cannot be deleted (fiscal record). Unreferenced customers / vehicles / catalog items can be deleted after confirmation. Documents keep snapshots, so later catalog edits never change old documents.

### What proves value to the shop owner (instrument later)
Reminder → booking conversion · estimate approval rate · average ticket · labor/parts mix · parts margin · days-to-pay · overdue amount · lift utilization.

### Packaging hypothesis for Garaj itself (to validate, not built)
| Plan | For | Includes |
|---|---|---|
| Start (free) | 1 mechanic | Calendar, work orders, 30 invoices / month |
| Pro | 2–8 people | Unlimited, reminders, reports, iPhone app |
| Plus | Multi-location | Cloud sync + roles, e-Factura auto-send, SMS credits, online booking |

---

## 3. MVP scope

| Module | Route | Key capabilities |
|---|---|---|
| Azi (dashboard) | `/` | KPIs, today's timeline, jobs by status, to-contact list, low stock, mechanic load |
| Programări | `/calendar/` | Day (per-mechanic columns) / Week / Month / Year heatmap / Agenda; create, move (drag), resize, status actions, check-in |
| Lucrări | `/work-orders/`, `/work-orders/detail/?id=` | List with one-tap status menu; detail with status stepper, lines editor, inspection, activity; create invoice; share estimate |
| Facturi | `/invoices/`, `/invoices/detail/?id=` | List + filters; **document view** (the reference page); issue, record payment, storno, print/PDF, share |
| Clienți | `/customers/`, `…/detail/?id=` | Individuals + companies (CUI), vehicles, history, balance, consent |
| Mașini | `/vehicles/`, `…/detail/?id=` | Plate hero, ITP / RCA / service cards, mileage history, service timeline |
| De contactat | `/reminders/` | Grouped reminders, message templates, contacted / snooze log |
| Catalog | `/catalog/` | Labor operations (norm hours) + parts (stock, cost, price, margin) |
| Rapoarte | `/reports/` | Period picker, revenue chart, mix, top services, mechanics, aging |
| Setări | `/settings/` | Shop profile, invoicing (series, VAT, terms), labor rate, team, bays, hours, appearance, backup / restore / demo reset |
| Design system | `/design/` | Living style guide of every token and component |

**Out of scope (next):** cloud sync + multi-user roles · e-Factura upload · SMS gateway · online booking · supplier catalogs (TecDoc) · Android build · i18n (English strings).

---

## 4. Architecture

```
 Pages (app router, static)          ─ render skeleton at build time
   │ useCollection / useEntity         (no data on the server)
   ▼
 Store  (src/lib/store)               ─ in-memory collections, useSyncExternalStore,
   │  actions call domain rules          per-collection subscriptions, WeakMap-cached indexes
   ▼
 Domain (src/domain)                  ─ pure functions: money, totals, invoice, work order,
   │                                     appointment, vehicle, stock, reminders, reports, search
   ▼
 Persistence (IndexedDB "garaj")      ─ 1 object store per collection, batched writes,
                                         atomic invoice numbering, BroadcastChannel tab sync,
                                         JSON backup / restore, schema version + migrations
```

- **Static export** (`output: 'export'`, `trailingSlash: true`) → the same `out/` folder is the website and the iOS bundle. Detail pages use `?id=` (IDs are unknown at build time).
- **Local-first**: all reads are synchronous from memory → no spinners after the first ~50 ms hydrate. Every write updates memory first, then persists (one IDB transaction per action).
- **Future sync**: the store's persistence adapter is the only thing that knows about IndexedDB. A server adapter (REST + change feed) replaces it without touching pages or domain.
- **Folders**

  ```
  src/app/(app)/…            routes (thin: compose feature components)
  src/components/ui/         shadcn primitives, restyled with tokens
  src/components/ds/         design-system components (Page, Section, Stat, Tone, Plate, Money, Sheet…)
  src/components/shell/      sidebar, rail, mobile tab bar, top bar, command palette
  src/features/<module>/     feature components (calendar, invoices, work-orders…)
  src/domain/                business rules (pure, tested with node:test)
  src/lib/store/             store, persistence, hooks, seed data
  ios/                       Capacitor iOS project (SPM)
  ```

---

## 5. Data model (collections)

| Collection | Key fields |
|---|---|
| `settings` (singleton) | shop {name, legalName, cui, regCom, address, city, county, phone, email, iban, bank, logo}, invoicing {series, nextNumber, vatPayer, vatRate, dueDays, notes}, laborRate, partsMarkup, hours {open, close, days}, appearance {theme, clock24}, calendar prefs |
| `customers` | type (person / company), name, phone, email, cui, regCom, address, notes, marketingConsent, createdAt |
| `vehicles` | customerId, plate, vin, make, model, year, engine, fuel, color, mileage[] {date, km, source}, itpExpiry, rcaExpiry, serviceIntervalKm, serviceIntervalMonths, lastServiceDate, lastServiceKm |
| `staff` | name, role, color, active |
| `bays` | name, kind, active |
| `services` (labor catalog) | name, category, hours, price (net), parts[] (package) |
| `parts` | code, name, brand, unit, cost, price, stock, minStock, location |
| `appointments` | start, end (ISO), customerId, vehicleId, serviceIds, title, notes, staffId, bayId, status, workOrderId |
| `workOrders` | number, status, customerId, vehicleId, appointmentId, staffId, bayId, mileage, fuelLevel, complaint, diagnosis, lines[], inspection[], activity[], invoiceId, dates {created, approved, started, ready, delivered} |
| `invoices` | series, number, status, issueDate, dueDate, snapshot {seller, buyer, vehicle}, lines[], totals, workOrderId, stornoOf, stornoId, notes |
| `payments` | invoiceId, amount, method (cash / card / transfer), date, note |
| `contacts` | reminder key, channel, date, snoozeUntil (reminder log) |

Line shape (shared by work orders and invoices): `{id, kind: labor|part|fee, refId, description, qty, unit, unitPrice, discountPct, vatRate, cost, staffId}`.

---

## 6. Performance (budgets → measured)

| Budget | Target | Measured / how |
|---|---|---|
| First-load JS per route | framework floor + ≤ 130 kB | **233–261 kB gzip** on modern browsers (React + Next runtime floor ≈ 128 kB). The 39 kB polyfill chunk is `noModule`, never downloaded by WebKit/Chrome. Removed: framer-motion, motion, re-resizable, react-hook-form, zod, react-day-picker, date-fns (→ native `Intl`), Radix tooltip/tabs/toggle/avatar/scroll-area. Lazy: every create/edit sheet, the ⌘K palette, the confirm dialog (prefetched on idle) |
| Time to data | ≤ 100 ms after hydrate | One IDB transaction reads all collections in parallel; demo seed (884 jobs, 837 invoices) builds in ~40 ms |
| Interaction | < 50 ms per tap | Per-collection subscriptions (`useSyncExternalStore`), selectors memoized per collection (WeakMap), React Compiler, `useDeferredValue` search, writes debounced 250 ms (flushed when the app is backgrounded) |
| Long lists | Smooth at 5 000 invoices | Progressive rendering (60 rows + sentinel), `content-visibility: auto`, precomputed search keys. Settings → Developer adds 5 000 invoices to test |
| Calendar | ≤ 400 DOM nodes in week view | Working-hours grid drawn with CSS gradients, one click handler per column, one shared sheet; drag on desktop only |
| Animation | 60 fps on iPhone | CSS transitions only; `prefers-reduced-motion` respected |
| Layout shift | 0 | Skeletons with final geometry; data renders only after hydrate (build-time HTML never contains dates or data) |

## 7. Edge cases checklist

**Money & VAT**
- [x] Float drift (0.1 + 0.2) → integer bani everywhere
- [x] Qty 1.5 h × 137,50 lei with 10 % discount → one rounding per line, half away from zero
- [x] Mixed VAT rates on one document → grouped per rate
- [x] Non-VAT payer → no VAT lines, legal mention
- [x] Negative totals only on storno
- [x] Parse "1.234,56" and "1234.56" and "1 234,56"

**Invoices**
- [x] Two tabs issuing at once → counter read + increment in one IDB transaction
- [x] Editing customer after issue → invoice keeps its snapshot
- [x] Payment larger than balance → blocked with message; zero / negative → blocked
- [x] Overdue is derived (due date < today and balance > 0), never stored
- [x] Storno of a storno → blocked; storno of a draft → blocked (delete instead)
- [x] Second invoice for the same work order → blocked unless the first was cancelled

**Dates & time**
- [x] Date-only fields stored as `YYYY-MM-DD` (no timezone shift)
- [x] DST days → durations via minute difference, grid drawn from local hours
- [x] Appointments outside working hours → grid expands to show them
- [x] Week starts Monday; 24 h clock default
- [x] End before start → validation error

**Vehicles & customers**
- [x] Plate normalized for search (`b 123abc` = `B-123-ABC`), displayed as entered
- [x] VIN: 17 chars, no I / O / Q (warning, not block)
- [x] CUI checksum and IBAN mod-97 (warnings)
- [x] Phone `07xx…` → `+407xx…` for WhatsApp and SMS links
- [x] Mileage lower than last reading → warning, allowed
- [x] Delete customer that has invoices → blocked with explanation

**Stock**
- [x] Part deleted from the catalog → documents keep their line snapshots
- [x] Stock can go negative (sold before received) → shown in red, not blocked

**Data & app**
- [x] First run → demo data with a visible "demo" banner; one-click reset to empty
- [x] IndexedDB unavailable (private mode) → in-memory mode with a warning banner
- [x] Schema version stored; migrations run before the first render
- [x] Backup export (share sheet / download) and import with validation
- [x] Corrupt import → rejected, current data untouched
- [x] `crypto.randomUUID` missing on plain-http LAN dev → `getRandomValues` ids

**Mobile / iOS**
- [x] Inputs ≥ 16 px (no zoom), 44 px touch targets, safe-area insets
- [x] Native date / time inputs (iOS wheels, zero JS)
- [x] No hover-only affordances; swipe-back gesture enabled
- [x] Deep-link reload inside the app → native router serves the right `index.html`
- [x] `window.print()` is a no-op in WKWebView → native print plugin (AirPrint / Save PDF)
- [x] Status bar text follows the app theme

---

## 8. iOS app

| Item | Decision |
|---|---|
| Wrapper | Capacitor 8.5 + Swift Package Manager (no CocoaPods) |
| Bundle | `out/` (static export) copied into the app → fully offline |
| Bundle ID | `com.albertoparos.garaj` |
| Signing | Personal Team `7363RX85BF` (free) → app expires after **7 days**, max **3** free-provisioned apps on the phone |
| Native bits | Router that maps `/route/` → `route/index.html` · print plugin (`UIPrintInteractionController`) · swipe-back gesture · status bar style |
| Build & install | `npm run ios:device` → static build → `cap sync` → `xcodebuild` → `devicectl install` → launch |
| Live reload (dev) | `CAP_SERVER_URL=http://<mac-ip>:3000 npm run ios:device` |

---

## 9. Delivery status

| Phase | Content | Status |
|---|---|---|
| 0 Foundation | Tokens, shell (sidebar / rail / tab bar), store + IndexedDB, domain + tests, seed data, static export | ✅ |
| 1 Money | Invoices (document view, issue, payments, storno, print), work orders (board, detail, lines, inspection) | ✅ |
| 2 Calendar | Rewrite on the design system, domain-backed, per-mechanic day view, drag / resize / undo | ✅ |
| 3 Relations | Customers, vehicles, reminders, catalog, reports, settings, design system page | ✅ |
| 4 Ship | iOS project, device install, performance pass, docs | ✅ |
| Next | Cloud sync + auth + roles → e-Factura upload → SMS gateway → online booking → Android → English UI | ⏭ |

### Verification (what was actually run)

| Check | Result |
|---|---|
| `npm test` — 28 unit tests on money, VAT, invoices, storno, work-order state machine, appointments, stock, reminders, search | ✅ pass |
| `npm run lint` (Next + React Compiler rules) | ✅ 0 findings |
| `npm run build` — 21 static routes | ✅ |
| Browser e2e on the **production bundle**, served with the same routing rules as the iOS app: job → draft → issue → pay → overpay blocked → storno → numbers gapless & unique (1…839) → check-in → calendar create → drag-move → undo → deep-link reload | ✅ no console errors |
| Stress: +5 000 invoices (5 837 total), phone viewport, 4× CPU throttle | ✅ data ready 418 ms · rows 460 ms · search 108 ms · scroll 0 long tasks |
| iOS Simulator (iPhone 17 Pro): native build, seed in WKWebView IndexedDB, safe areas | ✅ |
| Physical iPhone 15 Pro Max: signed (Personal Team), installed and launched with `npm run ios:device` | ✅ |

### Known limits of the prototype
- Data is per device (no sync yet). Use Settings → Date → backup weekly.
- iOS may clear WKWebView storage only under extreme storage pressure; production should move to native SQLite or cloud sync.
- Free provisioning: reinstall every 7 days.
- e-Factura: data is captured (CUI, addresses, per-rate VAT) but not uploaded to ANAF yet.

## 10. Plan reviews

### Review 1 — correctness and edge cases (changes applied above)
1. **Deep links in the iOS app** — Capacitor's default router serves the root `index.html` for every extension-less path, which breaks a static multi-page export on reload → added a native router.
2. **Invoice numbers across tabs** — an in-memory counter would duplicate numbers with two tabs open → numbering moved into an IDB transaction + tab sync.
3. **Date-only fields** — `toISOString()` shifts ITP expiry by a day for UTC+2/+3 → `YYYY-MM-DD` strings.
4. **Issued invoices changing retroactively** — they referenced live customers / catalog → snapshots on issue.
5. **Stock timing** — decrementing on line add would corrupt stock on edits → consume on issue, restore on storno, show reserved.
6. **Overlap policy** — blocking double bookings fights real workflows (a 15-min tire job next to a long repair) → warn only, per mechanic / bay.
7. **Demo vs real data** — mixing is dangerous for invoice numbering → banner + full reset that also resets counters.

### Review 2 — performance and mobile (changes applied above)
1. **Calendar DOM** — per-slot dialogs and 24-hour grids → working-hours grid with CSS lines, one handler per column, one shared sheet.
2. **Hydration** — `new Date()` and data in server render cause mismatches (build time ≠ run time) → server renders skeletons, data renders after hydrate.
3. **Global context** — the old calendar context recreated its value every render → per-collection store subscriptions.
4. **Bundle** — framer-motion + zod + react-hook-form on first load → motion removed, forms lazy-loaded inside sheets.
5. **Reports** — O(n²) filters per chart → single pass, memoized by collection reference, only on `/reports/`.
6. **iOS print** — `window.print()` does nothing in WKWebView → native plugin.
7. **Touch** — HTML5 drag & drop is unreliable on iPhone → drag on desktop (mouse), tap → edit sheet on touch.

### Review 3 — after building (fixed in code)
1. **Unstyled status tokens** in the old calendar (`text-t-*`) → replaced by tones; checked every page in light and dark.
2. **setState inside effects** (view preference, "mounted" flags) → `useSyncExternalStore`-based `useLocalPreference` / `useHydrated`; lint now clean.
3. **Nested interactive elements** (button in a button row) → `ListRow nested` renders a focusable div.
4. **Big numbers with tabular figures** looked loose → proportional figures for stat tiles and totals, tabular only in columns (dataviz rule).
5. **Chart colors** validated with the palette checker (CVD ΔE ≥ 9.2 light / 9.4 dark); low-contrast aqua gets labels + table view.
6. **Drag vs click**: a drag must not also open the editor; a cross-column drag must keep pointer capture → click suppression + hidden ghost node.
7. **Bundle audit** found a date library and unused Radix packages in first load → removed (see §6).

