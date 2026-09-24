# EmailQX

EmailQX is a lightweight email scheduling dashboard for queuing, tracking, and previewing outbound messages.

## Features

- Schedule emails for future delivery
- View scheduled, sent, failed, and cancelled jobs
- Queue jobs with BullMQ and Redis
- Preview sent messages through Ethereal SMTP
- Search and filter emails in a dashboard
- Support Google sign-in and file attachments

## Tech stack

- Frontend: React, Vite, TypeScript
- Backend: Express, TypeScript
- Queue: BullMQ + Redis
- Database: PostgreSQL + Prisma
- Email delivery: Nodemailer + Ethereal

## Quick start

### Prerequisites

- Node.js 18+
- Docker

### 1) Start Redis and PostgreSQL

```bash
docker run -d --name emailqx-redis -p 6379:6379 redis:alpine

docker run -d --name emailqx-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=emailqx_db \
  -p 5432:5432 postgres:15-alpine
```

### 2) Backend

```bash
cd server
npm install
# create a local .env with DATABASE_URL and REDIS_URL values
npx prisma db push
npm run dev
```

### 3) Frontend

```bash
cd client
npm install
# add VITE_GOOGLE_CLIENT_ID to your local .env
npm run dev
```

## Environment variables

### Server

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/emailqx_db
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=1000
MAX_EMAILS_PER_HOUR_PER_SENDER=50
MAX_EMAILS_PER_HOUR_GLOBAL=500
```

### Client

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## API overview

- GET /api/health
- GET /api/stats
- GET /api/emails
- POST /api/emails/schedule
- POST /api/emails/:id/cancel
- POST /api/emails/:id/reschedule

## Notes

The app uses Ethereal as a fake SMTP provider so emails can be sent and previewed without a real mail server. Each sent email stores a preview link in the dashboard for testing and QA.

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
