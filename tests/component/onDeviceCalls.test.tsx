import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnDevicePrompt } from '../../src/features/listen/birdnet/OnDevicePrompt';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';
import { getSetting, reloadSettings } from '../../src/lib/settings';

/** Empty Cache Storage: the model isn't downloaded. */
const emptyCaches = {
  open: async () => ({ match: async () => undefined, put: async () => undefined }),
  delete: async () => true,
};

describe('Identify bird calls on this device', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadSettings();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ mock: true }), { status: 200 }))),
    );
    vi.stubGlobal('caches', emptyCaches);
    vi.stubGlobal('Worker', class {});
  });

  it('is off by default; turning it on offers the download with its size and the licence', async () => {
    render(<SettingsScreen />);
    const toggle = screen.getByRole('switch', { name: /Identify bird calls on this device/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('birdnet-model')).toBeNull();

    fireEvent.click(toggle);
    expect(getSetting('onDeviceCalls')).toBe(true);
    expect(
      await screen.findByRole('button', { name: 'Download Model (82 MB)' }),
    ).toBeInTheDocument();
    const credit = screen.getByTestId('birdnet-credit');
    expect(credit).toHaveTextContent(/Cornell Lab of Ornithology/);
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    );
  });

  it('the Calls screen offers the download when the model isn’t on the phone', async () => {
    const { unmount } = render(<OnDevicePrompt busy={false} />);
    expect(await screen.findByTestId('birdnet-prompt')).toHaveTextContent(
      'Identify calls on this phone',
    );
    expect(screen.getByRole('button', { name: 'Download (82 MB)' })).toBeInTheDocument();

    // "Not now" hides it for this visit; next time it's a one-line reminder.
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('birdnet-prompt')).toBeNull();
    unmount();
    render(<OnDevicePrompt busy={false} />);
    const compact = await screen.findByTestId('birdnet-prompt-compact');
    expect(compact).toHaveTextContent('Download (82 MB)');
    expect(getSetting('onDeviceCalls')).toBe(false);

    // Choosing to download turns the feature on.
    await act(async () => fireEvent.click(compact));
    expect(getSetting('onDeviceCalls')).toBe(true);
  });

  it('stays out of the way while recording', async () => {
    render(<OnDevicePrompt busy />);
    await act(async () => undefined);
    expect(screen.queryByTestId('birdnet-prompt')).toBeNull();
  });
});
