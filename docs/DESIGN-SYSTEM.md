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

#### Hero cards: the cars in the shop

`HeroCard` (`ds/hero-card.jsx`) is a banner: a saturated gradient in the colour of the work-order status (`tone().banner`, white text, 700 → 500 so it always reads), the make's logo as a faint watermark, and `HeroChip` pills. It is used twice, so a car looks the same on the dashboard and in its sheet.

**Which cars come first** (`byAttention` in `src/domain/work-order.js`, tested): the question is "who is the job waiting on?"
1. *Late* jobs (pickup waiting 2+ days, parts waiting 3+ days) before everything else.
2. `ready`: the customer's car is done, hand it over and collect the money.
3. `waiting_parts`: blocked on us, chase the supplier.
4. `estimate`: blocked on the customer, chase the approval.
5. `approved`: can start, needs a mechanic and a bay.
6. `in_progress`: already being worked on, nothing to do but watch.
Within a group the longest-waiting job is first. The dashboard shows the first 6 and a "show all" button.

**Reading order inside a card** (top to bottom = most to least important): status colour + chip (what state) → late chip and clock (does it need me, how long has it been here) → make/model, plate, owner (which car, who is on it) → complaint, or what the status waits for → open, call (ready only), total.

**Reading order inside a work-order sheet**: hero (state, urgency, car, owner, mechanic, price, and the stepper that moves the job) → action row (next step, invoice, estimate) → then the cards, ordered by what the viewer needs first:
- default: contact and assignment → complaint and diagnosis → the work and price → billing → inspection → internal notes → history.
- `estimate` (waiting on the customer's yes): the price comes before the diagnosis.
- `waiting_parts`: the lines (where the parts are) come right after the contact.
- `ready` (hand-over): contact, then invoice and total, before the work itself.
History is always last: it is only read when something went wrong.

## Color: tones (status and category)
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
| Scrim | One `scrim` utility (globals.css) behind every sheet, dialog and the palette. Invisible on purpose (no tint, no blur): it only catches taps outside the panel |
| Shell | sidebar 240 · rail 64 · top bar 56 + safe area · tab bar 56 + safe area |
| Sidebar (lg+) | Under the search bar and **Nou**: 36 px rows, 16 px icons, 13 px ink-coloured labels. The open page is a light-blue pill (`tone("blue").nav`). The first group has no title; later groups sit under a divider with a quiet semibold title. Counts are small purple pills. An item can have `children` (see `nav.js`, used by Setări) that show under it while its page is open, beside a thin vertical line |
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

Domain UI built from these (in `src/features/`): `LinesEditor`, `CatalogPicker`, `TotalsBlock`, `InvoiceDocument`, `StatusStepper`, `InspectionChecklist`, `AppointmentCard`, `TimeGrid`, `CustomerPicker`, `VehiclePicker`, charts in `features/reports/charts.jsx`.

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
| **Calendar touch drag** | `TimeGrid` | Press and hold an appointment (~0.4 s, haptic) to lift it, then drag to move or, from its bottom edge, resize. 15-minute snap with a tick per slot, auto-scroll near the top and bottom edge. A quick swipe over an appointment still scrolls |
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
| **Status change** | `StatusMenu` (tap the badge → "Mută în…") on work-order rows, appointment cards and the appointment overlay, each change confirmed first, with an undo toast for appointments; the clickable `StatusStepper` on work-order detail and overlay |
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
