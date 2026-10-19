# The visit flow: plan (Programare → Lucrare → Factură → Recenzie)

**Status: plan approved by the owner on 16 Oct 2026, all six questions answered as recommended (§11). All phases (0 to 7) are 🟢 built.** What is still open: the owner's hands-on pass on the physical iPhone. What was built differently from the plan is listed at the end of §10.

Words used here: a **visit** is one car's trip through the shop. It leaves up to four **records**: the **programare** (booking), the **lucrare** (job), the **factură** (invoice) and, new, the **recenzie** (review). Each record opens as a sheet from `md` up and as a full page on a phone (see DESIGN-SYSTEM.md, "Screens, not previews"). The appointment is always a sheet.

---

## 0. Thinner sheets 🟢

Every sheet is one width from `md` up, so stacked sheets line up: it went from 48 rem (768 px) to **42 rem (672 px)** (`md:max-w-2xl` in `src/components/ds/sheet.jsx`). Phones are unchanged (full width).

Seen at the new width: the job's line items get cramped (the description column is cut to a few letters). Phase 1 makes the lines editor switch to stacked rows when its container is narrow (container query), so it reads well at 672 px.

## 1. What it must do

| # | Requirement |
|---|---|
| R1 | Right under the title of each record, a **flow strip**: small arrows with reference titles to the record before and the record after. The arrow forward is captioned **"Pasul următor"**. |
| R2 | Programare: title **"Programare #128"**, subtitle the booking's own description, editable in place. Forward: **"Începe lucrarea →"** before the job exists, **"Lucrarea #1857 →"** after. |
| R3 | Lucrare: back to its programare (or **"Fără programare"** for a walk-in), forward to its factură. |
| R4 | Factură: back to its lucrare, forward to the **recenzie**. |
| R5 | Recenzie, a new sheet: the admin sends the customer a link to give feedback, gives the customer stars and writes an internal note, to know them next time. |
| R6 | Under the flow strip, each sheet's own **state section**: what the next step is, one tap to do it, moves back and forth, skipping steps when needed. Programare: confirm, reschedule, announce a delay, no-show, cancel. Keep the look of the job's current stepper (the owner likes it). |
| R7 | Simple rules that survive surprises: every move that is not possible says why and how to fix it; nothing fails silently; every reversible change can be undone. |

## 2. What exists today

Read in the code on 16 Oct 2026.

| Record | States | Moves | Links |
|---|---|---|---|
| Programare | Programat · Confirmat · Sosit · Finalizat · Neprezentat · Anulat | Programat ⇄ Confirmat; either → Neprezentat / Anulat; Neprezentat / Anulat → Programat; → Sosit only through check-in (creates the job); → Finalizat when the job is delivered | `workOrderId` |
| Lucrare | Deviz · Aprobat · În lucru ⇄ Așteaptă piese · Gata · Predat · Anulat | Forward one step (Deviz may skip to În lucru); back to any earlier open step; Predat and Anulat are final | `appointmentId`, `invoiceId` |
| Factură | Ciornă · Emisă (shown as Parțial plătită · Plătită · Restantă from payments and dates) · Stornată / Stornare | Ciornă → Emisă (gets a number, frozen); payments; storno (credit note) | `workOrderId`, `stornoOf` / `stornoId` |
| Recenzie | does not exist | | |

What is wrong with it:

| # | Problem |
|---|---|
| 1 | The links between the records are in different places on each sheet: a "Deschide lucrarea" button on the booking, a "Factură" card in the job's side column, a "Legături" card on the invoice. There is no single picture of where a visit is. |
| 2 | Appointments have no number, so "Programare #…" cannot be said or searched. |
| 3 | The booking's state controls are hidden in a menu; there is no reschedule (only "back to Programat"), no announced delay, no reason for a cancellation. |
| 4 | The job's next step is repeated in three places (header, side card, phone bar). It cannot skip further than Deviz → În lucru, and a delivered or cancelled job can never be reopened (a car that comes back next day for the same fault). |
| 5 | The invoice has no stepper; what blocks issuing is a yellow list at the bottom; undoing an issued invoice (storno, then a new one) takes several steps. |
| 6 | Deleting a job puts its booking back to "Confirmat" even if it was only "Programat". |
| 7 | Check-in fails with an error if the booking has no car ("Adaugă întâi mașina"). |
| 8 | The app has no server: a page where the customer writes feedback cannot store anything (see Q1). |

## 3. One visit, four records

```
 Programare #128   →   Lucrarea #1857   →   Factura GRJ 0412   →   Recenzie
 booked                the job               the money               the follow-up
```

- Each record knows its neighbours: booking ⇄ job by `workOrderId` / `appointmentId` (exists), job ⇄ invoice by `invoiceId` / `workOrderId` (exists), job → review by `workOrderId` (new).
- A visit can start in the middle: a **walk-in** starts at the job; a **manual invoice** (from Facturi) starts at the invoice. The record before is then "missing", and the strip says so instead of hiding the arrow.
- A credit note (storno) is not a step of the visit: it hangs off the invoice it cancels, and the job's forward link goes to the invoice that replaced it.

## 4. Layout of each sheet

The same order on every record, sheet or full page:

```
‹ Înapoi                                                   ✎   ⤢   ✕
Programare #128
Revizie + geometrie ✎                         ← subtitle, edited in place
───────────────────────────────────────────────────────────────────────
                                                       PASUL URMĂTOR
                                                 Începe lucrarea  →     ← flow strip
───────────────────────────────────────────────────────────────────────
 ○ Programat ── ● Confirmat ── ○ Sosit ── ○ Finalizat                  ← state section
 [ A sosit — începe lucrarea ]  Reprogramează  Întârzie  Neprezentat  Anulează
───────────────────────────────────────────────────────────────────────
 the record itself (client, mașină, operațiuni, notițe…)
```

The flow strip, per record:

```
Programare      ·                                    PASUL URMĂTOR
                                                     Începe lucrarea →      (or)   Lucrarea #1857 · În lucru →

Lucrare         PASUL ANTERIOR                       PASUL URMĂTOR
                ← Programarea #128 · 16 oct          Facturează →           (or)   Factura GRJ 0412 · Emisă →
                (or)  Fără programare

Factură         PASUL ANTERIOR                       PASUL URMĂTOR
                ← Lucrarea #1857                     Cere recenzie →        (or)   Recenzie · ★★★★☆ →
                (or)  Fără lucrare

Recenzie        PASUL ANTERIOR
                ← Factura GRJ 0412                   Vizita e încheiată ✓
                (or)  ← Lucrarea #1857 (no invoice)
```

## 5. Decisions

**D1. The flow strip is the only place the records link to each other.** It replaces the booking's "Deschide lucrarea" button, the job's "Factură" side card and the invoice's "Legături" card (car and customer links stay where they are). Small and quiet, as asked: a caption (`text-2xs`, upper case, muted), a title, a status badge, an arrow. Left-aligned for the step before, right-aligned for the step after. Each half is one 44 px target.

**D2. Forward has two forms: "do it" and "go there".** Before the next record exists, the forward link is a verb that creates it, exactly as today's buttons do:

| From | Verb | What it does |
|---|---|---|
| Programare | Începe lucrarea | Opens check-in (it creates the job and marks the booking Sosit) |
| Lucrare | Facturează | Creates the draft invoice from the job's lines |
| Factură | Cere recenzie | Opens the review sheet |

After, it is the record's title with its status ("Lucrarea #1857 · În lucru"). The verb form is drawn as an accent link (brand text, arrow), the title form as plain text, so "there is something to do here" reads at a glance.

**D3. A forward link that cannot be used yet says why, in place.** It stays visible, muted, with one line under it and, when there is one, a fix:

| Situation | Says | Fix |
|---|---|---|
| Booking cancelled or no-show | Programarea e anulată | Reprogramează |
| Booking without a car | Adaugă mașina ca să începi lucrarea | Check-in lets the car be picked or added (§6.1); the link stays usable |
| Job without operations | Adaugă o operațiune ca să facturezi | Scrolls to the lines |
| Job cancelled | Lucrarea e anulată | Reactivează |
| Storno (credit note) | Nu are pas următor | none |

**D4. Moving along the strip replaces the sheet, it does not stack it.** Going forward slides the next record in from the right, going back slides the previous one in from the left, so the visit has a direction. The system Back (or swipe) returns along the same path. On a phone (full pages) the same with page transitions. The stack limit (two sheets) is never hit by walking the strip.

**D5. Appointments get numbers.** A counter like the jobs', taken atomically when a booking is saved. Existing bookings are numbered once, in creation order, by a one-time migration. Search finds "#128".

**D6. The subtitle is the booking's description, edited in place.** Click (or tap) → it becomes an input; Enter or leaving the field saves; Esc cancels. Emptied, it falls back to the operations' names, as the form does today. Same for the job (its complaint) and the invoice (its mentions line) only if the owner wants it later; not in this plan.

**D7. One state component for the three records, in the job stepper's look.** The bars and labels stay exactly as today. What changes:

- Under the bars, **one "next step" line**: a primary button with the verb ("Aprobă devizul"), and one muted sentence of what happens next ("Clientul a aprobat; mecanicul poate începe."). It replaces the three copies on the job.
- **Every step is still clickable.** A step behind is "Înapoi la …", the next one is the normal move, a step further on is "Sari la …": it asks once, names the steps that will be skipped, and the skipped steps are drawn hatched with "sărit" in the history.
- **Side states are not steps.** Neprezentat, Anulat, Stornată replace the bars with a banner that says what happened, when, why (the reason, when given) and the way back.
- **A pause is a chip on its step**, not a step: "Așteaptă piese" on În lucru (with an optional note "ce piesă, când vine"), "Parțial plătită" as a fill inside Încasată.
- **Every other move** is a row of small buttons under the line, never a hidden menu; one that is not possible now is disabled with its reason as the tooltip (and spoken by screen readers).

**D8. The rules live in the domain, with their reasons.** A new `src/domain/flow.js` answers, for any record: the steps, the current step, the next step, and every move with `allowed`, `reason` and whether it needs a confirmation. The UI only draws what it says, so a rule is changed in one tested place.

**D9. Undo for everything that can be undone; a clear warning for what cannot.** Status changes, reschedules, delays and payments get a toast with "Anulează". Issuing an invoice and storno cannot be undone (the law), so their confirmation says so in one sentence, and offers the right next step instead ("Stornează și refă").

## 6. Each record's state section

### 6.1 Programare

Steps: **Programat → Confirmat → Sosit → Finalizat.** Side states: Neprezentat, Anulat.

| State | Next step (primary) | Other moves |
|---|---|---|
| Programat | Clientul a confirmat | A sosit — începe lucrarea · Reprogramează · Întârzie · Neprezentat · Anulează |
| Confirmat | A sosit — începe lucrarea | Înapoi la Programat · Reprogramează · Întârzie · Neprezentat · Anulează |
| Sosit | (in the flow strip: Lucrarea #1857) | Reprogramează is off: "Mașina e deja în service" |
| Finalizat | none: "Vizita s-a încheiat" | none |
| Neprezentat / Anulat | Reprogramează | Restabilește (same time, if still ahead) |

- **Reprogramează** opens a small panel inside the section, not a new sheet: date, time and length, with quick chips ("+1 h", "mâine, aceeași oră", "săptămâna viitoare"), and the overlap warning live, as in the form. A checkbox **"Clientul știe"** (on when the booking was confirmed): on, it stays Confirmat; off, it goes back to Programat and the reminder message is offered. History: "Reprogramată: 16 oct 10:00 → 17 oct 09:00".
- **Întârzie** (the customer called to say they are late): +15 / +30 / +60 min or a time. The booking keeps its slot and gets an **expected arrival**; the calendar then says "anunțat: vine la 10:30" in a calm tone instead of the yellow "întârzie", and starts counting late from the new time. If the new time runs past the slot, it offers "Mută și programarea".
- **Neprezentat** and **Anulează** ask once, with an optional reason as chips (Clientul a anulat · Service-ul a anulat · Altul + text). The banner shows it; the toast offers "Reprogramează".
- **A booking whose time has passed and nothing happened** shows a banner instead of the next step: "Programarea a trecut. A venit clientul?" with A sosit · Neprezentat · Reprogramează. This is the most common real-life loose end.
- **Check-in without a car**: the check-in sheet gets the car picker (choose one of the customer's cars or add one) instead of refusing.
- **History** on the booking: created, confirmed, rescheduled, delay announced, cancelled (with reason), checked in. The same `activity` list the jobs have.

### 6.2 Lucrare

Steps (unchanged look): **Deviz → Aprobat → În lucru → Gata → Predat.** Pause: Așteaptă piese. Side state: Anulat.

| State | Next step (primary) | What the sentence says |
|---|---|---|
| Deviz | Aprobă devizul | Trimite devizul clientului; după aprobare poți începe |
| Aprobat | Începe lucrul | Mecanicul poate începe |
| În lucru | Marchează gata | Anunță clientul când e gata |
| Așteaptă piese | Piesele au sosit | Notes the part and the expected day, when given |
| Gata | Predă mașina | Asks first if there is no issued invoice (as today) |
| Predat | none | "Predată pe 16 oct, 17:20" · Redeschide |
| Anulat | Reactivează | Back to Deviz, lines kept |

- **Skip**: any later step can be reached from any open step ("Sari la Gata"), with one confirmation naming what is skipped. The dates of skipped steps are not invented: they are recorded as skipped.
- **Redeschide** (Predat → Gata, for a car that comes back): asks for a reason, which goes in the history. If the job has an issued invoice, the lines stay locked (a new invoice needs a storno first) and the sentence says so.
- **Reactivează** (Anulat → Deviz).
- **Deleting** a deviz returns its booking to the state it had before check-in (from the booking's history), not always to Confirmat (problem 6).
- The **Deviz** actions (send, print) and the editor stay where they are; only the status controls move into the section.

### 6.3 Factură

Steps: **Ciornă → Emisă → Încasată.** Fill inside Încasată: Parțial plătită (paid / total). Marks: Restantă (red mark on Emisă, with how many days). Side state: Stornată (and, on the credit note itself, Stornare).

| State | Next step (primary) | Other moves |
|---|---|---|
| Ciornă | Emite factura | Previzualizează · Șterge ciorna · Emite și încasează integral |
| Emisă | Înregistrează plata | Trimite · Tipărește · Stornează |
| Parțial plătită | Încasează restul (X lei) | as Emisă |
| Restantă | Trimite reamintire, then Înregistrează plata | as Emisă |
| Plătită | none: "Încasată integral pe 16 oct" | Trimite · Tipărește · Stornează |
| Stornată | none | Opens the credit note; "Refă factura" makes a new draft from the same lines |

- **What blocks issuing** (no customer, company without CUI, a line without a price…) is shown as a checklist right under the next step, each with its fix ("Completează CUI" opens the customer form), and the button says "Emite factura (2 probleme)" until they are solved.
- **Skip**: "Emite și încasează integral" for counter sales: issues and records one payment (cash or card) in one step.
- **Back** is not possible once issued (the law). The state section says it in one line and offers **"Stornează și refă"**: the storno and a new draft from the same lines, in one confirmation.
- **The job changed after the draft was made**: a banner on the draft, "Lucrarea s-a modificat după crearea ciornei", with "Actualizează liniile".
- **Payment removed by mistake**: the payment list keeps its undo, as today.

### 6.4 Recenzie (new)

Opens from the invoice's forward link (or from a delivered job without an invoice, from its state section). One review per job.

```
Recenzie
Ion Popescu · Dacia Logan B 123 ABC
───────────────────────────────────────────────────────────────────────
 PASUL ANTERIOR
 ← Factura GRJ 0412                                  Vizita e încheiată ✓
───────────────────────────────────────────────────────────────────────
 ○ Necerută ── ● Cerută (16 oct, WhatsApp) ── ○ Primită
───────────────────────────────────────────────────────────────────────
 Cere părerea clientului
 [ message, editable: "Bună ziua! Mulțumim că ați ales … Ne lăsați o părere? <link>" ]
 [ WhatsApp ]  [ SMS ]  [ Copiază ]
───────────────────────────────────────────────────────────────────────
 Nota ta (internă, clientul nu o vede)
 ★ ★ ★ ★ ☆      chips: Punctual · Plătește la timp · Pretențios · Recomandă
 [ notiță internă ]
```

- **States**: Necerută → Cerută (when, on which channel; each send is logged) → Primită (the admin marks it when the customer answered). Sending only opens WhatsApp or SMS, so the app cannot know it was sent: the log says "deschis în WhatsApp" with "N-am trimis" to take it back.
- **The admin's own note** (1 to 5 stars, a few chips, a note) is saved as it is typed and shown later where it helps: a small "★ 4" with the note's first words on the customer, on their next bookings and in check-in.
- **The link** depends on Q1.
- New settings: the review link and the message template (Setări → Recenzii).

## 7. How it is built

```
domain/flow.js            steps, current, next, moves (allowed, reason, confirm) for each record; tested
domain/appointment.js     reschedule, announced delay, cancel reason, history; tested
domain/review.js          the review record and its states; tested
store                     appointment counter + one-time numbering; "reviews" collection (database version 1 → 2)
lib/sheets.js             replaceSheet(type, props, direction) for walking the strip
components/ds/flow-links.jsx    the flow strip
components/ds/flow-steps.jsx    the stepper (today's StatusStepper, generalised) + next step line + moves row
features/reviews/review-sheet.jsx
```

- Every write goes through `actions.js`; the numbering and the database upgrade use `atomic()`.
- `flow.js` is the only place that knows the moves. `StatusStepper`, `StatusMenu` and the three "next step" buttons on the job are replaced by `FlowSteps`.
- The flow strip reads the neighbours from the store each render, so a record created, deleted or cancelled elsewhere (another tab, the dashboard) changes the strip at once.

## 8. Errors and surprises

| Case | Behaviour |
|---|---|
| A move that is no longer allowed (the record changed meanwhile) | The action fails with the domain's reason in a toast; the section redraws from the store |
| The record is deleted while open | The sheet closes with a toast (exists) |
| The next record is deleted (job deleted, draft deleted) | The strip falls back to the verb ("Începe lucrarea", "Facturează") |
| Double tap on an action | The button is disabled while the action runs |
| Issue fails (counter, missing data) | Nothing changes; the toast says why; the checklist shows the fix |
| Check-in from a booking that already has a job | Goes to the job instead of failing |
| Two bookings for one job, or a job linked to a deleted booking | The strip shows the one the job names; a missing one is "Fără programare" |
| Storno of an invoice whose job is open | The job's forward link becomes "Facturează" again |
| Manual invoice (no job) | "Fără lucrare"; the review is not offered |
| Walk-in job | "Fără programare"; everything else as usual |
| A booking rescheduled into the past | Allowed with a warning (recording what happened) |
| Delay announced, then the car arrives early | Check-in clears the delay |
| Reopened job with an issued invoice | Lines stay locked; the sentence says why and offers "Stornează și refă" on the invoice |
| Review requested twice | Both sends are logged; the state stays Cerută |
| Phone: full pages instead of sheets | Same strip and section; the next step also sits in the bottom bar (one-hand reach), as today |
| Keyboard | Strip links and moves are buttons in reading order; Esc closes panels first, then the sheet |

## 9. UI details

- The strip and the section use tones and tokens only; no new colours. The verb link is the brand accent; a disabled link is muted with its reason under it, never only greyed out.
- Numbers are monospace and tabular (`#128`, `#1857`, `GRJ 0412`), as elsewhere.
- Phone: every target 44 px, the strip's two halves stack when the screen is narrower than 360 px, the subtitle input is 16 px (no zoom).
- Motion: the strip's slide uses the existing sheet easing; reduced motion turns it into a fade.

## 10. Build order

Each phase ends with `npm test && npm run lint && npm run build`, browser checks for what it adds, and `npm run ios:device`.

| Phase | What ships |
|---|---|
| 0 🟢 | Thinner sheets |
| 1 🟢 | Domain: `flow.js` with tests; appointment numbers (counter + migration), history, reschedule, delay, cancel reason; the lines editor at 672 px |
| 2 🟢 | Flow strip on booking, job and invoice; walking the strip (replace, with direction); "Programare #N" with the editable subtitle |
| 3 🟢 | Booking state section: stepper, moves row, Reprogramează panel, Întârzie, reasons, the "a trecut" banner, check-in with car picker |
| 4 🟢 | Job state section in the current look: one next step, skip, pause chip, Redeschide, Reactivează, delete that restores the booking |
| 5 🟢 | Invoice state section: stepper, issue checklist with fixes, Emite și încasează, Stornează și refă, the draft-out-of-date banner |
| 6 🟢 | Recenzie: collection, sheet, settings, the rating shown on the customer, on the booking and in check-in |
| 7 🟢 | DESIGN-SYSTEM.md and PLAN.md updated; browser checks for the flow (`npm run ui:check`, "The visit flow"). The pass on the physical iPhone is the owner's |

Built differently from the plan, and why:

- **A booking opens as its sheet on every device**, also on a phone (before, a phone opened the booking's form). The strip and the state section are where a booking is moved on; the form is the pencil in the sheet's top bar, and it lost its own status block (one place for the state).
- **A blocked move stays a button.** It looks muted and says why when pressed (a toast), instead of a disabled button with a tooltip: tooltips do not exist on a phone.
- **A toast's "Anulează" works over a sheet.** A modal sheet switched pointer events off for everything outside it, toasts included, so every undo offered from inside a sheet could not be pressed (this was true before this work too). Toasts take pointer events again, and pressing one is not a click outside the sheet.
- **Moves that are not steps get a small panel inside the section** (reschedule, announced delay, the reason for a cancellation, a reopening, a pause for parts), not a dialog. Esc closes the panel first, the sheet second.
- **The job's steps are clickable as before, and the row of moves holds only what is not a step** (wait for parts, cancel, reopen), with one line under the bars: "Atinge o etapă ca să revii la ea sau să sari direct acolo." Listing every step again as a button would double them.
- **A part payment is drawn on the last step** ("Parțial plătită · 40 %", the bar filled to 40 %), not between steps.
- **Walking on a phone opens pages with the usual page transition.** The sliding from the arrow's side is for sheets (md and up).
- **The review's request has a copy fallback.** The clipboard can be refused (an older web view, no permission); copying then goes through a hidden field.
- **"Facturează" moved from the job's header to the strip; "Încasează" and "Emite factura" moved from the headers to the state sections.** The phone's bottom bar keeps the next step.

## 11. Questions for the owner

All six were answered "yes" (as recommended) on 16 Oct 2026.

| # | Question | Recommended |
|---|---|---|
| Q1 | The customer's feedback link. The app has no server, so a page where the customer types feedback cannot store it. **A**: the link opens the shop's Google reviews page (set in Setări); the admin marks "Primită" by hand. **B**: build a small online service later to receive feedback in the app (needs a server reachable from the internet: cost and security to decide). | A now, B later if wanted |
| Q2 | "Întârzie": keep the slot and record the expected arrival (offer to move it when it no longer fits), or always move the booking? | Keep the slot, offer to move |
| Q3 | A confirmed booking that is rescheduled: stays confirmed only when "Clientul știe" is ticked? | Yes |
| Q4 | Jobs: allow jumping to any later step (with one confirmation), and reopening a delivered job (with a reason)? | Yes, both |
| Q5 | Appointment numbers: their own sequence (#1, #2, …), existing bookings numbered by creation date? | Yes |
| Q6 | A job delivered without an invoice (fleets billed monthly): offer "Cere recenzie" from the job too? | Yes, from its "Predat" state |
