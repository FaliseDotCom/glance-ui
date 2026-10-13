// SQLite store (ADR-0002). Driver: Node's built-in `node:sqlite` ("Stability: 1.2 - Release candidate" in the Node
// v24.21.0 docs, read 2026-10-13). No native module to build. Everything that touches the driver lives in this file,
// so a future switch (e.g. to better-sqlite3) stays local.
//
// Schema migrations are forward-only (ADR-0003), tracked with PRAGMA user_version. A snapshot is taken before any
// migration runs. A database newer than the code is refused.

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  // 1: versions are full glance.yml snapshots (D-30); the draft is a single row (D-46).
  `CREATE TABLE versions (
     number      INTEGER PRIMARY KEY,
     created_at  TEXT NOT NULL,
     source      TEXT NOT NULL CHECK (source IN ('import', 'editor', 'outside')),
     text        TEXT NOT NULL,
     sha256      TEXT NOT NULL,
     changes     TEXT NOT NULL DEFAULT '[]',
     glance      TEXT NOT NULL,
     applied_at  TEXT,
     note        TEXT
   );
   CREATE TABLE draft (
     id            INTEGER PRIMARY KEY CHECK (id = 1),
     model_json    TEXT NOT NULL,
     base_text     TEXT NOT NULL,
     base_version  INTEGER,
     base_sha256   TEXT,
     ref_text      TEXT NOT NULL DEFAULT '',
     updated_at    TEXT NOT NULL
   );
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const DB_VERSION = MIGRATIONS.length;

export function openDb(dataDir: string, now: () => Date = () => new Date()): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "editor.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (current > DB_VERSION) {
    db.close();
    throw new Error(`The editor's database is version ${current}, newer than this editor (${DB_VERSION}). Restore the backup taken before the upgrade, or run the newer editor.`);
  }
  if (current < DB_VERSION) {
    if (current > 0) backup(db, dataDir, "pre-migration", now);
    db.exec("BEGIN");
    try {
      for (let v = current; v < DB_VERSION; v++) db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${DB_VERSION}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

/** ADR-0008 retention: 14 daily snapshots and 5 pre-migration snapshots. */
export const RETENTION = { daily: 14, "pre-migration": 5 } as const;

export function backup(db: Db, dataDir: string, kind: keyof typeof RETENTION, now: () => Date = () => new Date()): string {
  const dir = join(dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = now().toISOString().replaceAll(":", "-");
  const file = join(dir, `${kind}-${stamp}.sqlite`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${kind}-`)).sort();
  for (const old of mine.slice(0, Math.max(0, mine.length - RETENTION[kind]))) rmSync(join(dir, old));
  return file;
}
