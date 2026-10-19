# Garaj Design System

Live reference: **`/design/`** in the app (every token and component rendered in both themes).
Source: `src/app/globals.css` (tokens) · `src/components/ui/` (primitives) · `src/components/ds/` (system components) · `src/lib/tones.js` (status colors).

---

## 1. Principles

The system is distilled from the two reference screens of the product.

| From | Principle | In practice |
|---|---|---|
| **Invoice** | **Paper & ink** | Calm neutral canvas; content on white sheets with hairline borders; hierarchy through type size and weight, not color; money is tabular, right-aligned, and the total is the loudest thing on screen. |
| **Appointments** | **Tinted meaning** | Color is reserved for status and category. Every status has one *tone* (50 tint / 200 border / 700 text) and uses it everywhere: chip, calendar block, board column, timeline dot. |
| Both | **Glanceable** | Each screen answers one question in two seconds. Order: key number → status → details. |
| Both | **Thumb-first** | 44 px targets, bottom sheets on phones, native date/time pickers, primary action in reach. |
| Both | **Fast by default** | CSS-only motion, skeletons with final geometry, zero layout shift, no spinners for local data. |

---

## 2. Tokens

### Color: surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `oklch(0.985 0 0)` | `oklch(0.145 0 0)` | App canvas |
| `card` | `oklch(1 0 0)` | `oklch(0.195 0 0)` | Sheets, cards, the paper |
| `muted` | `oklch(0.967 0 0)` | `oklch(0.25 0 0)` | Subtle fills, table headers, inputs on dark |
| `border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 9%)` | Hairlines |
| `foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Primary text |
| `muted-foreground` | `oklch(0.52 0 0)` | `oklch(0.72 0 0)` | Secondary text (≥ 4.5:1) |
| `subtle-foreground` | `oklch(0.66 0 0)` | `oklch(0.56 0 0)` | Meta, placeholders, never essential info |
| `primary` | `oklch(0.205 0 0)` | `oklch(0.93 0 0)` | Primary buttons, selection, "today" |
| `brand` | `oklch(0.646 0.222 41.1)` | `oklch(0.705 0.213 47.6)` | Logo, active nav marker, "now" line, key highlights. Never body text |
| `destructive` | `oklch(0.577 0.245 27.3)` | `oklch(0.704 0.191 22.2)` | Destructive actions only |

### Color: tones (status and category)
Defined once in `src/lib/tones.js` as static Tailwind classes (safe for purging). Names match the original calendar colors.

| Tone | Palette | Chip (light) | Chip (dark) | Meaning |
|---|---|---|---|---|
| `neutral` | zinc | 100 / 200 / 700 | 800 / 700 / 300 | Draft, delivered, archived |
| `blue` | blue | 50 / 200 / 700 | 950 / 800 / 300 | Scheduled, estimate, info |
| `purple` | violet | 50 / 200 / 700 | 950 / 800 / 300 | Confirmed, approved, diagnosis |
| `orange` | orange | 50 / 200 / 700 | 950 / 800 / 300 | In progress |
| `yellow` | amber | 50 / 200 / 800 | 950 / 800 / 300 | Waiting parts, due soon, partial |
| `green` | emerald | 50 / 200 / 700 | 950 / 800 / 300 | Ready, paid, done, in stock |
| `red` | red | 50 / 200 / 700 | 950 / 800 / 300 | Overdue, cancelled, no-show |

Each tone exposes `chip` (tinted), `solid` (dot / bar), `text`, `soft` (row accent) and `ring`.

### Status → tone map (single source: `src/lib/labels.js`)

| Domain | Status → tone |
|---|---|
| Appointment | scheduled → blue · confirmed → purple · arrived → orange · done → green · no_show → red · cancelled → neutral |
| Work order | estimate → blue · approved → purple · in_progress → orange · waiting_parts → yellow · ready → green · delivered → neutral · cancelled → red |
| Visit (dashboard calendar, `VISIT_STAGE`) | scheduled → **outline** (dashed block, hollow dot, hatched bar segment: booked, not here yet) · then the work-order tones (estimate … ready) · delivered → neutral, dimmed · no_show → red, struck through |
| Invoice | draft → neutral · issued → blue · partial → yellow · paid → green · overdue → red · cancelled → neutral |
| Due dates (ITP, RCA, service) | > 30 d → green · ≤ 30 d → yellow · expired → red |
| Stock | ok → green · low → yellow · out / negative → red |

### Typography: Geist Sans and Geist Mono

| Role | Class | Size / line | Weight | Notes |
|---|---|---|---|---|
| Display | `text-display` | 32/36 (phone 28/34) | 600 | Totals, hero KPIs. `tabular-nums`, −0.02em |
| Title | `text-title` | 24/32 (phone 20/28) | 600 | Page titles, −0.015em |
| Heading | `text-heading` | 16/24 | 600 | Section and card titles |
| Body | `text-sm` | 14/20 | 400 | Default UI text |
| List (phone) | `text-[15px]` | 15/22 | 500 | Primary line of mobile rows |
| Caption | `text-xs` | 12/16 | 400–500 | Meta, helper text |
| Overline | `text-2xs uppercase tracking-wider` | 11/16 | 500 | Group labels, table headers |
| Mono | `font-mono` | 13/20 | 500 | Plates, VIN, document numbers |

Numbers: `tabular-nums` where numbers align in columns (tables, lists, axis ticks), right-aligned. Big standalone figures (stat tiles, totals, `.text-display`) use proportional figures — add the `figure` class; tabular digits look loose at display sizes.

### Spacing, size, radius, elevation, motion

| Token | Value |
|---|---|
| Grid | 4 px |
| Page gutter | 16 (phone) · 24 (tablet) · 32 (desktop) |
| Section gap | 20 (phone) · 24 |
| Card padding | 16 (phone) · 20 |
| Control height | 36 desktop · 44 touch (`h-11` on phones) |
| Row height | 44 desktop table · 60 phone list |
| Radius | `sm` 6 · `md` 8 (controls, chips) · `lg` 10 · `xl` 14 (cards) · `2xl` 18 (sheets) |
| Elevation | e0 border only (cards) · e1 `shadow-xs` (controls) · e2 `shadow-paper` (documents) · e3 `shadow-lg` (popovers, sheets) |
| Motion | 120 ms press/hover · 200 ms popover/dialog · 280 ms sheet · ease `cubic-bezier(.2,.8,.2,1)` · disabled under `prefers-reduced-motion` |
| Layers | sticky 20 · top bar 30 · nav 40 · overlay 50 · toast 60 |
| Scrim | One `scrim` utility (globals.css) behind every sheet, dialog and the palette. Faint `white/10` tint on the first sheet only (no blur); stacked sheets get an untinted one, because Radix mounts the scroll lock in the overlay. It catches taps outside the panel |
| Shell | sidebar 240 · rail 64 · top bar 56 + safe area · tab bar 56 + safe area |
| Sidebar (lg+) | Cloudflare's manner (`shell/app-shell.jsx`, `nav.js`): 256 px on the page's surface; the shop row with ⌃⌄ opens the shop menu (its settings, Date demo, Temă, Design system); a 40 px search (⌘K) with a square brand + (Nou) beside it; 40 px rows, 18 px muted icons, 14 px labels; the open page a **neutral pill** (`bg-accent`); counts as quiet grey pills. The first group has no title, later ones a plain muted one with space above. Items with `children` (Programări: Calendar · Toate programările; Setări) open under a 1 px guide line, by their chevron, open by default while their page is; a child page carries the pill, its parent the weight. **Recente** (the last five records opened, two lines each; `lib/recents.js`, on the device only) opens under Azi. At the bottom: fold into the rail (kept on the device, applied before the first paint by a script in the layout), Date demo, theme. The 64 px rail between `md` and `lg` (and when folded) has an unfold button on desktop |
| Breakpoints | `md` 768 → rail · `lg` 1024 → sidebar · `xl` 1280 → detail aside |

---

## 3. Components

### Primitives: `src/components/ui/` (shadcn, restyled by tokens)
Button · Input · Textarea · Select · Switch · Tabs · Dialog · AlertDialog · Popover · DropdownMenu · Tooltip · Command · Calendar · Skeleton · Separator · Avatar · Badge · Toggle · ScrollArea · Label · Form

**Button:** `default` (ink) for the one primary action per view · `outline` for secondary · `ghost` for toolbar · `destructive` only inside confirmations · `brand` for the global "create" action. Sizes `sm` 32 · `default` 36 · `lg` 40 · `touch` 44.

### System components: `src/components/ds/`

| File | Components | Purpose |
|---|---|---|
| `page.jsx` | `Page`, `PageHeader`, `Section`, `Toolbar`, `SplitView`, `StickyBar`, `Overline` | Page anatomy, gutters, phone action bar |
| `card.jsx` | `Card`, `CardHeader`, `CardContent`, `CardFooter` | Flat sheets (e0) |
| `tone.jsx` | `ToneBadge`, `StatusBadge`, `ToneDot`, `ToneIcon` | Everything colored by meaning |
| `data.jsx` | `Money`, `DateTile`, `Stat`, `KeyValue(Grid)`, `Meter`, `Initials`, `EmptyState`, `Banner`, `Kbd`, `Timeline` | Read-only building blocks |
| `inputs.jsx` | `Field`, `MoneyInput`, `NumberInput`, `SearchInput`, `Segmented`, `FilterChips` | Forms and filters (16 px, 44 px on phones) |
| `list.jsx` | `DataList`, `ListRow`, `ListHeader`, `useProgressive` | Long lists: progressive rendering, `cv-row` |
| `sheet.jsx` | `Sheet` | Create/edit: bottom sheet on phones, right panel from md |
| `detail-sheet.jsx` | `DetailSheet` | Read-only detail overlay: top-bar controls (edit, full page), skeleton, self-closing when the record is deleted |
| `make-logo.jsx` | `MakeLogo`, `VehicleLabel`, `PlateTag` | Vehicles are labelled by logo + make/model; the plate is secondary text (`PlateTag`). The `Plate` graphic is only for the vehicle page, documents and the plate field |
| `status-menu.jsx` | `StatusMenu`, `useStatusChange` | A status badge that is a menu of legal next states (safe inside links). Every status change asks for confirmation first |
| `confirm.jsx` | `ConfirmProvider`, `useConfirm` | One lazy-loaded confirmation dialog |
| `contact.jsx` | `ContactActions` | Call · SMS · WhatsApp with a prefilled message |
| `plate.jsx` | `Plate` | Romanian number plate |
| `skeletons.jsx` | `ListPageSkeleton`, `DetailPageSkeleton` | Loading states with final geometry |

Domain UI built from these (in `src/features/`): `LinesEditor`, `CatalogPicker`, `TotalsBlock`, `InvoiceDocument`, `StatusStepper`, `InspectionChecklist`, the calendar (`features/calendar/`: `DayStrip`, `MonthStrip`, `CalendarPanel`), `DashboardCalendar` (`Timeline`), `CustomerPicker`, `VehiclePicker`, charts in `features/reports/charts.jsx`.

Signature pieces:
- **`DateTile`** (from the calendar's Today button): month strip plus big day number. Used in appointment rows and document dates.
- **`Plate`**: Romanian plate (white, black rim, blue EU strip with "RO"). Wherever a car is referenced.
- **`Segmented`** (from the calendar view tabs): icon tabs whose active item expands to show its label.
- **`InvoiceDocument`**: the paper. A4 proportions, e2 elevation, print-ready.

---

## 3b. Native behaviour (phone)

The app is installed, so it should behave like one. All of this lives in shared primitives; features get it for free.

| Behaviour | Where | Notes |
|---|---|---|
| **Screens, not previews** | `Sheet`, `useOpenDetail`, `PageTransition` | On a phone a record opens its real page (customer, car, job, invoice), pushed in from the right; there is no preview overlay. Forms and the appointment panel are full-height `Sheet`s that slide in from the right with a back button; swipe right or the system edge-swipe closes them. From `md` up, sheets are side panels and the per-device "side panel / full page" setting applies. Bottom sheets are only for choices (action sheets, below) |
| **Action sheets** | `DropdownMenuContent`, `SelectContent`, `PopoverContent` carry `data-sheet-menu` | Below `md` they open as a bottom sheet (full width, 48 px rows, dimmed page, safe-area aware); from `md` they stay anchored popovers. The only dimmed scrim in the system: it marks a transient choice, not a surface. Pinned by CSS in `globals.css` |
| **Keyboard** | `useKeyboardInset` sets `--kb` / `--vvh` | Sheets and action sheets lift above the keyboard (`bottom: var(--kb)`) and cap their height, so footer buttons stay visible while typing |
| **Haptics** | `src/lib/haptics.js` (native `NativeHaptics` plugin in `AppDelegate.swift`) | Selection on tab, menu and select picks; tap/warning on confirmations; success/error/warning through `@/lib/toast` (import `toast` from there, never from `sonner`). No-ops outside the iOS app |
| **Pressed states** | `ListRow`, tab bar, buttons | `hover:` only exists for pointers, so touch gets `active:` feedback |
| **Chrome is not text** | `globals.css` | No long-press callout or selection on buttons, links, nav; fields stay selectable; opt in with `.selectable` for values worth copying. `touch-action: manipulation` removes the double-tap delay. Link previews are off (`allowsLinkPreview`) |
| **No zoom** | `viewport` in `layout.jsx` | Scale locked to 1. Inputs are 16 px so iOS never zooms on focus; a wide element can no longer shrink the whole UI |
| **Swipe actions** | `SwipeRow` (`ds/swipe-row.jsx`), actions in `features/common/swipe-actions.js` | Work orders, invoices, customers, vehicles. Swipe right = reach the person (call, SMS); swipe left = the one next step (move the job forward, take a payment, WhatsApp, check in). A full swipe fires the outermost action; destructive or status steps still go through the normal confirmation. Touch only; the first row nudges once on first use. A row that contains a Radix trigger (`StatusMenu`) opens it on tap, not on pointer-down, so a swipe can start on it |
| **Calendar touch drag** | `DayStrip`, the home `Timeline` | Press and hold a booking (380 ms, haptic) to lift it, then drag to move it (to another time, day or mechanic) or, held near its top or bottom (its side on the home timeline), stretch it. 15-minute snap with a tick per slot; dragging near an edge scrolls the grid (sideways without end). A press and hold on free time draws a new booking. A quick swipe still scrolls |
| **Page transitions** | `PageTransition` (`shell/`) | Going deeper (list → detail) the page slides in from the right; tabs, up and Back cross-fade; never on first load. Uses `left` and opacity, not `transform`, which would re-anchor the fixed bars inside pages |
| **Tab bar** | `app-shell.jsx` | Re-tapping the current tab scrolls to top |

Rules of thumb: a row that is wider than the screen scrolls inside its own container (`min-w-0` / `max-w-full`), never the page; a choice with more than two options is an action sheet, not a popover; the one-handed reach zone is the bottom third.

## 4. Data visualization

- Categorical slots in fixed order, never cycled: `--viz-1` blue `#2a78d6` / dark `#3987e5`, `--viz-2` orange `#eb6834` / `#d95926`, `--viz-3` aqua `#1baf7a` / `#199e70` (scoped under `.viz`). Validated with the dataviz palette checker against the card surface: CVD ΔE ≥ 9.2 (light) / 9.4 (dark); aqua is 2.8:1 on white, so it always ships with visible labels or a table view.
- Marks: columns ≤ 24 px with a 4 px rounded data-end and square baseline; 2 px surface gap between stacked segments; lines 2 px; markers ≥ 8 px with a 2 px surface ring; hairline solid gridlines.
- A legend for ≥ 2 series; label only the latest and the extreme value; hover/focus tooltip on every column (values lead); every chart has a table view.
- Status meaning (overdue, stock) uses tones with labels, never the chart palette.

## 5. Patterns

| Pattern | Anatomy |
|---|---|
| **List page** | `PageHeader` (title, count, primary action) → `Toolbar` (search, segmented filter, chips) → `DataList` (rows are links, progressive loading) → `EmptyState` |
| **Detail page** | Back → hero (identity + status + key amount) → action bar → `SplitView`: sections (main) + summary / timeline (aside, `xl+`). Phone: stacked, `StickyBar` with the primary action |
| **Document** | Paper centered (max 794 px) · header (shop + doc number) · parties · lines table · `TotalsBlock` · payment info · footer. Print CSS hides everything else |
| **Create / edit** | `Sheet` with sticky footer (Cancel · Save). Enter submits, Esc closes. Validation inline under the field |
| **Destructive** | `useConfirm` with a specific verb ("Anulează factura") and the consequence in one sentence |
| **Detail overlay** | Appointments, customers, vehicles, work orders and invoices open as a square `DetailSheet` over the list (nothing reflows); the top bar has Back (when stacked) · Edit · Open full page on the left and Close on the right. Settings → "Deschiderea detaliilor" switches the default to the full page (per device). An overlay can open one edit form on top (max 2 deep). The stack owns one history entry, so Back closes the top sheet |
| **Sheet width** | One width for every sheet from `md` up, so stacked sheets line up: 42 rem (672 px, `md:max-w-2xl`). Phones: full width 🟢 |
| **Flow strip** 🟢 | Right under a visit record's title (programare, lucrare, factură, recenzie): "Pasul anterior" ← the record before, "Pasul următor" → the record after. Before the next record exists the forward link is the verb that creates it (Începe lucrarea · Facturează · Cere recenzie, brand accent); after, its title and status. A link that cannot be used says why under it. Walking the strip replaces the sheet, sliding in from the arrow's side. Plan: [`VISIT-FLOW.md`](VISIT-FLOW.md) |
| **State section** 🟢 | Under the flow strip: the job stepper's look for all three records (bars + labels), one next-step line (primary button + one sentence of what happens), every other move as a row of small buttons (disabled ones carry their reason), side states (Neprezentat, Anulat, Stornată) as a banner with the way back, pauses as a chip on their step. A blocked move stays a button and says why when pressed. Moves that take a few words (reschedule, delay, a reason) open a small panel in the section; Esc closes it before the sheet. Rules and reasons come from `domain/flow.js`; the component is `ds/flow-steps.jsx`, the strip `ds/flow-links.jsx`. Plan: [`VISIT-FLOW.md`](VISIT-FLOW.md) |
| **Recenzie** 🟢 | The last record of a visit (`features/reviews/review-sheet.jsx`): the request message with the shop's review link (Setări → Recenzii), sent on WhatsApp or SMS or copied, each send logged with "N-am trimis"; the admin's internal note (1–5 stars, tags, text), shown later as one quiet line ("★ 4 · Plătește la timp") on the customer, the booking and check-in (`CustomerNote`) |
| **Text edited in place** 🟢 | `ds/inline-text.jsx`: reads as text with a pencil; a tap makes it a field; Enter or leaving saves, Esc gives up. Used for the booking's description under "Programare #N" |
| **Status change** | `StatusMenu` (tap the badge → "Mută în…") on work-order rows, appointment cards and the appointment overlay, each change confirmed first, with an undo toast for appointments; the clickable `StatusStepper` on work-order detail and overlay |
| **Sidebar v2** 🟢 | Cloudflare's manner (the sidebar row in §2 has the details): 256 px on a surface a shade off the page; the shop row with ⌃⌄ opens the shop menu; a 40 px quick search with a square brand + beside it; 40 px items, 18 px muted icons, the open page a neutral pill; items with children expand under a 1 px guide line (Programări: Calendar · Toate programările; Setări); a collapsible Recente group (last five records, two lines each); plain group titles; collapse to the rail at the bottom. Plan: [`APPOINTMENTS-AND-NAV.md`](APPOINTMENTS-AND-NAV.md) |
| **Toate programările** 🟢 | `/appointments/`: four quick stats that are also filters, search, status chips with counts, period, mechanic, sort; rows grouped under sticky day headers; `StatusMenu` in the row; Confirmă / A sosit / Neprezentat in one tap with undo; filters in the address for deep links. A Calendar · Toate switch tops both Programări pages |
| **Calendar v2** 🟢 | Notion Calendar's manner: a big month title that follows the scroll, a left panel (mini month with the visible band, mechanics and statuses as checkboxes), Zi · Săptămână · Lună as a dropdown (D, W, M, T keys). Zi and Săptămână: one endless strip of days scrolled freely sideways (no snapping) and through 24 h up and down (48 px an hour), days set apart by a 2 px divider and a bracket under each day's name (Zi fades the days beside the middle one), sticky one-line day headers ("Lun 19", today a brand pill), the gutter's corner with + and the time zone, hairline hours, one column per day with the mechanic as an avatar badge on each booking, a brand now line with its time in the gutter, slim closed days, a row of cars in service under the headers. Lună: endless weeks. Editing in place as on Azi. A ⇄ / ⇅ button turns the direction time scrolls: ⇅ stacks the days downward with the hours across, ⇄ puts Lună's months side by side (one per screen). The calendar opens with the sidebar folded (its own choice) |
| **Home (Azi)** 🟢 | Cloudflare-style home: a pill with the day, a centred question ("Ce e pe agendă azi?"), one big search (the app's ⌘K search), chips for Programare · Primire mașină · Factură, then sections in the cards form: Deja în service, De confirmat, Facturi, then the Analiză grid. Plan: [`HOME-PAGE.md`](HOME-PAGE.md) |
| **Cards form** 🟢 | `ds/card-section.jsx` (`CardSection`): a title column (name · count, ‹ › from `md` up, the title links to the full page), a carousel of 15 rem cards grouped under sticky labels, a coloured line + legend under it. The line filters the cards when its parts are the groups ("Doar: … ✕"); otherwise it is a picture and is not pressable. Cards share the `VisitCard` anatomy and carry at most two corner buttons for one-tap actions, always visible on touch. Empty: a dashed placeholder card with one action |
| **Metric card** 🟢 | Analiză: label, big number, change against the previous equal period (↗ ↘ %, green when it went the good way), area chart (large) or sparkline (small) with the axis on the right, "···" with Tabel and Deschide în Rapoarte; no data is a faint wave with a "Fără date" pill |
| **Dashboard calendar** | On Azi, right under the hero (see Home): the cars in service in the cards form, then the timeline in its own card (`features/dashboard/`: `dashboard-calendar.jsx`, `timeline.jsx`, `timeline-day.jsx`, `timeline-geometry.js`, `timeline-drag.js`, `visit-ui.js`). **Plan, decisions and status: [`DASHBOARD-CALENDAR.md`](DASHBOARD-CALENDAR.md); read it before changing this section, and run `npm run ui:check` after.** Top to bottom: **header**: ‹ · the day or range in view (a button that opens the native date picker; it follows the scroll) · › · Azi when today is out of view · `Segmented` Zi / Săptămână · link to the calendar. **Deja în service**: every car in the shop, always, as a snap carousel of cards grouped by stage in the status line's order (the group label stays in view while its cards scroll); a card shows make logo, make and model, plate, job, what the car is in for, customer, what the clock says ("de 2 h în service", "gata de 2 zile"), mechanic, total and where the car is on the calendar ("azi 14:00–16:00", or "primit ieri 10:30" when it came without a booking), with a calendar button that travels there. **A card and its booking say the same things in the same words** (`visitText`, `timingText` in `visit-ui.js`): that is what ties them together. **Status line**: one bar split by visit stage + legend with counts (the cars in service plus the bookings in view, each visit once; it settles when scrolling stops). **Timeline**: one strip of days at two zooms. Zi: each day from the first to the last shown hour (an hour is at least 72 px, 96 px on a phone), a 58 px row per mechanic (one lane; two overlapping bookings share it at half height, more are "+N"), a line at now; a booking is two lines, make and model, then what the clock says ("în 45 min"), and does not grow on hover (the rest is on its car's card, lit with it, and in its sheet); a car that came without a booking is a pin (a pill with a car) at the time it was received; a booked car not here a quarter of an hour on says "întârzie 45 min" in the yellow tone (also counted in the header: "3 mașini întârzie"). Săptămână: a column per day with up to five bookings as two-line chips (time and what the clock says, then the car), then "+N încă"; the day's header zooms in on it. A closed day with nothing booked is a 48 px marker; only the days in view are rendered. It scrolls sideways natively (trackpad, swipe, Shift + wheel); a mouse wheel up or down over it scrolls days too, never taking over a page scroll already moving; ‹ › (a day in Zi, a week in Săptămână), ← →, Shift ← → and T glide (our own easing, stopped by any input). Tap a booking to open it. **Zi is edited in place**: pointing at free time shows a line with the time a booking would begin (a quarter of an hour grid); a click books from there; a press dragged from there draws the booking (dashed slot behind the line, times in a bubble above) and opens the form with that interval and mechanic; a booking that is ahead or under way is moved by its body (to another time, mechanic or day) and stretched by either edge, then saved with a toast that can undo it. Mouse: the drag starts after 4 px. Touch: after a press and hold of 380 ms (haptic), so a swipe still scrolls; holding a booking near a side stretches it. Esc gives a drag up. The form stays the way to do all of it without dragging. Opens on Zi when something is booked today, otherwise on Săptămână; zooming keeps the day in view. **Filter**: tap a colour to keep one stage on the cards and the timeline; shown in the legend and as a chip next to the cards ("Doar: În lucru ✕"); it stays while moving between days and clears on a second tap, the chip, Esc, a zoom switch and Azi. **Hovered vs selected** (the link is the visit, not the car): hovering or keyboard-focusing a card or a booking rings and lifts that visit on both the cards and the timeline (`ring-2 ring-brand` and a brand shadow), and rings the same car's other visits lightly (`ring-1 ring-brand/50`); nothing is dimmed and it lets go on leave. Opening a booking or "Arată în calendar" *selects* it: the ring stays, its card scrolls into view, and a line docked under the timeline names it and offers Primire (not yet arrived) · Deschide · Lucrarea #N · ✕; Esc clears. After "Arată în calendar" the booking also pulses twice (`animate-visit-arrive`). |
| **Operations field** | `ServicesField` (`src/features/common/services-field.jsx`) in the check-in and appointment sheets: one full-width row per operation (name · time · price, tap to expand, X removes), an inline editor (name, time, price, internal cost, VAT total, margin) with "back to catalog values", then "+ Operațiune" on its own line at the left. The button opens an inline full-width search with a close button top right; it stays open for several picks and closes only on an outside tap or the close button. Typing a name that is not in the catalog offers it as a new operation. Margin and VAT come from `src/domain/lines.js` |
| **Contact** | `ContactActions` (Sună · SMS · WhatsApp) next to every customer phone |
| **Empty** | Icon · one sentence · one action |
| **Loading** | Skeleton with the final geometry. Never spinners for local data |

---

## 6. Content (Romanian UI copy)

- Sentence case. Buttons = verb + object: "Emite factura", "Înregistrează plata", "Programare nouă".
- Money: `1.234,56 lei` (ro-RO grouping). Dates: `30 sept. 2026` in UI, `30.09.2026` on documents. Time: 24 h `14:30`.
- Plates uppercase; VIN and document numbers in mono.
- Always use diacritics with comma below: ș ț (not ş ţ).
- Errors say what to do: "Suma depășește restul de plată (320,00 lei)."

## 7. Accessibility

- Text contrast ≥ 4.5:1, UI ≥ 3:1. Tone chips (700 on 50) pass.
- Visible focus ring on every interactive element (`ring-3 ring-ring/50`).
- 44 px touch targets on phones. Icon-only buttons get `aria-label`.
- Landmarks (`nav`, `main`), `aria-current="page"` in navigation, one `h1` per page.
- Color is never the only signal: tone + label or icon.
- `prefers-reduced-motion` disables transforms.

## 8. Mobile rules (iPhone)

- Tab bar: Azi · Programări · Lucrări · Facturi · Mai mult. Top bar: title, search, create (+).
- Safe areas via `env(safe-area-inset-*)`. Nothing interactive under the home indicator.
- Inputs 16 px (no zoom), `inputmode` decimal / tel / numeric, native date & time pickers.
- Sheets max 92 dvh, sticky footer above the home indicator.
- Tables become stacked rows.
- No hover-only affordances; long-press menus are never the only way.

## 9. Do / Don't

| Do | Don't |
|---|---|
| One primary (ink) button per view | Several filled buttons competing |
| Tone chips for status | Colored text for status without a chip |
| Tabular, right-aligned money in columns | Centered numbers in tables, or tabular digits on a hero total |
| Borders to separate, shadows only for floating layers | Shadows on every card |
| CSS transitions on transform / opacity | Animating layout (width, height, top) or JS animation libraries |
| Skeleton with final geometry | Spinners or content jumping in |
