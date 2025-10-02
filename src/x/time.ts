import { DateTime } from 'luxon';

export function computeNextBirthday9amUtcEpochMs(opts: {
  birthday: string; // YYYY-MM-DD
  timezone: string; // IANA TZ
  now?: Date;
}): number {
  const now = DateTime.fromJSDate(opts.now ?? new Date());
  const tzNow = now.setZone(opts.timezone, { keepLocalTime: false });

  const [yearStr, monthStr, dayStr] = opts.birthday.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);

  let candidate = DateTime.fromObject(
    { year: tzNow.year, month, day, hour: 9, minute: 0, second: 0, millisecond: 0 },
    { zone: opts.timezone }
  );

  if (candidate < tzNow) {
    candidate = candidate.plus({ years: 1 });
  }

  return candidate.toUTC().toMillis();
}

export function isBirthdayToday(opts: { birthday: string; timezone: string; now?: Date }): boolean {
  const now = DateTime.fromJSDate(opts.now ?? new Date()).setZone(opts.timezone);
  const [_, monthStr, dayStr] = opts.birthday.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);
  return now.month === month && now.day === day;
}



