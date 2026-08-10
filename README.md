# BlackLabel Car Services — NestJS Backend (Phase 2)

## Setup

```bash
npm install
cp .env.example .env    # fill in Supabase, Google Maps, Stripe, FCM keys
npm run build           # verified: compiles cleanly
npm test                # pricing engine unit tests (16/16 passing)
npm run start:dev       # http://localhost:3000/api/v1
```

Requires the Supabase schema from Phase 1 to already be applied (migrations + seed).

## Environment variables

See `.env.example`. Notably:
- `SUPABASE_SERVICE_ROLE_KEY` — used for all backend DB access (bypasses RLS; the API layer is the trust boundary here).
- `SUPABASE_JWT_SECRET` — used to verify the Supabase-issued access tokens on incoming requests and WebSocket connections.
- `GOOGLE_MAPS_API_KEY` — server-side route/distance calculation (never trust a client-supplied distance for pricing).
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — payment intents + webhook verification.

## Architecture

- **Auth boundary**: Supabase Auth issues JWTs (register/login proxied through `/auth`), verified here via `JwtStrategy` + `JwtAuthGuard`. `RolesGuard` + `@Roles()` enforce customer/admin/chauffeur access.
- **Pricing**: `pricing.calculator.ts` holds pure, unit-tested functions mirroring the SQL functions from Phase 1 exactly (same tie-break on the 200km boundary, same clamping, same validation). `PricingService` fetches live rates from Supabase so admin edits apply without a redeploy.
- **Reservations**: distance/duration always computed server-side via `MapsService` (Google Directions) — the mobile app's numbers are for UI only, never for pricing.
- **Real-time tracking**: Socket.IO gateway at `/tracking`, JWT-authenticated on connect. Chauffeur pushes `location:update`; customer/admin join a `reservation:<id>` room to receive it.
- **Payments**: Stripe PaymentIntents + webhook (`POST /payments/webhook`), gated by signature verification, not JWT.
- **Invoices**: generated automatically when a reservation reaches `completed`; PDF built with `pdfkit`, uploaded to a private Supabase Storage bucket, downloaded via a short-lived signed URL.

## API summary (prefix: `/api/v1`)

| Method | Route | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | role: customer or chauffeur |
| POST | `/auth/login` | public | |
| POST | `/auth/refresh` | public | |
| GET  | `/auth/me` | authenticated | |
| GET  | `/vehicle-categories` | authenticated | pricing config per category |
| PUT  | `/vehicle-categories/:id` | admin | edit rates |
| GET  | `/vehicles` | authenticated | |
| POST | `/vehicles` | admin | |
| POST | `/pricing/quote` | authenticated | live price preview before booking |
| POST | `/reservations` | customer | creates + prices a reservation |
| GET  | `/reservations` | authenticated | scoped to caller's role |
| GET  | `/reservations/:id` | authenticated (involved or admin) | |
| PATCH | `/reservations/:id/assign-chauffeur` | admin | |
| PATCH | `/reservations/:id/status` | chauffeur (own trip) / admin / customer (cancel only) | |
| POST | `/payments/intent` | customer | Stripe PaymentIntent |
| POST | `/payments/webhook` | Stripe (signature-verified) | |
| GET  | `/payments` | customer | |
| GET  | `/invoices` | customer | |
| GET  | `/invoices/:id/download` | customer/admin | signed URL, 10 min expiry |
| GET  | `/notifications` | authenticated | |
| PATCH | `/notifications/:id/read` | authenticated | |
| WS   | `/tracking` | authenticated (handshake token) | `reservation:join`, `location:update` |
| GET  | `/admin/stats` | admin | dashboard counts + revenue |
| GET  | `/admin/customers` | admin | all customers + profile info |
| PATCH | `/admin/customers/:id/active` | admin | activate/deactivate an account |
| GET  | `/admin/chauffeurs` | admin | all chauffeurs + assigned vehicle |
| PATCH | `/admin/chauffeurs/:id` | admin | update license/status |
| GET  | `/locations` | authenticated (customer) | saved/favorite addresses |
| POST | `/locations` | authenticated (customer) | |
| PUT  | `/locations/:id` | authenticated (customer) | |
| DELETE | `/locations/:id` | authenticated (customer) | |
| POST | `/reviews` | customer | rate a chauffeur after a completed trip (one per reservation) |
| GET  | `/chauffeurs/:id/reviews` | public | |
| GET  | `/chauffeurs/:id/reviews/summary` | public | average rating + count |
| POST | `/promo-codes` | admin | |
| GET  | `/promo-codes` | admin | |
| PATCH | `/promo-codes/:id` | admin | activate/deactivate, extend expiry |
| DELETE | `/promo-codes/:id` | admin | |
| POST | `/promo-codes/preview` | customer | validates a code + returns the discount, without redeeming it |
| POST | `/recurring-bookings` | customer | create a recurring booking template |
| GET  | `/recurring-bookings` | customer | |
| PUT  | `/recurring-bookings/:id` | customer | |
| DELETE | `/recurring-bookings/:id` | customer | |
| POST | `/recurring-bookings/run-now` | admin | manually trigger the daily generation job |
| POST | `/chat/messages` | authenticated | send a message on a trip; delivery is via Supabase Realtime, not this endpoint |
| GET  | `/chat/reservations/:id/messages` | authenticated (involved) | message history |
| PATCH | `/chat/reservations/:id/read` | authenticated (involved) | |
| GET  | `/earnings/me` | chauffeur | own completed-trip earnings after commission |
| GET  | `/admin/chauffeurs/:id/earnings` | admin | |
| POST | `/tips/intent` | customer | Stripe PaymentIntent for a tip (chauffeur keeps 100%) |
| GET  | `/tips/mine` | chauffeur | |
| POST | `/sharing` | customer | create a public share link for an active trip |
| DELETE | `/sharing/:id` | customer | revoke a share link |
| GET  | `/public/track/:token` | public | JSON trip status for a share link |
| GET  | `/public/track/:token/view` | public | minimal auto-refreshing HTML page for a friend without the app |
| GET  | `/credits/balance` | customer | |
| GET  | `/credits/transactions` | customer | |
| POST | `/gift-cards/redeem` | customer | |
| GET  | `/referrals/me` | authenticated | referral code + count of successful referrals |
| POST | `/admin/gift-cards` | admin | |
| GET  | `/admin/gift-cards` | admin | |
| GET  | `/admin/chauffeurs/pending-verification` | admin | |
| PATCH | `/admin/chauffeurs/:id/verify` | admin | approve/reject with notes |
| POST | `/chauffeur-documents/license` | chauffeur | multipart upload, resets verification to `pending` |
| POST | `/chauffeur-documents/insurance` | chauffeur | multipart upload (+ optional `expiry`) |

Note: `GET /invoices` and `GET /payments` now branch on role — admins get every row (with customer name joined in), everyone else gets only their own.

## What's stubbed / needs a decision before production

- **Push notifications**: `NotificationsService.pushToDevice()` is a stub — wire FCM/APNs once device-token storage is designed.
- **Payment provider**: Stripe is the reference implementation; `PaymentsService`'s public contract (`createIntent` / `handleWebhookEvent`) is the seam to swap providers.
- **Reservation lifecycle**: reservations are created as `confirmed` directly for a usable end-to-end flow; production should likely start at `pending` and flip to `confirmed` only after `payment_intent.succeeded` (the webhook handler already does this update — just change the initial insert status).

## Realtime notifications & chat (Supabase, not FCM)

Push delivery uses **Supabase Realtime**, not Firebase/APNs. The backend's only
job is inserting into `notifications` / `chat_messages` (already required for
history anyway) — Supabase streams that insert to any client subscribed via
`supabase.channel(...).on('postgres_changes', ...)`, filtered by RLS. The
Flutter app subscribes directly to Supabase for live delivery; it never talks
to a push provider. Trade-off: this only reaches an app with an open realtime
connection (foreground/backgrounded), not a fully killed app — add FCM/APNs
later if that matters for your use case.

## Recurring bookings

`recurring_bookings` rows are templates (days of week + time of day). A daily
cron job (`@nestjs/schedule`, 06:00 UTC) turns due templates into real
reservations by calling `ReservationsService.create()` directly — so a
generated reservation goes through the exact same pricing/maps/notification
pipeline as one booked by hand. Template times are currently interpreted as
UTC; add a per-template timezone before relying on this across regions.

## Promo codes

Discount validation (expiry, per-customer usage cap, category restriction,
minimum trip amount) lives in the `preview_promo_discount` SQL function from
Phase 1 — the backend calls it via `supabase.rpc(...)` rather than
re-implementing the rules in TypeScript, so the database stays the single
source of truth. `ReservationsService` re-validates against the *actual*
computed subtotal at booking time (never trusts a discount amount from the
client) and only records the redemption after the reservation insert
succeeds.

## Tips, sharing, credits & verification (Phase 6)

- **Tips**: chauffeur keeps 100% — no platform commission, unlike the trip fare. A tip is its own Stripe PaymentIntent (`metadata.type = 'tip'`); the shared webhook handler in `PaymentsService` branches on that metadata to insert straight into `tips` rather than touching the `payments`/`reservations` tables.
- **Trip sharing**: `POST /sharing` mints a random token (`trip_share_tokens`, 24h expiry by default). The public routes serve either JSON or a self-contained HTML page — no exposed Maps API key, no map SDK, just status + addresses + last known coordinates, auto-refreshing every 15s. Good enough for "here's where I am" over text; swap in an embedded map later if wanted.
- **Credits**: `customers.credit_balance` is the single ledger behind both referral rewards and gift cards (`credit_transactions`, DB-trigger-maintained — see Phase 5's migrations). `ReservationsService` applies it at booking time, strictly server-side (fetches the real balance, never trusts a client-supplied amount), after the promo discount and before the tax multiplier.
- **Referrals**: every profile gets an auto-generated `referral_code` on signup (DB trigger). The reward (configurable via `pricing_settings.referral_reward_amount`) fires once, automatically, the first time the *referee's* reservation reaches `completed` — enforced by a DB trigger, not application code, so it can't be bypassed by calling the API directly.
- **Chauffeur verification**: `chauffeurs.verification_status` gates `ReservationsService.assignChauffeur()` — an admin must approve a chauffeur's uploaded license/insurance before they can be assigned any trip. Uploading a new document automatically resets status back to `pending`.

## Next phase

3. Flutter customer app (auth, booking flow, live tracking map, payments, invoices)
4. Admin dashboard / chauffeur app
