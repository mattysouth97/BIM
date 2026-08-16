// src/lib/bim/model/transactions.ts
// Begin → mutate → commit. Undo restores the previous snapshot.

import type { BimModelSnapshot } from "./types";

export interface BimTransaction {
  id: string;
  name: string;
  timestamp: number;
  before: BimModelSnapshot;
  after: BimModelSnapshot;
}

export interface TransactionLog {
  past: BimTransaction[];
  future: BimTransaction[];
}

export const EMPTY_LOG: TransactionLog = { past: [], future: [] };

const CAP = 50;

export function beginCommit(
  log: TransactionLog,
  name: string,
  before: BimModelSnapshot,
  after: BimModelSnapshot,
): TransactionLog {
  if (before === after) return log;
  const tx: BimTransaction = {
    id: `tx-${Date.now()}-${log.past.length}`,
    name,
    timestamp: Date.now(),
    before,
    after,
  };
  return {
    past: [...log.past.slice(-(CAP - 1)), tx],
    future: [],
  };
}

export function undo(log: TransactionLog): {
  log: TransactionLog;
  model: BimModelSnapshot | null;
} {
  if (log.past.length === 0) return { log, model: null };
  const tx = log.past[log.past.length - 1];
  return {
    log: { past: log.past.slice(0, -1), future: [tx, ...log.future] },
    model: tx.before,
  };
}

export function redo(log: TransactionLog): {
  log: TransactionLog;
  model: BimModelSnapshot | null;
} {
  if (log.future.length === 0) return { log, model: null };
  const tx = log.future[0];
  return {
    log: { past: [...log.past, tx], future: log.future.slice(1) },
    model: tx.after,
  };
}

export function lastCommandName(log: TransactionLog): string | null {
  return log.past[log.past.length - 1]?.name ?? null;
}
