# Garaj — Glanceable UX redesign

> Status: **planned, not implemented.** The design-system spec lives in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) §0 and §3c–3e; this file is the reasoning, the per-entity decisions and the build order.
> Business rules stay in [`PLAN.md`](PLAN.md) and `src/domain/*`. Nothing here changes a fiscal rule (numbering, immutability, storno, VAT).

## 1. Goal

After **a quick eye scan** of any card or preview, the owner knows:

| | Question | In a garage it means |
|---|---|---|
| **WHO** | Whose is it? | Customer (and the mechanic on it) |
| **WHAT** | What is it? | The car, and the job / service on it |
| **WHERE** | Where does it stand? | Stage in the flow (status), the bay and mechanic, the date / time |
| **HOW** | How is it going, and what now? | Money (owed / paid / total), urgency, and **the one next step** |

Then, with one tap: act (call, confirm, check in, collect payment), or open the full record.

Success test, per screen: cover the screen after 3 seconds and answer *who / what / where / how* aloud. If any is missing, the screen fails.

## 2. What is wrong today (audited)

| # | Finding | Evidence | Effect |
|---|---|---|---|
| 1 | Detail views open on **stats**, not identity | Customer: 4 Stat tiles first; work order: stepper + separate cards | The answer to "who/what/where/how" is spread over 3 areas |
| 2 | **Preview sizes differ** | `customer/vehicle/work-order/invoice-view`: `xl` (896 px); `appointment-view`: `lg` (672 px) | Sheets jump in size; feels unfinished |
| 3 | The same data is drawn **five different ways** | Customer in list row, picker, car card, appointment view, job header | No learned pattern; slower scan |
| 4 | **Delete is the only exit** | `deleteCustomer` / `deleteVehicle` throw "in use" when history exists | A dead end: the user is told no, not what to do |
| 5 | **No urgency signal on cards** | Overdue, ITP expired, "ready 3 days" exist as domain data but rows look alike | The list is not scannable by importance |
| 6 | **Flat lists** | One long list per module | No "what needs me now" |
| 7 | Reschedule = edit the form | No history, no customer notice, conflict is a warning only | Customers are not told; no trail |
| 8 | Notifying is **per-screen ad hoc** | ContactActions, reminders page, estimate menu, invoice share | Inconsistent templates; contact log only on reminders |
| 9 | Errors are **toasts** only | `toast.error(error.message)` | Cause shown, remedy not offered |
| 10 | Canvas is nearly white (`oklch .985`) on white cards | tokens | Cards barely separate; low depth |

## 3. Design decisions (with the reason)

### D1 — One scan model: WHO · WHAT · WHERE · HOW
Every entity card and detail hero is built from the **same four slots**. Same position, same order, everywhere. Learning one teaches all five.
*Why:* removes finding #3; speed comes from position memory, not from reading.

### D2 — Color keeps one job: meaning
Color is **state**, never decoration (existing principle, now enforced harder).

| Use | Rule |
|---|---|
| Status | Existing tone map (`labels.js`), unchanged |
| **Attention rail** (new) | 3 px rail on the card's leading edge, colored by the single most urgent thing about it: red = overdue / expired / blocked, amber = soon / stuck, orange = active now, none = fine. A list scans as a colored edge |
| Money | Owed = red text, paid = green, everything else neutral. Never both on one card |
| Module accent (new, tiny) | Only the 32 px icon tile and section icon: appointments blue, jobs orange, invoices emerald, customers violet, cars zinc. Never text, never badges |
| Group headers | Tone dot + count (e.g. red dot "Restante · 4") |

*Why not a color per entity?* The palette already means status; a second meaning for the same hues makes both unreadable. The rail + module tile give recognition without conflict.

### D3 — Darker canvas, brighter paper
Light canvas `0.985 → 0.94`, cards stay white, hairlines `0.922 → 0.895`; dark canvas `0.145 → 0.11`, cards `0.195 → 0.175`. New `--surface-2` (inset wells inside a card: the key-facts strip). Cards get a 1 px bottom shadow on the darker canvas so edges read without heavy borders.
*Check:* muted text `0.52` on the new canvas ≈ 4.7 : 1 (≥ 4.5). Text on tones is unchanged.

### D4 — Importance tiers (what is loud, what is quiet)

| Tier | Contains | Style |
|---|---|---|
| T1 Identity + state + next step | Title, status badge, the one primary action | 16–17 px / 600, solid button |
| T2 Key facts (2–4) | Who, car, when, money | 14 px / 500, in a `surface-2` strip |
| T3 Details | Address, VIN, notes, IBAN, created / modified | 13 px, behind a collapsed **Detalii** group |
| T4 Trail | Activity, history, audit | Last, collapsed by default |

Rule: **one primary action per view.** Everything else is secondary (outline), tertiary (ghost / ⋯ menu) or destructive (only in ⋯ and only with a confirmation that lists consequences).

### D5 — One preview size
All **detail** overlays are `640 px` (`DETAIL_WIDTH`); all **forms** are `448 px`. The `size` prop on `DetailSheet` is removed. The preview shows hero + attention + primary action + groups; the full page adds room (two columns from `xl`) but **uses the same `DetailLayout`**, so content is identical.
Invoice preview: summary + actions + totals + "Vezi documentul"; the A4 paper is page-only (it needs 794 px).

### D6 — Grouped lists
Lists are sections with sticky headers (tone dot, label, count, collapsible, state remembered), sorted by urgency inside.

| Module | Sections (in order) |
|---|---|
| Programări (agenda) | Acum / întârziate · Azi mai târziu · Mâine · Săptămâna asta · Mai târziu |
| Lucrări | De aprobat · În lucru · Așteaptă piese · Gata de predare · (Predate, Anulate under filter) |
| Facturi | Restante · De încasat · Ciorne · Achitate |
| Clienți | Cu sold · În service acum · A–Z |
| Mașini | În service · Termene (ITP/RCA/revizie ≤ 30 z) · Restul |

Search and filters flatten the groups (results first, no headers).

### D7 — Quick actions where they save a step
Inline on a card: **max 2** (primary = the domain's next step; secondary = reach the person). Everything else in ⋯. On touch the same actions are the swipe actions (already built).

### D8 — Archive before delete (new business rule)
Referenced records cannot be deleted (fiscal rule, unchanged). Today that is a dead end. New: **archive** (`archivedAt`), reversible, for customers, vehicles, services, parts. Staff and bays already have `active`.
Archived = hidden from lists, pickers, search, reminders and the calendar's creation flows; shown under filter **Arhivate**; documents keep working (snapshots). Restore is one tap.
`canDelete(entity)` returns `{ ok, reasons[] }` so the dialog says *why* ("3 facturi emise") and offers **Arhivează** instead.

### D9 — Errors always carry a remedy
Four tiers, never mixed:

| Tier | When | Where | Example |
|---|---|---|---|
| Field | One input is invalid | Under the field, `role=alert` | "CUI invalid — verifică cifra de control" |
| Rule | A domain rule blocks the action | Banner at the top of the sheet + the fixing action | "Se suprapune cu Andrei, 10:00–11:00" → *[Alege alt interval] [Programează oricum]* |
| Transient | Done / info | Toast (3 s), success haptic, **Anulează** when reversible | "Mutat în Gata" · *Anulează* |
| Blocking | Irreversible | Dialog that names the consequence | "Anulezi factura GRJ 0123? Se emite stornare." |

Every `DomainError.code` maps to `{ message, remedy? }` in one table (`lib/errors.js`), so the same problem reads the same everywhere.

### D10 — Notify is one flow
`NotifySheet`: person (phone shown), channel (SMS / WhatsApp / call), template with **live preview and editable text**, send → opens the native app prefilled → **logs** the contact on the record's activity. Templates live in one place (domain `messages.js`).
Prompted (never forced) after: estimate ready to send, vehicle marked **Gata**, appointment **rescheduled / cancelled**, invoice issued, payment overdue.
Consent: transactional messages (about their own car/appointment/invoice) always allowed; **marketing-style reminders** (ITP/RCA/service) respect `marketingConsent` (existing behavior).

### D11 — Reschedule is a first-class action
`rescheduleAppointment(id, { start, end, staffId, bayId, reason })`: validates, returns conflicts **and the next free slots** for the same mechanic / bay, writes an `activity` entry (`rescheduled`, from → to, reason), then offers **Anunță clientul**. Entry points: card ⋯, detail primary-secondary, calendar drag, swipe.

### D12 — Reversible by default
Status moves, archive, reschedule and payment deletion show an **Anulează** toast for 6 s (inverse patch applied through `actions.js`; counters/stock untouched because those actions are not undoable: *issue invoice, storno, receive stock* stay behind confirmations).

### D13 — Motion explains change
| Where | Motion |
|---|---|
| Press | scale .98, 100 ms |
| Status change | badge cross-fades + a 600 ms tone ring on the card |
| Groups | height 200 ms (grid-rows), chevron rotate |
| List enter | fade-up, stagger 30 ms, first 6 rows only |
| Count / money change | none (stable layout beats flashy) |
| Reduced motion | all off (global rule already exists) |

### D14 — Plates and logos
Plate stays a quiet chip (existing decision) **except** in the vehicle hero and in "arrival" contexts (appointment card, check-in), where it is the identity the mechanic matches against the car in the yard: there it is the larger `PlateTag size="lg"`.

## 4. Entity specifications

Legend: ● always · ○ only when relevant (attention) · ⋯ in the overflow menu.

### Card content (list row / card / hero share slots)

| | Customer | Vehicle | Appointment | Work order | Invoice |
|---|---|---|---|---|---|
| **Lead** | Initials (violet person / purple company) | Make logo | **Time block** (start, end, duration) | Number badge | Number (mono) |
| **WHAT** (title) | Name | Make Model · year | Title / first service | Complaint / main labor | Customer name |
| **WHO** | Phone | Owner | Customer · plate | Customer | Plate / job |
| **WHERE** | "2 mașini · ultima vizită 24 sept" | Plate chip | Mecanic initials + elevator | Status badge · mechanic · age | Status badge · due date |
| **HOW** | ○ Sold **1.200 lei** | ○ ITP / RCA / revizie chip (≤ 30 z only) | Status badge + conflict flag | **Total** · progress dots (5) | **Total** · rest |
| **Rail** | red = sold restant · orange = în service | red = termen expirat · amber = ≤ 30 z · orange = în service | red = întârziat (past start, not arrived) · amber = suprapunere | red = gata ≥ 2 z / piese ≥ 3 z · orange = în lucru | red = restantă · amber = scade ≤ 3 z |
| **Primary** | Sună | Primire (or Programează) | Confirmă → Primire (by status) | Next step (`WO_NEXT`) | Încasează |
| **Secondary** | WhatsApp | Sună proprietar | Sună | Sună | Trimite |
| **⋯** | Edit · Programează · Arhivează · Șterge | Edit · Programează · Km · Arhivează · Șterge | Reprogramează · Edit · No-show · Anulează | Edit · Factură · Anulează · Șterge deviz | Trimite · Stornează · Șterge ciorna |

### Detail hero (the identity strip)

```
┌──────────────────────────────────────────────┐
│ [lead]  TITLE (WHAT)                  ⋯  ↗    │  header bar: back · ⋯ menu · full page
│         subtitle (WHO · phone)                │
│ [status ▾]  where-chips…              HOW 1.2k│  tap status = menu of legal moves
├──────────────────────────────────────────────┤
│ ▌ Attention banner (1 max) …   [Remedy]       │  from domain attentionOf()
├──────────────────────────────────────────────┤
│  [   PRIMARY   ]  [Sună] [WhatsApp] [Edit]    │  1 primary + ≤ 3 secondary
└──────────────────────────────────────────────┘
```
Then groups (each a card, collapsible, remembered):

| Entity | Group order |
|---|---|
| Customer | **Acum** (open jobs, sold, next appointment) · Mașini · Istoric (lucrări, facturi) · Detalii (adresă, CUI, IBAN, note, acord) |
| Vehicle | **Acum** (în service / termene) · Termene ITP · RCA · Revizie · Km & istoric · Detalii (VIN, motor, culoare, note) |
| Appointment | **Când & unde** (zi, oră, durată, mecanic, elevator) · Client & mașină · Servicii · Lucrare legată · Note · Istoric (activity) |
| Work order | **Stare** (stepper, mecanic, elevator) · Reclamație & verificare · Linii & total · Factură · Istoric |
| Invoice | **Stare & sumă** (total, plătit, rest, scadență) · Plăți · Linii (page only: document) · Client · Istoric |

## 5. Flows (with failure paths)

| Flow | Happy path | Failure / fallback |
|---|---|---|
| **Book** | Customer → car → services (duration suggested) → slot | Conflict → banner with next free slots; no car → book with title only; no phone → warn "nu putem anunța" |
| **Arrive** | Appointment → *Primire* → km + fuel + complaint → job | Already has job → open it; car missing → add car inline; km lower → warning, allowed |
| **Quote → approve** | Job lines → *Trimite devizul* (NotifySheet) → *Aprobat* | No phone → share / print; declined → *Anulează* with reason; wrongly approved → back to estimate (allowed) |
| **Work** | In lucru ⇄ Așteaptă piese → Gata (prompt: anunță clientul) | Part missing → reserved vs stock shown; rework ready → in lucru |
| **Hand over & bill** | Gata → *Predă* → *Facturează* → issue | Incomplete draft → blocking list of what is missing; one active invoice per job |
| **Collect** | *Încasează* → amount (full / rest) → method | Over-payment blocked with the rest shown; remove payment is undoable |
| **Reschedule** | Pick new slot → conflicts + alternatives → *Anunță clientul* | No free slot today → suggest next 3; customer unreachable → note in activity |
| **Cancel / no-show** | Reason chips (optional) → confirm → *Anunță* | Linked job exists → cancel the job first (blocked with link) |
| **Archive / restore** | ⋯ → Arhivează (consequence list) | Car in shop → blocked: "e în service (#1877)"; open invoice balance → warn, allowed |
| **Delete** | Only if unreferenced; consequence list | Referenced → dialog turns into *Arhivează* |

## 6. Domain & data changes (additive, tested)

| Change | Where | Notes |
|---|---|---|
| `attentionOf(kind, entity, ctx)` → `{ tone, label, rank, remedy? }` | `domain/attention.js` | Pure; one function drives rail, chip, banner, group order. Replaces ad-hoc `stale` checks |
| `nextAction(kind, entity, ctx)` → `{ key, label, tone, blocked?, reason? }` | `domain/next-action.js` | Wraps `WO_NEXT`, appointment moves, invoice states |
| `canDelete(kind, entity, refs)` → `{ ok, reasons[] }` | `domain/lifecycle.js` | Reasons are counts ("3 facturi emise") |
| `canArchive(kind, entity, refs)` | same | Blocks `inShop` vehicles / customers with open jobs; warns on balance |
| `archivedAt` on customers, vehicles, services, parts | schema (optional field, no migration) | Selectors filter by default; backups carry it |
| `activity[]` on appointments | schema (optional) | `{ at, type, from?, to?, reason?, channel? }`, same shape as work orders |
| `rescheduleAppointment`, `archive/restore*`, `logNotification` | `store/actions.js` | All through `actions.js`; none allocate numbers |
| `nextFreeSlots(appointment, day, appointments, hours)` | `domain/appointment.js` | Same mechanic or bay; respects working hours |
| `messages.js` templates (estimate, ready, reschedule, cancel, invoice, reminder) | `domain/` | Moved out of components; one wording |
| Error table | `lib/errors.js` | `code → { message, remedy }` |

Reminders (`computeReminders`) skip archived customers and vehicles.

## 7. Build order

Each phase ships on its own: tests green, lint, build, device build, short note in this file.

| Phase | Deliverable | Done when |
|---|---|---|
| **0 Tokens + primitives** | New canvas / surface tokens; `EntityCard`, `AttentionRail`, `GroupSection`, `ActionBar`, `DetailLayout`, `Disclosure`, `Attention` banner; `/design` page shows them | Light + dark verified at 430 px and 1280 px |
| **1 Domain** | `attention`, `next-action`, `lifecycle`, `messages`, `nextFreeSlots`, `activity`; unit tests (edge cases below) | `npm test` green; no UI change |
| **2 Cards + lists** | Five entity cards; grouped lists; swipe actions reuse `nextAction` | Scan test passes on all five lists |
| **3 Details** | `DetailLayout` on customer, vehicle, appointment, job, invoice; one 640 px preview size | Same content in sheet and page |
| **4 Flows** | Reschedule, archive / restore, NotifySheet + prompts, undo toasts, error table | Every row of §5 works incl. failure path |
| **5 Motion + audit** | Motion tokens, a11y pass (VoiceOver labels = WHO·WHAT·WHERE·HOW), perf (5 000 rows, ≤ 12 nodes per row) | Budget table below |

### Budgets
| Budget | Target |
|---|---|
| DOM per list row | ≤ 12 nodes (phone) |
| 5 000 invoices | scroll without long tasks (unchanged) |
| Tap → feedback | < 100 ms |
| Contrast | text ≥ 4.5 : 1 in both themes; status never color-only (icon + label) |
| Touch targets | ≥ 44 px incl. card quick actions |

## 8. Edge cases to cover

- **Money / fiscal:** archive never touches issued invoices; storno path unchanged; paid vs rest shown, never both colors; draft delete stays allowed.
- **Dates:** "întârziat" uses local time; appointments across midnight; DST-safe durations (existing `minutesBetween`).
- **Empty / missing data:** no phone → inline "Adaugă telefon" instead of dead buttons; customer without car; car without owner (orphan after import); job without lines (Facturează disabled with reason).
- **Archived references:** a job whose customer is archived still renders (name + "arhivat" chip); picker excludes archived but keeps the current value.
- **Concurrency:** two tabs archive / restore the same record → last write wins, activity keeps both; undo of a record changed meanwhile is refused with a message.
- **Long text:** names, addresses, titles truncate with `title` / expand in detail; plates never wrap.
- **Large data:** attention computed once per collection change (memoized selector), not per row render.
- **Small phones (375 px):** quick actions collapse to icons; hero wraps status below title.
- **Reduced motion, dark mode, large text (Dynamic Type up to 130 %)**.
- **Offline:** everything is local; share / open-app failures fall back to copy-to-clipboard with a toast.

## 9. Open questions (defaults chosen; change before Phase 2 if you disagree)

| # | Question | Default |
|---|---|---|
| 1 | Module accent tiles (blue / orange / emerald / violet / zinc) acceptable, or fully neutral tiles? | Accent tiles |
| 2 | Plate large in appointment cards and check-in only? | Yes |
| 3 | Archive for services and parts too (stock > 0 warns)? | Yes |
| 4 | Undo window | 6 s |
| 5 | Prompt "Anunță clientul" after Gata / reschedule / cancel | Prompt once, remembered per-device if dismissed 3× |
