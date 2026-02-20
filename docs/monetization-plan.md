# Monetization & Analytics Plan for Knee-Timer

## Context

Knee-Timer is a TKR recovery timer app with near-zero marginal cost per user (static audio, serverless). The target market is two-sided: TKR patients using the app + PT clinics/services/products that want to reach them.

Currently: no analytics, no accounts, no tracking.

---

## Monetization Strategy (Recommended: Hybrid)

### Revenue Stream 1: One-Time Purchase ($5.99)
- **Free trial**: 14 sessions (not time-based — rehab patients have unpredictable schedules)
- **After 14 sessions**: pay $5.99 to unlock unlimited use
- **No feature gates** — trial gets the full experience; gate is on session count only
- **Early adopters**: existing access codes remain as a free-forever override
- **Payment processor**: Paddle (Merchant of Record — handles global VAT/tax for solo devs)

### Revenue Stream 2: B2B Marketplace (Recurring)
- **Affiliate products** on post-session screen: knee braces, ice machines, recovery gear (Amazon Associates, 4-8% commission)
- **PT clinic directory** by location: free basic listings, $29-99/mo for featured placement
- **Lead generation**: "Request appointment" button (clinics pay $5-20/lead)
- **Rule**: B2B content ONLY on post-session completion screen, never during exercise

### Why This Works
- One-time purchase respects that rehab is temporary (subscriptions feel exploitative)
- B2B marketplace is the long-term recurring revenue, enabled by location data from analytics
- Near-zero infrastructure cost means even modest revenue is profitable

---

## Phase 1: Anonymous Analytics Collection

### Events to Collect

| Event | When | Extra Data |
|-------|------|------------|
| `app_open` | After access code verified | — |
| `session_start` | Timer starts | duration, prepTime, speechEnabled, cameraEnabled |
| `session_complete` | Timer reaches 0 | completionPercent: 100 |
| `session_abandon` | User stops early or closes tab | completionPercent (0-99) |

Server-side enrichment (from Vercel headers, never sent by client):
- City, region, country from `x-vercel-ip-city/country/region` headers (free on Vercel)
- Platform (mobile/desktop/tablet) and browser parsed from User-Agent

Anonymous device ID: `crypto.randomUUID()` in `localStorage` — random token, not a fingerprint.

### Architecture
- **Storage**: Vercel Postgres (Neon) — free tier 0.5GB, full SQL
- **Client**: New `src/analytics.ts` (~50 lines) — `trackEvent()` fire-and-forget
- **Server**: New `api/event.js` (~80 lines) — ingests events, extracts geo, rate-limits 60/min/IP, returns 204
- **Privacy**: Update modal to disclose anonymous stats collection, no PII, no IP stored

### Database Schema
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  device_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  duration_min SMALLINT,
  prep_time_sec SMALLINT,
  speech_on BOOLEAN,
  camera_on BOOLEAN,
  completion_pct SMALLINT,
  city VARCHAR(100),
  region VARCHAR(10),
  country VARCHAR(5),
  platform VARCHAR(10),
  browser VARCHAR(30)
);
```

### Integration Points in App.tsx
- `app_open`: after access code verified (~line 913)
- `session_start`: inside `startTimer()` (~line 690)
- `session_complete`: inside `setSecondsLeft` when timer hits 0 (~line 744)
- `session_abandon`: inside `stopAndClear()` (~line 867) + `beforeunload` listener

---

## Phase 2: Trial/Purchase Gate (After 2-4 Weeks of Analytics)

### New Files
- `src/licensing.ts` — trial state, session counting, license validation
- `api/verify-license.js` — Paddle license key validation
- `api/webhook-paddle.js` — Paddle webhook for purchases

### Flow
1. Check `localStorage` for license key → valid = full access
2. No license: check session count → < 14 = allow (show "X of 14 free sessions")
3. >= 14: show purchase screen with Paddle checkout overlay ($5.99)
4. Old access codes still work as override (grandfathered early adopters)

---

## Phase 3: B2B Marketplace (After Purchase Gate Works)

### New Files
- `src/Resources.tsx` — post-session affiliate links + PT clinic cards
- `api/clinics.js` — returns nearby clinics by city
- `api/clinic-click.js` — tracks lead clicks

### Approach
- Start with 5-10 curated affiliate products (static JSON)
- Show 1-2 products on post-session completion screen
- Manually curate PT clinics in top 5 user cities (from Phase 1 analytics)
- Featured clinic listings as recurring revenue

---

## Revenue Projection (at 1,000 MAU)
- One-time purchases: ~100/mo × $5.99 = ~$600/mo (tapers)
- Affiliate commissions: ~$60/mo
- Featured clinic listings: 5 clinics × $49/mo = ~$245/mo (recurring, grows)
- Total: ~$900/mo initially, B2B growing over time

---

## Key Technical Decisions
- **Custom analytics endpoint** (not third-party SDK) — zero bundle size, full privacy control
- **Session-count trial** (not time-based) — respects unpredictable rehab schedules
- **Paddle** (not Stripe) — Merchant of Record handles all tax compliance globally
- **B2B content only post-session** — never interrupts exercise
