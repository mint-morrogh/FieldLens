import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorCopy } from '../../src/features/identification/IdentifyScreen';
import { LocationPanel } from '../../src/features/identification/HomeScreen';
import { SessionProvider, useSession } from '../../src/features/identification/SessionContext';
import { LocationProvider } from '../../src/features/location/LocationContext';
import {
  clearObservations,
  listObservations,
  saveObservation,
  toRecord,
} from '../../src/features/history/historyStore';
import { ClientError } from '../../src/lib/api';
import { mockResult } from './fixtures';

function mockGeolocation(result: 'granted' | 'denied') {
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, error?: PositionErrorCallback | null) => {
      if (result === 'granted')
        success({ coords: { latitude: 46.2382, longitude: -63.1311 } } as GeolocationPosition);
      else error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    },
  );
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

describe('location permission', () => {
  beforeEach(() => localStorage.clear());

  const renderPanel = () =>
    render(
      <LocationProvider>
        <LocationPanel />
      </LocationProvider>,
    );

  it('asks for location automatically on first open', async () => {
    const get = mockGeolocation('granted');
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('location-status')).toHaveTextContent('Location: Ready'),
    );
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shows a denied state and never re-prompts after a denial', async () => {
    const get = mockGeolocation('denied');
    const { unmount } = renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('location-status')).toHaveTextContent('Location not used'),
    );
    unmount();
    renderPanel();
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Allow Location' })).not.toBeInTheDocument();
  });

  it('re-asks on later visits if previously granted (Safari resets permission)', async () => {
    localStorage.setItem('fieldlens.locationChoice', 'granted');
    const get = mockGeolocation('granted');
    renderPanel();
    await waitFor(() => expect(get).toHaveBeenCalled());
  });

  it('respects an explicit "Not Now" from an earlier visit', () => {
    localStorage.setItem('fieldlens.locationChoice', 'declined');
    const get = mockGeolocation('granted');
    renderPanel();
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use location' })).toBeInTheDocument();
  });
});

describe('session loading state', () => {
  it('moves through submitting to a result', async () => {
    const result = await mockResult('high');
    let resolve!: (v: Response) => void;
    // Replace XHR-based identify with a controllable stub.
    const api = await import('../../src/lib/api');
    const spy = vi
      .spyOn(api, 'identify')
      .mockImplementation(() => new Promise((r) => (resolve = (v) => r(v as never))) as never);

    let session!: ReturnType<typeof useSession>;
    function Probe() {
      session = useSession();
      return <p data-testid="step">{session.state.step}</p>;
    }
    render(
      <LocationProvider>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </LocationProvider>,
    );
    act(() => session.photoSelected(new Blob(['x'], { type: 'image/jpeg' })));
    expect(screen.getByTestId('step')).toHaveTextContent('crop');
    const image = { id: 'i', blob: new Blob(['x']), url: 'blob:i', feature: 'leaf' };
    act(() => void session.submit([image]));
    expect(screen.getByTestId('step')).toHaveTextContent('submitting');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await act(async () => resolve(result as never));
    await waitFor(() => expect(screen.getByTestId('step')).toHaveTextContent('result'));
    spy.mockRestore();
  });
});

describe('error copy', () => {
  it.each([
    ['offline', 'You’re offline.'],
    ['rate_limited', 'Let’s take a short break.'],
    ['provider_quota_exhausted', 'at capacity'],
    ['provider_timeout', 'That took too long.'],
    ['not_configured', 'isn’t set up'],
    ['internal_error', 'Something went wrong.'],
  ] as const)('%s', (code, title) => {
    expect(errorCopy(new ClientError(code, 'msg')).title).toContain(title);
  });
  it('keeps the photo for offline errors', () => {
    expect(errorCopy(new ClientError('offline', '')).body).toContain('Your photo is still here.');
  });
});

describe('local history', () => {
  beforeEach(() => clearObservations());

  it('saves results without coordinates and lists newest first', async () => {
    const result = await mockResult('high');
    expect(result.location.approx).toBeDefined();
    await saveObservation(toRecord('a', result, undefined, new Date('2026-01-01')));
    await saveObservation(
      toRecord('b', await mockResult('low'), undefined, new Date('2026-02-01')),
    );
    const records = await listObservations();
    expect(records.map((r) => r.id)).toEqual(['b', 'a']);
    const saved = records[1];
    expect(saved.result.location.approx).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain('46.24');
    expect(saved.locationLabel).toBe('46.2°N, 63.1°W');
    expect(saved.top?.scientificName).toBe('Acer rubrum');
  });
});
