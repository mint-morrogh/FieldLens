import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllLocalData } from '../../src/features/history/historyStore';
import {
  SETTINGS_KEYS,
  defaultUnits,
  getSetting,
  getSettings,
  reloadSettings,
  setSetting,
  uploadEncoding,
  useSettings,
} from '../../src/lib/settings';
import {
  formatAreaSize,
  formatDistance,
  formatMass,
  localizeMeasurements,
} from '../../src/lib/units';

describe('defaultUnits', () => {
  it('is imperial for the US and metric elsewhere', () => {
    expect(defaultUnits(['en-US'])).toBe('imperial');
    expect(defaultUnits(['es-US', 'en'])).toBe('imperial');
    expect(defaultUnits(['en-GB'])).toBe('metric');
    expect(defaultUnits(['en-CA'])).toBe('metric');
    expect(defaultUnits(['fr-FR'])).toBe('metric');
    expect(defaultUnits(['de'])).toBe('metric');
    expect(defaultUnits([])).toBe('metric');
  });
});

describe('settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadSettings();
  });
  afterEach(() => vi.restoreAllMocks());

  it('has sane defaults', () => {
    const s = getSettings();
    expect(s.nameItFirst).toBe(false);
    expect(s.dataSaver).toBe(false);
    expect(s.defaultCameraMode).toBe('live');
    expect(['metric', 'imperial']).toContain(s.units);
  });

  it('persists under fieldlens.* keys', () => {
    setSetting('nameItFirst', true);
    setSetting('units', 'imperial');
    setSetting('defaultCameraMode', 'photo');
    expect(localStorage.getItem(SETTINGS_KEYS.nameItFirst)).toBe('true');
    expect(localStorage.getItem('fieldlens.settings.units')).toBe('imperial');
    reloadSettings();
    expect(getSetting('nameItFirst')).toBe(true);
    expect(getSetting('units')).toBe('imperial');
    expect(getSetting('defaultCameraMode')).toBe('photo');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem(SETTINGS_KEYS.units, 'furlongs');
    localStorage.setItem(SETTINGS_KEYS.dataSaver, 'yes');
    reloadSettings();
    expect(['metric', 'imperial']).toContain(getSetting('units'));
    expect(getSetting('dataSaver')).toBe(false);
  });

  it('works for the session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    reloadSettings();
    expect(getSetting('dataSaver')).toBe(false);
    setSetting('dataSaver', true);
    expect(getSetting('dataSaver')).toBe(true);
  });

  it('notifies hooks and resets when local data is cleared', async () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.dataSaver).toBe(false);
    act(() => setSetting('dataSaver', true));
    expect(result.current.dataSaver).toBe(true);
    await act(() => clearAllLocalData());
    expect(result.current.dataSaver).toBe(false);
    expect(localStorage.getItem(SETTINGS_KEYS.dataSaver)).toBeNull();
  });

  it('uses smaller uploads with data saver', () => {
    expect(uploadEncoding(false).maxEdge).toBe(1600);
    expect(uploadEncoding(true).maxEdge).toBeLessThan(1600);
    expect(uploadEncoding(true).quality).toBeLessThan(uploadEncoding(false).quality);
  });
});

describe('units', () => {
  it('formats distances and masses', () => {
    expect(formatDistance(10, 'metric')).toBe('10 km');
    expect(formatDistance(10, 'imperial')).toBe('6.2 mi');
    expect(formatDistance(50, 'imperial')).toBe('31 mi');
    expect(formatAreaSize(10, 'imperial')).toBe('6 miles');
    expect(formatMass(450, 'metric')).toBe('450 g');
    expect(formatMass(450, 'imperial')).toBe('16 oz');
    expect(formatMass(5200, 'imperial')).toBe('11 lb');
  });

  it('rewrites metric server text for imperial', () => {
    expect(localizeMeasurements('about 5.2 kg', 'imperial')).toBe('about 11 lb');
    expect(localizeMeasurements('about 23 g', 'imperial')).toBe('about 0.8 oz');
    expect(localizeMeasurements('about 1,200 kg', 'imperial')).toBe('about 2,646 lb');
    expect(localizeMeasurements('about 5.2 kg', 'metric')).toBe('about 5.2 kg');
    expect(localizeMeasurements('Insects and seeds', 'imperial')).toBe('Insects and seeds');
  });
});
