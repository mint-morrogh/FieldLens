import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useRoute } from '../app/router';
import { useSession } from '../features/identification/SessionContext';
import { Button } from './ui';

/**
 * Service-worker updates. A waiting new version is applied automatically when
 * it's safe — on the home, history or about screens with no identification in
 * progress — so installed copies never get stuck on an old build. During an
 * identification it waits and offers a Reload button instead of losing the photo.
 */
export function UpdatePrompt() {
  const route = useRoute();
  const { state } = useSession();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Check on launch and whenever the app comes back to the foreground, plus hourly.
      const check = () => void registration.update().catch(() => undefined);
      check();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 60 * 60 * 1000);
    },
  });

  const safeToReload = route.name !== 'identify' && state.images.length === 0 && !state.pending;
  useEffect(() => {
    if (needRefresh && safeToReload) void updateServiceWorker(true);
  }, [needRefresh, safeToReload, updateServiceWorker]);

  if (!needRefresh || safeToReload) return null;
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
