# Sidebar, Programări and the calendar: plan

**Status: plan approved by the owner on 18 Oct 2026, all seven questions answered as recommended (§11). All phases (0 to 7) are 🟢 built; §12 lists what came out differently and the measurements.** Still open: the owner's hands-on pass on the iPhone, and a frame-time pass in the iOS simulator (§12).

The owner asked for three things, with two references (Cloudflare's sidebar, Notion Calendar's week view):

1. A sidebar that looks like Cloudflare's.
2. **Programări** with two child pages: **Toate programările** (a table with everything needed: filters, search, quick stats on top) and **Calendar** (the full calendar).
3. The calendar remade in the manner of Notion Calendar, with **infinite scroll**: scrolling on the cells moves from one day, week or month to the next. Performant, and a pleasure to look at.

---

## 1. Requirements

| # | Requirement |
|---|---|
| R1 | Sidebar in Cloudflare's manner: the shop at the top, a quick search, roomy items with quiet icons, a neutral pill for the open page, items with children that expand under a guide line, plain group titles, a collapse button at the bottom. |
| R2 | Programări has two children, Calendar and Toate programările, in the sidebar and as a switch at the top of both pages (phones have no sidebar). |
| R3 | Toate programările: every booking in one table; search, filters (status, period, mechanic), sorting, quick stats, one-tap actions, deep links from elsewhere. |
| R4 | Calendar in Notion Calendar's manner: a big month title, a left panel (mini month, filters), a header with the view, Azi and ‹ ›, day headers with today as a pill, a now line with its time in the gutter. |
| R5 | Infinite scroll: Zi and Săptămână scroll sideways through days without end (and up and down through the hours); Lună scrolls up and down through weeks without end. A gesture over the cells is enough; ‹ › and the keyboard do the same in steps. |
| R6 | Everything the calendar does today stays: click to book, drag to book an interval, move and stretch bookings (mouse and press and hold), across days, with undo; colour by status, mechanic or operation; filters. |
| R7 | 60 fps while scrolling on the iPhone 15 Pro Max and on a desktop with years of bookings; nothing date-bound rendered at build time; skeletons with the final geometry. |

## 2. What exists today

Read in the code on 18 Oct 2026.

| Piece | Today |
|---|---|
| Sidebar (`components/shell/app-shell.jsx`, `nav.js`) | 240 px, shop name, "Caută… ⌘K", a full-width **Nou**, groups split by dividers, blue pill for the open page, purple count pills; children only for Setări (shown while its page is open); demo chip, design link and theme at the bottom. A 64 px rail between `md` and `lg`; a tab bar on phones. |
| Calendar (`features/calendar/calendar-page.jsx`) | One page at `/calendar/`: views Agendă, Zi, Săptămână, Lună, An; ‹ › move one unit at a time (a new page each time, nothing scrolls between days); filters for mechanic and status; colour and style settings; Zi with several mechanics shows a column per mechanic. |
| Time grid (`time-grid.jsx`) | Hours as a CSS background, click to create, mouse drag to move, bottom edge to resize, press and hold on touch, auto-scroll near the top or bottom. Only open hours are drawn. |
| Infinite days (`features/dashboard/timeline*.js`) | The home page's timeline already scrolls through ±months of days sideways: days virtualised, the scroll position in refs, closed empty days slim, glides, a drag that travels across days. Its geometry and drag maths are pure and tested; this plan reuses them. |
| Toate programările | Does not exist; the closest is the Agendă view (a list of the month, grouped). |

## 3. Layout

### Sidebar (desktop, `lg` and up)

```
┌────────────────────────────┐
│ [logo] Garaj Auto Pro   ⌃⌄ │  ← the shop menu (Setări service, Date demo, Temă, Design)
├────────────────────────────┤
│ ┌───────────────────┐ ┌──┐ │
│ │ 🔍 Căutare rapidă ⌘K│ │ + │ │  ← search · Nou (brand)
│ └───────────────────┘ └──┘ │
│ ▣ Azi                      │  ← neutral pill when open
│ ⟲ Recente               ⌄  │
│ │  Dacia Logan             │
│ │  Mașină                  │
│ │  Lucrarea #1857          │
│ │  Lucrare · Dacia Logan   │
│ 📅 Programări            ⌄  │
│ │  Calendar                │
│ │  Toate programările   15 │  ← count: to confirm
│ 🔧 Lucrări              13  │
│ 🧾 Facturi                  │
│                            │
│ Relații                    │  ← plain group title, no divider
│ 👥 Clienți                  │
│ 🚗 Mașini                   │
│ 🔔 De contactat         35  │
│                            │
│ Administrare               │
│ 📦 Catalog                  │
│ 📊 Rapoarte                 │
│ ⚙ Setări                 ›  │
├────────────────────────────┤
│ [⊟]                    ☾   │  ← collapse to the rail · theme
└────────────────────────────┘
```

### Toate programările

```
Programări                                       [Calendar | Toate]   [+ Programare nouă]
┌ Azi ─────────┐ ┌ De confirmat ┐ ┌ Neprezentări ┐ ┌ Încărcare săpt. ┐
│ 11 · următ. 13:30│ │ 15 în 7 zile │ │ 4% în 30 zile│ │ 62% · 74 h din 120│
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘
[🔍 Client, mașină, telefon, #nr, operație…] [Viitoare ▾] [Toți mecanicii ▾] [Sortare ▾]
(Toate 182) (De confirmat 15) (Confirmate 10) (Sosite 7) (Finalizate 120) (Neprezentate 6) (Anulate 24)

AZI · sâmbătă, 18 octombrie · 4 programări · 6 h                                     ← sticky
 #143  13:30–15:30  în 2 h   [logo] Dacia Spring  B 264 EAL   Ioana Vasile  Revizie…  AP  ⬚ Programat ▾  [Confirmă]
 #87   16:30–17:30  în 5 h   [logo] Audi A4       IF 74 ZXX   Farmacia…     Diagnoză  CS  ◉ Confirmat ▾  Lucrarea —
MÂINE · duminică, 19 octombrie · închis · 1 programare
 …
```

### Calendar (Săptămână)

```
┌ left panel (260 px) ──┐┌──────────────────────────────────────────────────────────────────┐
│ ⊟                🔍 + ││ Octombrie 2026                      [Săptămână ▾] [Azi] ‹ ›  ⊞      │
│        ⌃ ⌄            ││ EEST │ Lun 19   Mar 20   Mie 21   Joi 22   Vin 23   Sâm 24   D   │ ← sticky; today a pill
│ L  M  M  J  V  S  D   ││      │ ▂▂▂▂▂    ▂▂▂      ▂▂▂▂▂▂   …   (load bar per day)        │
│ 28 29 30  1  2  3  4  ││ În   │ ▬▬▬ Dacia Logan · Așteaptă piese ▬▬▬▬▬▬▬▬▬               │ ← cars in service (Q4)
│  5  6  7  8  9 10 11  ││ serv.│      ▬▬ Opel Astra ▬▬                                     │
│ 12 13 14 15 16 17 18  ││──────┼────────────────────────────────────────────────────────────│
│ ▓19 20 21 22 23 24 25▓││ 08:00│ ┌──────┐                                                  │
│ 26 27 28 29 30 31  1  ││ 09:00│ │Dacia │      ┌────┐                                      │
│                       ││[11:20]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ (now: bold on today)    │
│ Mecanici              ││ 12:00│                                                           │
│ ☑ ● Andrei Popescu    ││  …   │            ← scroll sideways: days without end →          │
│ ☑ ● Mihai Ionescu     ││      │            ↑↓ scroll: the hours                           │
│ Stări                 ││      │                                                           │
│ ☑ ⬚ Programat         ││      │                                                           │
│ ☐ ○ Anulat            ││      │                                                           │
└───────────────────────┘└──────────────────────────────────────────────────────────────────┘
```

## 4. Decisions: sidebar

**D1. Cloudflare's look, Garaj's content.** 256 px wide, a surface a shade off the page, a hairline border. The top row is the shop (logo, name, ⌃⌄) and opens the shop menu: Setări service, Date demo (while in demo), Temă, Design system. Under it, a 40 px **quick search** ("Căutare rapidă…", ⌘K) with a square brand **+** beside it (the old "Nou", same menu). Items are 40 px, 14 px text, 18 px icons in the muted colour, the open page a **neutral pill** (no more blue), counts as quiet pills. Group titles are plain muted text with space above, no dividers.

**D2. Items with children expand under a guide line.** A chevron on the right (› closed, ⌄ open); the children sit under a 1 px vertical line aligned with the icons. **Programări**: Calendar, Toate programările (with the count of bookings to confirm). **Setări**: its sections, as today. A parent opens when its page is open and can be toggled by its chevron; what is open is remembered on the device. Pressing the parent itself opens its first child (Q6).

**D3. Recente** (Q5), as Cloudflare's: a collapsible group with the last five records opened (car, customer, job, invoice, booking), two lines each: the record and its kind ("Lucrarea #1857" over "Lucrare · Dacia Logan"). Kept on the device only, never synced; a deleted record drops out; opening one goes where the record opens anyway (sheet or page).

**D4. Collapse to the rail** (Q7). The button at the bottom left folds the sidebar into the 64 px rail (as between `md` and `lg`) and back; remembered on the device. The rail gets the same quiet look; its items show their name as a tooltip.

**D5. Phones and tablets.** The tab bar stays (Azi · Programări · Lucrări · Facturi · Mai mult). Programări opens the last of its two pages used on the device; both pages carry a **Calendar · Toate** switch at the top (also on desktop, so the two are one tap apart everywhere). Mai mult lists Recente too.

## 5. Decisions: Toate programările

**D6. Route and links.** `/appointments/` (Toate programările) next to `/calendar/` (Calendar). Filters live in the address (`?status=to-confirm&range=next7&staff=…&q=…`), so other screens deep-link: the home page's "De confirmat ›" opens the list on "De confirmat · următoarele 7 zile"; a customer's or car's "Programări" opens it searched.

**D7. Quick stats** (four, the `Stat` cards): **Azi** (count, the next one at 13:30), **De confirmat** (next 7 days), **Neprezentări** (no-shows out of decided bookings, last 30 days), **Încărcare săptămâna aceasta** (booked hours out of the mechanics' open hours, %). Each one is also a filter: pressing it applies it.

**D8. The table.** Rows grouped by day under sticky day headers ("Azi · sâmbătă, 18 octombrie · 4 programări · 6 h", "închis" on a closed day). Columns from `lg`: **#** · **Când** (interval, and what the clock says: "în 2 h", "întârzie 25 min", "acum 3 zile") · **Mașină** (logo, make and model, plate) · **Client** (name, phone) · **Operații** · **Mecanic** · **Stare** (the `StatusMenu` badge: tap to move it on) · **Lucrare** (#1857 when it became one). From `md` to `lg` the operations and phone fold under the car. On a phone each row is two lines, with swipe actions (Sună · WhatsApp to the left, Confirmă to the right). A row opens the booking's sheet.

**D9. Search, filters, sort.** Search over number, customer, phone, plate (with or without spaces), make and model, operations and notes (`fold`, diacritics ignored). Status chips with counts: Toate · De confirmat · Confirmate · Sosite · Finalizate · Neprezentate · Anulate. Period: Viitoare (default) · Azi · Următoarele 7 zile · Luna aceasta · Trecute · Toate · Interval (two dates). Mechanic. Sort: by time (default; upcoming soonest first, past latest first), by creation, by customer. "Trecute" shows past bookings latest first. Clearing: one "Șterge filtrele" when anything is set.

**D10. One-tap actions** where one tap is enough, each with undo in its toast (as on Azi): **Confirmă** on a booking to confirm, **A sosit** (opens check-in) and **Neprezentat** on one whose time passed. Everything else is in the booking's sheet.

## 6. Decisions: the calendar

**D11. Views: Zi, Săptămână, Lună** (Q1). Agendă is replaced by Toate programările (a better list); An by the mini month and Lună's endless scroll. The view is a dropdown like Notion's ("Săptămână ▾"), with keys **D**, **W**, **M**; **T** goes to today; **←** **→** step; ⌘K searches.

**D12. Infinite scroll, one gesture.**
- **Zi and Săptămână** are one strip of days, side by side, in one scroller that scrolls both ways: sideways through days, up and down through hours. A trackpad swipe, a finger, Shift + wheel or a horizontal wheel move days; the wheel alone moves hours (as in Notion). When a sideways gesture ends, the strip settles on the nearest day's edge (CSS `scroll-snap-type: x proximity`), so the view never rests half a day across. Săptămână fits 7 days in the width (3 on a phone, still scrolling day by day); Zi fits one day, split into a column per mechanic when no mechanic is filtered.
- **Lună** is one column of weeks, without end, scrolled up and down; it settles on a week's edge. The month mostly in view is the title; the days of the other months are dimmed; the first of each month is written "1 nov.".
- **‹ ›** step a day in Zi, a week in Săptămână, a month in Lună, with our own glide (as on Azi); quick presses add up. A far jump (the mini month, a deep link) lands near the target and glides only the last screen.

**D13. "Without end", built.** A window of days (±18 months around an anchor) is laid out; only the days in view, plus one screen on each side, are in the page. Nearing either end of the window, it is moved around the day in view and the scroll position corrected in the same frame, invisibly (the home timeline's anchor technique). So there is no end in either direction, the page never holds more than about 25 day columns (or 12 week rows), and the widths stay far below what browsers can scroll.

**D14. The grid.** Full 24 hours (Q3), the shop's open hours on the plain surface, the rest shaded; it opens scrolled to now (today) or to the opening hour. 64 px an hour on desktop, 72 px on a phone; hour lines are a CSS background, not elements. Day headers stick to the top ("Lun 19", today's number in a brand pill, "închis" on a closed day, a thin bar of the day's booked load); the hours stick to the left, with the time zone in the corner ("EEST"). **Now**: a brand line, bold across today and faint across the other days, with its time in a brand pill in the gutter ("11:20"), as Notion. A closed day with nothing booked is a slim 48 px marker, as on Azi (Q2).

**D15. Cars in service** (Q4), the row under the day headers (Notion's all-day row): every open job as a bar from the day it was received to today (or to the day it was delivered), in its stage's tone, labelled with the car and the stage ("Dacia Logan · Așteaptă piese"). It shows what the bookings alone do not: the cars that stay for days. A bar opens its job. At most three rows; more is "+N".

**D16. Bookings on the grid.** The language of Azi: tinted by the chosen colour (status, mechanic or operation), an unconfirmed one **outlined** whatever the colour (it still needs a call), past ones quieter, a no-show struck through, cancelled ones hidden by default. A block says the time, make and model, the customer, then the plate, as space allows (container queries). Two or more at once share the width (Zi: split; Săptămână: cascaded). An overlap on the same mechanic or bay gets the yellow mark. No hover card (as on Azi); the full text is in the block's label and tooltip.

**D17. Editing in place**, as on Azi's timeline, turned upright: pointing at free time shows a line with the time a booking would begin; a click books from there; a press dragged downwards draws the interval and opens the form; a booking is moved by its body (to another time, day or mechanic) and stretched by its top or bottom edge; dragging near the edges scrolls the grid, sideways without end. Mouse: after 4 px. Touch: after a press and hold of 380 ms (haptic); a swipe still scrolls. Esc gives a drag up. Every drop saves through `useReschedule` (the confirmation setting, the toast with "Anulează").

**D18. The left panel** (Notion's), 260 px, hidden with ⊟ (remembered). **Mini month** with ⌃ ⌄ (and the wheel over it), the visible days as a band (a week's row in Săptămână), today in a brand pill, a dot under days with bookings (darker with more); a click glides the calendar there. **Mecanici**: a checkbox and colour per mechanic, as Notion's calendars ("Nealocat" too). **Stări**: a checkbox per status (Anulat off by default). On a phone the panel is a sheet opened from the title ("Octombrie 2026 ▾"), which also holds the mini month.

**D19. Continuity with Azi.** The home timeline's "Calendar →" opens the calendar on the same day and zoom (`/calendar/?day=2026-10-18&view=day`); "Arată în calendar" on a booking's sheet does the same, with the booking selected.

**D20. Eye candy, kept quiet.** Hairline grid, a big title that changes with a short cross-fade as the month changes under the scroll, the brand used only for today, now and the selection, soft fades at the strip's edges, a lift and shadow on the selected booking, a time bubble over a drag, the closed days hatched, glides with the house easing; all motion off under `prefers-reduced-motion`. Both themes.

## 7. Rules (pure, tested)

| Module | What |
|---|---|
| `src/domain/appointment-list.js` (new) | `PERIODS` and `periodRange(period, today)`; `appointmentFilter({ status, period, staff, query })` (statuses grouped as the chips are; "De confirmat" means scheduled and ahead); `appointmentHay(appointment, lookups)` for search; `sortAppointments(list, sort, now)`; `groupByDay(list)`; `appointmentStats(appointments, { today, now, staff, hours })` for D7 (the load counts each mechanic's open hours on open days) |
| `src/features/calendar/calendar-geometry.js` (new) | The window and its re-anchoring (D13), day offsets with slim days (reusing `buildTimeline`), week rows for Lună, `snapIndex`, `stepIndex` per view, `scrollToShow`, `minuteAt(y)` / `yOf(minute)`, the in-service bars' spans; unit-tested like `timeline-geometry.js` |
| `features/dashboard/timeline-drag.js` | Reused as it is (`startAt`, `drawSpan`, `shiftSpan`, `stretchSpan`, `edgeSpeed`); moved to `features/calendar/` if both use it |
| `src/lib/recents.js` (new) | The Recente list: `remember(kind, id)`, `useRecents()`; localStorage, try/catch, five items, deleted ones filtered out at read |

## 8. Performance

| Target | How |
|---|---|
| 60 fps scrolling (iPhone 15 Pro Max, desktop) | The scroll position never becomes React state: one read per frame, state changes only when the set of rendered days changes. Days and week rows are memoised components; a day's layout (lanes) is computed once per list of its bookings (`WeakMap`). |
| Few elements | Only the days in view ± one screen (≈ 25 columns at most) or 12 week rows; hour lines and shading are backgrounds; the now line is one element on top, updated once a minute without re-rendering any day. |
| Years of data | Bookings are indexed by day once per change (`selectAppointmentsByDay`, already there); filters are applied per rendered day, not to the whole collection. The list page filters with a deferred query and pages its rows (`useProgressive`). |
| Smooth gestures | Native scrolling (no JS scroll emulation); `scroll-snap` for settling; our glide only for ‹ ›, Azi and jumps; drags read rects once per gesture; edge scrolling on `requestAnimationFrame`. |
| Measured, not hoped | A stress seed (20 000 bookings over 4 years) in the checks; frame times measured in Chrome and the iOS simulator (WebKit) while swiping days, scrolling Lună and dragging across days; the numbers go in this document. |

## 9. Edge cases

| Case | What happens |
|---|---|
| Store not ready / date unknown at build | Skeletons with the final geometry (sidebar, header, panel, grid); nothing date-bound is rendered before the store and the clock |
| A booking past midnight | Drawn to the end of its first day; its block says it goes on ("→ 02:00") |
| Daylight saving (25 Oct 2026, 29 Mar 2027) | Hours are drawn by the local clock: the day still has 24 rows; a booking across 03:00 on those nights is drawn by its local times (the shop is closed then; noted, not designed for) |
| Many bookings at once | Zi: split columns; Săptămână: cascaded, then "+N" opening Zi; Lună: up to 3 chips then "+N" opening Zi |
| A mechanic made inactive, or deleted | Their bookings still show, in "Nealocat" (Zi) or uncoloured; the filter lists them as "Inactiv" while they have bookings in view |
| Filters hide everything in view | The grid stays (free time can still be booked) and says so in one line, with "Arată tot" |
| The booking being dragged is changed or deleted elsewhere | The drop is ignored; a toast says why (as on Azi) |
| Dragging across days, far | Edge scrolling moves days without end; the day the drag began on stays rendered until the drop (a finger's moves go to what it first touched) |
| Re-anchoring during a glide or a drag | Postponed until the motion ends, so nothing jumps under the pointer |
| A deep link to a far date or a bad `?day=` | Far: the window is built around it; bad: today, without an error |
| Very narrow phone (≤ 360 px) | Săptămână shows 2 days; the gutter narrows to "11" without ":00" |
| Keyboard and screen readers | The grid is a group with a name ("Calendar, săptămâna 19–25 octombrie"); bookings are buttons in time order with their full text; ← → move days; Enter opens; Esc clears the selection |
| Two tabs open | Both follow the store (as everywhere); a drag in one is saved once |
| Reduced motion | No glides or cross-fades; jumps are instant |
| Printing | The calendar hides the panel and prints the days in view (best effort, not designed) |

## 10. Build order

| Phase | What | Done when |
|---|---|---|
| 0 | This plan + design-system rows (🟡) | The owner approves |
| 1 | Sidebar (D1–D5): the shop menu, search + +, expanding children, Recente, collapse, the rail's new look, the Calendar · Toate switch | ui:check: children open and close, Recente remembers, collapse persists |
| 2 | Toate programările (D6–D10): `appointment-list.js` + tests, the page, deep links from Azi | ui:check: search, chips, period, stats as filters, Confirmă + undo, a deep link |
| 3 | `calendar-geometry.js` + tests (D12, D13) | Unit tests for the window, re-anchoring, snapping and steps |
| 4 | The calendar's frame (D11, D18, D19): header, view dropdown and keys, left panel with mini month and filters, skeleton | The mini month and the header follow the scroll |
| 5 | Zi and Săptămână (D12–D17): the endless strip, sticky headers and gutter, now line, slim days, in-service row, bookings, editing in place | ui:check: swipe days, snap, re-anchor invisibly, drag across days with undo |
| 6 | Lună (D12): endless weeks, chips, "+N", month boundaries, a day opens Zi | ui:check: scroll months, title follows, "+N" opens the day |
| 7 | Performance pass (§8, stress seed, Chrome + iOS simulator), accessibility, docs 🟢, `npm run ios:device` | Frame times recorded here; all checks green |

## 11. Questions for the owner

| # | Question | Recommended | Why |
|---|---|---|---|
| Q1 | Views | **Zi, Săptămână, Lună; Agendă and An go** | Toate programările is a better Agendă; the mini month and Lună's endless scroll cover An. Fewer views, each one good |
| Q2 | Closed days in Zi and Săptămână | **A slim marker when nothing is booked, as on Azi** | A shop closed on Sundays would otherwise give a seventh of the width to an empty day. A closed day with a booking is drawn in full, shaded |
| Q3 | Hours | **All 24, the open hours plain and the rest shaded, opening at now or at the opening hour** | Scrolling feels endless both ways, as in Notion; bookings outside hours are never cut off. The alternative is only the open hours (shorter, but a late booking stretches the grid) |
| Q4 | A "Mașini în service" row under the day headers (jobs as bars across the days the car stays) | **Yes** | It is what a shop's calendar lacks: cars waiting for parts for days are invisible among bookings. Notion's all-day row, put to work |
| Q5 | "Recente" in the sidebar, as Cloudflare's | **Yes, five records, kept on the device** | The cars and customers being worked on today are one tap away. Nothing leaves the device |
| Q6 | Pressing "Programări" in the sidebar | **Opens it and goes to Calendar** (Toate programările is one tap under it) | The calendar is where the day is planned; the list is for finding and following up |
| Q7 | Collapsible sidebar on desktop | **Yes, to the rail, remembered** | The calendar and the list get 190 px more when wanted |

## 12. Built (18 Oct 2026)

| Piece | Where |
|---|---|
| Sidebar | `components/shell/app-shell.jsx` (shop menu, search + +, groups that open, Recente, fold into the rail), `nav.js` (Programări's children), `recents.jsx` + `lib/recents.js`, the no-flash script in `app/layout.jsx` and its rule in `globals.css` |
| Toate programările | `app/appointments/page.jsx`, `features/appointments/appointments-page.jsx`, `programari-switch.jsx`; rules in `domain/appointment-list.js` (tests in `appointment-list.test.js`) |
| Calendar | `features/calendar/calendar-page.jsx` (frame, keys, address), `calendar-panel.jsx` (mini month, filters), `day-strip.jsx` (Zi, Săptămână), `month-strip.jsx` (Lună), `calendar-geometry.js` (window, re-anchoring, steps, weeks, cars in service; tests in `calendar-geometry.test.js`). The old `time-grid.jsx`, `views.jsx` and `appointment-card.jsx` are gone |
| Checks | `npm run ui:check`, "Sidebar, Toate programările, Calendar": the sidebar's children and count, Recente, folding kept after a reload, the list's chip from the address with Confirmă + undo and search, the endless strip (the window moves, the day stays), › and Azi, drawing a booking, moving one to the next day with undo, D/W/M and Lună, a mechanic unticked; on a phone, three days under the title and the panel as a sheet |

Measured in headless Chrome on the owner's Mac, with 20 000 extra bookings over four years: the calendar is ready in about 0.4 s; scrolling Săptămână sideways, its hours, and Lună's weeks all hold 60 frames a second (half the frames at 16,7 ms or faster, 95 % at 16,8 ms or faster, the slowest 17 ms, none over 32 ms); the page never holds more than 24 day columns (84 cells in Lună). Not measured yet: WebKit in the iOS simulator.

Built differently from the plan, or found on the way:

- **"De confirmat" in the list is Azi's rule** and carries its own window (the next seven days and the ones that passed unanswered), so the chip, the sidebar's count and Azi's section are always the same number; the period picker is off while it is chosen and says why.
- **A delivered job that stayed one day gets no bar** in the cars-in-service row: its booking says it already. Only stays of several days and cars still in the shop are drawn, so the row stays readable. A bar's label sticks to the left edge, so a stay that began weeks ago still says what it is.
- **The load bar** under a day's name shows on open days only (a closed day with bookings has no capacity to fill).
- **Snapping is switched off** while our own glides, a drag's edge scrolling and the window's move run, and back on after, so they are never pulled to a day's edge mid-way.
- **On a phone** the title has its own row (it opens the panel as a sheet, with the mini month and the filters); the Calendar · Toate switch shows its icons only.
- **Fixed on the way**: the list's first build crashed on "what the clock says" for bookings without their day; the checks now run on the latest Tuesday at 11:20 whatever the real day is (the demo shop is built around today, and a Sunday had no booking still to come); the narrow header of a closed day printed a date format the formatter does not know.

## 13. Asked for after the build (18 Oct 2026)

**A direction button** (the ⇄ / ⇅ button in the calendar's header, and "Derulare prin zile și luni" in the panel; kept on the device, since it follows the mouse or trackpad in hand). It turns the layout, so a finger, a trackpad and a mouse wheel all follow it natively:

| | ⇄ Stânga–dreapta (default) | ⇅ Sus–jos |
|---|---|---|
| Zi, Săptămână | `DayStrip`: days side by side, hours down | `DayRows` (`day-rows.jsx`): days one under the other without end, the hours across (the open hours fill the width, the closed ones a sideways scroll away); Zi has a band per mechanic; bookings are drawn, moved and stretched along their row |
| Lună | `MonthPages` (`month-pages.jsx`): months side by side, one per screen, settling on a month; the wheel turned up or down moves a month | `MonthStrip`: endless weeks downward |

Both new strips use the same window and re-anchoring as the others (`monthWindow` added to `calendar-geometry.js`). The row of cars in service is drawn in ⇄ only (the panel says so). Zooming from Săptămână to Zi now lands on today when today is in view.

**The calendar opens with the sidebar folded.** It keeps its own choice (`garaj.sidebar.calendar`): unfolded there, it stays unfolded on the calendar; every other page keeps the shared one. Applied before the first paint on a load (the layout's script) and on every navigation.

Checks added: the sidebar's own choice on the calendar; the direction button (days downward without end, the choice kept after a reload, Lună as weeks downward and as months side by side); a booking drawn along a row.

**Notion's week and day, and no column per mechanic** (asked with two Notion Calendar screenshots):

- The panel runs the full height; the top bar holds only the controls, and the big month title sits on its own line under it, over the grid.
- A day's header is one line ("Lun 19"), centred; today's number is a brand pill. The gutter's corner holds **+** (a new booking) and the time zone. The cars in service sit in Notion's "All-day" row, labelled "În service". The grid is hairline hours (48 px an hour on a desktop, 64 px on a phone); the load bar and the shading of closed hours are gone (a closed day is still faintly hatched).
- **Mechanics are a badge, not a column.** Every view has one column (or row) per day; each booking carries its mechanic's avatar (in Lună's chips too). A drag changes a booking's time and day; its mechanic is changed in its form. With one mechanic ticked in the panel, a new booking goes to that mechanic.
- The mini month's arrows are named "Minicalendar: luna anterioară / următoare", so they are not mistaken for the calendar's own.

**Săptămână as Notion's week** (the day view kept as it is):

- **A week starts with today**: opening Săptămână and Azi put today at the left edge, ‹ › move seven days from the day at the left. The strip still scrolls without end and settles on a day's edge; there is no jump back to a Monday.
- **Seven equal columns**: Săptămână never narrows a day; only Zi still steps over a closed day with nothing booked (as a slim marker).
- **The "În service" row is one thin lane** (Notion's all-day row), with "+N" for the cars that do not fit; its label in the gutter opens it to all lanes and back (kept on the device).

**Zi: three days, fewer as more mechanics share a day; mechanic lanes back** (with the avatar kept on every booking):

- Zi shows the middle day whole and a share of the day before and after it: all of each (three days) with up to two mechanics shown, then 70 %, 40 % and 10 % with three, four and five, and the middle day alone from six on (`sideShare` in `calendar-geometry.js`). It counts the mechanics ticked in the panel (and "Nealocat" when a booking has nobody), so unticking some shows more days.
- The day in view is the middle one: Zi centres it when it opens and on Azi and ‹ ›, and settles on a day's middle when a swipe ends. Săptămână keeps its seven days from the left.
- Each day in Zi has a column per mechanic again (⇄, their names under the day's name) or a band per mechanic (⇅); a booking dropped in another mechanic's lane changes its mechanic. The avatar stays on every booking, in every view.
- A day only partly in view keeps its name at the visible edge of its column.
- **In ⇅, a booking in Zi fills its mechanic's band** (it was a 60 px bar). The bands' names moved out of the bands into the label column, beside each band (the day's name at the top), so nothing is covered; a tall booking reads from the top and shows its plate. Săptămână in ⇅ keeps its slimmer bars.
- **Each mechanic's lane is in their colour** (the avatar's tone, softly over the whole lane, stronger by their name), in ⇄ and ⇅. **Their name opens their card** (`mechanic-card.jsx`; resting on it with a mouse, a tap on a phone): their bookings that day, the time booked and its share of the open hours, the week's bookings, their open jobs (each opens its job) and a link to their bookings in Toate programările. The numbers come from `mechanicSummary` in `domain/appointment-list.js` (tested).

**Days told apart at a glance, and free scrolling:**

- **A strong divider between days** (2 px), unbroken from the day's name through the "În service" row to the bottom of the grid (between day rows in ⇅); a mechanic's lane inside a day keeps its light dashed line, so a day reads as one block.
- **A bracket under each day's name**, as wide as the day (brand for today): the mechanics' columns under it belong to it.
- **In Zi, the day in the middle is at full strength and its neighbours fade** (to 45 %), following the scroll; a drag brings every day back, so a booking can be dropped on a neighbour. Săptămână shades every other day faintly instead.
- **No snapping**: Zi, Săptămână and Lună's weeks stop wherever a swipe or the wheel leaves them (this replaces "settles on a day's edge" in D12). Our own glides (‹ ›, Azi, a picked day) still land a day exactly; Lună's month pages (⇄) still settle on a month, since they are pages.
- **The mechanic's card opens almost at once** (60 ms of rest on the name, 150 ms before it closes). **Each day's date sits at the left of its mechanics' lanes** in Zi's names row ("Lun 19", brand for today), kept in sight while the day is only partly in view.
- **Under the big title, what is in view and how many bookings it has**, as shown (the filters apply), following the scroll: Zi "Azi, 19 octombrie · 11 programări" (the day in the middle), Săptămână "19–25 octombrie · 30 de programări", Lună "în octombrie · 92 de programări".
- **In ⇅ Zi, the day's date has its own column** at the left of the mechanics' coloured cells, as tall as the day and centred in it; the coloured cells hold only the names (the label column is 140 px, 104 px on a phone). **"+N" in the cars-in-service row** sits in a strip under the lane, so it never covers a car's name on a narrow day.

**Each day's count under its name:**

- **Under each day's name, how many bookings it has**, as shown (the filters apply): "3 programări" where it fits, "3 prog." or "3" where it does not; 0 is faint. In ⇄ it is the header's second line (the header grows from 40 to 54 px); in ⇅ it sits under the date, in the date column beside the mechanics' bands or under the name in Săptămână. A closed day shows it only when it has bookings. The day's button says it too ("luni, 19 octombrie, 3 programări").

**What each card is, at a glance:**

- **Top-left, a mark** (`bookingMark` in `src/domain/visit.js`, names and icons in `BOOKING_MARK`): 📅 still a booking (Programat, Confirmat, and also Neprezentat or Anulat), 🔧 a job (the car was checked in and its lucrare is open: Deviz, Aprobat, În lucru, Așteaptă piese), ✓ finished (the lucrare is Gata or Predat, or the booking is Finalizat). The card's label and tooltip name it too.
- **Bottom-left, the mechanic's avatar** (it was top-left in ⇅ and top-right in ⇄): its own row when the card is tall enough, at the start of the bottom line when it is not, and at the end of a one-line card or a Lună chip.

**A booking's details on hover:**

- **With a mouse, resting on a card (about 0.1 s) opens its details** beside it (right, else left; under or over a card too wide for either): what it is and its state (📅 Programare · Confirmat, 🔧 Lucrare · În lucru, ✓ Finalizată · Gata), its number, the car with its logo and plate, the day, the hours and how long; then, as a list, Client (and phone), Mecanic (or Nealocat), Elevator, Servicii, Lucrare (number and value), Problemă, Motiv (for a cancelled or missed one), only the lines that have something; the notes; and what to watch: late, the arrival the customer announced, an overlap, the customer's note.
- **Moving to the next card shows its details at once**; moving away, pressing (a click or a drag), scrolling or Esc hides them. They only inform: a click still opens the booking, and a phone (no hover) keeps the tap. One card for the whole calendar (`BookingPeek`, found through `data-appt`), so the grid carries nothing extra; it replaces the browser's own tooltip on the cards.
- **The start line over free time glides** to the next slot (0.2 s, eased) instead of jumping, on the calendar (⇄ and ⇅) and on Azi's timeline; with reduced motion it jumps as before.

**Warnings with their fixes, and a job's card opens the job** (the full plan: [`WARNINGS.md`](WARNINGS.md)):

- Each card shows its most urgent warning as an outline and a sign at the end of its top line; the hover card and the sheet say exactly what (with whom, since when, why) and offer the fix as a button, with undo.
- **A card that is a lucrare (🔧, or ✓ with its job) opens the job's sheet**, not the booking's: once the car is in, the job is what is worked on. A booking still to come (📅) opens the booking's sheet, as before.

**A floating mini month, the settings folded under the header, a search after the title (2026-10-19):**

- **The side panel is gone.** The **mini month floats** over the grid (desktop): moved by its top bar, resized by its bottom-right corner (248–560 px), closed by ✕ and brought back by the calendar icon at the end of the controls. It keeps to the bottom-right by default, is remembered where it was left (`garaj.calendar.mini`), and always stays inside the calendar's area (a narrower window, or the sidebar opening, moves it in). Its days grow with it.
- **The settings** (Mecanici, Stări, Afișare: direction, colour by, cars in service, confirm on move) are a **collapsible under the header**, opened by **Setări** next to the search (remembered; a badge counts the filters that hide something, Anulat hidden being the default). On a phone (and a narrow tablet) the mini month and the settings stay in the sheet opened from the title.
- **The sidebar** is no longer folded by the calendar: one choice for every page, open by default (the calendar's own `garaj.sidebar.calendar` is gone).

**The search** (bookings and jobs only), on the title's line (under it on a phone); `/` puts the cursor in it:

- **What it finds**: the car (make, model, plate, VIN), the customer (name, phone), what it is for (title, operations, services, the job's complaint), the mechanic, the booking's number and its job's (#128, #1873). Case, diacritics and spacing do not matter ("ionut" finds "Ionuț", "b123abc" finds "B 123 ABC", "0722123456" finds "0722 123 456"); every word must be found, in any order; it starts at two letters or digits. The rule: `src/domain/booking-search.js` (tested).
- **What the calendar does** as the query settles (150 ms after the last key; a spinner meanwhile): **the bookings not found fade** (so do the cars in service not found), the **days say "2 din 5"** (found of those shown; "—" for none), the line under the title says "5 din 30 găsite", and the **mini month rings the days with a match**. When nothing found is in view, the calendar **glides to the nearest** (the next one to come, else the last one past) and puts it in focus.
- **The list** under the field: what is still to come first (soonest first), then what has passed (latest first), then the jobs nobody booked ("lucrări fără programare"); the counts are split ("24 programări · 135 lucrări fără programare"). ↑ ↓ choose, Enter goes there, Esc closes the list (a second Esc empties the search). **‹ n / N ›** (and Enter / Shift+Enter once the list is closed) walk through what was found in time order, bringing each into view, at its hour.
- **Edge cases**: a booking found but hidden by the filters still counts ("1 ascuns de filtre · Arată" shows everything again) and opens in its sheet from the list; a job nobody booked opens its sheet; a booking far away (outside the strip's window) is reached as any day is (the window moves there); switching the view keeps the search; an empty field brings the calendar back at once.
- **Performance**: the text each record is found by is built once per change of the data (not per key), as is the job behind each booking; a query is a few `includes` per record (20 000 bookings in a few milliseconds), and the cards learn the result through one set in their lookups, so only the cards on screen re-render.

