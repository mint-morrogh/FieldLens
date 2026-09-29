import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      await screen.findByRole('button', { name: 'Download Model (60 MB)' }),
    ).toBeInTheDocument();
    const credit = screen.getByTestId('birdnet-credit');
    expect(credit).toHaveTextContent(/Cornell Lab of Ornithology/);
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    );
  });
});
