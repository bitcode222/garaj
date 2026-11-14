# The timeframe ruler on Azi: plan

**Status: requested and approved to build in one go by the owner (2 Nov 2026); 🟢 built the same day** (§9). Replaces the "Perioada" toggle (Azi · 7 zile · 30 de zile) under the quick-create
buttons.

---

## 1. What it must do

| # | Requirement (owner, 2 Nov 2026, with a picture of a ruler: short ticks, a taller one every few) |
|---|---|
| R1 | The timeframe selector looks like a ruler. |
| R2 | Its ends are the start and end dates, and they follow the ruler as it is dragged. |
| R3 | Dragging the ruler moves the timeframe through dates. |
| R4 | Handles on the left and right change its length, in days. |
| R5 | Each day's space carries coloured bullets for what is in it: a booking, a job started, and the like. |
| R6 | Something with a deadline (a job to finish, an invoice to be paid) gets the same colour as its kind, with an exclamation mark. |
| R7 | Edge cases thought through, and how it all fits together. |

---

## 2. The model: a tape of days, the ruler is the selected stretch

The control is a strip of days the width of the search bar. The **selected stretch is the ruler**:
a bordered band whose ticks are days and whose two ends are labelled with the start and the end date.
Outside it, the days carry on, faint, so there is always somewhere to drag to.

```
     joi, 30 oct.                          7 zile                          miercuri, 5 nov.
 ┊ ┊ ┊ ┃┃╷  ╷  ╷  ╷  ╷  ╷  ┃  ╷  ╷  ╷  ╷  ╷  ╷  ╷  ╷  ╷  ┃  ╷  ╷  ╷  ╷  ╷  ┃┃ ┊ ┊ ┊
       ┃┃ •     ●     •!    │    ●!    •     ●     ●  ●    │      •          ┃┃
       ◀▶       31    1  nov.        Azi       3       4          5        ◀▶
  ● Programare  ● Deviz  ● Lucrare  ● Factură   (!) termen         1 zi · 7 zile · 30 de zile   ↺ Azi
```

- **Ticks** (R1): one per day boundary; taller on Mondays (the start of a week), tallest on the 1st
  of a month, with the month's name. That is the picture's rhythm (short, short, … tall).
- **Zoom follows the length**: at rest the ruler takes about half the width, from the left, the days to
  come running on faintly to its right (owner, 2 Nov 2026: "smaller, aligned left"); a day is between
  14 and 48 px wide. So 1 day is a short wide ruler, 60 days a long fine one.
- **Today**: its space is tinted in the brand colour, with "Azi" under it.
- **Closed days** (Setări → program): their spaces are faintly greyed.
- Everything is drawn from two numbers, the first day at the left edge and a day's width, so moving,
  resizing and zooming are the same thing to the code, and can glide.

---

## 3. Moving and resizing (R2, R3, R4)

| Input | What it does |
|---|---|
| Drag the ruler (mouse, finger, pen) | The days slide under it 1:1; the end labels change as days pass. On release it settles on whole days; a flick carries on a little (momentum). |
| Drag a handle | That end follows the pointer, a day at a time; the other end stays. Held at the strip's edge, it keeps adding days and zooms out to fit. The ends never cross: at least 1 day. |
| Release after a resize | The ruler glides back to half the width, from the left (zoom to fit). |
| Tap a day | The ruler glides to centre on it, same length. |
| Trackpad swipe sideways | Moves it, settles on whole days when the swipe stops. |
| Trackpad pinch (⌃ wheel) | Shorter or longer, around its middle. |
| Mouse wheel up/down | Scrolls the page: the ruler never traps the page's scroll. |
| Keys on the ruler | ← → a day · Shift ← → its own length · + / − a day longer or shorter · Home or T: today. On a handle: ← → move that end. |
| 1 zi · 7 zile · 30 de zile | The quick lengths, around the current middle. |
| ↺ Azi | Back to the default: centred on today (shown when it has moved). |

**The end labels move live; the sections update when the ruler settles** (release, end of a flick,
150 ms after a key, wheel or pinch). Recomputing four sections on every frame of a drag would stutter
on a phone, and cards changing under the finger are noise.

---

## 4. The bullets (R5, R6)

One bullet per kind present in a day (not one per record: a busy day stays readable); the day's
tooltip and the slider's text give the counts ("Luni, 2 nov.: 3 programări, 1 lucrare de terminat").
Fixed order, top to bottom; one colour per kind, the kinds' colours everywhere (docs/RECORD-COLORS.md, 2 Nov 2026):

| Kind | On the day | Colour | With "!" (a deadline) on the day |
|---|---|---|---|
| Programare | a booking (cancelled ones aside) | teal (was blue) | |
| Deviz | an estimate (Deviz, Aprobat) created | purple | its booking ends and it is still not approved or started |
| Lucrare | a job (În lucru … Predat) created | orange | its booking ends and it is still not finished (not Gata / Predat) |
| Factură | an invoice not collected yet created | blue (was green) | it falls due and is still not paid |

Only the deadlines the data has: a job's is the end of its booking (a walk-in has none); an invoice's
is its due date. A deadline bullet is larger, with a white "!", so it reads even on a thin day.

---

## 5. How it fits with the sections (R7)

**One rule: the sections show what falls in the ruler's dates**, so every bullet in the ruler is a
card below.

| Section | In the ruler's dates when |
|---|---|
| Programări | the booking's day is in them (the passed unrecorded ones form "Au trecut") |
| Devize | created in them, or their deadline is in them |
| Lucrări | created in them, or their deadline is in them |
| Facturi (not collected) | created in them (the owner's rule), or due in them |

- **Default**: 7 days centred on today (3 before, today, 3 after): the recent and the coming week.
- **Remembered**: the length, on the device; the position is not: the page opens on today.
- The words follow: "Nicio programare între 30 oct. și 5 nov.", "… pe 2 nov.", "… azi".

---

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Midnight passes with the page open | Not moved: it follows today. Moved by the user: it stays. |
| Daylight saving | Days are `"YYYY-MM-DD"` strings moved with `addDaysISO`, never milliseconds. |
| How far | Two years back, one year ahead of today; dragging past resists, then settles back inside. |
| Length | 1 to 60 days. |
| A sideways drag vs a page scroll on the phone | `touch-action: pan-y`: vertical swipes scroll the page; if the browser takes the gesture, the drag is cancelled and nothing changes. |
| A drag that ends on a day | Never also counts as a tap (4 px threshold). |
| The strip resizes (window, sidebar) | It re-fits; the dates stay. |
| Many records on a day | One bullet per kind; counts in the tooltip and the slider text. |
| A thin day (60 days on a phone) | Min 14 px a day: bullets are 6 px, deadline bullets 10 px with "!". Day numbers only on Mondays and the 1st when days are thin. |
| End labels that would collide (short ruler) | One centred label "30 oct. – 5 nov." (or the one date). |
| A filter on in a section | It stays when the dates change. |
| Reduced motion | No glide, no momentum: it jumps to the settled position. |
| Nothing in the dates | Each section's empty card names the dates, with its usual action. |

---

## 7. Accessibility and speed

- The ruler is a `role="slider"` with `aria-valuetext` ("30 oct. – 5 nov. 2026, 7 zile"), each handle
  a slider of its own ("Începutul perioadei: joi, 30 oct."), the keys of §3, a focus ring, 44 px
  handle targets on the phone. The legend and the quick lengths are ordinary buttons.
- Only the days in view are drawn (a few dozen nodes); a drag changes two numbers and re-renders one
  component, never the sections; the sections' selectors are memoised on the two dates.

---

## 8. Code

| Where | What |
|---|---|
| `src/domain/timeframe.js` | `windowAround(center, days)`, `SPAN` (1–60), `BOUNDS` (−730 … +365 days), `rangeOf`, clamping; tests |
| `src/domain/agenda.js` | `dayMarks` (the bullets), `jobDeadline`; `bookingsToConfirm`, `jobsToShow`, `invoicesToCollect` take `{ from, to }`; tests |
| `src/components/ds/day-ruler.jsx` | `DayRuler`: drawing, gestures, keys, glide |
| `src/features/dashboard/` | the page owns the dates (length remembered), the hero shows the ruler, the sections' words |

---

## 9. Build status

| Phase | What | Status |
|---|---|---|
| 1 | Domain and tests | 🟢 |
| 2 | `DayRuler` | 🟢 |
| 3 | Azi wired: the ruler replaces "Perioada"; sections by range; words | 🟢 |
| 4 | Checked in headless Chrome (drag, handles, edge hold, tap, keys, quick lengths, ↺ Azi, reload, finger drag, vertical swipe on the phone); DESIGN-SYSTEM | 🟢 (the iPhone itself: open) |

Built differently from the plan:

- **Bullets sit in fixed rows** (Programare at the bottom, then Deviz, Lucrare, Factură), the same height
  on every day, so a row reads across the days. A deadline takes its kind's place in the row (larger,
  with "!") instead of being stacked; the tooltip still counts both. Stacked bullets were cut off on a
  busy day.
- **Thin days** (a long ruler on a phone): deadline bullets keep 9 px so the "!" stays readable (wider
  than the day if need be); under the ruler only the 1st (its month) and the Mondays not right after it
  are labelled, and today is a brand dot, so no two labels collide.

---

## 10. Changes after the first build (owner, 2 Nov 2026)

These replace what §2–§4 say where they differ.

| Asked | Now |
|---|---|
| The whole timeline section aligned left | It is its own section under the hero, **"Interval"**, left-aligned like the sections below (no longer centred in the hero). |
| Fewer preview dates before and after | The strip is sized to the ruler plus **one faint day either side** (a day at most 48 px), left-aligned in the room it has; it opens to all the room only while a handle is dragged, so there is somewhere to drag it, and glides back when let go. |
| No buttons to choose the timeframe | 1 zi · 7 zile · 30 de zile are gone: the handles, the keys (↑ ↓ + −) and a trackpad pinch change the length. |
| The way back to today at the top right | **↺ Azi** at the section's top right, over the strip's right end; inactive while the ruler is on today. |
| A title | "Interval" (the section's title, in the sections' style). |
| No legend; a tooltip with the hovered day's details | The legend is gone. Hovering a day (mouse) lights it and shows its details under the ruler: the date, "azi" / "închis", and each kind present with its bullet and its count ("3 lucrări începute", "1 factură scadentă"); "Nimic în această zi." otherwise. On a touch screen a tap centres the ruler on the day and shows its details for 2.5 s. |
| More minimalist | The ruler is a thin faint outline (no fill, no shadow), the ticks faint, only the two dates over it ("30 oct." · "5 nov."; the length in the middle is gone), no tint for today or closed days (the brand "Azi" label and the tooltip say them), slim bar handles, smaller bullets in a 40 px ruler, a ghost ↺ Azi. |
| More like a ruler; the handles only left and right, nothing joining them top and bottom | No box: the ruler is its ticks, centred on one line: one per day (taller on Mondays, tallest on the 1st), with small ones between the days when they are wide enough (4 or 2 a day), like a ruler's millimetres; ticks and bullets outside the selection are faint. Each handle is a vertical bar with a grip, at its end of the selection, its grab area lying mostly outside the selection. |
| A click on a day makes it the timeframe, the handles either side of it, centred; a click on it again brings back what was before | A picked day keeps the zoom it was picked at (the strip does not shrink to it) and is centred in the strip; picking another day keeps the first "before", so one more click on the picked day restores it. Dragging or ← → move the picked day, still centred; a handle, ↑ ↓ or + − leave it. A picked day (and its undoing) is not remembered as the length. On a touch screen a tap near a handle is often handed to it by the browser (touch adjustment), so a finger's tap on a handle that does not move is a tap on the day under it; a handle's effects wait until it moves. |
| The bullets inside the ruler's brackets, the ticks between the days | Each divider marks a day's start (30 px, 36 on a Monday, 44 on the 1st), centred on the ruler's line; the gap between two dividers is the day, and its bullets sit in that gap on the line, one per kind present in the kinds' order, wrapping into a column when the day is thin. No small ticks inside a day. A deadline still takes its kind's place, larger with "!" (and may be wider than a thin day). |
| While a handle is dragged, at most four dates past it, not the whole row | This replaces "it opens to all the room while a handle is dragged". Holding the end handle widens the strip to the selection plus **four days past the handle**, and they follow it as it moves. Holding the start handle shows at most four days before it; the strip starts at the section's left edge, so fewer when there is no room for them. The strip is never wider than the room; held at its edge, the handle keeps adding days and zooms out as before. Let go, the strip glides back to its resting size. |

| Handles on the whole strip of dates too, to reveal more dates while the timeframe stays the same; the timeframe always in the centre of the dates shown | Two **outer handles**, quieter bars (thinner, fainter, a small grip) at the strip's two ends, change how many days show on **each side** of the selection (1 to 60, as many before it as after it), never the selection: it stays in the centre of the dates shown. The right one follows the pointer (two days of strip a step); held at the room's end it keeps revealing, the days getting thinner (a day at least 4 px). The strip's left end stays at the section's edge, so the left one is pulled past that edge and held; pushed in, either shows fewer. ← → on them: a day more or fewer each side. The days are cut at the strip's ends, the handles' room past them stays empty (no half day past the end, nothing to hover or pick there). The handles nearest the pointer win where grab areas overlap (thin days, a finger). Hidden while a selection handle is held. The amount is kept while the page is open (not remembered after a reload); moving, resizing and picking keep it. |

Found while fixing the handles (owner, 2 Nov 2026: "when I release the left handle the whole section is full width for a moment"): the
drag's own view kept the whole room's width (the edges for holding at the edge are measured on it), and the glide on release
started from it instead of from what was on screen: one frame at the new size, then the full row, then shrinking back. Now the
held view carries the width it is shown at, and a glide shows its first position at once (the render that hands over the new
dates came before the glide's first frame and flashed its end). Taking hold of a handle no longer widens the strip by 22 px either.

Found while checking it: the React Compiler memoises the ruler's handlers on the values they read; a
handler reading `view.dw` without checking for a view first made the compiler read it during the first
render (before the strip had measured itself) and crashed the page. Every handler now checks for the
view first.

---

## 11. Bars instead of bullets (owner, 6 Nov 2026) 🟢

Asked with a picture of a minimalist monochrome histogram (a dark strip of thin bars, the selected stretch white
and the rest grey, two thin lines at its ends, a floating pill over it with the dates, a count, zoom and ×):
"implement such a design to the timeline filter of the dashboard". It replaces the look of §4 and §10; the
gestures, keys, picking a day and the outer handles are unchanged.

| Before | Now |
|---|---|
| A divider at each day's start; coloured bullets in the gap, one per kind present, "!" for a deadline | **Thin bars** standing on one line, one per hour of the shop's day (Setări → program, 8–18 by default) as far as they fit at 4 px a bar; thinner days merge hours (at least one bar a day). A bar is as tall as what falls in that hour, on one scale for the whole tape (the tallest hour anywhere), so the bars do not change as it moves. An empty hour is a faint 2 px stub. Days are 2 px apart, bars 1 px |
| Kind colours on the tape | **Monochrome**: the selected days `foreground/80`, the others `/20`, the hovered day lit. The one colour left is a **3 px amber dot over a bar** where something falls due (a deadline, R6) |
| The two dates over the selection's ends | **The pill**, centred over the selection and following it live (kept inside the strip): the dates, how many records fall in them ("59 de evenimente": bookings, records created, deadlines: every bar), zoom in and out, and **×** |
| ↺ Azi at the section's top right | **×** in the pill, back to today; shown only once the ruler has been moved |
| No buttons to choose the length (§10) | **Zoom in / out** in the pill: 1 · 3 · 7 · 14 · 30 · 60 days, around the middle, remembered like any length; off at the ends |
| Handles: a bar with a grip in its middle | A thin line (1.5 px) rising 10 px over the bars; a small grip at its top on hover and on touch. The outer handles are fainter lines |
| Day numbers under the ruler | Only "Azi" (brand) and the month's name on the 1st: the dates are in the pill, a day's in its details |

When in the day a record falls (`dayTimes` in `src/domain/agenda.js`, the same records as `dayMarks`): a booking at its
start, a deviz, a job or an invoice at its creation, a job's deadline at its booking's end, an invoice's due date
(a date alone) at the end of the day. A record before opening counts in the first bar, after closing in the last.

## 12. Full width, lengths, dates to pick (owner, 6 Nov 2026) 🟢

Asked right after §11: "make the timeline full width; on the bottom right selectors for day, week and month; the start and
end date at the top of the time frame clickable, to select the time frame from them; remove the zoom in / out buttons".

| Before | Now |
|---|---|
| The strip sized to the selection plus one faint day either side (§10), widening while a handle is held | **Always the section's full width.** The selection stays in the centre; the days either side are as many as fill the room with days at most 48 px wide (more when the outer handles ask for more), so the strip never shrinks. Held handles no longer blank the days past four (that rule was for the narrow strip) |
| Zoom in / out in the pill | **Gone.** Under the strip, at its **bottom right**: `Segmented` **Zi · Săptămână · Lună**, 1, 7 or 30 days around the middle of the selection, remembered like any length; the one matching the length is selected, none when it is another (dragged to 9 days) |
| The pill's dates were text | **Each date is a button** (a faint dotted underline says so) that opens the device's own date picker (a calendar on a computer, the wheels on an iPhone; a hidden date field, `showPicker()`). The start: the end stays, or follows when the start passes it or the length would pass 60 days. The end: the same the other way; an end before the start makes that one day. A one-day timeframe has one date: picking it picks the day. The count and × stay |

## 13. Day cells with stacked records (owner, 6 Nov 2026) 🟢

Asked after §12: "I want those lines not to be events on the day but dividers between days, all the same size; where a
week ends and starts a bit taller, for a month even taller; and within each day cell the events stacked on top of each
other." It replaces the bars of §11 (and the per-hour times: the stacks need only each day's counts, `dayMarks`).

| Part | Look |
|---|---|
| Dividers | A line at each day's start, centred on it and standing on the line, **1 px wide for all**: **20 px** for a day, **24 px** where a week starts (Monday), **28 px** where a month starts (the 1st), each a little stronger (`foreground/28`, `/45`, `/60`; a bit darker with every border, owner 6 Nov 2026, from `/20`, `/35`, `/50`). Height tells them apart (owner, 7 Nov 2026: "make the dividers all same width and add more height between day divider, week divider and month divider"). Before: 1 px at 16, 26, 36 px; then 16, 20, 24 px; then 14, 16, 18 px; then thicker for a week and a month (1, 1.5, 2 px wide) at 20, 21, 22 px and 20, 20.5, 21 px ("not so far apart in tallness, a bit thicker", "less tallness", "taller, less difference", "I don't want the difference in height to be that big"). The gap between two dividers is the day's cell |
| Stacks | In the middle of each cell, half its width (3–18 px): **one block per record**, from the line up, a 1 px gap between two. A block is 3 px; when the busiest day of the whole tape would not fit the cell (48 px), every block is smaller, on one scale for the tape (1 px at least), so stacks compare across days and do not change as it moves |
| Colours | Monochrome: the selected days in the **primary** colour (owner, 7 Nov 2026: "the cells and dividers in view primary"; was `foreground/80`): their stacks `primary`, the dividers on their sides `primary/60`, `/80`, solid for a day, a week, a month; the others `foreground/25`, their dividers as above; the hovered day lit (and its cell faintly). **The deadlines sit on top of their day's stack in amber**, the one colour on the tape |
| Unchanged | Full width, the handles, the pill with its dates and count, Zi · Săptămână · Lună, the details on hover, every gesture and key |

## 14. No outer handles (owner, 7 Nov 2026) 🟢

"Remove the handles for the full view of the cells: as it is full width, no need for that." The two faint outer handles at the
strip's ends (§12: more or fewer days shown around the selection) are gone, and with them the 22 px gutters they sat in: the days
run to both edges of the strip. Around the selection there are as many days as fill the strip with days at most 48 px wide, one
faint day each side at least. A selection handle held at an edge still stops 22 px inside it while it grows.
