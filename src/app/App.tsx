import { useEffect, useState } from 'react';
import type { HealthResponse } from '../../shared/types';
import { Icon } from '../components/Icon';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { BRAND } from '../config/brand';
import { HistoryScreen, ObservationScreen } from '../features/history/HistoryScreen';
import { HomeScreen } from '../features/identification/HomeScreen';
import { IdentifyScreen } from '../features/identification/IdentifyScreen';
import { SessionProvider } from '../features/identification/SessionContext';
import { LocationProvider } from '../features/location/LocationContext';
import { PrivacyScreen } from '../features/privacy/PrivacyScreen';
import { getHealth } from '../lib/api';
import { useOnline } from '../lib/useOnline';
import { useRoute, type Route } from './router';

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold ${active ? 'bg-moss-soft text-moss-dark' : 'text-ink-soft hover:bg-paper-deep'}`}
    >
      {children}
    </a>
  );
}

function Screen({ route, health }: { route: Route; health?: HealthResponse }) {
  switch (route.name) {
    case 'identify':
      return <IdentifyScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'observation':
      return <ObservationScreen id={route.id} />;
    case 'privacy':
      return <PrivacyScreen />;
    default:
      return <HomeScreen health={health} />;
  }
}

export function App() {
  const route = useRoute();
  const online = useOnline();
  const [health, setHealth] = useState<HealthResponse>();

  useEffect(() => {
    void getHealth().then(setHealth);
  }, []);

  // Move focus to the main region on navigation so screen readers announce the new view.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <LocationProvider>
      <SessionProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-card focus:p-3"
        >
          Skip to content
        </a>
        <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4">
          <nav className="safe-top flex items-center justify-between gap-2 pb-1" aria-label="Main">
            {route.name === 'home' ? (
              // The big title below already names the app; a lone logo here looked like a placeholder.
              <span aria-hidden />
            ) : (
              <a
                href="#/"
                className="flex min-h-11 items-center gap-2 font-serif text-lg font-bold text-moss-dark"
                aria-label={`${BRAND.name} home`}
              >
                <Icon name="leaf" className="h-6 w-6" /> {BRAND.name}
              </a>
            )}
            <div className="flex gap-1">
              <NavLink
                href="#/history"
                active={route.name === 'history' || route.name === 'observation'}
              >
                <Icon name="history" className="h-5 w-5" /> History
              </NavLink>
              <NavLink href="#/privacy" active={route.name === 'privacy'}>
                <Icon name="info" className="h-5 w-5" /> About
              </NavLink>
            </div>
          </nav>
          {!online && (
            <div
              role="status"
              className="mb-2 flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-white"
              data-testid="offline-banner"
            >
              <Icon name="offline" className="h-5 w-5" /> You’re offline. Identification needs a
              connection.
            </div>
          )}
          <main id="main" tabIndex={-1} className="flex-1 pb-10 outline-none">
            <Screen route={route} health={health} />
          </main>
          <footer className="safe-bottom border-t border-line pt-4 text-center text-sm text-ink-muted">
            {BRAND.name} is an identification aid.{' '}
            <a href="#/privacy" className="underline">
              Privacy
            </a>
          </footer>
        </div>
        <UpdatePrompt />
      </SessionProvider>
    </LocationProvider>
  );
}
