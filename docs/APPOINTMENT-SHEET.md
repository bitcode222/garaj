# The appointment sheet, rethought: plan

**Status: approved by the owner on 1 Nov 2026 (all six questions as recommended, §7) and 🟢 built the same day: phases 1 to 5.** What was built differently from the plan is in §8. Open: the owner's pass on the iPhone.

The booking's sheet (`features/calendar/appointment-view.jsx`) and its form (`appointment-sheet.jsx`).
Read with [`VISIT-FLOW.md`](VISIT-FLOW.md) (the flow strip and the state section it changes for the
booking) and [`WARNINGS.md`](WARNINGS.md) (the warnings it re-places).

---

## 1. What is wrong today

Read in the code on 1 Nov 2026. Top to bottom, the sheet is:

```
Programare #128 / description
flow strip ............ "Începe lucrarea →"
warnings .............. every warning, one tinted box each, all at the top
state section ......... bars · "Clientul a confirmat" · A sosit · Reprogramează · Întârzie · Neprezentat · Anulează
when .................. one small line with a clock icon
client | car .......... two boxes
Servicii · Mecanic · Elevator
notes
Sună · SMS · WhatsApp
history
```

| # | Problem |
|---|---|
| P1 | **The facts come last.** When, who and which car sit under the warnings and a row of seven buttons. To answer "what is this booking?" you scroll past everything you can do with it. |
| P2 | **The same action in three places.** "Începe lucrarea" (strip) = "A sosit — începe lucrarea" (next step) = "A sosit" (moves row, warning fix). "Confirmă" is the next step and a warning fix. "Sună" is a warning fix and the contact row at the bottom. "Reprogramează" is a move and a fix. |
| P3 | **A wall of equal buttons.** Up to seven outline buttons in one row (move to another state, change the time, end the booking), none more important than the other. Cancelling looks as safe as confirming. |
| P4 | **Warnings far from what they are about.** An overlap is about the time, "fără mecanic" about the mechanic, "ITP expiră" about the car, yet they are all stacked at the top, before you have read the time, the mechanic or the car. |
| P5 | **Missing information** the desk asks for: how long until it starts ("peste 2 ore"), what it will cost (operations have hours and prices, never summed), whether the operations fit the slot, who the customer is to the shop (visits, no-shows, money owed), what was last done on the car. |
| P6 | **Small changes take a form.** Changing the mechanic or the bay opens the whole edit form. |
| P7 | **History is always fully open** and grows without end. |

---

## 2. The idea

**The sheet answers, top to bottom, the questions the person at the desk asks, in the order they ask them; every action and every warning sits next to the thing it changes.**

1. **Când?** When is it, and how far away.
2. **Ce am de făcut acum?** The state, the one next step, and anything urgent.
3. **Cine vine, cu ce mașină?** The customer and the car, with what the shop knows about them.
4. **Ce se face?** The operations, how long they take, what they cost.
5. **Cine lucrează?** The mechanic and the bay.
6. **Ce s-a întâmplat până acum?** The history.
7. **Oprire.** Cancel or no-show, last and quiet.

Rules that follow from it:

- **One action, one place.** Each action appears once on the sheet (the phone's sticky bar repeats the primary action; it is the same button).
- **One primary button per sheet**: the next step. Everything else is outline or quiet.
- **A warning lives in the section it is about.** The "Acum" card lists the urgent ones (late, missed, unconfirmed) and names the others in one line with a jump to them.
- **Ending a booking is not next to moving it.** Cancel and no-show go to the end, quiet, each with its confirmation.

---

## 3. The layout

Desktop (672 px sheet), a booking that is **Programat, tomorrow, with an overlap**:

```
‹                                                                   ✎   ✕
Programare #128   ○ Programat
Revizie + geometrie ✎                                          ← edited in place (as today)
─────────────────────────────────────────────────────────────────────────
CÂND
Mâine · joi, 22 octombrie                                     peste 22 h
10:00 – 11:30 · 1 h 30 min
[Reprogramează]  [Anunță o întârziere]
┌ ⚠ Se suprapune cu Dacia Logan, 10:30–11:30 · același mecanic (Ion) ──┐
│ [Mută la 11:30]  [Dă-i lui Mihai]  [Vezi cealaltă]                  │
└──────────────────────────────────────────────────────────────────────┘
─────────────────────────────────────────────────────────────────────────
ACUM
▬▬▬▬▬▬▬  ───────  ───────  ───────
Programat  Confirmat  Sosit  Finalizat
Așteaptă confirmarea clientului.
[✓ Clientul a confirmat]   [Cere confirmarea pe WhatsApp]
─────────────────────────────────────────────────────────────────────────
CLIENT                                  │ MAȘINA
Andrei Popescu                    ›     │ [VW] Volkswagen Golf 7 · 2016    ›
0722 123 456   [Sună] [WhatsApp]        │ B 123 ABC
6 vizite · ultima pe 12 aug             │ 148.200 km (12 aug)
1 neprezentare · de încasat 450 lei     │ ITP 03.2027 · RCA expiră 30 oct
★ 4 · Plătește la timp                  │ Ultima lucrare: #1840 · 12 aug · Revizie
─────────────────────────────────────────────────────────────────────────
CE SE FACE
Revizie ulei + filtre                              1 h          450 lei
Geometrie                                         30 min        200 lei
Estimat                                     1 h 30 min      ~ 650 lei
„Zgomot la roata din față stânga.“                             ← the notes
─────────────────────────────────────────────────────────────────────────
CINE LUCREAZĂ
Mecanic  [● Ion Popa ▾]          Post  [Elevator 2 ▾]          ← changed here, with undo
─────────────────────────────────────────────────────────────────────────
ISTORIC
• Reprogramată: 21 oct 09:00 → 22 oct 10:00 · 13 oct, 09:12
• Creată · 12 oct, 14:20
─────────────────────────────────────────────────────────────────────────
Neprezentat · Anulează programarea                             ← quiet, last
```

Phone (full-height sheet): the same order, one column (Client above Mașina), and a **sticky bar at
the bottom with the primary action** ("Clientul a confirmat"), in the thumb's reach. The bar is
hidden when there is no next step.

### 3.1 Header

`Programare #128` · status badge · the description edited in place (unchanged). Edit (✎) and close
stay in the top bar.

### 3.2 Când

- The day in words when near ("Azi", "Mâine", "Ieri"), else the weekday and date; the time range and
  its length; on the right, how far away: "peste 22 h", "peste 3 zile", "acum", "a început acum 10 min",
  "a trecut acum 2 h". An announced delay shows under it: "anunțat: vine la 10:30".
- Its actions: **Reprogramează** and **Anunță o întârziere** (the latter only on the day, as today).
  Their small panels open here (unchanged panels, new place).
- Its warnings: `overlap`, `closed`, `delayOverrun`, with their fixes (unchanged words and fixes).

### 3.3 Acum (the state and the next step)

The bars stay (the owner likes them). Under them **one sentence and at most three buttons**, the
first primary. What it says depends on the situation:

| Situation | Sentence | Primary | Others in the card |
|---|---|---|---|
| Programat, ahead | Așteaptă confirmarea clientului. | Clientul a confirmat | Cere confirmarea (WhatsApp) · Sună |
| Confirmat, another day | Confirmată. Vine joi la 10:00. | none | Înapoi la Programat (quiet link) |
| Programat or Confirmat, today, before start | Vine azi la 10:00 (peste 45 min). | A sosit — începe lucrarea | Sună |
| Late (`late`) | Întârzie 25 min. Trebuia să vină la 10:00. | A sosit — începe lucrarea | Sună · Vine în 15 min · Vine în 30 min |
| Passed, nothing recorded (`missed`) | A trecut fără să fie înregistrată. A venit clientul? | A sosit — începe lucrarea | Neprezentat · Reprogramează |
| Sosit | Mașina e în service. | Lucrarea #1857 · În lucru → | none |
| Finalizat | Vizita s-a încheiat: Lucrarea #1857 · 1.250 lei · Factura GRJ 0412 Plătită. | Vezi lucrarea → | none |
| Neprezentat / Anulat | the banner (what, when, why), as today | Reprogramează | Restabilește (when still ahead) |

- The urgent warnings (`late`, `missed`, `unconfirmed`, `noPhone`) are **this card**: their sentence
  becomes the card's sentence and their fixes its buttons. They are not repeated elsewhere.
- The other warnings are named in one line at the bottom of the card, each a link that scrolls to its
  section: "De rezolvat: suprapunere · fără mecanic".
- "A sosit" for a booking on another day (the car came early) stays possible: a quiet link in the card,
  "A venit mai devreme".

### 3.4 Client and Mașina

Side by side from `md` up, stacked on a phone. Each opens its record (›).

- **Client:** name; phone with **Sună** and **WhatsApp** (the only contact buttons on the sheet; the
  bottom contact row goes); then what the shop knows: visits and the last one, no-shows (red when
  any), money owed (amber, when any), the internal note (★ · tags), as today.
- **Mașina:** logo, make, model, year; plate; last km reading with its date; ITP and RCA (the
  `documents` warning becomes these two badges in their tone, no separate box); the last job on this
  car (number, date, what, total), which opens it.
- Neither: "Fără mașină" with **Adaugă mașina** (opens the form), since check-in needs one.

### 3.5 Ce se face

The operations as rows (name · time · price), then **Estimat**: the sum of the times and the price
(gross, from the domain). When the operations need more time than the slot: one line,
"Operațiunile cer 2 h 30 min; intervalul are 1 h 30 min", with **Prelungește până la 12:30**
(undo). The notes in quotes under them. No operations: "Nicio operațiune" and **Adaugă** (the form).

### 3.6 Cine lucrează

Mecanic and Post as two selects that save at once, with an undo toast. Its warning (`unassigned`,
with "Dă-i lui X") sits here. This replaces the form for the most common small change.

### 3.7 Istoric

Newest first, the last three; "Arată tot (7)" opens the rest in place.

### 3.8 Oprire

At the very end, two quiet buttons: **Neprezentat** (only once the booking has started, as today)
and **Anulează programarea**, each opening its reason panel in place (unchanged). Deleting stays in
the edit form.

---

## 4. Decisions

**A1. The booking's flow strip shows only once the job exists.** *(7 Nov 2026: gone with the strip; the visit bar is always there, its Deviz and Lucrare open check-in, [`VISIT-BAR.md`](VISIT-BAR.md) B2.)* Before that, starting the job is
the primary action of the Acum card, so the strip would repeat it (P2). Once the job exists the strip
is the way to it (`Lucrarea #1857 · În lucru →`), as today. This changes VISIT-FLOW D2 for the
booking only; the job, the invoice and the review keep their strips.

**A2. Every warning sits in its section** (P4). Acum: `late`, `missed`, `unconfirmed`, `noPhone`.
Când: `overlap`, `closed`, `delayOverrun`. Cine lucrează: `unassigned`. Mașina: `documents` (as
badges). The words and the fixes are unchanged (docs/WARNINGS.md); only the place changes. The hover
card keeps its compact list.

**A3. One primary button, one place per action** (P2, P3). The moves row goes: confirm and check-in
are the Acum card's, reschedule and delay are Când's, no-show and cancel are Oprire's, back to
Programat is a quiet link in Acum.

**A4. Mechanic and bay change in the sheet** (P6), saved at once with undo, conflicts shown live.

**A5. Money on the booking** (P5): the operations' estimate, and the customer's balance when they
owe. Read-only; nothing is invoiced from here.

**A6. The edit form follows the sheet's order**: Client · Mașina → Ce se face (with the description,
now under the operations, optional) → Când (date, time, length, with "potrivește durata" from the
operations, and the overlap live) → Cine lucrează → Notițe; a summary line in the footer ("joi 22 oct,
10:00–11:30 · Ion · ~ 650 lei").

---

## 5. Domain (pure, tested, in `src/domain/`)

| Function | Returns | Where |
|---|---|---|
| `bookingNow(appointment, { now, order, warnings })` | the Acum situation: `{ key, primary, others, warnings }`, keys as in §3.3; words stay in the UI | `flow.js` |
| `warningSection(kind)` | `now` · `time` · `staff` · `car` (A2) | `booking-warnings.js` |
| `operationsEstimate(operations, { vatRate })` | `{ minutes, gross }` in minutes and bani | `lines.js` |
| `customerFacts(customerId, { appointments, workOrders, balance })` | `{ visits, lastVisit, noShows, owed }` | `customer.js` |
| `lastJob(vehicleId, workOrders)` | the latest delivered or open job of the car | `vehicle.js` |
| `untilText` inputs: `relativeTo(start, end, now)` | `{ kind: "ahead" \| "now" \| "past", minutes }` | `dates.js` |

---

## 6. Build order

| Phase | What | Done when |
|---|---|---|
| 1 | Domain functions of §5, with tests | `npm test` green |
| 2 | Sheet rebuilt in the new order: Când, Acum, Client · Mașina, Ce se face, Cine lucrează, Istoric, Oprire; warnings moved (A2); strip rule (A1); phone sticky bar | every row of §3.3 checked on the demo data |
| 3 | Mechanic and bay in place (A4); "Prelungește"; history folded | |
| 4 | Edit form in the sheet's order (A6) | |
| 5 | DESIGN-SYSTEM and VISIT-FLOW updated 🟡 → 🟢; `npm test && npm run lint && npm run build`; iPhone run | |

---

## 7. Questions for the owner

| # | Question | Recommended |
|---|---|---|
| Q1 | The booking's flow strip only once the job exists (A1)? | Yes |
| Q2 | Warnings in their sections, with a one-line summary in Acum (A2), instead of one list at the top? | Yes |
| Q3 | Cancel and no-show at the end of the sheet, quiet (A3)? | Yes |
| Q4 | Change the mechanic and the bay right in the sheet (A4)? | Yes |
| Q5 | Show the estimate and what the customer owes (A5)? | Yes |
| Q6 | Rework the edit form in the same pass (A6, phase 4)? | Yes |

---

## 8. Built differently from the plan

| Where | Plan | Built | Why |
|---|---|---|---|
| Acum, Sosit / Finalizat | Primary "Lucrarea #1857 · În lucru →" | No button: the sentence, then the job in figures (status, total, its invoice and its state) | The flow strip right above is the way to the job (A1); a second link would break "one action, one place" |
| Client | Sună and WhatsApp buttons | The phone number is a tap-to-call link; Sună and Cere confirmarea are the Acum card's, when the situation calls for them (confirm, today, late) | The same buttons would otherwise be in both places |
| Mașina | `documents` as badges | As planned, and the badges are measured against the visit's day (as the warning is); "De rezolvat: acte de verificat" jumps to them | |
| Cine lucrează | Side by side | Side by side from `sm` up, stacked on a phone | Names were cut at 430 px |
| Edit form | "Potrivește durata" from the operations | Shown when the operations' time, on the half-hour grid, differs from the length; the footer summary shows from `md` up | On a phone the footer is only Renunță · Salvează |

Code: `src/features/calendar/appointment-view.jsx` (the sheet), `appointment-state.jsx` (the panels and
the history), `booking-warnings.jsx` (`useBookingWarnings`, `FixButton`: the warnings' fixes are also
the Acum card's buttons), `appointment-sheet.jsx` (the form); domain in `flow.js` (`bookingNow`),
`booking-warnings.js` (`warningSection`), `lines.js` (`operationsEstimate`), `customer.js`
(`customerFacts`), `vehicle.js` (`lastJob`), `dates.js` (`relativeTo`); tests in
`src/domain/booking-sheet.test.js`.
