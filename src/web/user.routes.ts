import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, userStore } from '../x/db';
import { computeNextBirthday9amUtcEpochMs } from '../x/time';

const CreateUserSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
});

const UpdateUserSchema = CreateUserSchema.partial().extend({ id: z.string().min(1) });

export const userRouter = Router();

userRouter.post('/', (req: Request, res: Response) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', error: parsed.error.issues });
  const user = userStore.createUser(parsed.data);
  // enqueue next birthday message for this user
  const nextUtc = computeNextBirthday9amUtcEpochMs({ birthday: user.birthday, timezone: user.timezone });
  const payload = `Hey, ${user.first_name} ${user.last_name}, it’s your birthday`;
  try { db.enqueueMessage({ user_id: user.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload }); } catch {}
  return res.status(201).json({ message: 'User successfully added', user });
});

userRouter.put('/', (req: Request, res: Response) => {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', error: parsed.error.issues });
  const updated = userStore.updateUser(parsed.data.id, parsed.data);
  if (!updated) return res.status(404).json({ message: 'User not found' });
  // reschedule: clear undelivered and enqueue next
  db.deleteUndeliveredForUser(updated.id);
  const nextUtc = computeNextBirthday9amUtcEpochMs({ birthday: updated.birthday, timezone: updated.timezone });
  const payload = `Hey, ${updated.first_name} ${updated.last_name}, it’s your birthday`;
  try { db.enqueueMessage({ user_id: updated.id, scheduled_utc_ms: nextUtc, delivered_at_ms: null, payload }); } catch {}
  return res.json({ message: 'User successfully updated', user: updated });
});

userRouter.delete('/', (req: Request, res: Response) => {
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ message: 'id required' });
  db.deleteUndeliveredForUser(id);
  const ok = userStore.deleteUser(id);
  if (!ok) return res.status(404).json({ message: 'User not found' });
  return res.status(200).json({ message: 'User successfully deleted' });
});



