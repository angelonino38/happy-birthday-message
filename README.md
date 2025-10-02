## Happy Birthday Message Service

TypeScript Node.js app that schedules and delivers birthday messages at 9am in each user's local timezone. Messages are sent to a configurable webhook (e.g. Hookbin). Uses SQLite (via sql.js, no native build) with an outbox pattern for durability, recovery, and idempotency.

### Run locally

1. Create a Hookbin URL at `https://hookbin.com` and copy your bin URL.
2. Create a `.env` file (sql.js persists to `DB_FILE`, default `./data.sqlite`):

```
PORT=3000
DB_FILE=./data.sqlite
HOOK_URL=<your-hookbin-url>
```

3. Install and start:

```
npm install
npm run dev
```

### API

- POST `/user`

```
{
  "id": "optional string",
  "firstName": "John",
  "lastName": "Doe",
  "birthday": "1990-04-25", // YYYY-MM-DD
  "timezone": "America/New_York" // IANA timezone
}
```

- PUT `/user` to update any subset; body includes `id`
- DELETE `/user?id=<id>`

Quick examples (PowerShell)
```
curl -Method POST -Uri http://localhost:3000/user -ContentType 'application/json' -Body '{
  "firstName":"John","lastName":"Doe","birthday":"1990-04-25","timezone":"America/New_York"
}'

curl -Method PUT -Uri http://localhost:3000/user -ContentType 'application/json' -Body '{
  "id":"<id>","timezone":"Australia/Melbourne"
}'

curl -Method DELETE -Uri "http://localhost:3000/user?id=<id>"
```

### How it works

- On startup, the scheduler enqueues the next 9am-local birthday per user into an `outbox` table with a unique key `(user_id, scheduled_utc_ms)` to prevent duplicates.
- A background poller delivers due messages to `HOOK_URL` and marks them delivered. If the app is down, undelivered messages remain and will be sent on next startup.

Notes
- Uses sql.js (WebAssembly) so it works on Windows/macOS/Linux without native compiler tools.
- Set `DB_FILE` to change the SQLite file location; default is `./data.sqlite`.

### Design details

- Timezone handling: Uses `luxon` with IANA tz names to compute the next occurrence of the user's birthday at exactly 09:00 local time, converted to UTC for scheduling.
- Outbox pattern: All scheduled messages are persisted with a unique `(user_id, scheduled_utc_ms)` constraint to prevent duplicates. Successful deliveries are marked with `delivered_at_ms` for idempotency.
- Recovery: On restart, the system polls the outbox for any due, undelivered messages and sends them, ensuring no birthdays are missed after downtime.
- Rescheduling: Creating or updating a user enqueues the next birthday; updates clear any undelivered future messages for that user and enqueue the new next delivery.
- Scalability: Delivery uses a periodic batch poll (every 5s) capped by a limit; increase frequency/limit or shard by user hash in a multi-process setup. The schema supports indexing by schedule time.

### Scripts

- `npm run dev` – start API and scheduler with tsx in watch mode
- `npm run build` – type-check and emit JS to `dist/`
- `npm start` – run compiled JS from `dist/`
- `npm test` – run unit tests (Vitest)

### Troubleshooting

- No messages at Hookbin:
  - Ensure `HOOK_URL` is set and reachable.
  - Check server logs for delivery errors; the system retries on the next poll.
- Timezone errors:
  - Use valid IANA names (e.g., `America/New_York`, `Australia/Melbourne`).
- Windows native build errors:
  - The project uses `sql.js` specifically to avoid native builds; ensure `npm install` completes without errors.

### Testing

```
npm test
```



