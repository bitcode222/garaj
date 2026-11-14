# The visit bar: plan (a record's header)

**Status: 🟢 built 7 Nov 2026.** The owner picked the sheet look with the bar on a decision board (sheet option C, with notes: the maker's logo before the car, the state pill at the right, the car's name in the text colour). Q1–Q3 were not answered in words; they were taken as recommended (A, A, A), the five sections being what the picked look showed. What was built differently is in §9.

The header of every record of a visit (programare, deviz, lucrare, factură, recenzie), on its sheet and on its
full page. Read with [`VISIT-FLOW.md`](VISIT-FLOW.md) (the flow strip and the state section, which this changes) and
[`RECORD-COLORS.md`](RECORD-COLORS.md) (the kind colours it uses).

---

## 1. What was asked (owner, 6 Nov 2026)

| # | Requirement |
|---|---|
| R1 | The sheet's header becomes **four sections in one row**: Programare, Deviz, Lucrare, Review. |
| R2 | Under each section, **a line in its colour**. |
| R3 | Before each title, **its icon, in the same colour** as its line. |
| R4 | **The sections can be clicked.** On a Programare, a click on Lucrare **creates the Lucrare** linked to that booking, and so on. |
| R5 | **Each section's status is drawn as a donut.** |

## 2. What is there today

| Piece | Where | What it does |
|---|---|---|
| Title row | `Sheet`, `PageHeader` | The kind's icon tile, "Programare #130" in the kind's colour, its state (a dot with an icon, and its words) |
| Subtitle | under the title | The booking's description, edited in place |
| Flow strip | `FlowLinks` (`features/flow/visit-links.jsx`) | "Pasul anterior" ← and "Pasul următor" →, the forward one a verb while the next record does not exist yet (Începe lucrarea · Facturează · Cere recenzie). The booking shows it only once its job exists |
| State section | `FlowSteps` | The steps as bars ("Acum"), the next step, the other moves |

Facts that shape the plan:

- **Deviz and Lucrare are one record**: one work order at two stages (`estimate`, `approved`, then `in_progress` and on). It changes title and colour when the work starts.
- **Factură is a step of the visit too**, but was not named in the request (Q1).
- **Recenzie has no kind colour.** The four kind colours are teal, violet, orange and blue, and red, amber and green are kept for states.
- **Creating a job from a booking is check-in**: it records the mileage and the fuel, picks the car when the booking has none, and marks the booking Sosit.

## 3. The bar

Desktop (672 px sheet), a booking that is **confirmed, with no job yet**:

```
‹ Înapoi   ✎  ⤢                                                                     ✕
📅 Programare     📝 Deviz          🔧 Lucrare        🧾 Factură        ★ Recenzie
━━━━━━━━━━━━━━   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄   ┄┄┄┄┄┄┄┄┄┄┄┄┄
(◕) Confirmat     (+) Deschide      (+) Începe        ( ) După lucrare  ( ) După lucrare
    #130
Verificare pre-ITP ✎                                              ← the subtitle stays
```

The same visit, seen from its job, **under way, invoice not made yet**:

```
📅 Programare     📝 Deviz          🔧 Lucrare        🧾 Factură        ★ Recenzie
──────────────   ──────────────   ━━━━━━━━━━━━━━   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄   ┄┄┄┄┄┄┄┄┄┄┄┄┄
(●) Sosit         (●) Aprobat       (◔) În lucru      (+) Facturează    (+) Cere
    #130              #1857             #1857
```

### 3.1 One section, top to bottom

| Part | Look |
|---|---|
| **Icon + name** | The kind's icon and its name ("Programare", "Deviz", "Lucrare", "Factură", "Recenzie"), both in the kind's colour. The current record's name is semibold |
| **Line** | 2 px in the kind's colour, the full width of the section; **3 px** under the current record. A record not made yet: **dashed**, the "planned, not done" mark (DESIGN-SYSTEM.md §4). One that cannot be made yet: dashed and faint |
| **Ring (the donut)** | 28 px (24 on a phone), described in 3.2. Beside it, the state in its words in the signal colour ("Confirmat", "Restantă de 3 zile"), and under that the number, muted and monospace (`#130`, `#1857`, `GRJ 0412`, `★ 4`) |
| **Not made yet** | A dashed ring with **+** in its hollow, and the verb beside it in the brand accent (Deschide · Începe · Facturează · Cere). If it cannot be made yet, an empty ring and the short reason, muted ("După lucrare") |

### 3.2 The ring

A small full donut, **one arc per step** of that record, 2 px apart, coloured by the same rules as the stepper's bars,
so the two read alike:

| Arc | Colour |
|---|---|
| A step done | `foreground/80` |
| The step it is on | its state's signal colour (amber "De confirmat", red "Restantă", the kind's colour "În lucru") |
| A step ahead | `muted` |
| A step jumped over | hatched |
| A part payment | the "Încasată" arc filled to the part paid |

In the hollow is **the state's icon**, the same one as in the state dot. The ring is the state dot with its progress
around it. A side state (Anulat, Neprezentat, Stornată) is a full ring in its colour, with its icon.

| Record | Its arcs |
|---|---|
| Programare | Programat · Confirmat · Sosit · Finalizat |
| Deviz | Deviz · Aprobat |
| Lucrare | În lucru (paused: "Așteaptă piese" in amber) · Gata · Predat |
| Factură | Ciornă · Emisă · Încasată |
| Recenzie | Necerută · Cerută · Primită |

### 3.3 A tap on a section

| Section | It exists: the tap… | It does not exist: the tap creates it | It cannot be made yet: the tap says why, with the fix |
|---|---|---|---|
| **Programare** | walks to the booking | (it is never created from the bar) | a walk-in job: "Fără programare", not clickable |
| **Deviz** | walks to the work order; on the job's own page it scrolls to the **Deviz** card (its lines) | from a booking: **check-in**, and the job opens as a Deviz | booking cancelled or no-show ("Programarea e anulată" · Reprogramează) |
| **Lucrare** | walks to the work order | from a booking: **check-in**, and the job opens **În lucru** (the Deviz drawn jumped over). From a Deviz: **"Începe lucrul"**, the stepper's move, which asks once when it skips "Aprobat" | Deviz cancelled ("Devizul e anulat" · Reactivează); booking cancelled |
| **Factură** | walks to the invoice | from a Deviz or Lucrare: **the draft invoice** from its lines, then walks to it (today's "Facturează") | no lines ("Adaugă o operațiune" · Adaugă); job cancelled; from a booking with no job: "Începe întâi lucrarea" · Începe |
| **Recenzie** | walks to the review | from a job or its invoice: **the review sheet** (the review is saved on its first change, as today) | no job: "Recenzia se cere după lucrare" · Începe lucrarea |

- **Walking replaces the sheet**, sliding in from the side of the section tapped (right of the current one: forward; left: back), as the flow strip does today (VISIT-FLOW.md D4). On a phone, records with a page open it with the page transition.
- **What is created is what exists today**: check-in, the status move, the draft invoice, the review sheet. There is no new kind of creation and no new confirmation; the undo toasts stay.
- **Two steps ahead is not created in one go.** From a booking, Factură says "Începe întâi lucrarea" and offers that, because an invoice needs a job's lines.
- **A tap on the current section** does nothing: it is where you are.
- A section is a button (44 px tall at least), named for screen readers: "Lucrarea #1857, În lucru, deschide" or "Lucrare, nu există, începe".

## 4. Decisions

**B1. The bar is the header.** It replaces the title row (the icon tile, "Programare #130" and the state), because
the current section says all three. The sheet's title stays for screen readers ("Programare #130"). The subtitle stays
under the bar, still edited in place.

**B2. The bar replaces the flow strip** on every record, on its sheet and on its page. "Pasul anterior / Pasul
următor" goes, because the bar shows the whole visit at once (problem 1 of VISIT-FLOW.md: "no single picture of where a
visit is"). The booking's rule that hid the strip until the job existed (APPOINTMENT-SHEET.md A1) goes too. The
Acum card's "A sosit · începe lucrarea" stays its primary button; the bar's Deviz and Lucrare open the same check-in.

**B3. Five sections, Factură included**, if Q1 is answered as recommended.

**B4. "Recenzie", not "Review".** The UI is in Romanian, and the record is called Recenzie everywhere else.

**B5. Recenzie gets a kind colour: pink**, with the `Star` icon. Pink is not a signal colour and is far from the
other four. This adds a `pink` tone to `src/lib/tones.js` and `review` to `RECORD_KIND`.

**B6. Phone: the current section opens, the others close.** Five sections do not fit 358 px with their names, so
on a phone the current one shows its name and state, and the others show only icon, ring and line. Tapping one opens
it, as `Segmented` does with `collapse`. From `sm` up, all five are open.

**B7. The rules live in the domain.** A new `visitBar()` in `src/domain/flow.js`, tested, says for each section
whether it exists, its id, its arcs, its current arc and what jumped, whether it is the current one, and its tap
(walk / create, with `allowed`, `reason`, `fix`). The bar only draws it.

**B8. A job started straight from a booking records the Deviz as jumped over.** Today `createWorkOrder` stamps
`dates.estimate` even when the job opens În lucru, so the Deviz would look done. It will stamp only the step it
opens on, so the Deviz arcs are hatched.

## 5. Surprises

| Case | What the bar does |
|---|---|
| Walk-in job (no booking) | Programare: "Fără programare", dashed, faint, not clickable |
| Manual invoice (no job) | Deviz and Lucrare: "Fără lucrare", faint; Recenzie: "Recenzia se cere pentru o lucrare" |
| Invoice cancelled by storno, a new one made | Factură is the live invoice; the cancelled one is reached from it |
| A credit note's own sheet | Factură is current, showing the credit note (Stornare); the rest is its original's visit |
| Deviz cancelled | Its ring red with ✕; Lucrare and Factură say "Devizul e anulat" · Reactivează |
| Job cancelled after it started | Deviz done; Lucrare red with ✕ |
| Booking without a car | Deviz and Lucrare open check-in, which has the car picker |
| The job is deleted (a Deviz never approved) | The booking goes back to what it was (as today); the bar offers Deschide again |
| A record changes elsewhere (another tab, the dashboard) | The bar reads the store on every render and redraws |
| Double tap on a creating section | The section is busy until the action ends |
| Reduced motion | The walk becomes a fade (as today) |

## 6. How it is built

```
domain/flow.js                visitBar({ appointment, order, invoice, review, now, today, from }) with tests
lib/tones.js, lib/labels.js   pink tone; RECORD_KIND.review
lib/store/actions.js          createWorkOrder stamps only the step it opens on (B8)
components/ds/status-ring.jsx the ring (SVG, the half donut's arc maths, closed into a full turn)
components/ds/visit-bar.jsx   the bar: sections, lines, rings, phone collapse
features/flow/visit-links.jsx reads the visit from the store, runs the taps; replaces AppointmentLinks, JobLinks,
                              InvoiceLinks, ReviewLinks and FlowLinks
components/ds/sheet.jsx, detail-sheet.jsx, page.jsx   a header slot for the bar instead of kind + title + state
check-in sheet                opens a Deviz or straight a Lucrare (`status`)
features/design/design-page   the bar and the ring, every state
```

## 7. Build order

Every phase ends with `npm test && npm run lint && npm run build` and headless Chrome checks (desktop and phone,
light and dark). The last one also runs `npm run ios:device`.

| Phase | What ships |
|---|---|
| 1 | Domain: `visitBar()` with tests; B8; the pink tone and the review kind |
| 2 | `StatusRing` and `VisitBar` in the DS, on the design page |
| 3 | The bar on the booking, the work order, the invoice and the review (sheets and pages); the flow strip removed; check-in for Deviz or Lucrare |
| 4 | Phone collapse; browser checks of every tap (walk, create, blocked); DESIGN-SYSTEM.md, VISIT-FLOW.md, RECORD-COLORS.md updated to 🟢 |

## 8. Questions for the owner

| # | Question | Recommended |
|---|---|---|
| Q1 | **Factură** was not in the list. **A**: five sections, Programare · Deviz · Lucrare · Factură · Recenzie. **B**: the four asked; the invoice is then reached only from the job's state section, and on an invoice's own sheet no section is current. | **A** |
| Q2 | **Deviz before the car arrives.** **A**: tapping Deviz on a booking is check-in, as today (the car is here, its mileage recorded). **B**: a Deviz can be made from a booking ahead of time, for a quote given by phone. The booking stays Programat or Confirmat, and check-in later starts the work on that Deviz. That is a new business rule (PLAN.md), and a larger change. | **A** now, B later if wanted |
| Q3 | **The "Acum" bars** of the state section. **A**: keep them as they are; the donut is in the bar, and the bars stay where the moves are (you said you like the stepper). **B**: they become a half donut too, its arcs the steps, a tap on an arc the move. | **A** |

## 9. As built (7 Nov 2026)

| Plan | Built |
|---|---|
| B1: the bar replaces the title row | The title row stays under the bar, as the picked look had it: the maker's logo, **the car (make and model) · the record's number** in the text colour, and the state as a pill at the right. The kind is said by the bar |
| §3.1: the state's words and the number under each ring | Not drawn (the picked look had none): each section is its ring and name over its line; the words, the number and what a tap does are its `title` and its name for screen readers |
| §3.2: the ring's done arcs in `foreground/80` | Done arcs in the kind's colour, as in the picked look; the step it is on takes amber or red when its state asks for attention (a pause: amber); a step passed over is faint; a cancelled record red all round. The kind's icon is in the hollow |
| A blocked section "says why, with the fix" | A toast with the reason and the fix as its action (Reprogramează · Reactivează · Adaugă · Începe lucrarea) |
| The Deviz section on a started job scrolls to the Deviz card | Scrolls to the job's operations (`job-lines-<id>`) |
| — | Check-in from a booking now keeps "Pornește ca" (it always opened a Deviz before); the bar's Lucrare opens it at În lucru |
| — | A job's form saves what is typed before the bar makes its invoice (`lib/pending-edits.js`) |
