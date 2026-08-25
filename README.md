# 🚀 ReachInbox — Full-Stack Email Job Scheduler

A production-grade email scheduling service and real-time dashboard built with BullMQ, Redis, PostgreSQL, Express, and React.

---

## 📋 Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Architecture Overview](#architecture-overview)
4. [How Scheduling Works](#how-scheduling-works)
5. [Persistence on Restart](#persistence-on-restart)
6. [Rate Limiting & Concurrency](#rate-limiting--concurrency)
7. [Behaviour Under 1000+ Emails](#behaviour-under-1000-emails)
8. [Quick Start](#quick-start)
9. [Environment Variables](#environment-variables)
10. [API Reference](#api-reference)
11. [Frontend Features](#frontend-features)
12. [Feature Checklist](#feature-checklist)
13. [Assumptions & Trade-offs](#assumptions--trade-offs)

---

## Features

- **BullMQ + Redis delayed jobs** — zero cron jobs, pure event-driven scheduling
- **Fake SMTP via Ethereal** — every sent email gets a live preview URL
- **Multi-sender support** — isolate rate limits per sender account
- **Restart resilience** — all pending jobs are re-synced from DB on boot
- **Strict idempotency** — atomic DB row-lock prevents any email being sent twice
- **Redis-backed hourly rate limiting** — per-sender and global, excess jobs are rescheduled not dropped
- **Configurable throttle delay** — minimum delay between individual sends (mimics provider limits)
- **File attachments** — base64-encoded files sent via Nodemailer and displayed in the dashboard
- **Google OAuth login** — real OAuth 2.0 via `@react-oauth/google`
- **Real-time dashboard** — 5-second polling, optimistic UI updates, URL-based state

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+, Express, TypeScript |
| Queue | BullMQ 5.x |
| Cache / Rate limiting | ioredis (Redis) |
| Database | PostgreSQL via Prisma ORM |
| SMTP | Nodemailer + Ethereal Email |
| Frontend | React 18, Vite, TypeScript |
| Auth | Google OAuth 2.0 (`@react-oauth/google`) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                        │
│  Google OAuth → Dashboard → Compose → List → Detail View    │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────────┐
│                   Express API Server                         │
│  POST /emails/schedule  →  Zod validation                    │
│  GET  /emails           →  Paginated list (indexed queries)  │
│  POST /emails/:id/cancel / reschedule                        │
│  GET  /health  /stats                                        │
└────────┬──────────────────────────┬─────────────────────────┘
         │ Prisma ORM               │ BullMQ Queue
┌────────▼──────┐         ┌────────▼───────────────────────┐
│  PostgreSQL   │         │  Redis                          │
│  Email rows   │         │  Delayed jobs (BullMQ)          │
│  User rows    │         │  Rate-limit counters            │
│  Indexes on:  │         │  ratelimit:sender:{key}:{hour}  │
│  status,      │         │  ratelimit:global:{hour}        │
│  userEmail,   │         └─────────────┬───────────────────┘
│  scheduledAt  │                       │ Job fires at delay
└───────────────┘         ┌─────────────▼───────────────────┐
                          │  BullMQ Worker (concurrency=N)   │
                          │  1. Idempotency lock (DB atomic) │
                          │  2. Rate limit check (Redis)     │
                          │  3. Throttle delay (MIN_DELAY)   │
                          │  4. Send via Ethereal SMTP       │
                          │  5. Update DB → SENT / FAILED    │
                          └─────────────────────────────────┘
```

---

## How Scheduling Works

1. **API request** hits `POST /api/emails/schedule` with `{ recipient, subject, body, scheduledAt, senderEmail, attachments? }`.
2. The controller validates with Zod, writes an `Email` record to PostgreSQL with `status: "SCHEDULED"`.
3. `scheduleEmailJob(emailId, scheduledAt)` is called — it adds a BullMQ job with `jobId = emailId` and a `delay = scheduledAt - now` milliseconds.
4. At the target time, Redis fires the job to the BullMQ worker.
5. The worker:
   - Reads the `Email` row from Postgres
   - Acquires an **atomic idempotency lock** (`updateMany WHERE status='SCHEDULED'`)
   - Checks the **Redis hourly rate limit**
   - Sleeps `MIN_EMAIL_DELAY_MS` (provider throttle)
   - Sends via Ethereal SMTP with Nodemailer
   - Updates the row to `status: "SENT"` with the Ethereal preview URL

---

## Persistence on Restart

On every server boot, `syncPendingJobsOnStartup()` runs before the HTTP server starts:

```ts
// Fetch all SCHEDULED emails from DB (only id + scheduledAt)
const pendingEmails = await prisma.email.findMany({
  where: { status: "SCHEDULED" },
  select: { id: true, scheduledAt: true },
});

// Check all existing BullMQ jobs in PARALLEL (not sequentially)
const jobChecks = await Promise.all(
  pendingEmails.map((e) => emailQueue.getJob(e.id))
);

// Re-enqueue only the ones whose job was lost from Redis
const toEnqueue = pendingEmails.filter((_, i) => !jobChecks[i]);
await Promise.all(toEnqueue.map((e) => emailQueue.add(...)));
```

**Guarantees:**
- Emails whose delay has already passed are enqueued with `delay: 0` — they fire immediately.
- Emails already in Redis are not touched — BullMQ deduplicates by `jobId`.
- Emails with `status: "SENT"` or `"CANCELLED"` are excluded from the query.
- No email is ever re-sent — the idempotency lock in the worker catches any edge case.

---

## Rate Limiting & Concurrency

### Worker Concurrency

```env
WORKER_CONCURRENCY=5   # number of jobs processed in parallel
```

BullMQ's built-in `concurrency` option limits parallel job execution per worker instance. All concurrent workers share the same Redis rate-limit counters, so limits are enforced globally even when scaling horizontally.

### Provider Throttle Delay

```env
MIN_EMAIL_DELAY_MS=1000   # minimum ms between individual sends (default: 1 second)
```

Implemented as a `setTimeout` inside the worker before calling Ethereal. This serialises the actual SMTP calls within each worker slot, mimicking real provider throttling requirements.

### Redis-Backed Hourly Rate Limiting

```env
MAX_EMAILS_PER_HOUR_PER_SENDER=50    # per sender account
MAX_EMAILS_PER_HOUR_GLOBAL=500       # across all senders combined
```

**Redis key structure:**
```
ratelimit:sender:{senderEmail}:{YYYY-MM-DDTHH:00:00Z}   TTL: 2h
ratelimit:global:{YYYY-MM-DDTHH:00:00Z}                 TTL: 2h
```

**Atomic INCR-then-check pattern** (eliminates TOCTOU race under high concurrency):
```ts
// 1. Atomically increment both counters in one round-trip
pipeline.incr(senderKey);
pipeline.incr(globalKey);
const results = await pipeline.exec();

// 2. Check if either limit was exceeded
if (newSenderCount > MAX_PER_SENDER || newGlobalCount > MAX_GLOBAL) {
  // 3. Roll back the increments
  pipeline.decr(senderKey);
  pipeline.decr(globalKey);
  await pipeline.exec();
  // Reschedule job to top of next hour window — never dropped
}
```

**When the limit is hit:**
- The worker reverts the email status back to `"SCHEDULED"` in Postgres.
- Calculates `nextWindowDate = top of next UTC hour`.
- Re-enqueues the job in BullMQ with a delay to `nextWindowDate`.
- Order is preserved — emails scheduled earlier get a slightly shorter wait.

---

## Behaviour Under 1000+ Emails

This is explicitly designed for bulk load:

### Scheduling phase (API)
- Each `POST /api/emails/schedule` call is independent — no locking.
- 1000 concurrent requests create 1000 Postgres rows and 1000 BullMQ delayed jobs. BullMQ batches Redis writes efficiently.
- If all 1000 are scheduled for the same time, they all become `delayed` jobs in Redis with the same timestamp. Redis fires them as a burst.

### Worker processing phase
- With `WORKER_CONCURRENCY=5` and `MIN_EMAIL_DELAY_MS=1000`, throughput is **5 emails/second max per worker instance**.
- At 1000 emails: estimated processing time ≈ 1000 / 5 = **200 seconds** (≈3.3 minutes) assuming no rate limiting.
- With default `MAX_EMAILS_PER_HOUR_GLOBAL=500`: the first 500 jobs send in the current hour, the remaining 500 are automatically rescheduled to the next hour window.

### Rate limit overflow flow for 1000 emails across 3 senders:
```
Hour 1:
  sender1: sends 50  → hits limit → remaining rescheduled to Hour 2
  sender2: sends 50  → hits limit → remaining rescheduled to Hour 2
  sender3: sends 50  → hits limit → remaining rescheduled to Hour 2
  global:  sends 500 → global limit hit → rest reschedule to Hour 2

Hour 2:
  Remaining jobs fire automatically — no manual intervention needed.
```

### DB query performance at scale
Five composite indexes ensure queries stay fast even with millions of rows:
```sql
@@index([status])                -- filter by SCHEDULED/SENT/etc.
@@index([userEmail])             -- isolate per-user emails
@@index([scheduledAt])           -- order by send time
@@index([userEmail, status])     -- dashboard tab queries
@@index([status, scheduledAt])   -- next upcoming job lookup
```

### Startup sync at scale
`syncPendingJobsOnStartup` uses **parallel** Redis checks (not sequential), so syncing 1000 pending jobs takes one Redis round-trip per job in parallel, not N sequential round-trips.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for Redis and PostgreSQL)

### 1. Start Redis and PostgreSQL

```bash
docker run -d --name outbox-redis -p 6379:6379 redis:alpine

docker run -d --name outbox-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=reachinbox_db \
  -p 5432:5432 postgres:15-alpine
```

### 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env if your DB credentials differ

npx prisma db push        # creates tables + indexes
npm run dev               # starts Express + BullMQ worker on port 4000
```

### 3. Frontend setup

```bash
cd client
npm install
cp .env.example .env
# Set VITE_GOOGLE_CLIENT_ID (see Google OAuth setup below)

npm run dev               # starts Vite on port 3000
```

### Google OAuth Setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3000` to **Authorised JavaScript origins**
4. Copy the Client ID into `client/.env`:
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
5. Restart Vite

### Ethereal Email (automatic)

No setup needed. The Ethereal SMTP transporter auto-creates a test account on first startup:
```
[Ethereal] Creating test account for fake SMTP...
[Ethereal] Test account created: abc123@ethereal.email
```
Every sent email logs a preview URL:
```
[Ethereal] Preview URL: https://ethereal.email/message/...
```
This URL is stored in the database and shown as a clickable link in the dashboard.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Express server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker |
| `MIN_EMAIL_DELAY_MS` | `1000` | Minimum delay between sends (ms) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hourly send cap per sender |
| `MAX_EMAILS_PER_HOUR_GLOBAL` | `500` | Global hourly send cap |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Redis ping, DB check, queue stats, active config |
| `GET` | `/api/stats` | Scheduled / Sent / Failed / Cancelled counts + next job |
| `POST` | `/api/users/sync` | Upsert user profile from Google OAuth |
| `POST` | `/api/emails/schedule` | Schedule a new email job |
| `GET` | `/api/emails` | List emails (filter by status, search, pagination) |
| `GET` | `/api/emails/:id` | Get a single email by ID |
| `POST` | `/api/emails/:id/cancel` | Cancel a pending email job |
| `POST` | `/api/emails/:id/reschedule` | Change the send time of a pending job |

### Schedule email — request body

```json
{
  "senderEmail": "sender1@reachinbox.ai",
  "recipient": "user@example.com",
  "subject": "Hello from ReachInbox",
  "body": "Your message here.",
  "scheduledAt": "2026-08-27T10:00:00.000Z",
  "attachments": [
    { "name": "file.pdf", "type": "application/pdf", "data": "<base64>" }
  ]
}
```

---

## Frontend Features

| Feature | Details |
|---|---|
| **Google OAuth** | Real OAuth 2.0 via `@react-oauth/google`, user picture + name + email in header |
| **Email/password UI** | Present in login form, clearly labelled "Coming soon" — auth not yet implemented |
| **Demo login** | Falls back to demo profile if Google OAuth fails |
| **Scheduled tab** | Lists all SCHEDULED emails with live status badges |
| **Sent tab** | Lists all SENT emails with Ethereal preview links |
| **Compose panel** | Full-screen panel: From selector, To (tag pills + CSV upload), Subject, Delay, Hourly limit, rich toolbar, body textarea, file attachments |
| **Send / Send Later** | Single button — shows "Send" (immediate +5s) until clock is set, then "Send Later" with scheduled time |
| **CSV upload** | Parses `.csv` / `.txt` files, detects email addresses, shows count banner |
| **File attachments** | Any file type, rendered as image thumbnails or file chips in both compose and detail view |
| **Email detail panel** | Full-screen slide-in: sender/recipient info, "to me" when recipient = logged-in user, user avatar in header, body card, attachment grid, Ethereal preview link |
| **Cancel / Reschedule** | Hover-reveal action buttons on each email row, optimistic UI update |
| **URL state** | Tab, selected email ID, compose state all reflected in URL — survives hard refresh, back/forward works |
| **Optimistic updates** | New emails appear instantly after scheduling, cancellation applies immediately without full refetch |
| **5s polling** | Background refresh keeps status badges current as jobs process |
| **Loading / empty states** | Spinner while loading, descriptive empty state with icon |
| **Toast notifications** | Success/error toasts for all user actions |
| **Health indicators** | Redis and PostgreSQL connection status pills in the header |

---

## Feature Checklist

### Backend
- [x] Email scheduling API with Zod validation
- [x] PostgreSQL storage via Prisma ORM
- [x] BullMQ delayed jobs — zero cron jobs
- [x] Multiple sender accounts via Ethereal SMTP
- [x] Restart persistence (`syncPendingJobsOnStartup`)
- [x] Idempotency lock (atomic `updateMany`)
- [x] Configurable worker concurrency
- [x] Provider throttle delay (`MIN_EMAIL_DELAY_MS`)
- [x] Per-sender hourly rate limiting (Redis counters)
- [x] Global hourly rate limiting (Redis counters)
- [x] Rate-limited jobs rescheduled to next hour (never dropped)
- [x] Atomic INCR-then-rollback rate limiting (TOCTOU-safe)
- [x] BullMQ retry with exponential backoff (3 attempts)
- [x] Graceful shutdown (worker + Redis + Prisma)
- [x] DB indexes for high-volume query performance
- [x] File attachments stored as JSON, passed to Nodemailer
- [x] User isolation (emails scoped per `userEmail`)

### Frontend
- [x] Real Google OAuth 2.0 login
- [x] User name, email, avatar in header
- [x] Logout
- [x] Scheduled Emails tab
- [x] Sent Emails tab
- [x] Compose New Email (full-screen panel)
- [x] Subject + body input
- [x] CSV/TXT upload with lead count detection
- [x] Start time picker (date + time)
- [x] Delay between emails input
- [x] Hourly limit input
- [x] Schedule / Send button
- [x] Cancel scheduled email
- [x] Reschedule email
- [x] Email detail view with attachment grid
- [x] "to me" recipient detection
- [x] Loading states
- [x] Empty states
- [x] Error toasts
- [x] URL-based navigation state
- [x] Optimistic UI updates
- [x] TypeScript throughout

---

## Assumptions & Trade-offs

| Decision | Rationale |
|---|---|
| **Attachments as base64 in DB** | Simplest approach for a demo system. In production, files would be stored in S3/GCS and referenced by URL. The 50mb body limit handles typical email attachments. |
| **Ethereal auto-account** | Ethereal creates a fresh test account on each cold start. Preview URLs remain valid for the Ethereal session. |
| **5-second frontend polling** | Simple and reliable. SSE or WebSockets would be more efficient at scale but add infrastructure complexity. |
| **INCR-then-rollback rate limiting** | More correct than read-check-write under concurrency. The rollback adds one extra Redis round-trip only when a limit is hit, which is rare. |
| **`syncPendingJobsOnStartup` uses parallel checks** | `Promise.all` instead of sequential loop — syncing 1000 jobs takes ~one Redis RTT instead of N×RTT. |
| **No authentication middleware on API routes** | The `x-user-email` header isolates data per user but is not signed/verified. In production, JWT middleware would validate the token before trusting the header. |
| **`status` as String not Enum in Prisma** | Kept flexible for easier migration. A Prisma enum would add DB-level constraint; trade-off is a minor schema migration. |
| **Single worker process** | For this demo one worker handles all concurrency via BullMQ's `concurrency` option. Horizontal scaling just requires starting more instances pointing to the same Redis and Postgres. |
