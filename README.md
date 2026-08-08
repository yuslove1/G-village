# Gadgetvillage

Buy, sell and trade gadgets anywhere in Nigeria. Computer Village supply,
reachable from any state, with every used device checked by a person before it
ships and a real receipt at the end.

```
Gadgetvillage/
  backend/    Node, TypeScript, Express, Prisma, PostgreSQL
  frontend/   Next.js 14 App Router, Tailwind, mobile-first PWA
  mobile/     Empty until phase 5. See mobile/README.md for why
```

## Running it

You need Node 20+, PostgreSQL 15+, and a Paystack test account.

```bash
# backend
cd backend
cp .env.example .env          # fill in DATABASE_URL and the Paystack keys
openssl rand -base64 48       # run twice, one for each JWT secret
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev                   # http://localhost:4000

# frontend, in a second terminal
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

For webhooks in development, point a tunnel at the API and set the URL in the
Paystack dashboard:

```bash
ngrok http 4000
# webhook URL: https://<your-tunnel>.ngrok.io/api/v1/webhooks/paystack
```

## Decisions worth knowing before you change anything

**Money is BigInt kobo. Everywhere.** No floats, no decimals, no strings that
get parsed twice. `0.1 + 0.2` is not `0.3` in binary floating point, and on a
platform holding other people's money that error compounds until somebody eats
it. Formatting to `₦285,000` happens once, at the response edge, in
`lib/serialize.ts`.

**The ledger is double entry and it is not optional.** Every movement of money
writes entries that sum to zero. `postJournal` throws on anything unbalanced
before it reaches the database. Balances are derived by summing entries, never
stored in a column that can drift. A background job runs the trial balance
every fifteen minutes and logs at `fatal` if the books stop agreeing, which is
a stop-taking-payments signal, not a warning.

**Webhooks are notifications, not evidence.** Paystack's payload is verified by
HMAC SHA-512 over the raw bytes with a timing-safe compare, and even then the
amount in it is never trusted. `settlePayment` calls Paystack's verify endpoint
and refuses to mark an order paid if the confirmed amount is short. The handler
answers 200 before doing any work, because a slow response turns one event into
dozens of retries.

**Refresh tokens rotate and reuse is treated as theft.** Every refresh burns the
old token. If an already-rotated token comes back, the entire token family is
revoked. That signs out the real user too, which is annoying once and correct
always.

**Stock is reserved inside the order transaction.** A conditional `updateMany`
that only fires on a `LIVE` listing means a racing second buyer loses cleanly
instead of both of them buying the same phone. Reservations expire after thirty
minutes and a job puts the stock back.

**Every privileged write is audited.** Who, what, before, after, when. Append
only. Nothing in the application updates or deletes those rows.

## Build order

Phases and the dead-end map are in `GadgetHub_Build_Order.docx`. The short
version: ship phase one, which is auth through checkout plus admin orders, and
resist designing phase four until real people have used phase one.

## Still open

- SMS provider for OTP. `auth.service.ts` logs the code in development and has
  a marked spot for the integration
- Image uploads. Listings take URLs; wire Cloudinary or S3 with signed uploads
- Receipt PDF generation
- Redis-backed rate limiting once this runs on more than one instance. The
  in-memory store is per-process and stops being accurate the moment you scale
- Background jobs use `setInterval`. Same caveat: they need a lock or a real
  queue before a second instance exists
