import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db, userStore, initDb } from '../src/x/db';
  beforeAll(async () => {
    await initDb();
  });
import { computeNextBirthday9amUtcEpochMs } from '../src/x/time';

describe('outbox idempotency and reschedule', () => {
  beforeEach(() => {
    // Clear store
    db.__clearAll();
  });

  it('enqueues only one message per (user, schedule)', () => {
    const u = userStore.createUser({ firstName: 'A', lastName: 'B', birthday: '2000-10-01', timezone: 'America/New_York' });
    const nextUtc = computeNextBirthday9amUtcEpochMs({ birthday: u.birthday, timezone: u.timezone });
    const payload = `Hey, ${u.first_name} ${u.last_name}, it’s your birthday`;

    db.enqueueMessage({ user_id: u.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload });
    // second enqueue same schedule should throw; catch and ignore
    try { db.enqueueMessage({ user_id: u.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload }); } catch {}

    const rows = db.listOutboxByUser(u.id);
    expect(rows.length).toBe(1);
  });

  it('reschedules on update by clearing undelivered then enqueuing new schedule', () => {
    const u = userStore.createUser({ firstName: 'X', lastName: 'Y', birthday: '2000-10-01', timezone: 'America/New_York' });
    const nextUtc = computeNextBirthday9amUtcEpochMs({ birthday: u.birthday, timezone: u.timezone });
    const payload = `Hey, ${u.first_name} ${u.last_name}, it’s your birthday`;
    db.enqueueMessage({ user_id: u.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload });

    // Update timezone to Melbourne which will change schedule
    const updated = userStore.updateUser(u.id, { timezone: 'Australia/Melbourne' })!;
    db.deleteUndeliveredForUser(updated.id);
    const next2 = computeNextBirthday9amUtcEpochMs({ birthday: updated.birthday, timezone: updated.timezone });
    db.enqueueMessage({ user_id: updated.id, scheduled_utc_ms: next2, delivered_at_ms: null, payload });

    const rows = db.listOutboxByUser(u.id);
    expect(rows.length).toBe(1);
    expect(rows[0].scheduled_utc_ms).toBe(next2);
  });
});


