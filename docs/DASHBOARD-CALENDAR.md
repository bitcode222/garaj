# Dashboard calendar v2: plan

**Status: plan approved by the owner on 13 Oct 2026. All phases (0 to 8) are 🟢 built.** Phase 8 (§12: bigger bookings, the same wording on a card and its booking, editing in place) was asked for by the owner on 13 Oct after phases 0 to 7 were merged. What is still open: the owner's own hands-on pass on the physical iPhone (the checks below ran in Chrome; phases 0 to 7 also in the iOS 27 simulator).
It replaces the paged Zi / Săptămână calendar on Azi (`src/features/dashboard/dashboard-calendar.jsx`, `visit-timeline.jsx`).
Build order and status are in §10; each phase ships on its own. The owner's answers are in §11.

Browser checks: `npm run ui:check` builds the app and drives it in headless Chrome (`scripts/ui-check.mjs`). Every phase adds its checks there.

Words used here: a **visit** is one car's trip through the shop (a booking, the job it became, or a walk-in job with no booking). The **timeline** is the part with the mechanics' rows and the bookings. **Zi** and **Săptămână** are its two zoom levels.

---

## 1. What it must do

| # | Requirement |
|---|---|
| R1 | Scrolling over the timeline moves through days: mouse wheel up/down, trackpad or swipe left/right. No pages. |
| R2 | The day or range in view is always written between the ‹ › buttons at the start of the header, and follows the scroll. |
| R3 | Cars in service and the timeline read as one thing: a car's card leads to its booking, a booking leads to its card. |
| R4 | "Arată în calendar" on a card travels to the booking in one smooth motion and leaves it highlighted. |
| R5 | Quick access, smart highlighting, grouping. |
| R6 | No stale state (filter, highlight, cards). |
| R7 | Smooth on the iPhone 15 Pro Max. |

## 2. What is wrong today

Checked on the current code. "Reproduced" means driven in headless Chrome; "read" means found by reading the code.

| # | Problem | Cause | How found |
|---|---|---|---|
| 1 | **Stale "În lucru" cards.** Tap the orange segment, switch Zi → Săptămână → Zi (or go to the next day and back): the cards are still only "În lucru". On the next day they vanish, on return they come back filtered. | The stage filter has no lifetime rules: it survives every navigation. Its only indicator is in the status line, which now sits *below* the cards. | Reproduced |
| 2 | The highlight after "Arată în calendar" is lost as soon as the pointer leaves the card. On touch it never clears. | One variable is used for both "hovered" and "selected". | Read |
| 3 | Hovering most cards lights nothing on the calendar. | The cards list only the cars that are *not* on the visible calendar (`jobsWithoutBooking`), so the two halves never overlap. | Reproduced |
| 4 | A car's old bookings light up as if they were this job. | The link is by car (`vehicleId`), not by visit. | Read |
| 5 | "Arată în calendar" swaps the whole day, forces Zi, and uses the browser's default scroll. | The day is a page (`key={date}` remounts it); there is nothing to scroll through. | Read |
| 6 | The cars disappear when another day is shown. | They are only computed when today is in view. | Reproduced |
| 7 | The carousel arrows can be wrong after a filter. | Their enabled state is measured only on scroll, not when the list changes. | Read |

## 3. Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [‹]  marți, 13 oct · azi  [›]   11 programări · 13 în service   [Azi]  [Zi | Săptămână]  Calendar → │  header
├─────────────────────────────────────────────────────────────────────────┤
│ DEJA ÎN SERVICE · 13   [Doar: În lucru ✕]                         ‹ ›   │
│ ● Deviz 2 [card][card]  ● Aprobat 2 [card][card]  ● În lucru 4 [card]…  │  cars, grouped by stage
├─────────────────────────────────────────────────────────────────────────┤
│ ▨▨▨▨████████████████   ○ Programat 4  ● Deviz 2  ● Aprobat 2  ● În lucru 4 … │  status line = filter
├─────────────────────────────────────────────────────────────────────────┤
│    │ lun 12        ┊ mar 13 · azi          ┊ mie 14         ┊ joi 15    │
│ AP │      ▭▭▭      ┊  ▭▭▭▭  ┃      ▭▭▭     ┊    ▭▭          ┊           │  one continuous strip of days
│ MI │   ▭▭          ┊        ┃  ▭▭▭▭        ┊        ▭▭▭     ┊  ▭▭       │  ┃ = now
├─────────────────────────────────────────────────────────────────────────┤
│ Dacia Logan · azi 13:30 · Programat        [Primire] [Deschide] [✕]     │  selected visit (only when one is selected)
└─────────────────────────────────────────────────────────────────────────┘
```

The order (header, cars, status line, timeline) is the one the owner asked for on 13 Oct.

## 4. Decisions

**D1. One continuous strip of days.** Days sit side by side, each one from opening to closing hour. Zi and Săptămână are two widths of the same strip, not two components. Why: R1 needs something to scroll through, and one strip removes the remount in problem 5.

**D2. What scrolls what.**

| Input | Result |
|---|---|
| Trackpad sideways, Shift + wheel, swipe sideways | Days (native scrolling, with momentum) |
| Mouse wheel up/down with the pointer on the timeline grid | Days. Wheel down = later |
| Mouse wheel anywhere else (header, cars, the rest of the page) | The page, as always |
| Swipe up/down on a phone | The page. See Q4 for why |
| ‹ › | Glide one day (Zi) or one week (Săptămână) |
| ← → · Shift ← → · T | One day · one week · now |

Two guards so the page never gets trapped (the timeline is the first thing on the page): the timeline takes the wheel only on its grid, and it never takes over a page scroll that is already moving (it waits for 150 ms of wheel silence).

**D3. The date lives between the arrows.** `[‹] marți, 13 oct · azi [›]`, fixed width so the arrows never move. Zi shows the day under the reading point (30 % from the grid's left edge); Săptămână shows the first and last fully visible day (`13 – 18 oct`). It updates while scrolling. The label is a button: it opens the native date picker to jump to any day. "Azi" appears only when now is out of view.

**D4. Cars in service = every open job, always shown.** It is the shop right now, so it does not depend on the day in view (problems 3 and 6). Cards are grouped by stage in the same order as the status line, each group with a small label that stays in view while its cards scroll. Each card says where it is on the calendar: `azi 10:00`, `14 oct 09:30`, or `fără programare · primit 12 oct`.

**D5. The link is the visit.** A card and a block are the same thing when the booking is the one the job was checked in from (`order.appointmentId` / `appointment.workOrderId`). Other bookings of the same car get a lighter mark, so they are visible but not confused with this job (problem 4).

**D6. Hovered and selected are different states.**

| State | Set by | Cleared by |
|---|---|---|
| Hovered | Mouse over, or keyboard focus on, a card or a block. Never by touch | Pointer leaves, scrolling starts, the list changes |
| Selected | "Arată în calendar"; tapping a block's card link | Esc, ✕, selecting another, the visit is deleted or cancelled. Not by scrolling |

Selecting a block scrolls its card into view in the carousel; hovering never moves anything.

**D7. The filter has a lifetime and is impossible to miss.** Tapping a colour keeps one stage on both the cards and the timeline. A chip `Doar: În lucru ✕` shows next to the cards' title *and* in the status line. It is cleared by: a second tap, ✕, Esc, switching Zi / Săptămână, "Azi", and by "Arată în calendar" when it would hide the target. It stays while scrolling, because browsing one stage across days is the point of it (problem 1).

**D8. The status line counts what the section shows.** Every car in service plus the bookings on the days in view, each visit once. The date label follows the scroll live; the counts update when scrolling stops, so the bar does not flicker.

**D9. "Arată în calendar" is one motion.** See §6.

**D10. Edited in place at the Zi zoom** (it was read-only until phase 8). See §12.

**D11. No dimming.** Highlighting adds a ring; nothing else fades (owner, 13 Oct).

## 5. Behaviour

### Highlighting

| Signal | Looks like | When |
|---|---|---|
| Now | Brand line and dot; the elapsed part of today lightly shaded | Today is in view |
| Today | Filled day chip, faint brand tint on its column | Always |
| Closed day | Muted; a 48 px column when nothing is booked | Per shop hours |
| Hovered visit | 2 px brand ring on its block and its card | D6 |
| Selected visit | The same ring, kept; the block pulses once on arrival | D6 |
| Same car, another visit | 1 px brand outline | While a visit is hovered or selected |
| Late arrival | Amber clock and "întârzie 25 min" on the block and on nothing else (the car has no card yet) | Programat, start passed by more than 15 min, today |
| What the clock says | One line, the same on a car's card and on its booking: "în 45 min", "de 2 h în service", "gata de 2 zile" (§12) | Every visit except delivered and no-show |
| Where a booking would begin | A line with the time, on the quarter of an hour under the mouse | Mouse over free time, Zi |

### Quick access

| To… | Do this |
|---|---|
| Go to now | "Azi", or T |
| Go to any date | Click the date between the arrows |
| Find a car's booking | The calendar button on its card |
| Find a booking's car | Click its block: the card scrolls into view and is ringed |
| Check a car in | Select today's booking, then "Primire" in the selected-visit line |
| Open the job or the booking | Tap the card or the block |
| Book at a time | Tap free time on a mechanic's row |
| Book an interval | Press on free time and drag (touch: press and hold first) |
| Move a booking, or change how long it is | Drag it by its body, or by either edge (touch: press and hold first) |
| See one stage | Tap a colour |
| Clear | Esc: first the selection, then the filter |

## 6. "Arată în calendar"

1. Find the target: this job's booking, else the car's booking nearest to today (`appointmentForJob`, already tested).
2. If the filter would hide it, clear the filter. Keep the current zoom.
3. If the timeline is partly off screen (phone), bring it into view at the same time.
4. Travel. Up to 3 screens away: one eased glide, 350 to 650 ms depending on distance. Farther: jump to one screen before the target, then glide the last screen, so it always arrives from the right direction and never runs through weeks of days.
5. Arrive: the block is centred, pulses once, stays ringed; its card is ringed too; keyboard focus moves to the block; a screen reader hears the day, time and car.
6. Any wheel, touch, click or key during the glide stops it where it is.
7. With reduced motion: jump, ring, no pulse.

The glide is our own animation of the scroll position (not the browser's `behavior: "smooth"`), because duration and easing must be the same in Safari and Chrome. Scroll snapping is switched off while it runs.

## 7. How it is built

```
store: appointments, workOrders, staff, …
  └─ selectVisits (memoised on the collections)      visits · byDay · byId · inService
view state (one reducer in DashboardCalendar)        zoom · filter · selected · following
scroll position                                      refs only, never React state
derived from scroll (changes a few times a second)   days to render · label
hover                                                tiny external store (useSyncExternalStore)
```

Rules that keep it from going stale (R6):

- Nothing is stored that can be derived. The filter and the selection are checked against the visits on every render; a selected visit that no longer exists becomes "none".
- Every list is keyed by visit id.
- A new day with the app left open: if the user has not scrolled away, re-anchor on now; clear filter and selection.
- The carousel arrows are measured on list change and resize too.

Files: `timeline-geometry.js` (pure: day offsets, day at a scroll position, position of an instant), `timeline.jsx` (scroller, virtualisation, wheel, glide), `timeline-day.jsx` (one day at either zoom), `cars-strip.jsx`, `stage-line.jsx`, `focus-store.js`, `dashboard-calendar.jsx` (state and composition). `visit-timeline.jsx` is removed at the end. Business rules (visits index, late arrival, waiting for pickup) go in `src/domain/visit.js` with tests.

### Geometry

- Days from today − 180 to today + 365. Past the ends scrolling stops and a chip links to Programări.
- A day's width: Zi = the wider of the grid and 72 px per hour, 96 px per hour on a phone (a day fills the grid on desktop, scrolls inside the day on a phone); Săptămână = the wider of 8.5 rem and one sixth of the grid.
- A closed day with nothing booked is 48 px. Positions come from one precomputed list of offsets, so "which day is at this scroll position" is a lookup.
- The same hours for every day: shop hours, widened once to cover bookings outside them, capped at 06:00 to 22:00.
- Row heights never change while scrolling: every mechanic's row is one lane (58 px; 76 px for a while in phase 8, 52 px before). Two overlapping bookings share the lane at half height, one line each; a third and beyond become "+N", which opens Programări.
- On resize, rotation or a zoom change, the instant under the reading point stays under it.

## 8. Performance

| Budget | How |
|---|---|
| No React update per scroll frame | Scroll position in a ref; one passive listener, one `requestAnimationFrame`; state changes only when the rendered days or the label change |
| At most 4 days in the DOM in Zi, about 12 columns in Săptămână | Only days in view plus one on each side (three in Săptămână) are rendered |
| A hover re-renders 2 to 4 items, not the section | Hover lives in an external store; each card and block subscribes to "is it me?" |
| Data work once per change, not per scroll | `selectVisits` memoised on the collections; a day's list is a map lookup |
| No layout work in the glide | Target computed before the first frame; the loop only writes `scrollLeft` |
| The minute tick repaints the days in view, once a minute | Since phase 8 every booking says what the clock says about it, so every rendered day (four at most in Zi) reads the clock |
| No layout animation | Rings and the pulse use box-shadow, opacity and transform only |

Checked with a frame recording on the iPhone during a swipe and a glide (the method in the simulator memory note), not by eye.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Nothing booked today | Opens in Săptămână with today at the left (existing rule). Otherwise Zi, at now |
| Nothing booked on the days in view | The timeline stays and still scrolls; a chip at the edge: "Următoarea: joi, 15 oct →" |
| Booking outside shop hours | Covered by the widened hours; beyond 06:00 to 22:00 it is clipped with a mark |
| Booking that runs past closing | Clipped at the day's end with a continuation mark |
| Unassigned or inactive mechanic | A "Nealocat" row, present whenever any such booking exists in the range, so rows never appear mid-scroll |
| No mechanics, or one | A single row without the label column |
| More than 8 mechanics | The card grows; the timeline never scrolls vertically inside itself (the wheel is taken by days) |
| Car with several bookings | The button goes to this job's own booking; the car's other bookings get the lighter ring |
| Car with no booking | A pin on the timeline at the time it was received; the card says "primit ieri 10:30" and its button travels to the pin |
| Target deleted or cancelled mid-travel | Travel ends, selection cleared |
| A booking saved in a sheet while scrolled away | Position kept; the block appears in place |
| Shop hours changed in Setări | Geometry rebuilt; the same day stays in view |
| Filter active, a stage's count drops to 0 | The chip stays (with 0) until cleared; the timeline says "nimic în etapa aceasta" inline |
| Hovered card removed by a filter | Hover cleared on list change (no leave event fires for a removed element) |
| Touch | No hover; the calendar button is always visible on cards; a tap on a block opens it |
| Keyboard | Tab reaches blocks in time order; focus scrolls a block into view and counts as hover |
| Reduced motion | No glide, no pulse |
| A page scroll already moving when the pointer reaches the grid | The page keeps scrolling (D2) |
| Dark and light theme | Tones and tokens only, as today |

## 10. Build order

Each phase ends with `npm test && npm run lint && npm run build`, the browser checks, and `npm run ios:device`.

| Phase | What ships | Done when |
|---|---|---|
| 0 🟢 | On the current code: filter lifetime and chip next to the cards (D7), hovered vs selected (D6), carousel arrows. The headless-Chrome checks move into the repo as `npm run ui:check` | The scripted "filter → Săptămână → Zi" run shows every card |
| 1 🟢 | Data only: `selectVisits`, link by visit, late-arrival and waiting-pickup rules, with tests | Tests pass; no UI change |
| 2 🟢 | Continuous timeline in Zi: geometry with tests, virtualised days, live date between the arrows, "Azi", gliding ‹ ›, wheel, trackpad, swipe, keyboard, now line | Scripted wheel and scroll runs pass; frame recording on the iPhone is smooth |
| 3 🟢 | Săptămână as the second zoom; zoom keeps the day in view; the opening rule | Switching zoom never changes the day under the reading point |
| 4 🟢 | Cars in service: all cars, grouped, calendar anchor on each card, two-way link, selected-visit line with actions, the glide and pulse (§6) | Scripted "card → booking" runs for near, far, filtered and deleted targets |
| 5 🟢 | Status line counts cars plus days in view and settles after scrolling (built with phase 2) | Counts match the cards and blocks on screen in every scripted state |
| 6 🟢 | Late and waiting-pickup marks; pins for walk-in cars (Q3) | Each has a domain test and a screenshot check |
| 7 🟢 | Old paged components removed; `DESIGN-SYSTEM.md` and `PLAN.md` updated to 🟢; full pass on the iPhone | Nothing in this file is still 🟡 |
| 8 🟢 | §12: bigger bookings with the card's wording, the clock's line on both, the line where a booking would begin, drawing, moving and stretching bookings | Scripted drags with a mouse and with a finger; a swipe still scrolls |

Built differently from the plan, and why:

- **Rows are one lane, not one or two.** With two full lanes every double-booked mechanic's row was twice as tall on every day; sharing the lane at half height keeps the timeline compact and its height fixed.
- **Every car in service is already always shown** (the first half of D4, planned for phase 4). Otherwise the cards would appear and disappear as the day in view changed, and the timeline would jump up and down while scrolling sideways.
- **No scroll snapping.** It fights the wheel and the glide; ‹ › and the keys land exactly on a day's start instead.
- **A mouse-wheel notch moves a quarter of a day, eased**; a trackpad follows the fingers one to one.
- **Săptămână shows the days in view, not Monday to Sunday.** It is the same strip zoomed out, so the date between the arrows is the first and last whole day in view ("13 – 18 oct. 2026") and ‹ › move seven days.
- **Zooming in picks the useful day.** Today, when today is among the days shown; otherwise the first of them; a day's header zooms in on that day. Zooming out puts the day in view at the left edge. The timeline is remounted for a zoom change (no animation between zooms).
- **The selected visit's line is docked under the timeline**, not under the header, so selecting never moves the cards or the timeline.
- **Opening a booking also selects it** (ring on the booking and its car's card, card scrolled into view, no pulse). Only "Arată în calendar" pulses, because only it travels.
- **Hover is plain React state**, not an external store: with 13 cards and about 20 bookings in view the re-render is not measurable, and the React Compiler keeps the days memoised.
- **A walk-in's pin replaces "another booking of the same car".** A car that came without a booking is drawn as a pin (a pill with a car) at the time it was received, on its mechanic's row; its card says "primit ieri 10:30" and its calendar button travels to that pin. So every card has the button, and the selected visit can be a walk-in (its line then offers only the job).
- **Late is said in three places**: on the booking ("întârzie 45 min", a clock only when the booking shares its lane), in the header summary ("3 mașini întârzie") and in the selected visit's line. A finished car's card says "gata de 2 zile".
- **Measured in WebKit, not on the physical phone.** In the iOS 27 simulator (iPhone 18 Pro Max, the app's own web view) a 6-screen scroll in 2.4 s holds 16.7 ms per frame (p95 17 ms, worst 31 ms) forwards, back and again; the very first scroll after a fresh install had one 379 ms frame, once. Headless Chrome gives the same 16.7 ms. A recording on the phone itself has not been made.
- **Two things only WebKit on a phone showed, both fixed**: after "Arată în calendar" the selected item could sit behind the tab bar (the timeline now has scroll margins for the fixed bars and for the selected visit's line), and the focus moved to the booking counted as a hover (it is now moved quietly, `focusQuietly`).

Risks to watch: re-rendering days during iOS momentum scrolling (kept safe by fixed row heights and one spare day on each side); scroll snapping fighting the glide (snap off while gliding); the wheel guard feeling wrong in practice (Q1).

## 11. Questions for the owner

All four were answered "as recommended" on 13 Oct 2026.

| # | Question | Decided |
|---|---|---|
| Q1 | Mouse wheel up/down on the timeline scrolls days whenever the pointer is on the grid, or only after clicking into it? | Whenever the pointer is on the grid, with the two guards in D2 |
| Q2 | Is problem 1 in §2 the "stale În lucru cards" bug you meant, and are the clearing rules in D7 right? | Yes; clear on Zi / Săptămână switch, "Azi", Esc, second tap; keep while scrolling |
| Q3 | Should a car that came without a booking get a pin on the timeline at its check-in time, so every car has a place on it? | Yes, in phase 6 |
| Q4 | On the phone, swipe up/down over the timeline keeps scrolling the page (days move with sideways swipes). OK? | Yes. The timeline fills most of the first screen, so taking vertical swipes would trap the page |

## 12. Phase 8: one wording, bigger bookings, editing in place

Asked for by the owner on 13 Oct 2026, after phases 0 to 7: a stronger visual tie between a car's card and its booking, bigger bookings with more descriptive titles, the time until or since on both, and a timeline that can be worked on directly (draw a booking, change its interval).

### The tie between a card and its booking

A card and a booking are recognised as the same thing when they say the same things. Both now show, in the same words and the same order:

| Line | Card | Booking (Zi) | Where it comes from |
|---|---|---|---|
| Who | Make logo, **make and model**, then plate and job number | Make logo, **make and model** | `visitText` |
| What for | The booking's title, else the complaint, else the job's first operations | The same, then the customer | `visitSubject` (domain) |
| The clock | "de 2 h în service", "gata de 2 zile" | The same, then the interval | `visitTiming` (domain), `timingText` |
| Where on the calendar | "azi 14:00–16:00", or "primit ieri 10:30" | Its place | |

What the clock says, by state:

| State | Says | Marked |
|---|---|---|
| Booked, still to come | "în 45 min", "în 3 h", "mâine", "în 3 zile" | |
| Booked, the customer called to say they come later (docs/VISIT-FLOW.md §6.1) | "vine la 10:30"; late only after that time | |
| Booked, expected now (inside the 15 min grace) | "acum" | |
| Booked for earlier today, not here | "întârzie 25 min" | Amber, clock |
| Booked for an earlier day, never arrived | "nu a sosit" | Amber, clock |
| In the shop, not finished | "abia primită", "de 2 h în service", "de 3 zile în service" (from when the job was opened) | |
| Finished | "gata acum", "gata de 3 h", "gata de 2 zile" (from when it became ready) | Heavier, clock, from one day up |
| Delivered, no-show | Nothing | |

The lit state is the same on both too: a 2 px brand ring and a brand shadow. Still no dimming (D11).

Sizes: a mechanic's row is 58 px (a booking 50 px, two lines: make and model, and what the clock says, or the time; it does not grow on hover, the rest is on its car's card and in its sheet); an hour is at least 96 px on a phone, so a quarter of an hour is 24 px under the finger. On desktop a day still fills the grid. A chip in Săptămână is two lines (44 px) at every width.

### Editing in place (Zi only)

| Do this | With a mouse | With a finger |
|---|---|---|
| See where a booking would begin | Point at free time: a line and the time, on the quarter of an hour | (press and hold shows it) |
| Book from a time, for the usual length | Click | Tap |
| Book an interval | Press and drag, either way; release | Press and hold, then drag |
| Move a booking (time, mechanic, day) | Drag it by its body | Press and hold its middle, then drag |
| Change when it starts or ends | Drag its left or right edge (a grip shows on hover) | Press and hold within 22 px of a side, then drag |
| Give up | Esc, or drop it where it was | Drop it where it was |

Rules:

- Everything lands on a quarter of an hour, inside the shown hours; a booking is never shorter than a quarter of an hour. A drawn or stretched booking stays on its day and its mechanic; a moved one follows the pointer, and waits on the last open day while over a closed one.
- While drawing, the line that was under the mouse stays as the booking's beginning; a dashed slot grows from it and a bubble above says "08:45–10:15 · 1 h 30 min". The form then opens with that start, length and mechanic. A drawn length is kept when operations are picked in the form (their hours would otherwise replace it).
- A mouse drag starts after 4 px, so a click still opens a booking or books from free time. A finger must hold still for 380 ms first (the same as in Programări, with the same haptics); moving sooner is a scroll, so swiping through days is unchanged.
- Only bookings that are `scheduled`, `confirmed` or `arrived` can be dragged (`canReschedule`). Delivered, no-show and walk-in pins stay put.
- A drop saves through `useReschedule` (shared with Programări): the optional confirmation from the calendar's settings, a toast that says where the booking went ("Mutată", "Interval nou"), warns about an overlap and offers "Anulează". The booking is left selected.
- Dragging near a side of the grid scrolls it (up to 14 px a frame, only in the direction the pointer is heading). For a drawn or stretched booking it stops at the ends of its day.
- The preview is drawn by the timeline, over the days, and the pointer is captured by the scroller: it survives the days that are rendered and removed under it. The day a drag began on stays rendered until the drag ends, because a finger's moves are delivered to the element it first touched.
- Săptămână has no hours, so nothing is dragged there.
- Dragging is a shortcut, not the only way: the booking's form changes the same things and is reachable by keyboard.

Maths (`timeline-drag.js`, unit-tested): `startAt`, `drawSpan`, `stretchSpan`, `shiftSpan`, `edgeSpeed`. Pointer handling: `timeline.jsx`.

Not done, on purpose: no drag in Săptămână; no "over the planned time" mark for a job that runs past its booking (a car that waits for parts for days would always carry it).

## 13. On the new home page (17 Oct 2026)

Azi became the Cloudflare-style home ([`HOME-PAGE.md`](HOME-PAGE.md)). For this calendar it means: the cars in service are drawn by the shared cards form (`CardSection` in `components/ds/card-section.jsx`, the same as De confirmat and Facturi), on the page rather than inside the calendar's card, with the status line under them; the timeline keeps its own card right below. Everything in this document still holds: the link between a card and its booking, the filter, hover and selection, editing in place. A finished car's card also tells its customer on WhatsApp (Anunță).

