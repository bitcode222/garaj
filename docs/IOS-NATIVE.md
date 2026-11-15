# The native iPhone app (SwiftUI): plan

Status: **approved 2026-11-15**. Phase 0 done and on the iPhone (every record moved, checked against the old database). Phase 1 (Lucrări) done: list with totals, swipe to the next step, undo; job detail with status moves, contact (call/SMS/WhatsApp with the estimate), complaint/diagnosis, lines editor (catalog, stock, free lines), totals, notes, delete; new job. Still to come in Lucrări: check-in from a booking (with Programări), the inspection checklist, the activity history. Phase 2 (Facturi) done: list with filters and what is left to collect, swipe to collect; draft editing (client, dates, lines, notes, refresh from the job), issue (next number, snapshot, stock out), issue and collect in one step, payments with undo, storno (stock back, what to refund), redo, the document on screen and as PDF, share by WhatsApp/SMS; "Fă factura" on a job. Phase 3 (Azi) done: the day and quick actions, a search over jobs and invoices, Deja în service (stage chips, next step on the card), De confirmat (Confirmă, Sună; for late ones A sosit = check-in and Neprezentat), De încasat (Încasează, WhatsApp memento), Analiză (7 zile / 30 de zile / 12 luni, Swift Charts); the app opens on Azi. Phase 4a (Toate programările) done: four numbers that filter, status chips with counts, period / mechanic / sort, search, rows by day with booked time, swipe Confirmă / A sosit / Anulează / Neprezentat with undo; booking page and form (next open slot, duration from the operations, live overlap warning, moving a confirmed booking asks whether the customer knows), cancel with a reason, delete. Phase 4b (the calendar) done: Programări has a Listă / Calendar switch; the day view has a week strip (swipe or arrows, dots on days with bookings), a column per mechanic, the hours, a red now line; tap a free slot to book it for that mechanic; long-press and drag to move (15-minute snap, across mechanics, haptics), after lifting a handle stretches it; a confirmed booking moved in time asks whether the customer knows; undo. A UI test (`GarajUITests`, run on demand) drags a booking an hour and undoes it. Not yet: week and month views. Phase 5a (Clienți, Mașini) done: lists with search (name, phone, plate, CUI, VIN, owner), ITP / RCA / revizie badges; client page (call / SMS / WhatsApp, visits, last visit, no-shows, what is left to collect, contact, cars, jobs), car page (plate, owner, ITP / RCA / revizie with the km estimate, mileage log and a new reading, jobs); forms with live checks (CUI control digit, email, VIN, unique plate); delete with the web's rules. Phase 5b (De contactat, Catalog) done: reminders by kind (ITP, RCA, revizie, restanțe, de ridicat, mâine) with the message ready for WhatsApp / SMS, a consent warning, contacted / snooze (1, 7, 30 days) with undo, the count on the Mai mult tab; Catalog with operations by category and parts with available / reserved stock, edit forms (price from labor rate, price from cost + markup, margin), goods receipt. Car fuel is stored as the web's key (petrol, diesel, …). Phase 5c (Rapoarte, Setări) done: Rapoarte with the four periods, the period's numbers, revenue by day / month as stacked Swift Charts columns (touch to read one, a table view), best-selling operations, mechanics, payments by method (donut), receivables by age; Setări with the shop profile (logo, CUI / IBAN / email checks), invoicing (series, next number only upwards, VAT, due days, default notes), rates, the reviews link, opening hours and days, team and bays (forms; one with history is deactivated, not deleted, with undo), theme, and Date și backup. Every screen is now native; next is phase 6 (clean-up).

The owner's decisions:

- The iPhone app becomes a **truly native SwiftUI app** using Apple's own controls everywhere. **iPhone only**: the web/desktop version keeps its current UI (Next.js, `src/components/ds`).
- The business rules are **ported to Swift** (not run from JS).
- The native app **replaces the current one right away** (same bundle id `com.albertoparos.garaj`); screens not rebuilt yet show "În lucru" until their phase lands.
- Order: **Lucrări → Facturi** first (the daily money path), then Azi, Programări, Mai mult.

## 1. What changes and what stays

| | Today | After |
|---|---|---|
| iPhone UI | Next.js pages in a WKWebView (Capacitor 8) | SwiftUI, Apple's controls only (`ios-native/`) |
| Desktop / web UI | Next.js | unchanged |
| Business rules | `src/domain/` (JS, `npm test`) | JS stays the reference for the web; `ios-native/Garaj/Domain/` is its Swift port |
| iPhone data | IndexedDB inside the web view | `garaj.json` in Application Support (atomic writes), same shape as a backup |
| Backup format | `{ app: "garaj", format: 1, collections, meta }` | identical, so backups move freely between phone and desktop |
| CLAUDE.md UI rules (DS components, tones, skeleton until ready) | apply | apply to the web only; the iPhone app follows Apple's HIG and the `apple-design` + `ios-design-guidelines` skills |

## 2. Keeping two copies of the rules equal

Porting means every rule exists twice. To stop phone and desktop drifting apart (a VAT rounding difference is a real bug):

- **Golden fixtures**: `npm run ios:fixtures` runs the JS rules on a set of inputs (money parsing, line totals, invoice totals, status moves, …) and writes `ios-native/GarajTests/Fixtures/*.json`. Swift tests run the same inputs through the Swift port and must give the same outputs. A JS rule change that is not ported makes the Swift tests fail.
- Each Swift file names the JS file it ports (`// Port of src/domain/money.js`).
- A rule change is done when both `npm test` and the Swift tests pass.

## 3. Moving the data on the phone

The native app takes over the same bundle id, so the old app's web storage is still on the phone. On first launch the native app opens a hidden web view on the old app's origin (`capacitor://localhost`), reads every IndexedDB collection and saves it natively, once. Before installing, a raw copy of the app's data container is pulled off the phone as a safety net, and a backup can always be imported from Mai mult → Setări → Date.

## 4. Apple elements, screen by screen

| Today (web) | Native |
|---|---|
| Bottom tab bar (Azi · Programări · Lucrări · Facturi · Mai mult) | `TabView` with SF Symbols, badges, the iOS 26+ Liquid Glass tab bar, a search tab |
| Page header | `NavigationStack`, large titles, toolbar buttons, `.searchable` |
| Lists, rows, cards | `List` (inset grouped), `Section`, swipe actions, context menus, pull to refresh |
| `Sheet` forms | `.sheet` with detents (medium/large), `Form`, `TextField`, `Picker`, `Toggle`, `Stepper` |
| Date / time inputs | `DatePicker` (compact, wheel, graphical) |
| Status menu | `Menu` / `Picker`, confirmation dialogs for destructive steps |
| Toasts with undo | native undo (shake / three-finger), plus a small banner for "Anulează" |
| Empty states | `ContentUnavailableView` |
| Reports charts | Swift Charts |
| Invoice print/PDF/share | PDF rendered natively (`ImageRenderer`), `ShareLink`, print sheet |
| Haptics (`src/lib/haptics.js`) | `sensoryFeedback` |
| Calendar (day per mechanic, endless week strip, drag/stretch) | **No Apple control exists for this.** Built in SwiftUI with native gestures, springs and haptics, styled like the iOS Calendar app |
| Phone / SMS / WhatsApp actions | `Link` to `tel:`, `sms:`, WhatsApp URL |
| Car brand logos (`car-logo-paths.js`) | converted to SF-style vector assets |

## 5. Phases (each one ships as its own PR, installed on the iPhone)

| # | Phase | Done when |
|---|---|---|
| 0 | **Foundation**: `ios-native/` Xcode project (xcodegen, SwiftUI, iOS 26+), models, native store + persistence, migration from the old app, backup import/export, golden fixtures, Money + dates port, `TabView` shell, read-only Lucrări list | The phone opens the native app with its existing data |
| 1 | **Lucrări**: detail, status, lines editor, check-in (rules: lines, work-order, flow, lucrare) | A job can go from booking to "gata" natively |
| 2 | **Facturi**: list, document view, issue, payment, storno, PDF + share (rules: invoice, numbering) | An invoice can be issued, paid and shared |
| 3 | **Azi**: cars in service, to confirm, to collect, analytics grid | Home matches the web's content |
| 4 | **Programări**: Toate programările, then the calendar (day/week/month, drag, stretch, undo) | Biggest phase; calendar is custom |
| 5 | **Mai mult**: Clienți, Mașini, De contactat, Catalog, Rapoarte (Swift Charts), Setări | Feature parity with the web on the phone |
| 6 | **Clean-up**: Capacitor iOS project removed, CI `ios` job builds `ios-native/` | Only the native app remains |

## 6. Costs accepted

- **Two UIs and two copies of the rules**: every new feature is built twice; golden fixtures keep the rules equal.
- **Size**: ~16,000 lines of feature UI and ~5,700 lines of rules; many weeks. The calendar is the largest single piece.
- **Gaps until parity**: screens not yet rebuilt are missing on the phone; use the web version (desktop or Safari) for them meanwhile.
- **CI**: GitHub's `check` job can't build iOS; Swift tests run on the Mac runner with the `ios` job, which first needs its signing fix (Xcode account on the runner).
