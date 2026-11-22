# Garaj · design language

One language for the web and the iPhone app, taken from the iPhone's look 3 "Coperți" ([`IOS-NATIVE.md`](IOS-NATIVE.md) §9).
It replaces the old web design system (removed 16 Nov 2026).

Status: **built** (16 Nov 2026, PRs #50–#57). Board: round 5, https://claude.ai/artifact/XjEeKzMcBaw2Kcg7fxUdds
(the professional pass, with the car-colour gradients kept as on the phone).

## 1. Rules

| # | Rule | In practice |
|---|---|---|
| 1 | Colour comes from the car | A job, a car and their pages take the make's colour (the phone's table, deepened so white text reads; yellow makes stay light with black text). Everything else is neutral. |
| 2 | Each area keeps one colour | Programare teal, Deviz violet, Lucrare orange, Factură blue, Clienți yellow, Mașini green, Catalog cyan, Rapoarte green, De contactat red. Used on its icon, its "Nou" tile and its kind label, never as a page background. |
| 3 | State is a small coloured dot with words | Green done/paid/ready, amber waiting, red late, grey closed. A kind colour never means a state. |
| 4 | One filled button per card | The black ink capsule (white on a car colour) for the next step. The rest are round buttons or the "…" menu, with grouped items. |
| 5 | Four text levels | Page title 34 bold → section 22 bold with "›" and a grey line → card title 17 → row 15. Eyebrows are 12 uppercase grey. Money is tabular. |
| 6 | The running job is always in view | A floating glass capsule at the bottom centre of every page. |
| 7 | Useful empty states | An icon, one sentence and the button that fixes it. |

## 2. Shell

Sidebar on the left, 208 px: the shop, search ⌘K, and one compact list (Azi, Atelier, Agendă, then Bani · Oameni și
mașini · Atelier, set apart by a gap, with no titles, sub-items or recent records). Phosphor icons, outlined and grey; the
selected one filled in its area colour, under one pane of liquid glass that glides to the picked route (`shell/nav-glide.jsx`). A thin toolbar over the content (back, page actions, the black "Nou").
Under 700 px the web looks like the iPhone app: tab bar Azi · Atelier · Agendă · Registru · Caută.

## 3. Shapes and surfaces

Neutral canvas (`#F7F7F8` light, `#0F0F11` dark), white cards with radius 12 and a 1 px hairline, covers radius 14,
buttons 32 tall (28 small) with radius 8, square icon buttons with a hairline. Inter; page title 26, section 15.5
semibold, rows 13.5, eyebrows 11 uppercase. Car colours keep their gradients (cover art, the Lucrare, Mașină and
client headers fading into the page). Calendar and timeline blocks are a light tint of the car with a coloured edge.
The floating surfaces are liquid glass ([`LIQUID-GLASS.md`](LIQUID-GLASS.md), `ds/glass.jsx`): the phone's top bar, tab bar
and action bar, the running job (dark glass, light in dark mode), menus, popovers, selects, the ⌘K window and the
mini month. Setări › Aspect › "Sticlă lichidă" turns it off on the device; cards and pages are never glass.

## 4. Screens (owner's picks)

Where two variants were chosen, the page has a small switch at the top right (a segmented control) and remembers the
choice on that device. A detail page follows the view it was opened from.

| Group | Pick | The switch | Screens |
|---|---|---|---|
| Azi | one page | none | One page, no look switch (owner, 21 Nov 2026; the "Ziua" look is gone). From the top (desktop, 18 Nov 2026): **De acceptat** (bookings still to accept as outlined covers — dashed border, no fill, the make tile in the car's colour — with an amber "De confirmat" label, in day order, each naming its day (no day labels in the row, so the covers sit on the În atelier grid), one-tap Confirmă with undo; no section when none), **În atelier** (the jobs as covers), the **money row** (Încasat azi by method · Mai poate intra azi: ready cars + invoices due today · the month so far against the month before, cumulative), and last **Ziua în atelier** (the day board of Agendă → Zi, for today, under its own title; moved to the bottom by the owner, 21 Nov 2026). Type on tablet and desktop: **Manrope**, titles and money at 800 with tight tracking (`.azi-type`; owner's pick D from https://claude.ai/artifact/UZ2E9kTM1UWSbTdsEfDViK, 21 Nov 2026); the other pages, the sheets and the phone keep their fonts. |
| Atelier | A + B | Etape · Tablă | A: job cards grouped by stage; Lucrare and Deviz open as a full page with the car-coloured header; Recepție is a centred sheet. B: a board with a column per stage, drag to move; Lucrare, Deviz and Recepție open in a panel on the right. |
| Agendă | A | none | The week by the hour with blocks tinted by the car, the list grouped by day, a booking as a centred sheet in the car's colour. |
| Bani | A + B | Tabel · Plăci | A: invoices as a table under the month's numbers; the invoice as the printed page with its status beside it; reports as simple charts. B: invoices as cards with the amount first, grouped (to collect, drafts, paid); the invoice with the amount in a car-coloured header; reports as a dashboard. |
| Oameni și mașini | A + B | Listă · Galerie | A: dense tables; a plain client header. B: clients as cards, cars as a shelf of covers, the client page in their car's colour, De contactat with the message ready to send. Mașină is the same page in both. |
| Catalog, setări, căutare | A + B | Listă · File | A: catalog as a table, settings as the iPhone's grouped list, search as a floating ⌘K window, Nou as a menu of tiles under the button. B: catalog and settings with tabs on the left, search as a results page, Nou as a centred sheet. ⌘K always opens the window; "Vezi toate" opens the page. |

The current home (hero search, day ruler, stage sections) is replaced by Azi; its analytics move into Rapoarte.

Azi was reworked on 18 Nov 2026 from the round-2 board (https://claude.ai/artifact/Fm5Xv1Xbzte3UzS36iW8QD): the owner
kept the covers, asked for the bookings to accept above them, and picked the lifts by the hour and three money blocks for
the area below. The day's four numbers, "Agendă azi" and "De încasat" left Azi. The money comes
from `src/domain/analytics.js` (`takingsToday`, `stillToCollectToday`, `monthToDate`), ported to `Analytics.swift`.

### Agendă, second pass (owner, 16 Nov 2026)

The calendar keeps how it works (drag, filters, search, warnings, day/week/month, scrolling both ways, the mini month).
Its head is the pages' head ("Agendă", what is in view under it; the view, ‹ › and Azi on the right; Calendar · Toate,
the search and the settings under it). Blocks are a tint of the car's colour with that colour as the left edge in
every view, a state is a plain dot, mechanics' avatars are neutral, their columns are no longer tinted, today is an ink
circle and now is a red line, as on Azi.

### Sheets "A" with the card's head (owner's picks 19–20 Nov 2026, board https://claude.ai/artifact/GBUact6KBar7C7Qsbxo3Uc: S, S2, T5)

Replaces the "car's colour all over" look below. Only the head of a car's sheet is in the car's colour (`.car-sheet-*`
tokens on the head alone): the logo box at the left as on the cards (`cover.code` at its top left, the plate at its
bottom), beside it the state pill, the title and a few lines (`cover.car` • plate, `cover.lines`), then the main glass
button (`CoverButton`, stretched) and the round glass ones (`CoverIconButton`), then the visit bar. The head ends in a fade into the body (owner, 21 Nov 2026). The body has the
dashboard's background (`.sheet-a`), its sections rounded groups in the dashboard's card colour under big 20 px bold titles (`.sheet-a-body`). The job's sheet orders them as the desk asks: alert, Ce reclamă clientul, Recepția (km, fuel,
inspection), De făcut la mașină, Deviz, Factură, Note interne (yellow tint), Mai multe (mechanic, bay, stages, history).
22 Nov 2026 (owner): a sheet's logo box has no gradient, only a faint flat fill, and the record's number moved out of it to the top of the right column, above the state.
22 Nov 2026 (owner): in the dark theme a sheet's edge is a faint 6% white, not the brighter `--border`. The sheet's shadow is one soft 48 px layer in both themes.
22 Nov 2026 (owner): more room at the top of a sheet; "Toate detaliile" (the full page, with its icon) and close are round liquid glass, in one line at the top right, above a car's colour from tablet up.
22 Nov 2026 (owner): behind an open sheet the page is blurred, not darkened (`sheet-blur`: 8 px from tablet up, one layer, only its opacity animates; none on a phone, where the sheet covers the screen).
20 Nov 2026 (owner): the head scrolls away with the body; a car's sheet is 40 rem (640 px) wide (widened 21 Nov 2026), its content and the head's colour inset 36 px from tablet up (21 Nov 2026); a booking's sheet has no colour on its head, only a dashed left, top and right edge fading out at the bottom (21 Nov 2026), other sheets keep
42 rem; no visit bar in the head. A job's "…" (`JobMenu`, as on its card) holds every move of its state, the visit's
booking, invoice and review, the full page, writing to the client and deleting it; a booking's "…" (`BookingMenu`)
reaches its job and invoice and its edit form.

Receiving the car (owner, 20 Nov 2026: "the whole flow in a separate modal"; flow R1 "Pas cu pas"): `ReceptionFlow`
is a window of its own (full screen on a phone, 28 rem centred from md up) with five steps (Bord: km and fuel;
Martori aprinși; Caroserie: tap the car drawn from above, then the kind of mark; Problema and what was left in the car;
Confirmare: the summary and the client's word), saved on the last one (`src/domain/reception.js`,
`saveWorkOrderReception`). The job's sheet shows only `ReceptionCard`: "Începe recepția" before, then what was filled
in one line, the marks on a small drawing and whether the client confirmed; tapping it opens the window again. The
inspection checklist is its own section, after the work. Web only for now; the iPhone app gets it later.

### Sheets (owner's pick, 16 Nov 2026, board https://claude.ai/artifact/1yjxRSfQoMKsYEa6BPdeqJ: A)

A sheet about one car is in that car's colour all over, as the iPhone's `carSheet`: the cover colour behind, the logo on
its art, the title centred with the state as a quiet pill, rows and fields a light veil of the ink, the main button white
(black on yellow makes). Done in `Sheet` (`tint`, or `make` with a visit bar) by redefining the colour tokens inside the
panel (`.car-sheet-dark`, `.car-sheet-light` in `globals.css`), so every field stays editable as before. Car sheets:
a visit's records (booking, estimate, job, invoice), the car, the client (their first car), the booking form and the car
form once a car is chosen, Recepție once a car is chosen. Sheets with no car (parts, operations, payment, team) stay
neutral.

Second pass (owner's pick "A · Capsule sub titlu", board https://claude.ai/artifact/Rgsc7cfr41UCgzYQjRkiyU): on a car's
sheet the main buttons sit under the title (the sheet's `footer` moves there: the booking's next step, the job's next step
and call, the invoice's Încasează and PDF, a form's Renunță and Salvează); in forms each field is an iPhone row, label on
the left, value on the right, in rounded groups with their title above (`[data-field]` rows, `globals.css`); a view's
sections are rounded groups.

### Agendă, third pass (owner's pick A + E, 16 Nov 2026, board https://claude.ai/artifact/QcYyQTxWy1eZ61cKtY7A4f)

The calendar keeps its views (Zi, Săptămână, Lună) and all it does (drag, filters, search, warnings). Bookings are
cards in their car's colour with depth, a soft glow of that colour and the logo large as a watermark
(`features/calendar/craft.jsx`); day numbers are set large, today in red; an hour is 64 px on a desktop (was 48).
**Săptămână** has two looks, its own switch beside the views ("Ore · Albume", kept on the device, `garaj.agenda.week`):
**Ore**, the hours grid on a white sheet (pick A); **Albume** (desktop), the week as tall day cards side by side, each a
stack of car cards in the day's order, with its own ‹ › and Azi and a "+" per day (`features/calendar/album-week.jsx`,
pick E). Bookings still to confirm: a dotted white outline (and an amber dot in Albume).

### Agendă, Zi (owner's pick C, 16 Nov 2026, board https://claude.ai/artifact/2mZRpiUQRqgMNNrqcxgMgX)

**Zi on a desktop is the day board** (owner, 20 Nov 2026; replaces Linie · Mecanici and "Ziua pe scurt",
`features/calendar/day-board.jsx`): one day, ‹ › and Azi move it, the mini month picks it. Rows by lift or by mechanic
(**Elevatoare / Mecanici**, `garaj.azi.lanes`; Mecanici leaves out the front desk), the days are one carousel (21 Nov 2026):
click-and-drag or a sideways scroll runs freely through them, ‹ › step, what is in view in the top-left corner. On Azi the
section has its own ‹ › and Azi and a **Zi / Săptămână** switch (`garaj.azi.range`; a week starts on Monday). Rows are
renamed in place, dragged by their handle into a new order and added at the bottom (a new lift or mechanic). Any card dragged
along the hours, to another day (the board's sides scroll while carrying it) or to another row takes that place on the quarter
hour, with its landing spot drawn under the pointer and one undo (21 Nov 2026). `src/domain/board-move.js` says what can't go
where, in red on the spot: a booking still to come into the past, logged work into the future or over the job's other
stretches, a running stretch, a closed job. A hand that hardly moved along the hours keeps the exact time. **Every change to a job
is in its Istoric** (`src/domain/job-log.js`): who, when, from what to what, for the booking's time, logged work, lift, mechanic,
lines and notes; typing folds into one entry, an undo is a new entry. A row change takes the booking's job along; dragged by an end it takes
a new start or end on the quarter hour — a booking through the calendar's reschedule (confirm setting, overlap warning,
undo), a job's logged work through `setEntrySpan` (`src/domain/work-clock.js`: no overlap with the job's other stretches,
a running one keeps running). Jobs on a lift on the car's cover; bookings a grey dashed outline with the make tile. A
tablet and the phone keep their own day. Cards that overlap on one row stack in levels and the row grows (20 Nov 2026); a card half under the row names keeps its logo and text in view; a narrow card shows only the logo; one day in view keeps every hour at 56 px or more.
**Overlaps** (21 Nov 2026, `src/domain/board-clashes.js`): only those still ahead, on a lift or mechanic. The shared time is hatched amber, the cards get an amber edge, a ⚠ marks the spot, and a line above the board names each one. Either opens the quick fixes, for whichever car you pick (the one still to come first): up to two free rows at the same time, the nearest time after or before, only the free part, the nearest hour on another row, the next open day. Logged work can only change row; each fix has an undo.

**Outside working hours** (owner, 21 Nov 2026): one day in view runs 00:00–24:00, opens on the working hours at their usual scale, and scrolls sideways to the rest. Closed hours and closed days are shaded. A card can be dropped there, and its landing spot says "în afara programului". Quick fixes still suggest working hours only. The week view keeps to the working hours so its cards stay readable. **Closed days fold** to a thin strip with their day and date: a click opens one and a small button folds it back, a card carried onto a strip opens it, and ‹ › walk past strips. Today and a closed day holding a card never fold.

### Telefon ca iPhone (owner, 17 Nov 2026, board https://claude.ai/artifact/XZjoSBj5YhRWmdHKBATf8d)

Under 768 px the web is a one-to-one copy of the iPhone app (`ios-native/`, checked side by side with the simulator at
the same width). The desktop keeps everything above. The phone has one look per screen, the iPhone's: the A/B switches
are a desktop thing. One exception, by the owner's choice: the Agendă calendar takes the iPhone's layout (Listă ·
Calendar, the week as a row of days, the mechanics as a legend) with the web's car-coloured cards inside it.

| Step | What | Status |
|---|---|---|
| 1 | The frame: no top bar; each page's nav row (round glass buttons: "+" by default, "‹ Registru" on its pages, the account on Registru) over a 34 px bold title that shrinks into the row as it scrolls away (`ds/nav-bar.jsx`, `PageTitle` `actions`, `inline`, `phoneTitle`); the tab bar as a floating glass capsule, the tab in view in a grey pill, orange, "Căutare" a tab with its page; the iOS grouped grey and the system font; the running job a light capsule | done |
| 2 | Registru (three groups, bold headers, the iPhone's area colours `IOS_AREA`, values: to collect, how many) and Căutare (large title, the grey search capsule, the empty state, matches in capped groups with their state as a pill), from `ds/ios.jsx` (`IosGroup`, `IosRow`, `IosPill`, `IosEmpty`, `IosSearchField`) | done |
| 3 | Atelier (`features/work-orders/phone-list.jsx`): title small in the row with sort/group (kept on the device) and "+", the search capsule, a chip per state with its count, open jobs as the iPhone's JobCard (72 pt tile, car · plate, state pill, client · amount, the summary, the next step, call, "…"), closed ones as rows, 40 at a time; a section's net total under it | done |
| 4a | Agendă · Listă (`features/appointments/phone-appointments.jsx`): large title with the filters (period, mechanic, order) and "+", Listă · Calendar, the search, the four numbers (each a filter), a chip per state, the bookings by day (time and length, client, plate · what for, state, mechanic, number), swipes kept; the phone's Agendă tab opens on the Listă the first time | done |
| 4b | Agendă · Calendar (`features/calendar/phone-week.jsx`, `DayStrip` `bare`): "Agendă" small in the row with Azi and "+", Listă · Calendar, the month with orange ‹ › for the weeks, the week as a row of days (the day in view filled, today orange, a dot where booked), the mechanics as a legend over their columns; one day at a time, a column per mechanic, sideways to other days, with the web's car-coloured cards (owner's choice). Drag, warnings and the sheets as before | done |
| 5 | Azi (`features/dashboard/phone-azi.jsx`): the greeting as the title and the day with the hours under it; "În atelier ›" with its stage menu; the cars as 300 × 380 covers in their colour, one at a time sideways, "1 / 13" with its bar; Programare · Lucrare · Factură; four numbers (În service, De confirmat, De încasat, Venit în <lună> against last month), each scrolling to its section; De confirmat (Confirmă / A sosit), De încasat (state, when, balance), Analiză (7 zile · 30 de zile · 12 luni, two large and four small tiles with their line) | done |
| 6a | Registru's lists (`features/phone/registry-lists.jsx`): Clienți (avatars, phone · car, visits or what is overdue; sort and group), Mașini (the make's circle, plate, car · owner, the most urgent of ITP/RCA/service as a pill, km; sort and group), De contactat (by kind; WhatsApp, SMS, call with the message ready; swipe: contacted, snooze), Facturi (two numbers, state chips, by month; swipe: collect), Catalog (Operații · Piese, operations by category, parts with stock) | done |
| 6b | Record pages, strictly the iPhone's (owner: the web-only parts stay on the desktop). Job (`features/work-orders/phone-job.jsx`): the cover colour behind the top, logo, plate, state, LUCRAREA #n · CLIENT, the job, car · year · fuel · km, the next step, call and "…" (other states, WhatsApp, SMS), the clock line, the hint; Reclamație, Operații și piese (`features/lines/ios-lines.jsx`: the iPhone's rows, "Adaugă o operație sau o piesă", the total; swipe: done, delete), Factură, Note, Șterge | job done |
| 6b' | Booking (`features/calendar/phone-booking.jsx`): a page over everything, as the iPhone pushes it: back, "Programarea #n", Editează; its state (late in orange) with Confirmă / A sosit; Mașina, Client, the phone, Mecanic, Rampă, Număr; Operații · n with their estimate (a tap or "Adaugă" opens the booking form); Note; Lucrarea; Toate acțiunile, Mută sau editează, Șterge | done |
| 6b'' | Client and car (`features/phone/record-pages.jsx`): the client's card (avatar, person or company, Sună · SMS · WhatsApp), visits, last visit, no-shows, to collect; Contact; Mașini (+ Adaugă); Lucrări; Note; Șterge. The car on its cover: the logo large, name and plate, year · engine · fuel · km, VIN, the owner; Istoric as tiles; Termene (ITP, RCA, Revizie); Kilometraj with today's reading; Note; Șterge | done |
| 6b''' | Invoice (`features/phone/phone-invoice.jsx`): issued: state and amount, the page itself (tap: whole), Încasează, Trimite pe WhatsApp, Detalii, Plăți (swipe: delete), Lucrarea, Stornează, Reface, PDF. Draft: Emite factura, Emite și încasează integral, what blocks issuing, Client and dates, refresh from the job, Linii, Total, Mențiuni with Previzualizează, Șterge ciorna. `InvoiceDocument` lays itself out by its own width (container queries), so the phone's scaled page is the A4 one | done |
| 6c | Rapoarte (`features/phone/phone-reports.jsx`): the period, four tiles, the revenue chart (touch a column to read it) with "Pe luni, în tabel", the best-selling operations and the mechanics as bars, payments by method as a ring, Creanțe la zi; "Activitate" stays on the desktop. Setări (`features/phone/phone-settings.jsx`): one grouped form, label left and value right, saved as typed: Service (logo), Facturare (the next number with Aplică, TVA, the due days as a stepper), Tarife, the reviews link, Program, Echipă, Posturi de lucru, Aspect (with this device's liquid glass), Date și backup as its own page (counts, export, import, start fresh, demo) | done |

## 5. Building blocks (in code)

| Where | What |
|---|---|
| `src/lib/colors.js` | `AREA`, `STATE`, `MAKE_COLORS`; `makeColor`, `makeCover` (deepened), `makeInk` (white, black on yellow makes), `makeTint` (calendar blocks) |
| `src/components/ds/car.jsx` | `MakeTile`, `MakeArt`, `CarCover`, `CoverButton`, `CoverIconButton`, `CarHeader` (cover colour fading into the page) |
| `src/components/ds/glass.jsx` | `Glass` and `useGlass(preset)` (`bar`, `float`, `menu`): liquid glass on a floating surface, off with the device's switch (`garaj.glass`) |
| `src/components/ds/blocks.jsx` | `PageTitle`, `SectionHeader` (with "›" when it links), `StatusDot`, `KindLabel`, `StatCard`, `useViewSwitch` (the A/B switch, kept per device), `KeyHint` |
| `src/components/ui/button.jsx` | 32 px buttons (28 small, 40 on touch screens), radius 8; the default is the black one |
| `src/components/shell/` | Sidebar groups and area colours in `nav.js`; the toolbar with "Nou"; ⌘K; the phone tab bar with Registru and Caută |

## 6. Build plan (one PR each, each one shippable)

| Part | Content | Status |
|---|---|---|
| 1 | Foundations: tokens (neutrals, area, state and make colours, Inter), the first building blocks, the shell (quiet sidebar, toolbar with Nou, phone tab bar), `/design/` rebuilt. Job card, list, table, sheet and side panel come with the pages that first use them | done |
| 2 | Azi A + B (`features/dashboard/dashboard-page.jsx`, data in `azi-data.js`), and the running job: `startWork`, `stopWork`, `setLineDone` in the store over `src/domain/work-clock.js`, the floating bar on every page (`features/running/running-job.jsx`), the next-step button (`features/work-orders/job-action.js`). The old home's pieces stay unused until part 7; its analytics stay at the bottom of Azi until part 5 | done |
| 3 | Atelier A + B (`features/work-orders/work-orders-page.jsx`, `job-card.jsx`): stages and board (drag between columns, only moves the rules allow); Lucrare and Deviz as the full page with the car-coloured header, the clock line and the steps to tick (`job-progress.jsx`), or in the right panel from the board. Recepție stays the right panel in both looks for now | done |
| 4 | Agendă A, on the existing calendar (its drag, filters, search, warnings and day/week/month kept): bookings tinted with their car's colour and that colour as the left edge, dashed while only booked; "Colorează după" offers Mașină (the default; the old "Tip"), Mecanic, Operație; the list with car tiles and the new title. The booking's centred sheet in its car's colour comes with the sheets rework (part 7) | done |
| 5 | Bani A + B: invoices as "Tabel" (the table under the month's numbers) or "Plăci" (cards with the amount first, grouped: to collect, drafts, paid, cancelled); the invoice's full page follows the list's look (`garaj.bani.look`): the printed page with its state, or the amount first in a car-coloured header; Rapoarte as "Grafice" or "Panou" (the chart large beside the numbers as tiles), with the old home's analytics at the bottom. In the side panel an invoice keeps its sheet | done |
| 6 | Oameni și mașini A + B, one switch for the three lists (`garaj.oameni.look`): Clienți as the table or cards with their cars as tiles; Mașini as the table (car tiles) or covers; De contactat with the message folded or ready to send; the client page plain or in their car's colour; the car page with its car-coloured header in both | done |
| 7a | Catalog, Setări, Caută, Nou A + B, one switch (`garaj.rest.look`): Catalog as tables or with tabs on the left and cards; Setări as the iPhone's grouped list leading to the sections, or tabs on the left that follow the scroll; Caută as the ⌘K window or the results page `/search/` (⌘K always opens the window, its "Vezi toate rezultatele" opens the page); Nou as tiles under its button or a centred sheet | done |
| 7b | Sheets: a sheet about one car (a visit's records, Recepție once the car is chosen) has its head washed with the car's colour and its logo on a tile of that colour (`Sheet` `tint`); Recepție opens centred from Atelier "Etape" (`centered`). Removed: the old home (hero, day ruler, sections, its timeline and cards, `card-section`, `half-donut`). `scripts/ui-check.mjs` still drives the old home and needs rewriting for the new one | done |
