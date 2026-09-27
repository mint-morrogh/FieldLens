import { describe, expect, it } from 'vitest';
import { buildRows } from '../../src/features/identification/AnalysisProgress';
import { readNdjson } from '../../src/lib/api';
import { mergeImages } from '../../src/features/results/Gallery';

describe('readNdjson', () => {
  it('parses complete lines and keeps partial ones for later', () => {
    const text = '{"a":1}\n{"b":2}\n{"c":';
    const first = readNdjson(text, 0);
    expect(first.lines).toEqual([{ a: 1 }, { b: 2 }]);
    const more = readNdjson(text + '3}\n', first.next);
    expect(more.lines).toEqual([{ c: 3 }]);
  });
});

describe('analysis checklist', () => {
  const base = { phase: 'identifying' as const, fraction: 1, stages: {} };
  it('marks upload done and the next stage active once the server starts', () => {
    const rows = buildRows({ ...base, stages: { identify: 'active' } }, 'Pl@ntNet', true);
    expect(rows.map((r) => r.state)).toEqual([
      'done',
      'active',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(rows[1].source).toBe('Pl@ntNet');
  });
  it('shows skipped location and finishes when every stage reports', () => {
    const rows = buildRows(
      {
        ...base,
        stages: {
          identify: 'done',
          taxonomy: 'done',
          occurrence: 'skipped',
          rank: 'done',
          enrich: 'done',
        },
      },
      'Pl@ntNet',
      false,
    );
    expect(rows.every((r) => r.state === 'done' || r.state === 'skipped')).toBe(true);
    expect(rows.find((r) => r.key === 'occurrence')?.note).toBe('Location not used');
  });
  it('shows upload progress while uploading', () => {
    const rows = buildRows({ phase: 'uploading', fraction: 0.42, stages: {} }, 'Pl@ntNet', true);
    expect(rows[0]).toMatchObject({ state: 'active', note: '42%' });
    expect(rows[1].state).toBe('pending');
  });
});

describe('mergeImages', () => {
  it('dedupes by URL and keeps order', () => {
    const a = { url: 'x', source: 's' };
    const b = { url: 'y', source: 's' };
    expect(mergeImages([a, b], [a], undefined).map((i) => i.url)).toEqual(['x', 'y']);
  });
});
