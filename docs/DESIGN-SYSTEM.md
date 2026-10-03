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
| Scrim | One `scrim` utility (globals.css) behind every sheet, dialog and the palette: a flat 10 % white tint (`--scrim`), **no blur**. Only its opacity animates (200 ms in / 150 ms out). Solid tint under `prefers-reduced-transparency` |
| Shell | sidebar 240 · rail 64 · top bar 56 + safe area · tab bar 56 + safe area |
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
| **Detail overlay** | Appointments, customers, vehicles, work orders and invoices open as a square `DetailSheet` over the list (nothing reflows); the top bar has Edit · Open full page · Close. Settings → "Deschiderea detaliilor" switches the default to the full page (per device). An overlay can open one edit form on top (max 2 deep). The stack owns one history entry, so Back closes the top sheet |
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
