import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from '../../src/features/identification/SessionContext';
import { LocationProvider } from '../../src/features/location/LocationContext';
import {
  OfflineQueueRunner,
  QueueIndicator,
  SaveForLater,
} from '../../src/features/offline/OfflineQueue';
import {
  enqueue,
  getQueued,
  listQueued,
  removeQueued,
  resetQueueMemory,
  toQueued,
} from '../../src/features/offline/queueStore';
import * as api from '../../src/lib/api';
import { mockResult } from './fixtures';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

async function queuePhoto(id: string, second = 0) {
  await enqueue(
    toQueued(
      {
        observationId: id,
        category: 'plant',
        images: [{ blob: new Blob(['x'], { type: 'image/jpeg' }), feature: 'leaf' }],
        capturedAt: new Date(Date.UTC(2026, 8, 20, 15, 0, second)),
      },
      undefined,
      new Date(Date.UTC(2026, 8, 20, 16, 0, second)),
    ),
  );
}

beforeEach(async () => {
  localStorage.clear();
  resetQueueMemory();
  for (const item of await listQueued()) await removeQueued(item.id);
});

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
  delete (window as { Notification?: unknown }).Notification;
});

describe('queue indicator', () => {
  it('shows how many photos are waiting for signal, and lets them be removed', async () => {
    setOnline(false);
    await queuePhoto('a', 1);
    await queuePhoto('b', 2);
    render(<QueueIndicator />);
    const summary = await screen.findByTestId('queue-summary');
    expect(summary).toHaveTextContent('2 photos waiting for signal');
    expect(screen.queryByRole('button', { name: 'Try now' })).not.toBeInTheDocument();

    await userEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    const rows = screen.getAllByTestId('queue-item');
    expect(rows).toHaveLength(2);
    await userEvent.click(within(rows[0]).getByRole('button', { name: /^Remove photo from/ }));
    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(screen.getByTestId('queue-summary')).toHaveTextContent('1 photo waiting for signal'),
    );
    expect(await getQueued('a')).toBeUndefined();
  });

  it('offers to try now when back online, and is hidden when the queue is empty', async () => {
    setOnline(true);
    const { container } = render(<QueueIndicator />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
    await act(() => queuePhoto('c'));
    expect(await screen.findByTestId('queue-summary')).toHaveTextContent(
      '1 saved photo waiting to be identified',
    );
    expect(screen.getByRole('button', { name: 'Try now' })).toBeInTheDocument();
  });
});

describe('saving for later', () => {
  let session!: ReturnType<typeof useSession>;
  function Harness() {
    session = useSession();
    const { error } = session.state;
    return error ? <SaveForLater error={error} /> : <p>{session.state.step}</p>;
  }
  const renderHarness = () =>
    render(
      <LocationProvider>
        <SessionProvider>
          <Harness />
        </SessionProvider>
      </LocationProvider>,
    );
  const image = () => ({ id: 'i', blob: new Blob(['x']), url: 'blob:i', feature: 'leaf' as const });

  it('saves automatically when offline and offers a silent notification once', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(function Notification() {}, {
        permission: 'default',
        requestPermission,
      }),
    });
    setOnline(false);
    renderHarness();
    await act(() => session.submit([image()], { locationChoice: 'none' }));
    expect(await screen.findByTestId('saved-for-later')).toHaveTextContent('Saved on this device');
    const queued = await getQueued(session.state.observationId);
    expect(queued?.status).toBe('waiting');
    expect(queued?.location).toBeUndefined();

    expect(screen.getByTestId('notify-offer')).toHaveTextContent('silent notification');
    await userEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('notify-offer')).not.toBeInTheDocument());
    expect(localStorage.getItem('fieldlens.queueNotifyAsked')).toBe('1');
  });

  it('offers to save after a network error', async () => {
    setOnline(true);
    vi.spyOn(api, 'identify').mockRejectedValue(new api.ClientError('network', 'No reach.'));
    renderHarness();
    await act(() => session.submit([image()], { locationChoice: 'none' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Save and identify when back online' }),
    );
    expect(await screen.findByTestId('saved-for-later')).toBeInTheDocument();
    const queued = await getQueued(session.state.observationId);
    // Just failed on a weak connection: not retried straight away.
    expect(queued?.nextAttemptAt).toBeGreaterThan(Date.now());
  });
});

describe('queue runner', () => {
  it('identifies waiting photos on start and shows a quiet toast', async () => {
    setOnline(true);
    const result = await mockResult('high');
    const identify = vi.spyOn(api, 'identify').mockResolvedValue(result);
    await queuePhoto('later');
    render(<OfflineQueueRunner />);
    const toast = await screen.findByTestId('queue-toast');
    expect(toast).toHaveTextContent('Saved photo identified: Red Maple');
    expect(within(toast).getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '#/history/later',
    );
    expect(identify).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await getQueued('later')).toBeUndefined());
    await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('queue-toast')).not.toBeInTheDocument();
  });
});
