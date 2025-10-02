import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { computeNextBirthday9amUtcEpochMs, isBirthdayToday } from '../src/x/time';

describe('time utils', () => {
  it('schedules next 9am local if today before 9am', () => {
    const tz = 'America/New_York';
    const now = DateTime.fromObject({ year: 2025, month: 10, day: 1, hour: 8, minute: 0 }, { zone: tz }).toJSDate();
    const ms = computeNextBirthday9amUtcEpochMs({ birthday: '2000-10-01', timezone: tz, now });
    const dt = DateTime.fromMillis(ms).setZone(tz);
    expect(dt.year).toBe(2025);
    expect(dt.month).toBe(10);
    expect(dt.day).toBe(1);
    expect(dt.hour).toBe(9);
  });

  it('schedules next year if today after 9am', () => {
    const tz = 'Australia/Melbourne';
    const now = DateTime.fromObject({ year: 2025, month: 10, day: 1, hour: 10, minute: 0 }, { zone: tz }).toJSDate();
    const ms = computeNextBirthday9amUtcEpochMs({ birthday: '1999-10-01', timezone: tz, now });
    const dt = DateTime.fromMillis(ms).setZone(tz);
    expect(dt.year).toBe(2026);
    expect(dt.month).toBe(10);
    expect(dt.day).toBe(1);
    expect(dt.hour).toBe(9);
  });

  it('detects birthday today regardless of year', () => {
    const tz = 'Europe/London';
    const now = DateTime.fromObject({ year: 2025, month: 3, day: 5, hour: 13 }, { zone: tz }).toJSDate();
    expect(isBirthdayToday({ birthday: '2001-03-05', timezone: tz, now })).toBe(true);
    expect(isBirthdayToday({ birthday: '2001-03-06', timezone: tz, now })).toBe(false);
  });
});



