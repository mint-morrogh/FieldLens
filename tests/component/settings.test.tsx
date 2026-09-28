import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';
import { SETTINGS_KEYS, getSetting, reloadSettings } from '../../src/lib/settings';

describe('SettingsScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadSettings();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ mock: true }), { status: 200 }))),
    );
  });

  it('toggles Name it first (off by default) and data saver', () => {
    render(<SettingsScreen />);
    const nameIt = screen.getByRole('switch', { name: /Name it first/ });
    expect(nameIt).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(nameIt);
    expect(nameIt).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(SETTINGS_KEYS.nameItFirst)).toBe('true');

    fireEvent.click(screen.getByRole('switch', { name: /Data saver/ }));
    expect(getSetting('dataSaver')).toBe(true);
  });

  it('chooses units and the default camera mode', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Imperial/ }));
    expect(getSetting('units')).toBe('imperial');
    fireEvent.click(screen.getByRole('button', { name: /Metric/ }));
    expect(getSetting('units')).toBe('metric');
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(getSetting('defaultCameraMode')).toBe('photo');
    expect(screen.getByRole('button', { name: 'Take a photo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('asks before clearing local data', async () => {
    localStorage.setItem('fieldlens.homePatch', 'x');
    render(<SettingsScreen />);
    fireEvent.click(screen.getByTestId('clear-data'));
    expect(localStorage.getItem('fieldlens.homePatch')).toBe('x');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByTestId('clear-data'));
    fireEvent.click(screen.getByTestId('clear-data-confirm'));
    await waitFor(() => expect(screen.getByText(/has been cleared/)).toBeInTheDocument());
    expect(localStorage.getItem('fieldlens.homePatch')).toBeNull();
  });
});
