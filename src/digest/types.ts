/** Status of one run line in `runs/<night>.jsonl`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  /** Owner from the latest line for the job. `null` is kept; views show '—'. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines with status 'retry'. */
  retries: number;
  /** Status of the latest line by `at`. */
  lastStatus: RunStatus;
  /** `error` of the latest line, else null. */
  lastError: string | null;
  /** `at` exactly as in the log (keeps the offset). */
  firstAt: string;
  lastAt: string;
};

/** Lines per status. */
export type StatusCounts = { ok: number; retry: number; fail: number };

export type DigestNight = {
  /** YYYY-MM-DD */
  night: string;
  /** Sorted by job (ascending), so page and JSON agree. */
  rows: DigestRow[];
  /** Lines that did not parse or lacked at/job/status. Blank lines are not counted. */
  badLines: number;
  counts: StatusCounts;
};

/**
 * Reads `runs/<night>.jsonl`.
 * Returns null when the file does not exist (or the night is not YYYY-MM-DD);
 * an empty file gives rows: [], badLines: 0.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
