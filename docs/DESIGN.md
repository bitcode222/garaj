# Garaj · design language

One language for the web and the iPhone app, taken from the iPhone's look 3 "Coperți" ([`IOS-NATIVE.md`](IOS-NATIVE.md) §9).
It replaces the old web design system (removed 16 Nov 2026).

Status: **chosen, not built yet** (16 Nov 2026). Board: round 5, https://claude.ai/artifact/XjEeKzMcBaw2Kcg7fxUdds
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

Sidebar on the left (search ⌘K, Azi, Atelier, Agendă, then Bani · Oameni și mașini · Atelier), grey icons, only the
current page's icon in its area colour. A thin toolbar over the content (back, page actions, the black "Nou").
Under 700 px the web looks like the iPhone app: tab bar Azi · Atelier · Agendă · Registru · Caută.

## 3. Shapes and surfaces

Neutral canvas (`#F7F7F8` light, `#0F0F11` dark), white cards with radius 12 and a 1 px hairline, covers radius 14,
buttons 32 tall (28 small) with radius 8, square icon buttons with a hairline. Inter; page title 26, section 15.5
semibold, rows 13.5, eyebrows 11 uppercase. Car colours keep their gradients (cover art, the Lucrare, Mașină and
client headers fading into the page). Calendar and timeline blocks are a light tint of the car with a coloured edge.
The running job is a dark floating bar (light in dark mode); glass only for the search window and menus.

## 4. Screens (owner's picks)

Where two variants were chosen, the page has a small switch at the top right (a segmented control) and remembers the
choice on that device. A detail page follows the view it was opened from.

| Group | Pick | The switch | Screens |
|---|---|---|---|
| Azi | A + B | Coperți · Ziua | A: the cars in the shop as car-coloured covers, the day's numbers, agenda, money due. B: the day as a timeline per lift, dashed for what is still to come. |
| Atelier | A + B | Etape · Tablă | A: job cards grouped by stage; Lucrare and Deviz open as a full page with the car-coloured header; Recepție is a centred sheet. B: a board with a column per stage, drag to move; Lucrare, Deviz and Recepție open in a panel on the right. |
| Agendă | A | none | The week by the hour with blocks tinted by the car, the list grouped by day, a booking as a centred sheet in the car's colour. |
| Bani | A + B | Tabel · Plăci | A: invoices as a table under the month's numbers; the invoice as the printed page with its status beside it; reports as simple charts. B: invoices as cards with the amount first, grouped (to collect, drafts, paid); the invoice with the amount in a car-coloured header; reports as a dashboard. |
| Oameni și mașini | A + B | Listă · Galerie | A: dense tables; a plain client header. B: clients as cards, cars as a shelf of covers, the client page in their car's colour, De contactat with the message ready to send. Mașină is the same page in both. |
| Catalog, setări, căutare | A + B | Listă · File | A: catalog as a table, settings as the iPhone's grouped list, search as a floating ⌘K window, Nou as a menu of tiles under the button. B: catalog and settings with tabs on the left, search as a results page, Nou as a centred sheet. ⌘K always opens the window; "Vezi toate" opens the page. |

The current home (hero search, day ruler, stage sections) is replaced by Azi A/B; its analytics move into Rapoarte.

## 5. Building blocks (in code)

| Where | What |
|---|---|
| `src/lib/colors.js` | `AREA`, `STATE`, `MAKE_COLORS`; `makeColor`, `makeCover` (deepened), `makeInk` (white, black on yellow makes), `makeTint` (calendar blocks) |
| `src/components/ds/car.jsx` | `MakeTile`, `MakeArt`, `CarCover`, `CoverButton`, `CoverIconButton`, `CarHeader` (cover colour fading into the page) |
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
| 7b | Sheets reworked (a car's sheet in its colour; Recepție centred in Atelier A); old components and docs that no longer apply are removed | planned |
