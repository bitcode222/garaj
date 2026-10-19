# Azi, the home page: plan (Cloudflare-style home)

**Status: plan approved by the owner on 17 Oct 2026, all five questions answered as recommended (§9). All phases (0 to 7) are 🟢 built; §10 lists what came out differently.** Still open: the owner's hands-on pass on the iPhone, and the Cloudflare look for the sidebar and top bar (Q5, a later pass).

The owner showed the Cloudflare dashboard's home ("What's on the agenda?", one big search, then sections, then an analytics grid) and asked for the same kind of page, with every section after the search in the form of the "Deja în service" strip (a title column, cards grouped under small labels, a coloured line with a legend under them). The order is fixed by the owner:

1. Search
2. Cars already in the shop
3. Bookings that need confirming
4. Invoices
5. Analytics

---

## 1. What it must do

| # | Requirement |
|---|---|
| R1 | A calm, airy page in the Cloudflare manner: a centred question as the title, one big search under it, sections stacked under that, an analytics grid last. |
| R2 | Every section after the search has **the cards form**: a title column (name · count, ‹ › from `md` up), a carousel of cards grouped under small labels, and a line with a legend under it. |
| R3 | Sections: **Deja în service** (as today), **De confirmat** (bookings not confirmed yet), **Facturi** (what is not collected yet), **Analiză** (charts). |
| R4 | Each card can be acted on where it stands when one tap is enough (confirm a booking, tell a customer the car is ready, remind a customer of an overdue invoice); everything else opens the record's sheet. |
| R5 | Nothing is lost: what the old blocks did is somewhere (§6). |
| R6 | Phone first (430 px), the same rules as everywhere: 44 px targets, nothing only on hover, skeletons with the final geometry. |

## 2. The page, top to bottom

```
            ( Bună ziua · sâmbătă, 17 octombrie · deschis 08:00–18:00 )      ← pill
                         Ce e pe agendă azi?                                  ← h1, centred
   ┌──────────────────────────────────────────────────────────────┐
   │ 🔍  Caută o mașină, un client, o factură…              ⌘  K │      ← 56 px, halo border
   └──────────────────────────────────────────────────────────────┘
                 [+ Programare]  [Primire mașină]  [Factură]                  ← chips

   DEJA ÎN SERVICE · 13   ● Deviz 2  [card][card]  ● Aprobat 2  [card][card] …
   ‹ ›                    ▨▨▨▨▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (stages, a filter)
                          ○ Programat 2 ● Deviz 2 ● Aprobat 2 …

   [ the timeline, if it stays: Q1 ]

   DE CONFIRMAT · 6       ● Au trecut 1 [card]  ● Azi 2 [card][card]  ● Mâine 3 …
   ‹ ›                    ┄┄┄┄┄┄▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (next 7 days, progress)
                          ○ De confirmat 6  ● Confirmate 9  ● Sosite 2

   FACTURI · 7            ● Restante 2 [card][card]  ● Parțial 1 [card]  ● Emise 2 …  ● Ciorne 2 …
   12.480 lei             ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  (amounts, a filter)
   ‹ ›                    ● Restante 3.400 lei  ● Parțial 900 lei  ● Emise 6.100 lei  ○ Ciorne 2.080 lei

   Analiză                                         [📅 Ultimele 7 zile ▾]  Rapoarte ›
   ┌ Încasări ··· ──────────────┐ ┌ Mașini primite ··· ────────┐
   │ 18.420 lei  ↗ 12,4%        │ │ 23  ↘ 8,0%                 │
   │ [area chart, axis right]   │ │ [area chart, axis right]   │
   └────────────────────────────┘ └────────────────────────────┘
   ┌ Bon mediu ┐ ┌ Prezență ┐ ┌ Timp în service ┐ ┌ Ore facturate ┐
   │ 801 lei ↗ │ │ 92% ↘    │ │ 1,5 zile ↘      │ │ 64 h ↗        │
   │ [spark]   │ │ [spark]  │ │ [spark]         │ │ [Fără date]   │
   └───────────┘ └──────────┘ └─────────────────┘ └───────────────┘
```

Content is centred, at most 72 rem (1152 px) wide, like Cloudflare's. On a phone: the pill wraps, the title is 1.75 rem, a section's title column becomes one row (name · count; the arrows go, a finger swipes), analytics is one column for the two big cards and two columns for the small ones.

## 3. Decisions

**D1. The hero.** A pill with the day (greeting, date, open hours or "închis azi"); the title **"Ce e pe agendă azi?"**; the search; three chips under it for what is started most (Programare, Primire mașină, Factură). The old header buttons become these chips.

**D2. The search is the app's search.** The big field is the same search as ⌘K and the sidebar's "Caută…" (`command-menu.jsx`): same results, same "Creează" group. Pressing it, or typing while it is focused, opens the search with what was typed (Q4). On a phone the search opens as it does today. "/" also focuses it on a desktop.

**D3. The cards form is one component.** `InShopStrip` becomes a general `CardSection` (`src/components/ds/card-section.jsx`): `title`, `count`, `href` (the title links to the full page: Lucrări, Programări, Facturi), `groups` ([{ key, label, mark, items }]), `renderCard`, `line` ({ parts, legend, filters }), `empty` and `aside` (an extra line under the title, e.g. the invoices' total). One look, one behaviour: phones swipe (snap per card), ‹ › from `md` up, the group label stays in view while its cards scroll, cards 15 rem wide (72 vw on a phone).

**D4. The line under a section.** When its parts *are* the section's groups (stages, invoice states) a tap filters the cards and says so next to the title ("Doar: Restante ✕"), as the in-service line does today. When they are not (the bookings' progress line) it is only a picture and is not pressable. The rule is written once, in `CardSection`.

**D5. Every card has the same anatomy** as the in-service card (`VisitCard`): logo, title, a monospaced line (plate, number), what it is for, who and what the clock says, a hairline, then where and how much. A card is tinted by its group's tone, a booking still to confirm is outlined (the "Programat" look). Up to two corner buttons for the one-tap actions (R4); on a phone they are always visible.

**D6. De confirmat.** Bookings with status `scheduled` from now to 7 days on, plus the ones whose time passed with nothing recorded (Q3), grouped: **Au trecut** (amber, the "late" tone), **Azi**, **Mâine**, then a group per day. A card: car, plate, "Programare #128", what it is for, customer, "în 2 h" / "mâine 10:00", mechanic and interval. Corner: **Confirmă** (one tap, toast with "Anulează"; the domain's `setAppointmentStatus`), **Sună**. A past one has **A sosit** and **Neprezentat** instead. The line: the next 7 days' bookings by status (De confirmat outlined, Confirmate purple, Sosite orange, the status tones), legend "8 din 12 confirmate". More than 30: the last card is "+N în Programări".

**D7. Facturi.** Everything not collected: overdue, part-paid, issued and unpaid, drafts. Groups in that order (Restante, Parțial plătite, Emise, Ciorne), each with the `INVOICE_STATE` tone. A card: the job's car logo (a receipt icon without a car), customer, "FCT 0123 · B 123 ABC" (or "Ciornă · Lucrarea #1857"), what it is for (its first lines), "restantă de 12 zile" / "scadentă în 3 zile" / "ciornă de 2 zile", then "rest 1.200 lei" in bold and "din 1.600". Corner: **Memento** on WhatsApp for overdue and unpaid ones with a phone (the message carries the number, the rest and the due date). A tap opens the invoice sheet (issuing has its checklist there, collecting has its panel). The line is by amount (what is left to collect), and filters. The title column also says the total left to collect. Amounts come from the domain (`invoiceFlow`), never from the UI.

**D8. Deja în service** stays as it is, moved into `CardSection`. A finished car's corner also gets **Anunță** (WhatsApp "gata de ridicare", the old "Gata de predare" message), next to "Arată în calendar".

**D9. Analiză, the Cloudflare grid.** A title, a period button (**Ultimele 7 zile** by default · 30 de zile · 12 luni, remembered on the device) and "Rapoarte ›". Two large cards (area chart, four grid lines, axis on the right, as Cloudflare): **Încasări** (payments per day) and **Mașini primite** (jobs opened per day). Four small cards with a sparkline: **Bon mediu**, **Prezență la programări** (arrived out of due), **Timp în service** (median, opened to ready), **Ore facturate** (labour). Each: label, big number, change against the previous equal period (↗ / ↘ and %, green when it went the good way: for Timp în service down is good), "···" with **Tabel** (the numbers in place, the data-viz rule) and **Deschide în Rapoarte**. No data: a faint wave with a "Fără date" pill, never an empty box. Hover or focus on a chart shows the day and its value. Values are net of VAT where they are money, as in Rapoarte.

**D10. Old blocks** (§6). The four stats, "Gata de predare", "Încărcare azi", "De contactat" and "Stoc de completat" leave Azi; each one's job is listed in §6.

## 4. Domain (pure, tested)

New `src/domain/analytics.js`:

| Function | Returns |
|---|---|
| `periodDays(today, period)` / `previousPeriod(days)` | The days of the period and of the one before it, the same length |
| `dailySeries(items, days, { dayOf, value })` | One number per day (sums), for the charts |
| `paymentsByDay`, `jobsOpenedByDay` | The two large series |
| `averageTicket`, `billedHours` | From issued invoices in the period (net), reusing `domain/reports.js` |
| `showRate(appointments, days, now)` | Arrived out of those that were due, null when none were due |
| `timeInService(workOrders, days)` | Median days from opened to ready, null when none finished |
| `change(current, previous, { better })` | `{ pct, direction, good }`; null when the previous period is empty (no "+∞%") |

New selectors in `lib/store/selectors.js`: `selectToConfirm(appointments, today, now)` (groups of D6) and `selectToCollect(invoices, payments, today)` (groups and amounts of D7, through `invoiceFlow`).

## 5. Components

| Piece | Where | Note |
|---|---|---|
| `CardSection` | `ds/card-section.jsx` | D3, D4; replaces `InShopStrip`'s shell |
| `SectionLine` | `ds/card-section.jsx` | The coloured line + legend, pressable or not (D4) |
| `BookingCard`, `InvoiceCard` | `features/dashboard/` | The `VisitCard` anatomy (D5) |
| `HomeSearch` | `features/dashboard/home-search.jsx` | D2 |
| `AreaChart`, `Sparkline`, `NoData` | `features/reports/charts.jsx` | Reuse `niceMax`, `useWidth`; tooltip and table view per §4 of the design system |
| `MetricCard` | `features/dashboard/analytics.jsx` | Label, value, change, chart, "···" |

## 6. Where the old blocks go

| Old block | Its job now |
|---|---|
| Stat "În service acum" | The count in "Deja în service · 13" |
| Stat "Programări azi" | The "Azi" group of De confirmat and the timeline |
| Stat "Încasat azi" | The Încasări chart (today is its last point) |
| Stat "De încasat" | The Facturi title column ("12.480 lei de încasat") |
| Gata de predare | The "Gata" group of Deja în service, with "gata de 2 zile" and the **Anunță** corner (D8) |
| Încărcare azi | The hours per mechanic already written in the timeline's mechanic column |
| De contactat | Its page (De contactat) and the count on it in the sidebar and in Mai mult (Q2) |
| Stoc de completat | Its tab in Catalog (Q2) |

## 7. Edge cases

| Case | What happens |
|---|---|
| Store not ready / date unknown at build | Skeleton with the final geometry (hero, three strips, the grid); nothing date-bound is rendered at build time |
| A section with nothing in it | It stays, with one sentence and one action (a dashed placeholder card, as Cloudflare's "Add a domain"): "Nicio mașină în service · Primire mașină", "Toate programările sunt confirmate · Programare nouă", "Totul e încasat" |
| Confirm on a booking deleted or changed meanwhile | The domain refuses, a toast says why, the card follows the store |
| Confirm then undo | The toast's "Anulează" puts the status back (as in the booking sheet) |
| A booking's time passes while the page is open | It moves to "Au trecut" on the next minute tick, with A sosit / Neprezentat |
| A customer without a phone | No WhatsApp corner; the sheet still has everything |
| Invoices in another currency | Amounts follow `settings.currency`, as everywhere |
| A storno pair | Neither is "to collect" (the storno cancels the original) |
| Hundreds of items | 30 cards per section, then "+N în …" leading to the full page |
| Analytics with too little history | Change is hidden when the previous period has nothing; "Fără date" when the current one has nothing |
| A period of 12 months | The charts go per month, not per day |
| Dark mode, reduced motion | Tokens only; no chart animation under reduced motion |
| Keyboard | ⌘K and "/" for search; Tab goes hero → sections in order; ‹ › and ← → in a strip; "···" menus are menus |

## 8. Build order

| Phase | What | Done when |
|---|---|---|
| 0 | This plan + design-system rows (🟡) | The owner approves |
| 1 | `domain/analytics.js`, the two selectors, tests | `npm test` covers every function in §4 |
| 2 | `CardSection` + `SectionLine`; Deja în service moved into it (no visible change) | ui:check passes unchanged |
| 3 | The hero and the search | ⌘K, "/", typing opens the search with the text |
| 4 | De confirmat (cards, Confirmă with undo, past ones) | New ui:check: confirm, undo, an empty week |
| 5 | Facturi (cards, filter by state, memento) | New ui:check: filter, amounts match the invoice sheet |
| 6 | Analiză (charts, period, table view, "Fără date") | New ui:check: period switch, table view; values match Rapoarte |
| 7 | Old blocks removed, skeleton, phone pass, docs 🟢, `npm run ios:device` | All checks; seen at 430 px and on the iPhone |

## 9. Questions for the owner

| # | Question | Recommended | Why |
|---|---|---|---|
| Q1 | The timeline (mini-calendar) is not in the list. Where does it go? | **Keep it on Azi, right under Deja în service** | The cards and the bookings stay linked (hover, "Arată în calendar"), and it is the only place to drag bookings. Other options: the top of Programări, or remove it |
| Q2 | "De contactat" and "Stoc de completat" are not in the list either | **Move them to their pages; the sidebar counts stay** | The page stays the five sections asked for. Other option: a compact three-column list under Analiză, as Cloudflare's lists |
| Q3 | Do bookings whose time passed with nothing recorded go in De confirmat? | **Yes, first, as "Au trecut"** | They need a decision too (A sosit / Neprezentat), and nothing else on the page would show them |
| Q4 | The big search: the app's search, or results drawn under the field? | **The app's search (⌘K)** | One search to learn; it already finds cars, customers, jobs and invoices and creates things. Results under the field would be a second search to keep in step |
| Q5 | The Cloudflare look beyond Azi (sidebar "Recente", top bar)? | **Azi now; the sidebar and top bar in a separate pass after** | Keeps this change to one page, so it can be judged on its own |

## 10. Built (17 Oct 2026)

| Piece | Where |
|---|---|
| Rules | `src/domain/analytics.js` (periods, the six numbers, `change`), `src/domain/agenda.js` (`bookingsToConfirm`, `invoicesToCollect`), `readyMessage` in `src/domain/work-order.js`; tests in `src/domain/home.test.js` |
| Selectors | `selectToConfirm`, `selectToCollect`, `selectHomeAnalytics` in `src/lib/store/selectors.js` |
| Cards form | `src/components/ds/card-section.jsx`: `CardSection`, `SectionCard`, `CardButton`, `CornerButton`, `SectionLine`, `PartMark`, `capGroups` |
| Sections | `features/dashboard/`: `home-hero.jsx`, `dashboard-calendar.jsx` (Deja în service + the timeline), `to-confirm.jsx`, `to-collect.jsx`, `home-analytics.jsx`; the page is `dashboard-page.jsx` |
| Charts | `AreaChart`, `NoData` in `features/reports/charts.jsx` |
| Checks | `npm run ui:check`, "Azi: the home page" (order, search, Confirmă + undo, the invoices' filter and amounts, the analytics table and period), "Au trecut" at 15:45, the hero on a phone |

Built differently from the plan, or found on the way:

- **"/" opens the search** rather than focusing the field: the field's only job is to open it, so this is one step shorter. With the field focused, "/" is still the shortcut, not text.
- **The search opens with what was typed** through a new `seed` in `command-state.js` (each opening is a new session); the sidebar and top-bar buttons still open it empty.
- **Corner buttons are 32 px to the eye and 44 px to a finger** (their hit area reaches past them), so two fit on a 15 rem card without covering its title. "Arată în calendar" and "Sună" show on hover with a mouse; Confirmă, A sosit, Neprezentat, Anunță and an overdue invoice's Memento are always shown.
- **Deja în service** now sits on the page, not inside the calendar's card; the timeline has its own card under it. The status line still filters both.
- **The axes count in clean steps** (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 × 10ⁿ, whole steps for counts), so a chart reads 0 · 1 K · 2 K · 3 K · 4 K, never 1,3 K.
- **Today is the last point of every chart**, so far: "Încasări" can end low in the morning. It is the truth of the day, not a fault.
- **A click on free time** was measured on the row, 1 px inside the day's border, while the line under the mouse was measured on the day: at some widths the click booked a quarter of an hour earlier than the line said. Both are measured on the day now (found by the checks once the page became narrower).
- **The "gata de ridicare" message** is one function (`readyMessage`) for the card's Anunță and the job's contact buttons.

