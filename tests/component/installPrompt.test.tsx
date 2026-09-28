import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from '../../src/components/InstallPrompt';
import { DONE_KEY, USES_KEY, _resetInstallPromptForTests } from '../../src/lib/installPrompt';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

describe('InstallPrompt (iOS Safari)', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetInstallPromptForTests();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
  });
  afterEach(() => vi.restoreAllMocks());

  it('stays hidden after only one use', () => {
    localStorage.setItem(USES_KEY, '1');
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
  });

  it('shows Share instructions from the second use and can be dismissed for good', () => {
    localStorage.setItem(USES_KEY, '2');
    const { unmount } = render(<InstallPrompt />);
    const card = screen.getByRole('complementary', { name: /add fieldlens to your home screen/i });
    expect(card).toHaveTextContent(/Share/);
    expect(card).toHaveTextContent(/Add to Home Screen/);
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss home screen suggestion/i }));
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
    expect(localStorage.getItem(DONE_KEY)).toBe('dismissed');

    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).not.toBeInTheDocument();
  });
});
