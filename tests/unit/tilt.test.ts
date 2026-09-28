import { describe, expect, it } from 'vitest';
import { buildIdentifyForm, localHourOf } from '../../src/lib/api';
import { tiltBucket } from '../../src/lib/tilt';

describe('camera tilt buckets', () => {
  it('maps the phone’s front-to-back tilt to up, level or down', () => {
    expect(tiltBucket(90)).toBe('level'); // upright, camera on the horizon
    expect(tiltBucket(10)).toBe('down'); // nearly flat, camera at the ground
    expect(tiltBucket(-20)).toBe('down');
    expect(tiltBucket(150)).toBe('up'); // tipped back, camera at the canopy
    expect(tiltBucket(null)).toBeUndefined();
    expect(tiltBucket(-120)).toBeUndefined();
    // Landscape: beta isn't the camera's pitch.
    expect(tiltBucket(10, 90)).toBeUndefined();
  });
});

describe('identify request context', () => {
  const at = new Date(2026, 6, 1, 21, 30); // 9:30 pm on this device

  it('sends the local hour, whether it is approximate, and the tilt', () => {
    expect(localHourOf(at)).toBe(21.5);
    const camera = buildIdentifyForm(
      {
        observationId: 'o',
        category: 'auto',
        images: [],
        capturedAt: at,
        timeSource: 'device',
        tilt: 'down',
      },
      undefined,
    );
    expect(camera.get('localHour')).toBe('21.5');
    expect(camera.get('localHourApprox')).toBeNull();
    expect(camera.get('tilt')).toBe('down');

    const library = buildIdentifyForm(
      { observationId: 'o', category: 'auto', images: [], capturedAt: at, timeSource: 'photo' },
      undefined,
    );
    expect(library.get('localHourApprox')).toBe('1');
  });

  it('sends nothing extra when the capture time is unknown', () => {
    const form = buildIdentifyForm(
      { observationId: 'o', category: 'auto', images: [], capturedAt: at },
      undefined,
    );
    expect(form.get('localHour')).toBeNull();
    expect(form.get('tilt')).toBeNull();
  });
});
