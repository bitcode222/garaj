# Record colours and state dots: plan

**Status: requested by the owner on 2 Nov 2026, to plan and build in one go. 🟢 Built the same day** (§9, §10).

---

## 1. What was asked

| # | Requirement (owner, 2 Nov 2026) |
|---|---|
| R1 | Programări, Lucrări, Devize and Facturi each have **one colour of their own**, used everywhere they appear. Example: Facturi are **blue**. |
| R2 | A record's **full page** and its **sheet** carry that colour in the header or the title. |
| R3 | A **card** is that colour all over. *(7 Nov 2026, the owner's card pick: cards are white; the kind's colour is on their first line, the calendar's blocks are outlined in it. DESIGN-SYSTEM.md, Card sizes.)* |
| R4 | The record's **state** (late, to be paid, accepted…) is said by an **expressive colour** (red, yellow…): a **dot**, with an **icon** in it (a clock, a warning…). |
| R5 | Next to the dot, a **short text** when there is room ("Restantă de 1 zi"); where there is no room, the dot alone, with the text **on hover**. |
| R6 | The same dot, icon and text on the page, the sheet, the card and the rest. |
| R7 | Edge cases and logic gaps thought through. |

Example from the owner: an unpaid invoice past its due date shows a red dot with a clock in it. On its page and its sheet the dot sits next to the title with "Restantă de 1 zi". On its card it is the same dot, and the text shows on hover.

---

## 2. The model: two colours, two questions

Until now a colour meant a status, and every status had its own colour. Blue meant "Programat" in one place and
"Deviz" or "Emisă" in another. So a colour said neither *what* a thing was nor *how* it stood. The change splits
colour into two separate jobs:

| Layer | Answers | Where | Colours |
|---|---|---|---|
| **Kind colour** (the record's colour) | *What is it?* A booking, an estimate, a job, an invoice | The card's fill, a page's or sheet's title and its icon tile, a section's title on Azi, the calendar's blocks, the day ruler's bullets, a stripe on rows where kinds mix | One hue per kind, never red, amber or green |
| **State signal** (the dot) | *How does it stand?* Does it need me? | A dot with an icon, plus its text or a tooltip | Red, amber, green or grey, plus the kind's own colour for "under way" |

The signal colours are kept for states only, so no kind takes red, amber or green. A red dot means one thing
anywhere in the app.

---

## 3. The kind colours

| Kind | Colour | Icon | Why |
|---|---|---|---|
| **Programare** | **teal** | `CalendarDays` | Calm, the calendar's colour; far from blue on a dark card (the owner's theme) |
| **Deviz** | **violet** | `FilePen` | Unchanged from the day ruler; a paper waiting for a yes |
| **Lucrare** | **orange** | `Wrench` | The workshop; unchanged from the ruler; near the brand colour |
| **Factură** | **blue** | `ReceiptText` | The owner's choice |

- **Estimates and jobs are one record** (a work order) at different stages, so its kind follows its stage:
  `estimate` and `approved` make it a Deviz, and from `in_progress` on it is a Lucrare. A Deviz that becomes a job
  changes colour and title ("Devizul #12" becomes "Lucrarea #12"), and undoing that changes them back. A cancelled
  one stays what it was when it was cancelled: a Lucrare if it was ever started (`dates.in_progress`), otherwise a
  Deviz.
- The colours come in two strengths. **Tinted** (the 50 tint, 200 border, 800 text) is for cards and title tiles.
  **Vivid** (the 600 fill, white text) is for calendar blocks.
- Defined once in `src/lib/labels.js` (`RECORD_KIND`), with a new `teal` tone in `src/lib/tones.js`.

---

## 4. The state signal

### 4.1 Colours

| Signal | Colour | Means | Icon colour |
|---|---|---|---|
| **danger** | red | Late, missed, overdue: look now | white |
| **warning** | amber | Waiting on someone, or due soon: something to do | dark amber (white on amber fails contrast) |
| **success** | green | Agreed, ready, paid: good as it stands | white |
| **active** | the kind's own colour | Under way, nothing to flag (a job in progress, a car that arrived) | white |
| **neutral** | grey | Not started or closed: draft, finished, handed over, cancelled | white |

### 4.2 The rules (`src/domain/record-state.js`, tested)

The rule is the record's stored status, then what the clock says about it. The first line that matches wins.
`N` counts whole days: dates are `"YYYY-MM-DD"` strings, so daylight saving cannot shift the count.

**Programare** (`appointmentSignal(appointment, { now })`)

| When | Signal | Icon | Text |
|---|---|---|---|
| cancelled | neutral | CircleX | Anulată |
| no_show | danger | UserX | Neprezentat |
| done | neutral | CircleCheck | Finalizată |
| arrived | active | CarFront | Sosit |
| scheduled or confirmed, its day passed | danger | CalendarX2 | Nu a sosit |
| scheduled or confirmed, today, later than 15 min (counting from the time the customer gave, if they called) | danger | Clock | Întârzie 25 min |
| scheduled | warning | CalendarClock | De confirmat |
| confirmed | success | CalendarCheck | Confirmată |

**Deviz** (`orderSignal(order, { today, appointment })`, `estimate` and `approved`)

| When | Signal | Icon | Text |
|---|---|---|---|
| the deadline passed (the end of its booking) | danger | Clock | Întârziat cu N zile |
| estimate | warning | Hourglass | De aprobat |
| approved | success | ThumbsUp | Aprobat |
| cancelled, never started | neutral | CircleX | Anulat |

**Lucrare** (`orderSignal`, `in_progress` onwards)

| When | Signal | Icon | Text |
|---|---|---|---|
| in progress or waiting for parts, the deadline passed | danger | Clock | Întârziată cu N zile |
| waiting for parts 3 days or more | danger | PackageSearch | Piese de N zile |
| waiting for parts | warning | PackageSearch | Așteaptă piese |
| in progress | active | Wrench | În lucru |
| ready, not collected for 2 days or more | warning | KeyRound | Neridicată de N zile |
| ready | success | CircleCheck | Gata |
| delivered | neutral | KeyRound | Predată |
| cancelled after it started | neutral | CircleX | Anulată |

**Factură** (`invoiceSignal(invoice, payments, { today })`, built on `invoiceState`)

| When | Signal | Icon | Text |
|---|---|---|---|
| draft | neutral | FilePen | Ciornă |
| cancelled (stornoed) / a credit note | neutral | Undo2 | Stornată / Stornare |
| paid in full | success | Check | Plătită |
| past its due date, not fully paid (partly paid included) | danger | Clock | **Restantă de N zile** |
| partly paid | warning | CircleDashed | Parțial plătită |
| due today / tomorrow / in N days | warning | Clock | Scadentă azi / mâine / în N zile |
| no due date | warning | Clock | De plată |

Each rule also returns a **detail**: one longer sentence for a tooltip or the page ("Clientul nu a confirmat
încă", "Rest de plată 1.200 lei", "Gata de 3 zile; clientul nu a ridicat-o").

### 4.3 The thresholds already in use, kept

- **Booking late:** 15 min of grace, as `arrivalDelay` already uses.
- **Waiting for parts:** marked from 3 days, as the Lucrări list already does (in red).
- **Ready but not collected:** from 2 days, as the Lucrări list already does. That list showed it in red; it
  becomes amber, because the delay is the customer's and the shop has nothing to fix.
- **Job deadline:** the end day of its booking (`jobDeadline`, the same rule as the day ruler's "!"). A walk-in has
  no deadline, so it is never late by this rule.

### 4.4 The status colours follow

The statuses' own tones in `labels.js` (used by legends, filters, the calendar's filter list, swipe actions and the
job's steps) become their signal colours, so a status has one colour everywhere:

| Status | Before | Now |
|---|---|---|
| Programare: scheduled · confirmed · arrived · done · no_show · cancelled | blue · purple · orange · green · red · grey | amber · green · teal · grey · red · grey |
| Lucrare: estimate · approved · in_progress · waiting_parts · ready · delivered · cancelled | blue · purple · orange · amber · green · grey · red | amber · green · orange · amber · green · grey · grey |
| Factură: draft · issued · partial · paid · overdue · cancelled | grey · blue · amber · green · red · grey | grey · amber · amber · green · red · grey |

---

## 5. The pieces (`src/components/ds/tone.jsx`)

| Piece | What |
|---|---|
| `StateDot` | The dot: a filled circle in the signal's colour with the state's icon, a ring in the surface's colour so it reads on any card. Sizes `sm` 14 px (icon 9 px), `md` 18 px (icon 11 px), `lg` 22 px (icon 13 px). With `tip`, hovering or focusing it shows the text in a small bubble. `aria-label` is the text either way |
| `StateTag` | The dot and its short text in the signal's text colour (`compact`: the dot alone, with the tip). The detail goes into the tooltip / `title` |
| `KindMark` | The kind's icon in a tinted tile, in front of a page's or a sheet's title |
| `StatusBadge` | Restyled to look like a `StateTag` (dot with icon + label) from the label maps, where only the stored status is known, so every list, link and search result changes at once. `StatusMenu` keeps its chevron and menu |

`PageHeader`, `Sheet` and `DetailSheet` take `kind` and `state`: the title is written in the kind's colour after
its `KindMark`, and the state's `StateTag` sits next to it (wrapping under it on a phone).

---

## 6. Where it shows

| Surface | Kind colour | State |
|---|---|---|
| **Azi: the four sections** | The section's title; every card's first line names its kind in its colour (white cards since 7 Nov 2026; a Programare's dashed border while unconfirmed stays) | The dot on the corner of the card's logo tile, the text on hover; the filter chips over the cards and the half donut beside them use the status colours (§4.4) |
| **Azi: the day ruler** | Bullets in the kind colours (teal, violet, orange, blue) | The deadline bullet keeps its "!" in the kind's colour |
| **Visit records** (booking, job, invoice, review: sheet and page) | Since 7 Nov 2026 the visit bar on top, each record in its kind's colour (Recenzie **pink**, ★), the open one marked; the title is the car, in the text colour | The state as a pill at the title's right; the ring of each section in the bar |
| **List pages** (Programări, Lucrări, Facturi) | The page title. On Lucrări (Devize and Lucrări mixed) a stripe in the kind's colour on each row | The row's status shows the clock too ("Întârzie 20 min", "Piese de 4 zile", "Restantă de 3 zile"); the menu to change it stays |
| **Calendar** | "Colorează după: Tip" (formerly "Stare"): every booking in teal (outlined, white inside, since 7 Nov 2026). Mechanic and operation unchanged | The dot replaces the mark icon at the start of a block: the job's state if there is one, else the booking's. The hover card shows the `StateTag` |
| **Everywhere else with a status** (search, visit links, a customer's or a car's history, the hover card) | Unchanged | Through the restyled `StatusBadge` |
| **The invoice paper, reports, charts** | Not coloured (paper and ink) | Not coloured |

---

## 7. Edge cases

| Case | Behaviour |
|---|---|
| A Deviz approved and started, then undone | Kind and colour follow the stage each time; nothing is stored |
| Cancelled work order | Kind by whether it was ever started; neutral dot |
| Walk-in job (no booking) | No deadline: never "late" by deadline; waiting for parts and not collected still count |
| Invoice partly paid **and** past due | Red "Restantă de N zile"; the detail gives the remainder |
| Invoice without a due date | Amber "De plată", never overdue |
| Credit note, and the invoice it cancels | Both neutral ("Stornare" / "Stornată") |
| A booking today within its 15 minutes of grace | Still "De confirmat" / "Confirmată" |
| A customer who called to say they come later | Counted late from the time they gave, as everywhere else |
| A booking whose day passed with nothing recorded | Red "Nu a sosit" (the "Au trecut" group on Azi turns red with it) |
| Booking that became a job, on the calendar | The block stays teal (it is the booking's slot); its dot is the job's state |
| Arrived booking with no job (old data) | Teal "Sosit": a teal dot on a teal block, kept apart by its ring |
| Amber dot | Dark icon (white on amber is under 3:1) |
| Colour blindness | Never colour alone: icon + text, or text in the tooltip and the aria-label |
| Touch (no hover) | The card's aria-label says the state; a tap opens the record, where the text is written out |
| A tooltip inside a scrolling carousel | Drawn inside the card, under the dot, so the carousel's clipping cannot cut it |
| Midnight with the page open | Signals read `today` / `now` from the store's hooks, which refresh every minute |
| Before the store is ready | Nothing date-dependent is drawn (skeletons), as now |

---

## 8. Code

| Where | What |
|---|---|
| `src/domain/record-state.js` | `orderKind`, `appointmentSignal`, `orderSignal`, `invoiceSignal`; tests |
| `src/lib/tones.js` | the `teal` tone |
| `src/lib/labels.js` | `RECORD_KIND`, `STATE_ICON`; status tones remapped (§4.4) |
| `src/lib/record-state.js` | the domain's signal plus its tone and icon (`stateOf…`), for the UI |
| `src/components/ds/tone.jsx` | `StateDot`, `StateTag`, `KindMark`; `StatusBadge` restyled |
| `src/components/ds/page.jsx`, `sheet.jsx`, `detail-sheet.jsx` | `kind` + `state` on titles |
| `src/features/…` | the surfaces of §6 |

---

## 9. Build status

| Phase | What | Status |
|---|---|---|
| 1 | Domain rules and tests (`record-state.test.js`, 14 tests) | 🟢 |
| 2 | Tones, labels, DS pieces | 🟢 |
| 3 | Azi: sections, cards, ruler | 🟢 |
| 4 | Pages and sheets: booking, job, invoice; the visit strip (booking → job → invoice) | 🟢 |
| 5 | List pages | 🟢 |
| 6 | Calendar (blocks, hover card) | 🟢 |
| 7 | DESIGN-SYSTEM, `/design` ("Tip și stare"), checked in headless Chrome in both themes and on a phone | 🟢 (the iPhone itself: open) |

---

## 10. Built differently from the plan, or added

- **A work order's title follows its kind**: "Devizul #12" or "Lucrarea #12" on its page, its sheet, the visit strip and
  Recente.
- **The visit strip** (booking → job → invoice, at the top of each record) names each record in its kind's colour,
  with its state. On a phone the strip's halves are narrow, so there the state is its dot alone.
- **A draft invoice's sheet** is titled "Factură nouă", as its page is, so it does not read "Ciornă" twice.
- **The Facturi list**: the Scadență column now gives the due date itself; the state beside it already says how
  far it is ("Scadentă în 5 zile", "Restantă de 3 zile"). The state column is wider.
- **The Lucrări list**: a stale row's date is written in its state's colour (amber or red), no longer always red.
- **Filters and stat tiles** follow the colours: "De încasat" amber, "Anulate" grey, the bookings' "Azi" teal, a swipe
  to confirm green.
- **The job's and the invoice's steps** take the status colours too ("Emisă" amber, "Deviz" amber, "În lucru" orange).
- **The calendar's hover card** opens with the kind (its tile and name) and the visit's state.
- **A second border in the state's colour, and no lines under the cards**, were tried on Azi (owner, 2 Nov 2026) and
  taken back the same day: the cards keep one border, in their kind's colour, and the lines under them stay.
- **The lines under the cards went** later (owner, 5 Nov 2026): each section's parts are now filter chips over its
  cards and a half donut in its title column, in the same status colours.
