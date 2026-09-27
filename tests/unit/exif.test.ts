// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseExif, parseExifDate } from '../../src/lib/exif';

const fixture = (name: string) => {
  const buf = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures', name),
  );
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('EXIF reader', () => {
  it('reads GPS and capture date from a JPEG', () => {
    const meta = parseExif(fixture('gps.jpg'));
    expect(meta.latitude).toBeCloseTo(46.2382, 3);
    expect(meta.longitude).toBeCloseTo(-63.1311, 3);
    expect(meta.takenAt?.getFullYear()).toBe(2026);
    expect(meta.takenAt?.getMonth()).toBe(6);
  });
  it('returns nothing for images without EXIF or non-JPEGs', () => {
    expect(parseExif(fixture('leaf.png'))).toEqual({});
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({});
  });
  it('parses EXIF dates and rejects junk', () => {
    expect(parseExifDate('2026:09:21 14:05:33')?.getDate()).toBe(21);
    expect(parseExifDate('0000:00:00 00:00:00')).toBeUndefined();
    expect(parseExifDate('garbage')).toBeUndefined();
  });
});
