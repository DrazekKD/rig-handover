import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const GOOD = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

// Written out of order on purpose: the reader sorts by job.
const goodLines = [
  { at: '2026-01-01T02:00:00+01:00', job: 'zeta/clean', status: 'ok', owner: 'rook' },
  { at: '2026-01-01T01:00:00+01:00', job: 'alpha/sync', status: 'ok', owner: 'lane-07' },
  { at: '2026-01-01T03:00:00+01:00', job: 'mid/build', status: 'fail', owner: null, error: 'boom' },
]
  .map((l) => JSON.stringify(l))
  .join('\n');
const badLines = [
  JSON.stringify({ at: '2026-01-03T01:00:00+01:00', job: 'alpha/sync', status: 'ok', owner: 'rook' }),
  'this is not json',
].join('\n');

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${GOOD}.jsonl`), `${goodLines}\n`);
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(dir, `${BAD}.jsonl`), `${badLines}\n`);
  app = createApp({ ...config, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders the table for a good night', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${GOOD}`);
    expect(html).toContain('bad lines: 0');
    expect(html).toContain('<table');
    expect(html).toContain('alpha/sync');
    expect(html).toContain('boom');
  });

  it('answers 404 with a message for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no digest for ${MISSING}`);
  });

  it('says nothing ran for the empty night, without a table', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('shows the bad line count', async () => {
    const res = await app.request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('bad lines: 1');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync', 'mid/build', 'zeta/clean']);
  });

  it('answers 404 with an error object for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: MISSING });
  });

  it('returns empty rows for the empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('reports the bad line count', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as DigestNight;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBe(3);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
