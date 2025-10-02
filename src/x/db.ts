import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlDatabase, SqlJsStatic } from 'sql.js';

export interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  birthday: string; // YYYY-MM-DD in user's local calendar
  timezone: string; // IANA timezone string, e.g., America/New_York
  created_at: number; // epoch ms
  updated_at: number; // epoch ms
}

export interface OutboxRow {
  id: string; // message id
  user_id: string;
  scheduled_utc_ms: number; // delivery time in UTC epoch ms
  delivered_at_ms: number | null; // null until delivered
  payload: string; // message body for idempotency
  created_at: number;
}

class DB {
  private file: string = '';
  private sql!: SqlJsStatic;
  private db!: SqlDatabase;

  async init() {
    const filename = process.env.DB_FILE || 'data.sqlite';
    this.file = path.resolve(filename);
    this.sql = await initSqlJs({
      locateFile: (f) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', f),
    });
    let database: SqlDatabase;
    if (fs.existsSync(this.file)) {
      const fileBuffer = fs.readFileSync(this.file);
      database = new this.sql.Database(fileBuffer);
    } else {
      database = new this.sql.Database();
    }
    this.db = database;
    this.migrate();
  }

  private persist() {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = this.db.export();
    fs.writeFileSync(this.file, Buffer.from(data));
  }

  private migrate() {
    this.db.run(`
      create table if not exists users (
        id text primary key,
        first_name text not null,
        last_name text not null,
        birthday text not null,
        timezone text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table if not exists outbox (
        id text primary key,
        user_id text not null,
        scheduled_utc_ms integer not null,
        delivered_at_ms integer,
        payload text not null,
        created_at integer not null,
        unique(user_id, scheduled_utc_ms)
      );

      create index if not exists idx_outbox_scheduled on outbox(scheduled_utc_ms, delivered_at_ms);
    `);
    this.persist();
  }

  createUser(data: { id?: string; firstName: string; lastName: string; birthday: string; timezone: string; }) {
    const id = data.id || nanoid();
    const now = Date.now();
    const stmt = this.db.prepare(`insert into users (id, first_name, last_name, birthday, timezone, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run([id, data.firstName, data.lastName, data.birthday, data.timezone, now, now]);
    stmt.free();
    this.persist();
    return this.getUser(id)!;
  }

  updateUser(id: string, data: Partial<{ firstName: string; lastName: string; birthday: string; timezone: string; }>) {
    const existing = this.getUser(id);
    if (!existing) return null;
    const now = Date.now();
    const merged: UserRow = {
      id,
      first_name: data.firstName ?? existing.first_name,
      last_name: data.lastName ?? existing.last_name,
      birthday: data.birthday ?? existing.birthday,
      timezone: data.timezone ?? existing.timezone,
      created_at: existing.created_at,
      updated_at: now,
    };
    const stmt = this.db.prepare(`update users set first_name=?, last_name=?, birthday=?, timezone=?, updated_at=? where id=?`);
    stmt.run([merged.first_name, merged.last_name, merged.birthday, merged.timezone, now, id]);
    stmt.free();
    this.persist();
    return this.getUser(id)!;
  }

  deleteUser(id: string) {
    const existed = !!this.getUser(id);
    const delOutbox = this.db.prepare(`delete from outbox where user_id = ?`);
    delOutbox.run([id]);
    delOutbox.free();
    const delUser = this.db.prepare(`delete from users where id = ?`);
    delUser.run([id]);
    delUser.free();
    if (existed) this.persist();
    return existed;
  }

  getUser(id: string) {
    const stmt = this.db.prepare(`select * from users where id = ?`);
    const res = stmt.getAsObject([id]) as any;
    stmt.free();
    if (!res || !res.id) return undefined;
    return res as UserRow;
  }

  listUsers() {
    const result: UserRow[] = [];
    const stmt = this.db.prepare(`select * from users`);
    while (stmt.step()) {
      result.push(stmt.getAsObject() as any as UserRow);
    }
    stmt.free();
    return result;
  }

  enqueueMessage(row: Omit<OutboxRow, 'id' | 'created_at'> & { id?: string }) {
    const id = row.id || nanoid();
    const created_at = Date.now();
    const stmt = this.db.prepare(`insert into outbox (id, user_id, scheduled_utc_ms, delivered_at_ms, payload, created_at)
      values (?, ?, ?, ?, ?, ?)`);
    stmt.run([id, row.user_id, row.scheduled_utc_ms, row.delivered_at_ms ?? null, row.payload, created_at]);
    stmt.free();
    this.persist();
    return id;
  }

  getDueUndelivered(nowMs: number, limit = 500) {
    const result: OutboxRow[] = [];
    const stmt = this.db.prepare(`select * from outbox where delivered_at_ms is null and scheduled_utc_ms <= ? order by scheduled_utc_ms asc limit ?`);
    stmt.bind([nowMs, limit]);
    while (stmt.step()) {
      result.push(stmt.getAsObject() as any as OutboxRow);
    }
    stmt.free();
    return result;
  }

  markDelivered(id: string, deliveredAtMs: number) {
    const stmt = this.db.prepare(`update outbox set delivered_at_ms = ? where id = ?`);
    stmt.run([deliveredAtMs, id]);
    stmt.free();
    this.persist();
  }

  deleteUndeliveredForUser(userId: string) {
    const stmt = this.db.prepare(`delete from outbox where user_id = ? and delivered_at_ms is null`);
    stmt.run([userId]);
    stmt.free();
    this.persist();
  }

  listOutboxByUser(userId: string): OutboxRow[] {
    const result: OutboxRow[] = [];
    const stmt = this.db.prepare(`select * from outbox where user_id = ?`);
    stmt.bind([userId]);
    while (stmt.step()) {
      result.push(stmt.getAsObject() as any as OutboxRow);
    }
    stmt.free();
    return result;
  }

  __clearAll() {
    this.db.run('delete from outbox; delete from users;');
    this.persist();
  }
}

export const db = new DB();
export async function initDb() { await db.init(); }

export const userStore = {
  createUser: (data: { id?: string; firstName: string; lastName: string; birthday: string; timezone: string; }) => db.createUser(data),
  updateUser: (id: string, data: Partial<{ firstName: string; lastName: string; birthday: string; timezone: string; }>) => db.updateUser(id, data),
  deleteUser: (id: string) => db.deleteUser(id),
  getUser: (id: string) => db.getUser(id),
  listUsers: () => db.listUsers(),
};



