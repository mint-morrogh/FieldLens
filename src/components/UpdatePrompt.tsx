import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/**
 * Service-worker update flow: a new version waits until the user chooses to
 * reload. Sits below full-screen dialogs (camera/crop) so it never covers them.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates hourly while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-white shadow-lg"
    >
      <p className="flex-1">A new version is available.</p>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="!text-white"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </Button>
    </div>
  );
}
