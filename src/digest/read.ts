import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight, RunStatus, StatusCounts } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

/** Parses one log line; null when it is not JSON or lacks a valid at/job/status. */
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || typeof job !== 'string' || job === '') return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) return null;
  return {
    at,
    time,
    job,
    status: status as RunStatus,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  const byJob = new Map<string, { row: DigestRow; firstTime: number; lastTime: number }>();

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const seen = byJob.get(line.job);
    if (!seen) {
      byJob.set(line.job, {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          lastError: line.error,
          firstAt: line.at,
          lastAt: line.at,
        },
        firstTime: line.time,
        lastTime: line.time,
      });
      continue;
    }
    seen.row.runs++;
    if (line.status === 'retry') seen.row.retries++;
    if (line.time < seen.firstTime) {
      seen.firstTime = line.time;
      seen.row.firstAt = line.at;
    }
    // Ties go to the later line in the file.
    if (line.time >= seen.lastTime) {
      seen.lastTime = line.time;
      seen.row.lastAt = line.at;
      seen.row.lastStatus = line.status;
      seen.row.lastError = line.error;
      seen.row.owner = line.owner;
    }
  }

  const rows = [...byJob.values()]
    .map((s) => s.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts } satisfies DigestNight;
};
