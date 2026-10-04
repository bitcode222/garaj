# Garaj Design System

Live reference: **`/design/`** in the app (every token and component rendered in both themes).
Source: `src/app/globals.css` (tokens) · `src/components/ui/` (primitives) · `src/components/ds/` (system components) · `src/lib/tones.js` (status colors).

Plan, reasoning and build order for the v2 system below: [`UX-REDESIGN.md`](UX-REDESIGN.md). Business rules: [`PLAN.md`](PLAN.md).
Status marks used in this file: 🟢 in code · 🟡 specified, built in the phase named in `UX-REDESIGN.md` §7 (until then, follow the spec for any new UI).

---

## 0. The scan model (v2) 🟡

Every card and every detail hero answers four questions in the same positions. Reading order is top-left to bottom-right.

| Slot | Question | Content | Position |
|---|---|---|---|
| **WHAT** | What is it? | Title: car (make model), job, service, customer name | Line 1, left, 15–17 px / 600 |
| **WHO** | Whose? | Customer (+ phone) or owner or mechanic | Line 2, left, 13 px muted |
| **WHERE** | Where does it stand? | Status badge, stage, bay / mechanic, date / time | Line 2 chips, or the lead block (time) |
| **HOW** | How is it going, what now? | Money, urgency, **the one next step** | Line 1 right (number) + trailing primary action |

Rules that apply to all UI:
1. **One primary action per view**, the domain's next step (`nextAction`). Secondary = reach the person. Everything else lives in ⋯.
2. **Color means state.** Status tones, the attention rail, owed / paid money. Never decoration. Module accent only on the 32 px icon tile.
3. **Show just enough:** ≤ 3 chips on a row, ≤ 4 facts in a hero strip. The rest is behind **Detalii**.
4. **Never a dead end.** A blocked action explains why and offers the way out (archive instead of delete, next free slot instead of conflict).
5. **Reversible by default:** soft actions toast *Anulează* for 6 s; irreversible ones name their consequence first.

---

## 1. Principles

The system is distilled from the two reference screens of the product.

| From | Principle | In practice |
|---|---|---|
| **Invoice** | **Paper & ink** | Calm neutral canvas; content on white sheets with hairline borders; hierarchy through type size and weight, not color; money is tabular, right-aligned, and the total is the loudest thing on screen. |
| **Appointments** | **Tinted meaning** | Color is reserved for status and category. Every status has one *tone* (50 tint / 200 border / 700 text) and uses it everywhere: chip, calendar block, board column, timeline dot. |
| Both | **Glanceable** | Each screen answers one question in two seconds. Order: key number → status → details. |
| Both | **Thumb-first** | 44 px targets, bottom sheets on phones, native date/time pickers, primary action in reach. |
| Both | **Scan first, read second** 🟡 | Who · what · where · how in 3 seconds; one next step; color only for state (§0) |
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

#### v2 surfaces (canvas darker, paper brighter) 🟡
Applied in `globals.css` in Phase 0. Cards stay white; the canvas drops so edges and grouping read at a glance.

| Token | Light v1 → **v2** | Dark v1 → **v2** | Use |
|---|---|---|---|
| `background` | .985 → **.94** | .145 → **.11** | App canvas |
| `card` | 1 → 1 | .195 → **.175** | Cards, sheets |
| `surface-2` (new) | – → **.972** | – → **.215** | Inset well inside a card: key-facts strip, selected row |
| `muted` | .967 → **.955** | .25 → **.24** | Fills, skeleton |
| `border` | .922 → **.895** | white 9 % → **10 %** | Hairlines |
| `input` | .90 → **.88** | white 14 % → 15 % | Input borders |
| Card shadow (new) | – → `0 1px 0 oklch(0 0 0 / .04)` | none | Edge lift on the darker canvas |

Contrast check: `muted-foreground` .52 on the v2 canvas ≈ 4.7 : 1 (≥ 4.5). Do not use `subtle-foreground` for anything the user must read.

#### Attention rail and module accents 🟡

| Token | Rule |
|---|---|
| **Attention rail** | 3 px leading edge of a card, color = tone of the *single most urgent* state from `attentionOf()`: `red` overdue / expired / blocked, `yellow` soon / stuck, `orange` active now, none = fine. Never more than one rail color per card |
| **Money color** | Owed `red`, paid `green`, otherwise foreground. Not both on one card |
| **Module accent** (icon tile / section icon only) | appointments `blue` · jobs `orange` · invoices `green` · customers `purple` · cars `neutral` |

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
| Sheet widths 🟡 | **Detail 640** (customer, car, appointment, job, invoice: one size) · **Form 448** |
| Layers | sticky 20 · top bar 30 · nav 40 · overlay 50 · toast 60 |
| Scrim | One `scrim` utility (globals.css) behind every sheet, dialog and the palette. Invisible on purpose (no tint, no blur): it only catches taps outside the panel |
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

## 3c. Entity cards 🟡

One component family, three densities, five entities. Files: `components/ds/entity-card.jsx` (+ per-entity adapters in `features/<module>/*-card.jsx`).

| Density | Where | Height (phone) | Shows |
|---|---|---|---|
| **row** | Lists, pickers | 64–72 | Lead · WHAT · WHO · WHERE chip · HOW number · rail |
| **card** | Dashboard, "Acum" groups, related items inside a detail | 96–120 | row + attention chip + inline actions |
| **hero** | Top of a detail | auto | card + subtitle detail + status menu |

```
row     │▌[lead] WHAT                          HOW │   ▌ = attention rail (3 px)
        │▌       WHO · where-chip               ›  │
card    │▌[lead] WHAT                          HOW │
        │▌       WHO · where-chip · attention chip │
        │▌       [ PRIMARY ] [secondary]        ⋯  │
```

API (spec):

```jsx
<EntityCard
  kind="customer | vehicle | appointment | workOrder | invoice"
  density="row | card | hero"
  lead={node}            // initials, make logo, time block, number
  what={node} who={node} where={[chips]} how={node}
  attention={{ tone, label, rank }}      // from domain attentionOf(): rail + chip
  actions={[{ key, label, icon, primary, onSelect, disabled, reason }]}
  onOpen={fn}
/>
```
Rules: ≤ 2 inline actions (first is `primary`, from `nextAction`), rest under ⋯; the same `actions` array feeds the swipe actions (`SwipeRow`). A disabled action shows its `reason` on long-press / in the ⋯ menu. The whole card is the tap target (≥ 44 px); inline actions stop propagation. Accessible name = "WHAT, WHO, WHERE, HOW" in one sentence.

Per-entity content (what goes in each slot, rail logic, primary / secondary / ⋯): [`UX-REDESIGN.md` §4](UX-REDESIGN.md).

### Grouped lists 🟡
`GroupSection`: sticky header (tone dot · label · count · chevron), collapsible with `Disclosure` motion, state remembered per list in `localStorage`. Sections and their order are fixed per module (`UX-REDESIGN.md` D6); inside a section sort by `attentionOf().rank` then by time. Search or filter flattens the groups.

## 3d. Detail layout (preview and page are the same) 🟡

`DetailLayout` in `components/ds/detail-layout.jsx`; used by `DetailSheet` (640 px, md+) and by the detail pages (phone, and two columns from `xl`). Same content everywhere.

| Part | Component | Rule |
|---|---|---|
| Header bar | `Sheet` top bar | Back (phone) / close, ⋯ menu (Edit · Archive · Delete · Share), "open full page" (preview only) |
| Hero | `EntityCard density="hero"` | WHAT / WHO / WHERE / HOW; status badge is a `StatusMenu` |
| Attention | `Attention` banner | **One**, the top `attentionOf()` item, with its remedy button |
| Action bar | `ActionBar` | 1 primary (solid) + ≤ 3 secondary (outline, icon + label); sticky at the bottom on phone |
| Groups | `DetailGroup` (collapsible card) | Order per entity in `UX-REDESIGN.md` §4; **Acum** first and open, **Detalii** and **Istoric** collapsed |
| Key facts | `surface-2` strip | 2–4 `KeyValue`s that matter right now |

Destructive actions are never in the page body: only in ⋯, after a confirmation that lists consequences.

## 3e. Flow patterns 🟡

| Pattern | Spec |
|---|---|
| **Next step** | `nextAction(kind, entity)` returns `{ key, label, tone, blocked?, reason? }`; the same value is the card's primary action, the hero's primary button and the swipe action |
| **Error tiers** | Field (under input) · Rule (banner + fixing action) · Transient (toast ≤ 3 s, with *Anulează* if reversible) · Blocking (dialog naming the consequence). Messages come from one table keyed by `DomainError.code` (`lib/errors.js`) |
| **Archive / delete** | `canDelete()` / `canArchive()` return `{ ok, reasons[] }`; a blocked delete turns the dialog into *Arhivează*. Archived items: hidden from lists / pickers / search / reminders, visible under filter **Arhivate**, restorable. Never for invoices |
| **Reschedule** | `rescheduleAppointment()` → conflicts + next free slots → activity entry (from → to, reason) → *Anunță clientul* |
| **Notify** | `NotifySheet`: channel · editable template with live preview · opens the native app · logs the contact on the record. Offered (never forced) after Gata, reschedule, cancel, issue. Consent: transactional always, marketing reminders need `marketingConsent` |
| **Undo** | Soft actions (status, archive, reschedule, delete payment) toast *Anulează* for 6 s; fiscal / numbering / stock actions never offer undo |
| **Missing data** | Never a dead button: no phone → inline "Adaugă telefon"; archived owner → name + "arhivat" chip; no lines → *Facturează* disabled with the reason |

### Motion tokens 🟡
Press scale .98 / 100 ms · group expand = `grid-template-rows` 0fr → 1fr / 200 ms · status change = badge cross-fade + 600 ms tone ring · list enter = fade-up, 30 ms stagger, first 6 rows · no animated numbers · all off under `prefers-reduced-motion`.

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
