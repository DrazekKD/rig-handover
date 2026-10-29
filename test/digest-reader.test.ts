import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('finds 5 jobs and 1 bad line, sorted by job', () => {
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
  });

  it('keeps the last failure and its error', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row with a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps times with the +01:00 offset', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });
});

describe('readNight edge cases', () => {
  let dir: string | undefined;
  const tmp = () => (dir = mkdtempSync(join(tmpdir(), 'rig-digest-')));
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns null for a missing night', () => {
    expect(readNight(tmp(), '2026-10-30')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
  });

  it('gives no rows for an empty file', () => {
    const d = tmp();
    writeFileSync(join(d, '2026-10-30.jsonl'), '');
    expect(readNight(d, '2026-10-30')).toEqual({
      night: '2026-10-30',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines missing fields as bad, skips blank lines, never throws', () => {
    const d = tmp();
    const lines = [
      '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      '{"job":"a","status":"ok"}',
      '{"at":"2026-10-30T02:00:00+01:00","job":"a","status":"weird"}',
      'null',
      '{"at":"2026-10-30T00:30:00+01:00","job":"a","status":"retry","owner":"y","error":"e"}',
    ];
    writeFileSync(join(d, '2026-10-30.jsonl'), lines.join('\n') + '\n');
    const n = readNight(d, '2026-10-30');
    expect(n?.badLines).toBe(3);
    expect(n?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(n?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T00:30:00+01:00',
        lastAt: '2026-10-30T01:00:00+01:00',
      },
    ]);
  });
});
