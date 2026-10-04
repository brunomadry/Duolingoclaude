/**
 * Minimal D1Database stand-in backed by node:sqlite, so Worker tests run the real
 * SQL (upserts, RETURNING, batches) without Miniflare. Only the API surface the
 * Worker uses is implemented.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Bound = SQLInputValue;

const WRITES = /^\s*(insert|update|delete|replace)\b/i;

class Statement {
  private readonly db: DatabaseSync;
  readonly sql: string;
  readonly params: Bound[];

  constructor(db: DatabaseSync, sql: string, params: Bound[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params: unknown[]): Statement {
    for (const p of params) {
      if (p === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a valid bind value');
    }
    return new Statement(this.db, this.sql, params as Bound[]);
  }

  async first<T>(): Promise<T | null> {
    return this.firstSync<T>();
  }

  firstSync<T>(): T | null {
    const row = this.db.prepare(this.sql).get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    return this.execSync<T>();
  }

  async run(): Promise<{ results: never[]; success: true; meta: { changes: number } }> {
    const res = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(res.changes) } };
  }

  execSync<T>(): { results: T[]; success: true; meta: { changes: number } } {
    const stmt = this.db.prepare(this.sql);
    if (WRITES.test(this.sql) && !/\breturning\b/i.test(this.sql)) {
      const res = stmt.run(...this.params);
      return { results: [], success: true, meta: { changes: Number(res.changes) } };
    }
    const rows = stmt.all(...this.params) as T[];
    return {
      results: rows,
      success: true,
      meta: { changes: WRITES.test(this.sql) ? rows.length : 0 },
    };
  }
}

export class D1Shim {
  readonly raw: DatabaseSync;

  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec('PRAGMA foreign_keys = ON');
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      this.raw.exec(readFileSync(new URL(file, dir), 'utf8'));
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this.raw, sql);
  }

  async batch(statements: Statement[]) {
    this.raw.exec('BEGIN');
    try {
      const out = statements.map((s) => s.execSync());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}
