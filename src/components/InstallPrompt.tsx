import { BRAND } from '../config/brand';
import { captureInstallEvents, useInstallPrompt } from '../lib/installPrompt';
import { Icon } from './Icon';
import { Button } from './ui';

// Chrome can fire beforeinstallprompt before React mounts, so listen as soon as this loads.
if (typeof window !== 'undefined') captureInstallEvents();

/**
 * A small, dismissible "Add to your home screen" card, shown from the second identification
 * onward. Non-blocking and silent; the fade respects reduced motion (see .fade-up).
 */
export function InstallPrompt() {
  const { offer, install, dismiss } = useInstallPrompt();
  if (!offer) return null;

  return (
    <aside
      aria-labelledby="install-prompt-title"
      data-testid="install-prompt"
      className="fade-up mb-3 flex items-start gap-3 rounded-2xl border border-line bg-card p-3 pl-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
    >
      <Icon name="leaf" className="mt-0.5 h-6 w-6 shrink-0 text-moss" />
      <div className="min-w-0 flex-1">
        <p id="install-prompt-title" className="font-semibold text-ink">
          Add {BRAND.name} to your home screen
        </p>
        {offer === 'native' ? (
          <p className="text-[0.95rem] text-ink-soft">
            It opens full-screen, like an app, and is one tap away in the field.
          </p>
        ) : (
          <p className="text-[0.95rem] text-ink-soft">
            Tap{' '}
            <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
              Share <Icon name="share" className="inline h-4 w-4" />
            </span>{' '}
            in Safari’s toolbar, then{' '}
            <span className="font-semibold text-ink">Add to Home Screen</span>. It opens
            full-screen, like an app.
          </p>
        )}
        {offer === 'native' && (
          <Button size="sm" className="mt-2" onClick={() => void install()}>
            Install
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss home screen suggestion"
        className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-paper-deep"
      >
        <Icon name="close" className="h-5 w-5" />
      </button>
    </aside>
  );
}
