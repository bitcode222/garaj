# The native iPhone app (SwiftUI): plan

Status: **approved 2026-11-15**. Phase 0 done and on the iPhone (every record moved, checked against the old database). Phase 1 (Lucrări) done: list with totals, swipe to the next step, undo; job detail with status moves, contact (call/SMS/WhatsApp with the estimate), complaint/diagnosis, lines editor (catalog, stock, free lines), totals, notes, delete; new job. Still to come in Lucrări: check-in from a booking (with Programări), the inspection checklist, the activity history. Phase 2 (Facturi) done: list with filters and what is left to collect, swipe to collect; draft editing (client, dates, lines, notes, refresh from the job), issue (next number, snapshot, stock out), issue and collect in one step, payments with undo, storno (stock back, what to refund), redo, the document on screen and as PDF, share by WhatsApp/SMS; "Fă factura" on a job. Phase 3 (Azi) done: the day and quick actions, a search over jobs and invoices, Deja în service (stage chips, next step on the card), De confirmat (Confirmă, Sună; for late ones A sosit = check-in and Neprezentat), De încasat (Încasează, WhatsApp memento), Analiză (7 zile / 30 de zile / 12 luni, Swift Charts); the app opens on Azi. Phase 4a (Toate programările) done: four numbers that filter, status chips with counts, period / mechanic / sort, search, rows by day with booked time, swipe Confirmă / A sosit / Anulează / Neprezentat with undo; booking page and form (next open slot, duration from the operations, live overlap warning, moving a confirmed booking asks whether the customer knows), cancel with a reason, delete. Phase 4b (the calendar) done: Programări has a Listă / Calendar switch; the day view has a week strip (swipe or arrows, dots on days with bookings), a column per mechanic, the hours, a red now line; tap a free slot to book it for that mechanic; long-press and drag to move (15-minute snap, across mechanics, haptics), after lifting a handle stretches it; a confirmed booking moved in time asks whether the customer knows; undo. A UI test (`GarajUITests`, run on demand) drags a booking an hour and undoes it. Not yet: week and month views. Phase 5a (Clienți, Mașini) done: lists with search (name, phone, plate, CUI, VIN, owner), ITP / RCA / revizie badges; client page (call / SMS / WhatsApp, visits, last visit, no-shows, what is left to collect, contact, cars, jobs), car page (plate, owner, ITP / RCA / revizie with the km estimate, mileage log and a new reading, jobs); forms with live checks (CUI control digit, email, VIN, unique plate); delete with the web's rules. Phase 5b (De contactat, Catalog) done: reminders by kind (ITP, RCA, revizie, restanțe, de ridicat, mâine) with the message ready for WhatsApp / SMS, a consent warning, contacted / snooze (1, 7, 30 days) with undo, the count on the Mai mult tab; Catalog with operations by category and parts with available / reserved stock, edit forms (price from labor rate, price from cost + markup, margin), goods receipt. Car fuel is stored as the web's key (petrol, diesel, …). Phase 5c (Rapoarte, Setări) done: Rapoarte with the four periods, the period's numbers, revenue by day / month as stacked Swift Charts columns (touch to read one, a table view), best-selling operations, mechanics, payments by method (donut), receivables by age; Setări with the shop profile (logo, CUI / IBAN / email checks), invoicing (series, next number only upwards, VAT, due days, default notes), rates, the reviews link, opening hours and days, team and bays (forms; one with history is deactivated, not deleted, with undo), theme, and Date și backup. Every screen is now native. Phase 6 (clean-up) done: the Capacitor project (`ios/`, `capacitor.config.js`, the `@capacitor/*` packages) and the web code that only ran inside it (status bar, native print and haptics plugins) are removed; web haptics use `navigator.vibrate` where a browser has it.

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

## 7. The look: variant A, one to one (picked 15 Nov 2026)

The owner compared six looks on a board (https://claude.ai/artifact/PAWzmYUBS3yBvLiMgny3qp) and picked **A · Nativ iOS** with the orange palette; the app is being made to match that board screen by screen. A sets the layout and the look; what the app does that A does not show stays, lower on the screen or in a menu. Shared pieces live in `ios-native/Garaj/Views/Components.swift` (`StatusPill`, `StatTile`, `QuickAction`, `IconSquare`/`IconRowLabel`, `TimeColumn`, `CapsHeader`).

| PR | Screens | Status |
|---|---|---|
| 1 | Status capsules everywhere, Azi (greeting + day, 4 shortcuts, 4 number tiles, rows for in service / to confirm / to collect, analytics), Mai mult (Settings-style icon squares with counts) | merged (#39) |
| 2 | Lucrări (search, filters with counts, rows), Lucrare (header card with plate, next-step button, complaint, lines, total), Facturi (2 tiles, filters, rows by month), Factură (the document on screen, collect + WhatsApp buttons, payments) | merged (#40) |
| 3 | Programări (list/calendar switch under the title, time column rows), Calendar (mechanic colors), Clienți (avatars), Mașini (plate rows, ITP/RCA capsules), De contactat, Catalog, Rapoarte, Setări | merged (#43) |

## 8. Look 2 "Pată de culoare" and the editing round (picked 16 Nov 2026)

Round-2 board: https://claude.ai/artifact/G3kDyaAPJFpQeoYgkCEs13. The owner picked **2 · Pată de culoare** (orange) and asked for everything to feel native, plus much more editing: operations on a booking that can be tapped, edited, reordered and priced; sorting and editing on every list.

| PR | What | Status |
|---|---|---|
| 1 | The band (`Views/Look.swift`: accent band with soft circles behind the title, follows the scroll, never shorter than the bar so the inline title stays white on orange), car make logos (`npm run ios:logos` writes template SVG image sets from `src/lib/car-logo-paths.js`; `MakeLogo` with brand colors), work-kind icons (`WorkKind`, by catalog category or words) on job lines | merged (#43) |
| 2 | Booking operations: list with icon, duration, mechanic, price; edit sheet (kind, name, duration and quantity steppers, price from the labor rate, mechanic, parts); reorder, delete, add from catalog or free; total with VAT; saved in the web's `operations` shape | merged (#44) |
| 3 | Sort and group menus on every list (remembered), swipe Editează, reorder where order matters | merged (#45) |

The status bar text is left to the system (iOS 26 picks it from what is behind it; black on this orange reads well).

## 9. Look 3 "Coperți" (picked 16 Nov 2026)

Round-3 board: https://claude.ai/artifact/JxQ97krZXRKRx2TowZzMoa. A design system taken from a podcast app the owner likes, applied four ways; the owner picked **A · Coperți** (light). The orange band of look 2 goes; color now comes from the content.

Rules:

1. **Color comes from the content.** The car's make colors its card, its page and the sheets opened from it (`Make.colors`).
2. **Each area keeps one color** (`Area` in `Views/Look.swift`): Programări sky, Lucrări peach, Facturi lavender, Clienți butter, Mașini mint, Stoc pink, Catalog teal, Rapoarte green.
3. **One filled button per card:** an ink capsule (`.primary`; white `.onColor` on a car's color). Other actions are round glass buttons (`.circle`) or grey capsules (`.secondary`).
4. **Four levels of text:** large title → `SectionHeader` (bold, › when it opens everything, one muted line under it) → card → row. Status only in small capsules.
5. **What runs sits at the bottom:** the started job above the tab bar, with its timer (`tabViewBottomAccessory`).
6. **Menus grouped with icons; sheets with Renunță / Salvează; empty lists with a sentence and a button that fixes it.**

Tabs: **Azi · Atelier · Agendă · Registru**, and search as its own tab (`Tab(role: .search)`; iOS decides whether it sits in the bar or apart). Registru holds Facturi, Rapoarte, Clienți, Mașini, De contactat, Catalog, Setări.

| PR | What | Status |
|---|---|---|
| 1 | Base: new tabs and Registru, search tab, ink capsule buttons and chips, glass circle style, `SectionHeader`, area colors; the band removed | merged (#46) |
| 2 | Covers: Azi carousel of make-colored cards (paging, "1 / 5"), Atelier cards with a one-line summary, Lucrare page headed in the car's color, grouped "…" menus (`Views/Covers.swift`: `CoverCard`, `JobCard`, `MakeTile`, `.cover()`, `JobText`) | merged (#47) |
| 3 | Car-colored sheets (`.carSheet(make)`: the job's line editor, the booking's operation sheet), Mașina page (cover with logo, plate, facts, owner; history cards tinted by the kind of work; deadlines), empty lists with a sentence and a button (jobs, invoices, clients, cars, bookings) | merged (#48) |
| 4 | The running job: `src/domain/work-clock.js` (time log `timeLog: [{ id, staffId, start, end }]`, starting work moves the job to in progress and stops the mechanic's other running job; `line.done`; steps = labor lines) with tests, `Domain/WorkClock.swift` against `work-clock.json`; `Views/RunningJob.swift`: the bar above the tabs (`tabViewBottomAccessory`, timer, step, Pauză, ✓ for the step; tap opens the job) and the main button of a job (Începe/Continuă/Pauză). Fixed with it: the data file was looked up with a percent-encoded path, so every launch re-imported the old app's data | merged (#49) |


## 10. Talon scanner (18 Nov 2026, iPhone only)

The owner asked for document scanning as a real feature, after a reference with a camera frame and a "Looking good?" review. They picked **Talon → car**. Round 2 put the button in the tab bar, added photos and Files as sources, and asks what comes next.

- **Where (round 3):** not in the tab bar, which is back to Azi · Atelier · Agendă · Registru (search sits at the top of Azi). Two places instead:
  - **Azi:** a "Scanează talonul" quick button beside Programare / Deviz / Lucrare / Factură nouă. After the check, it asks **"Adaugi mașina la o lucrare?"**: add to the open job #N, Lucrare nouă, Deviz nou, Programare nouă, or "Nu, doar salvează mașina".
  - **A car's page:** a Documente section (and a Scanează menu in the bar).
    - **Scanează talonul** fills in that car: matched to it whatever was read. It warns when the VIN belongs to another car (and refuses to save) or differs from the one on file. Then "Actualizează mașina" or "Actualizează și fă un deviz" (asking first when a job is open).
    - **Scanează un document** keeps any paper on the car under a name: ITP, RCA, CASCO, CIV, Factură piese, Deviz semnat, Proces-verbal, Garanție or typed. ITP and RCA can take their expiry date, which goes on the car (`itpExpiry`, `rcaExpiry`) and so into De contactat.
    - **The list:** the talon and the documents show there, open full screen, and swipe to delete.
- **Sources:**
  - **Camera:** live edge search (Vision, about 8 a second), with white corner marks that follow the page. "Ține nemișcat" shows once it holds still. Flash Auto / Pornit / Oprit and "Fă poza".
  - **Photo library or Files:** a picture, or a PDF whose first four pages are tried in turn.
  - **Without the camera** (no permission, or the simulator): the gallery and Files buttons sit in the middle of the screen.
  - **Large pictures:** scaled to 3000 px to save memory.
- **Review:** "Arată bine?" with the page cut and straightened. Decupează (drag the four corners), Rotește, Confirmă talonul, Refă.
- **Reading:** `TalonParser` reads the EU codes: A plate, B year, C.1 holder, C.2 owner, C.x.3 address, D.1 make, D.3 model, E VIN, P.1 cc, P.3 fuel, R colour.
  - Plate and VIN are also found by their shape.
  - Cyrillic look-alikes and O/0, I/1 in the VIN are fixed.
  - A sideways picture is tried all four ways.
  - When holder and owner differ, the leasing company goes aside and the other name is the client.
- **"Ce am citit":** nothing is saved yet.
  - **Status:** new car, or already in the register (matched by VIN first, then plate) with the fields that would change.
  - **Warnings:** the plate is on another car; matched by plate but the VIN differs (maybe a moved plate); an open job; an upcoming booking.
  - **Car fields:** all editable.
  - **Client:** the owner on file, namesakes with phone and number of cars, any client from the register, or a new client from the talon. Two or more namesakes pick nobody. A different name than the owner on file explains that a sold car moves to the new client, while old jobs and invoices stay with the former owner.
- **"Ce urmează":** Adaugă / Actualizează / Deschide mașina, Deviz nou, Lucrare nouă, Programare nouă. Each saves the client and car, then opens it.
  - An open job asks "Deschide lucrarea #N" or a new one.
  - An upcoming booking asks to open it or make another.
  - "Renunță" saves nothing.
- **Saving:** `AppStore.talonReview(_:for:)` and `AppStore.saveTalon(_:client:into:)` check the plate and the VIN before writing anything. Documents live in `Scans/<car id>/` with an `index.json` (`CarDocuments`). The picture is kept on the phone (`Scans/<car id>-talon.jpg`) and shown under Documente on the car. It is deleted with the car or its client, since it holds personal data.
- **Not on the web:** the web app has no scanner, and the talon picture stays on the phone.
- **Debug:**
  - `-GarajScan 1` opens the scanner.
  - `-GarajScanCar talon|document` with `-GarajOpenVehicle <id>` scans onto that car.
  - `-GarajScanImage <path>` starts from a picture, and `-GarajScanRead 1` confirms it.
  - `-GarajScanBottom 1` scrolls to "Ce urmează".
  - `-GarajScanNext car|estimate|job|booking` picks the next step.
