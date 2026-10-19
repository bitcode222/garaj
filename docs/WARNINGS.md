# Warnings on bookings and jobs: specific, with the fix one tap away

Status: plan approved with the request (2026-10-19), implemented in the same change.

## Why

Today a booking says little when something is off: an amber outline and "Se suprapune cu altă
programare" (with whom? since when? what do I do?), "Întârzie 25 min" without a way to call, and
"Programarea a trecut" only inside the sheet. Every warning should say **what exactly**, **with
whom / since when**, and offer **the fix as a button** (with undo), on the card, in the hover card
and in the sheet.

## The rule (domain, `src/domain/booking-warnings.js`)

`bookingWarnings(appointment, ctx)` returns the list, most urgent first; `jobWarnings(order, ctx)`
the job's; `bookingAlert` a light summary for the cards (no fix search). Pure, tested, words-free:
each warning carries facts and fixes; the UI words them.

```
{ kind, severity: "danger" | "warning" | "info", ...facts, fixes: [{ id, ...params }] }
```

| Kind | When | Facts | Fixes |
|---|---|---|---|
| `missed` (danger) | booked (Programat/Confirmat) and its end has passed, nothing recorded | day, start | A sosit (check-in) · Neprezentat · Reprogramează |
| `late` (danger) | today, past start (or the announced time) + 15 min grace, not arrived, not over | minutes, since, announced | Sună (when a phone exists) · A sosit · Vine în 15 / 30 min · Neprezentat |
| `overlap` (warning) | overlaps another active booking on the same mechanic or the same elevator, still to come | each other booking: time, car, why (mecanic / elevator / both) | Mută la HH:MM (the free slot that day closest to its time, same length) · Dă-i lui X (a free mechanic) · Pe <elevator> (a free one) · for a car already in: mută cealaltă la HH:MM, or another mechanic / elevator for it · Vezi cealaltă |
| `delayOverrun` (warning) | the customer announced an arrival at or after the booked end | expectedAt, end | Mută la HH:MM–HH:MM (from the announced time, same length) |
| `unassigned` (warning) | to come, no mechanic or an inactive one, and the shop has mechanics | inactive name | Dă-i lui X (up to two free mechanics, least booked first) · Alege… (edit) |
| `unconfirmed` (warning) | Programat (not confirmed), starts today (not yet started) or tomorrow | start | Confirmă · Trimite reamintire (WhatsApp, prefilled) · Sună |
| `closed` (warning) | to come, on a closed day or outside the opening hours | closed day / hours | Mută la <zi> HH:MM (the free slot in the hours closest to its time, that day or the next open days) |
| `pickup` (warning, job) | ready for 1 day or more, not handed over | days, value | Anunță clientul (WhatsApp, prefilled) · Vezi lucrarea |
| `parts` (warning, job) | waiting for parts for 2 days or more | days, what (the reason given) | Au venit piesele (→ În lucru) · Vezi lucrarea |
| `estimate` (warning, job) | estimate not approved for 1 day or more | days, value | Aprobat · Trimite devizul (WhatsApp) |
| `overrun` (warning, job) | today, the job (Deviz / Aprobat / În lucru) ran past the booked end | minutes over, the mechanic's next booking today | +30 min · +1 h · Gata (from În lucru) |
| `documents` (info) | to come or in the shop, ITP or RCA expired, or expiring within 30 days of the visit | which, date | Vezi mașina |
| `noPhone` (info) | shown only with `unconfirmed`, `late` or `missed`: the customer has no phone | | Adaugă telefon |

Order: danger, then warning, then info; within one severity, the table's order.

## Where it shows

- **Card** (calendar, Zi · Săptămână · Lună, ⇄ and ⇅): the most severe warning as an outline
  (red for danger, amber for warning; info draws nothing) and a small icon at the end of the top
  line (⏰ red for late / missed, ⚠ amber otherwise). The card's label names them ("Atenție:
  întârzie 25 min; se suprapune cu Dacia Logan").
- **Hover card**: a section "Atenție" right under the date: each warning's sentence, its context
  line and its fixes as small buttons; at most three, then "+N în fișă". The hover card becomes
  interactive: the pointer can move onto it (it closes 0.2 s after the pointer leaves both).
  A fix closes it; a fix that needs a choice opens the booking's sheet on that panel.
- **Opening a card**: a lucrare's card (🔧, or ✓ with its job) opens the job's sheet; a booking still
  to come opens the booking's sheet.
- **Booking sheet**: the same list, full size (44 px buttons on the phone), above the state
  section. It replaces the generic overlap line and the "A trecut. A venit clientul?" notice.
- **Job sheet**: the job's warnings (`pickup`, `parts`, `estimate`, `overrun`) above its steps.

Every fix that changes data shows a toast with **Anulează** (undo), like every other change.

## Edge cases

- Cancelled or no-show: nothing. Finished (done / delivered): nothing. A car in the shop
  (Sosit): only `overlap` (offering to move the *other*, booked one), the job's kinds, `documents`.
- Past: whatever ended before now is skipped, except `missed` (a loose end, however old).
- `late` vs `delayOverrun`: an announced time still ahead is `delayOverrun` (when it overruns) and
  never `late`; once it has passed (+ grace), it is `late` "față de ora anunțată".
- Free slot: the booking's day, from the later of now (rounded up to 15 min) and the opening, in
  15-minute steps, same length, ending by the closing, clear of the same mechanic's and the same
  elevator's bookings; the one closest to the booked time (the smallest change; a tie goes to the
  later one); none on a closed day. `closed` looks up to 14 days ahead, at the same hour first.
- Free mechanic / elevator: active, not the current one, nothing active overlapping the slot;
  "Nealocat" bookings block nobody. No free one: no button (Reprogramează / Alege stay).
- Moving a confirmed booking by a fix changes its time, so it goes back to Programat (the customer
  must hear it); the toast says so.
- The conflicting booking may be hidden by the calendar's filters: it still counts.
- Shops without mechanics in the app: no `unassigned`.
- No phone: no Sună / reamintire buttons, and `noPhone` with "Adaugă telefon".
- The clock moves: the lists are recomputed every minute (cards, hover card, sheet).
- Performance: cards use `bookingAlert` (no fix search), computed once per minute for all
  bookings; the full list with fixes is computed only for the booking in the hover card or sheet.
- Phone: no hover; the card's icon says it, the sheet resolves it.
