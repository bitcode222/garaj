# Storefront on Cloudflare

Customers open a public page, sign in with their phone, ask for a time, and follow their visits. The request lands in the shop's **De acceptat**, and the shop confirms it there. Owner's decisions, 22 Nov 2026: everything on Cloudflare, request then confirm, site plus customer accounts, phone login with dummy data for now.

## How it fits together

```
Customer ──► /service/ ──► Worker /api ──► D1 (customers, cars, bookings, busy times)
                                 ▲
Shop's app (behind a password) ──┘  every 30 s: pull requests · push decisions · publish services, hours, busy times
      │
      └── IndexedDB stays the shop's own record
```

| Path | Who | What |
| --- | --- | --- |
| `/service/` | Everyone | Site, booking flow, customer account |
| `/api/*` | Customers | Profile, free times, login, cars, bookings |
| `/api/shop/*` | Shop session | Inbox, acknowledgements, decisions, publishing |
| `/shop-login` | Shop | Password page |
| Everything else | Shop session | The existing Garaj app |

The code is in `cloudflare/`. Booking rules are pure and tested in `src/domain/online-booking.js`.

## What leaves the shop's device

- **Always:** shop name, phone, address, opening hours, service names, durations and starting prices, the number of lifts, and busy times with no names or cars.
- **Only with "Arată clienților istoricul" on (off by default):** visit summaries and invoice numbers, only for people who booked online.
- **Never:** costs, notes, other customers, the demo shop.

## Edge cases

| Case | What happens |
| --- | --- |
| Two people take the last slot | The insert re-checks the load in one statement. The loser is told and goes back to the times |
| Double tap, or a retry after a lost connection | One idempotency key per request returns the same booking |
| Time zones and clock changes | Slots are computed in Europe/Bucharest. A skipped hour is never offered |
| Job longer than the day, or past closing | Not offered. A job must end by closing time |
| Same-day booking | Needs two hours' notice |
| Shop closed, past day, more than 60 days ahead | No slots, also refused by the API |
| Services or prices changed mid-booking | The server re-reads them. The customer chooses again |
| Too many open requests | Three per customer |
| Same car booked twice at once | Refused |
| Login interrupted | The draft survives in the tab and resumes after the code |
| Wrong or expired code | Five attempts, five minutes, resend limit, rate limits by phone and IP |
| Unanswered request | Shows as expired once its time passes and stops holding the slot |
| Customer cancels | Free while requested. A confirmed visit needs two hours' notice, otherwise a phone call |
| Customer cancels while the shop confirms | The cancellation wins and the shop is told |
| Car already in the shop when a cancel arrives | The local booking is kept |
| Shop deletes an imported booking | The customer sees it as refused |
| Shop reschedules | The customer sees the new time |
| Existing customer books online | Matched by phone. Name and notes are not overwritten |
| Plate belongs to another customer | Never attached. The booking carries a warning to check it |
| Several shop tabs | A browser lock lets one sync at a time |
| Shop offline | Requests wait in D1 and import on the next sync |
| Account deleted | Contact data, cars and history go, and open requests are cancelled |
| Forged cross-site requests | SameSite cookies, an origin check and JSON-only writes |

## Before going public

1. **Connect a real SMS provider.** Demo login accepts `123456` and works only on localhost. On any public host, login is off, so nobody can enter someone else's account.
2. **Create the database** with `npx wrangler d1 create garaj` and put its id in `cloudflare/wrangler.jsonc`.
3. **Set the shop password** with `npx wrangler secret put SHOP_PASSWORD`. Without it, the shop's app stays locked on public hosts.
4. **Add a privacy policy** that names the shop as data controller, since the site collects personal data.
5. Run `npm run cf:deploy`.

## Known limits

- One device should run the shop's app against the storefront, because each browser keeps its own IndexedDB. Moving the shop's data into D1 is the next step for several devices.
- Busy times refresh when the shop's app is open.
- Customers are not notified of a confirmation yet. They see it in their account.
- The native iPhone app is left for later.

## Run it locally

```bash
npm run cf:dev   # http://localhost:8787/service/ and the shop's app at http://localhost:8787/
```
