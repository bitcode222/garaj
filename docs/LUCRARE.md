# Two items: Programare and Lucrare (plan)

**Status: plan approved by the owner on 8 Nov 2026** on the decision board <https://claude.ai/artifact/Fjb2opvQfScGvynCNF7kea>: all 31 questions answered with the recommended option, no edge case flagged, no notes. Step 1 (rules) 🟢 built; steps 2–5 not started.

Words used here: an **item** is a record with its own list, card and page. After this change there are two: the **programare** (booking) and the **lucrare** (job). The lucrare holds four **chapters**: **Deviz** (what the client approved), **Lucru** (the car in the shop), **Factură** (the money) and **Recenzie** (the follow-up). The invoice is still a legal document with its own series and number; it only stops being an item.

> Supersedes, once built: the four-record visit of [`VISIT-FLOW.md`](VISIT-FLOW.md) §3, the visit bar's five sections ([`VISIT-BAR.md`](VISIT-BAR.md)) and the stacked records on the Azi card (DESIGN-SYSTEM.md, "Card sizes").

---

## 1. Before and after

| | Today | After |
|---|---|---|
| Items | Programare, Lucrare (Deviz is its first state), Factură, Recenzie | Programare, Lucrare |
| Where a car's story is | Four sheets stitched by the visit bar | One lucrare page; the programare is linked from its header |
| Invoice draft | A copy of the job's lines; goes out of date | None: the Factură chapter is the lucrare's own lines; **Emite** freezes them |
| Lists | Programări, Lucrări, Facturi | Programări, Lucrări; the invoices become a register in Rapoarte |

## 2. The owner's picks

| # | Question | Pick |
|---|---|---|
| 1 | When does a lucrare begin? | **Any time**: from a call, from a programare or at check-in; check-in adds km and fuel to an existing one |
| 2 | What is a deviz? | **Approval is kept**: lines added later are *Suplimentar* and need their own yes |
| 3 | How does the client say yes? | **Line by line**: *Necesar* / *Recomandat*; refused lines stay off the invoice; the channel is recorded |
| 4 | Invoice draft? | **No draft** |
| 5 | Invoices per lucrare | **One live invoice**; storno and re-issue listed in the chapter |
| 6 | Fleet invoice for many lucrări | **Data ready now, screen later** |
| 7 | Selling without a car | **Vânzare**: a lucrare with no car and only the Factură chapter |
| 8 | Where the review lives | **Last chapter**; stars and note still shown on the client |
| 9 | Car comes back to finish | **Same lucrare, second programare** |
| 10 | Car comes back after delivery | **Warranty lucrare** (*Garanție la #N*); reopening only the same day, before an invoice |
| 11 | How progress reads | **Four chapters**, each with its state inside |
| 12 | Hand over before invoicing | **Either order**; handed over without an invoice shows *De facturat* |
| 13 | When it leaves Azi | **Handed over and paid** |
| 14 | Client refuses the deviz | **Refuzată**: own end, lines kept for next visit, reminder after 30 days, optional diagnosis fee |
| 15 | Deposits | **Not now** |
| 16 | Page layout | **Chapter tabs** (the bar is the tabs) |
| 17 | Next step | **Bottom bar**, also at the bottom of the computer's sheet |
| 18 | Header | **Car, client, money, mechanic, promised time** |
| 19 | Link to the programare | **A line in the header** (*din Programarea #128*); walk-ins say *Fără programare* |
| 20 | Azi card stage | **Chapter strip** inside the card |
| 21 | Azi sections | **By chapter**: Programări, Devize, În lucru, De încasat |
| 22 | Sidebar | **Lucrări with views**: Toate, Devize, În lucru, De încasat; no Facturi |
| 23 | Phone tab bar | Azi · Programări · Lucrări · **Clienți** · Mai mult |
| 24 | Lucrări page | **List with chapter chips** |
| 25 | Invoice register | **Rapoarte → Registru facturi** |
| 26 | Deviz to the client | **Text + PDF** |
| 27 | Invoice buyer | **The client, can change** |
| 28 | Stock | **At handover or invoice, whichever is first** |
| 29 | Asking for the review | **Suggested** for 3 days after handover and payment, and in De contactat |
| 30 | Existing invoices without a lucrare | **They become Vânzări** |
| 31 | Shipping | **In steps** (§7) |

## 3. The lucrare

### 3.1 Chapters and their states

| Chapter | States inside | Done when |
|---|---|---|
| Deviz | *fără linii* · *de trimis* · *trimis* · *aprobat* · *suplimentar de aprobat* · *refuzat* · *sărit* | Approved (or skipped by jumping straight to work) |
| Lucru | *de început* · *în lucru* · *așteaptă piese* · *gata* | The car is ready |
| Factură | *de emis* · *emisă* · *parțial plătită* · *restantă* · *plătită* | Paid in full, or nothing to bill (a warranty at 0 lei) |
| Recenzie | *necerută* · *cerută* · *primită* | Asked or received |

Handover (*Predat*) is a fact of the lucrare, not a chapter: it can come before or after the invoice (pick 12). A *Vânzare* has only the Factură chapter.

### 3.2 One phase, one next step

`src/domain/lucrare.js` works out a single **phase** from the job, its invoice, payments and review. The phase gives the card's pill, the Azi section and the two buttons (pick 17: the bottom bar holds the next step and one more move).

| Phase | Current chapter | Azi section | Next step | Other move |
|---|---|---|---|---|
| `estimate_empty` | Deviz | Devize | Adaugă linii | – |
| `estimate_to_send` | Deviz | Devize | Trimite devizul | Aprobă |
| `estimate_sent` | Deviz | Devize | Aprobă devizul | Retrimite |
| `supplement` | Deviz | În lucru | Aprobă suplimentarul | Sună |
| `to_start` | Lucru | În lucru | Începe lucrul | Trimite devizul |
| `in_progress` | Lucru | În lucru | Gata | Așteaptă piese |
| `waiting_parts` | Lucru | În lucru | Au venit piesele | – |
| `to_invoice` | Factură | De încasat | Emite factura | Emite și încasează |
| `to_collect` | Factură | De încasat | Încasează | Predă |
| `overdue` | Factură | De încasat | Încasează | Memento |
| `to_deliver` (paid, car still here) | Factură ✓ | De încasat | Predă mașina | Anunță |
| `delivered_unpaid` | Factură | De încasat | Încasează | Memento |
| `delivered_uninvoiced` | Factură | De încasat | Emite factura | – |
| `review` (closed, not asked, ≤ 3 days) | Recenzie | De încasat, at the end, as *Încheiate · cere recenzie* | Cere recenzie | Notează clientul |
| `closed` | – | not on Azi | – | – |
| `refused` | Deviz | not on Azi | – | Reactivează · Taxă diagnoză |
| `cancelled` | – | not on Azi | Reactivează | – |

A lucrare **leaves Azi** (pick 13) when it is handed over and nothing is left to pay; a refused or cancelled one leaves at once. One exception from pick 29: for 3 days after closing, a lucrare whose review was not asked stays at the end of De încasat with *Cere recenzie*.

### 3.3 The deviz keeps what was approved (picks 2, 3)

- Each line has a **need**: *Necesar* (default) or *Recomandat* (inspection findings come in as Recomandat).
- **Aprobă** records, per line, the yes or no and **how** (telefon, WhatsApp, SMS, la ghișeu). Refused lines stay on the lucrare, greyed, never on the invoice; they are suggested on the car's next visit.
- After approval, a line that is **added**, or **changed so it costs more**, is *Suplimentar*: the deviz chapter asks *Aprobă suplimentarul* with the difference in lei, and the invoice cannot be issued until it is approved or removed. Work on the approved lines goes on. A line that got cheaper or was removed needs nothing.
- A lucrare that jumped straight to work (no approval) has nothing to compare: its deviz chapter is *sărit*.

### 3.4 Money

- **No draft** (pick 4): the Factură chapter shows the invoice the lucrare would make: its billable lines (not refused), the buyer (the client unless changed, pick 27), due date and mentions, kept on the lucrare as `billing`. **Emite** checks it (the existing checklist, plus *suplimentar de aprobat*), takes the number and freezes the snapshot.
- **One live invoice** (pick 5). An invoice names its lucrări in `workOrderIds` (pick 6; one id for now, several later for fleets). The old `workOrderId` stays readable.
- **Stock** (pick 28) leaves at the first of handover or issue; the lucrare remembers when (`stockTakenAt`). A storno before handover puts the parts back; after handover they left with the car. A re-issue never takes them twice.

### 3.5 Arrival, returns, warranty

- **A deviz before the car** (pick 1): the lucrare is created with `receivedAt: null`. Check-in on its programare (or on the car) finds it and adds km, fuel and complaint; it never makes a second lucrare. Existing lucrări count as received.
- **Second programare** (pick 9): a programare can point to an existing lucrare as its *revenire*; check-in then only records the return.
- **Warranty** (pick 10): a new lucrare, kind `warranty`, `warrantyOf` the old one, starting at 0 lei. At 0 lei, handed over is closed (nothing to bill). Reopening the old one is offered only the same day and only while it has no live invoice.
- **Refuzată** (pick 14): a new end state for a deviz. Reactivating takes it back to Deviz.

## 4. Data changes

| Where | Change | When |
|---|---|---|
| Line | `need: "required" \| "recommended"`, `refused: true` | Step 1 (rules), step 2 (editor) |
| Lucrare | `kind: "job" \| "sale" \| "warranty"`, `warrantyOf`, `receivedAt`, `approval { at, channel, lines }`, `billing { customerId, dueDate, notes }`, `stockTakenAt`, status `declined` | Step 1 (rules), step 4 (migration) |
| Invoice | `workOrderIds: []` beside `workOrderId` | Step 1 (rules), step 4 (migration) |
| Programare | `returnOf` (a second programare for an open lucrare) | Step 2 |

Migration (step 4, also run on backup import): invoices without a lucrare are wrapped in a Vânzare with the same number and date; a draft edited after its lucrare gives the lucrare its lines, an untouched draft is dropped; `workOrderIds` filled from `workOrderId`; `stockTakenAt` set from the issue date where an invoice exists.

## 5. Screens (steps 2–3)

- **Lucrare page / sheet**: top bar; header with logo, make and model, number, plate, client, state pill, *din Programarea #128 · azi 09:00* (or *Fără programare*), mechanic, promised time, total and paid bar; the four chapter tabs with their marks (done ✓, current ●, ahead dashed), opening on the current chapter; the chapter's content; the bottom bar with the next step and one more move.
- **Azi card**: last week's card (white, kind on the first line, two buttons, extras) with the **chapter strip** under its header instead of the stacked records.
- **Navigation**: sidebar Azi · Programări (Calendar, Toate programările) · Lucrări (Toate, Devize, În lucru, De încasat) · Clienți · Mașini · De contactat · Catalog · Rapoarte (Registru facturi) · Setări. Phone tabs: Azi · Programări · Lucrări · Clienți · Mai mult.
- **Lucrări page**: chips with counts per chapter, search, rows by day, like Toate programările.
- **Search**: one kind of result, the lucrare, opening at the matching chapter (#1857, GRJ 0412, a plate).
- DESIGN-SYSTEM.md is updated with step 2 (lucrare page, chapter tabs, bottom bar) and step 3 (card strip, navigation).

## 6. Edge cases

All accepted as planned on the board.

| Case | Handling |
|---|---|
| Walk-in | Starts at check-in, *Fără programare* |
| Deviz made, then the programare is cancelled or missed | Stays in Deviz with *Programarea a fost anulată*; Reprogramează or Refuzată |
| Check-in for a car that already has a deviz | Finds it, adds km, fuel, complaint |
| Two programări for one lucrare | Both blocks carry #N; the second is *Revenire* |
| Deleting a programare that has a lucrare | Blocked; it can be unlinked (the lucrare becomes a walk-in) |
| Deleting a lucrare | Only without a live invoice; its programare returns to its state before check-in |
| Lines added or changed after approval | *Suplimentar*, needs its own approval; work goes on |
| Catalog price changes after the deviz went out | The deviz keeps its prices |
| VAT rate changes between deviz and invoice | Lines keep their own rate (a shop may set one per line on purpose); the chapter warns when a line differs from the current rate, with one tap to apply it |
| Client accepts only some lines | Refused lines greyed, off the invoice, suggested next visit |
| Approving a deviz with no lines | *Adaugă o operațiune* |
| Deviz sent, no answer | *Fără răspuns de 2 zile* + Sună; De contactat after 2 days |
| Waiting for parts for days | Pause chip; the car may leave and return on a second programare |
| Mechanic changes mid-job | In the history; billed hours follow each line |
| Car ready, not collected | *Gata de 3 zile* + Anunță; De contactat |
| Forgot something, same day | Reopen with a reason while no invoice; else Stornează și refă |
| Storno and re-issue | Both listed in Factură; the live one counts |
| Paid partly, car leaves | *400 din 845 lei*, stays in De încasat |
| Handed over without an invoice | *De facturat*, stays on Azi |
| Cancelling with an issued invoice | Blocked: *Stornează factura întâi* |
| Invoice to another buyer | Set in the chapter, frozen at issue; reminders still go to the client |
| Edit in one tab while the invoice is issued in another | Issue freezes the lines; the later edit is refused |
| Payment larger than what's left | Blocked (as today); money back means a storno |
| Diagnosis fee on a refused deviz | An invoice with that one line; *Refuzată · taxă diagnoză* |
| Client without a phone | Recenzie offers Copiază only |
| Lucrare handed over without an invoice | Review still offered |
| Review asked twice | Both logged (as today) |
| Old invoice links | Open the lucrare at Factură; a counter sale opens its Vânzare |
| Searching a number or plate | One result kind, the lucrare |
| Client and car pages | One list of lucrări with chapter and money |
| Unpaid reminders | Open the lucrare's Factură |
| Reports | Unchanged |
| Restoring an older backup | The migration runs on import |
| Existing drafts | Edited after the lucrare: their lines win; untouched: dropped |
| iPhone | 44 px tabs and buttons; the bottom bar clears the home indicator; each chapter keeps its scroll |

## 7. Steps

Each step is its own pull request and ends with `npm test && npm run lint && npm run build`, browser checks on phone and computer, and `npm run ios:device`.

| Step | What ships | Status |
|---|---|---|
| 1 Rules | `src/domain/lucrare.js` with tests: chapters, phase, next step, Azi section, approval kept and supplements, billable lines, invoice preview and checklist, invoices naming lucrări, stock timing, arrival, reopen vs warranty; status `declined` in `work-order.js` | 🟢 |
| 2 The lucrare page | Header, chapter tabs, bottom bar; Deviz (need, approval, supplement), Factură (preview, buyer, issue, payments, storno list) and Recenzie moved in; programare ⇄ lucrare links; new actions in `actions.js` | ⬜ |
| 3 Azi, lists, navigation | Sidebar, tab bar, Lucrări page with chips, Azi sections and cards, search | ⬜ |
| 4 Invoices folded in | Register in Rapoarte, old links, Vânzare, migration (and on import), client and car pages, reminders | ⬜ |
| 5 Clean-up | Docs, design page, `ui:check`, iPhone | ⬜ |
