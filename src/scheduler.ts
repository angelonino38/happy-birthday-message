import axios from 'axios';
import { db, userStore } from './x/db';
import { computeNextBirthday9amUtcEpochMs } from './x/time';

const HOOK_URL = process.env.HOOK_URL || '';

export async function startScheduler() {
  if (!HOOK_URL) {
    console.warn('HOOK_URL not set; scheduler will still enqueue but delivery will fail');
  }

  // On boot, ensure upcoming birthdays are enqueued at least 32 days ahead for all users
  bootstrapEnqueue();

  // Poller to deliver due messages (idempotent via outbox unique key and delivered_at)
  setInterval(deliverDueMessages, 5_000);

  // Periodic task to refresh future enqueues in case users were added/updated
  setInterval(bootstrapEnqueue, 60_000);
}

function bootstrapEnqueue() {
  const users = userStore.listUsers();
  for (const u of users) {
    const fullName = `${u.first_name} ${u.last_name}`;
    const nextUtc = computeNextBirthday9amUtcEpochMs({ birthday: u.birthday, timezone: u.timezone });
    const payload = `Hey, ${fullName}, it’s your birthday`;
    try {
      db.enqueueMessage({ user_id: u.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload });
    } catch {
      // unique constraint may throw if already enqueued; ignore
    }
  }
}

async function deliverDueMessages() {
  const now = Date.now();
  const due = db.getDueUndelivered(now, 100);
  for (const msg of due) {
    try {
      await axios.post(HOOK_URL, { id: msg.id, userId: msg.user_id, message: msg.payload, scheduledAt: msg.scheduled_utc_ms });
      db.markDelivered(msg.id, Date.now());
    } catch (err) {
      // keep for retry on next tick
      // optionally add exponential backoff metadata in real system
    }
  }
}



