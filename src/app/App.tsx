import { Suspense, lazy, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { InstallPrompt } from '../components/InstallPrompt';
import { RankUpMoment } from '../components/RankUpMoment';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { BRAND } from '../config/brand';
import { HistoryScreen, ObservationScreen } from '../features/history/HistoryScreen';
import { HomeScreen, LocationReadout } from '../features/identification/HomeScreen';
import { IdentifyScreen } from '../features/identification/IdentifyScreen';
import { SessionProvider } from '../features/identification/SessionContext';
import { LocationProvider } from '../features/location/LocationContext';
import { OfflineQueueRunner } from '../features/offline/OfflineQueue';
import { useOnline } from '../lib/useOnline';
import { HealthProvider } from './health';
import { useRoute, type Route } from './router';

// Screens off the main photo path load on demand (the service worker still precaches them
// for offline use), which keeps the first download small.
const LiveScreen = lazy(() =>
  import('../features/live/LiveScreen').then((m) => ({ default: m.LiveScreen })),
);
const ListenScreen = lazy(() =>
  import('../features/listen/ListenScreen').then((m) => ({ default: m.ListenScreen })),
);
const SpeciesPageScreen = lazy(() =>
  import('../features/journal/SpeciesPage').then((m) => ({ default: m.SpeciesPageScreen })),
);
const PrivacyScreen = lazy(() =>
  import('../features/privacy/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
);
const SettingsScreen = lazy(() =>
  import('../features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

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

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'live':
      return <LiveScreen />;
    case 'listen':
      return <ListenScreen />;
    case 'identify':
      return <IdentifyScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'observation':
      return <ObservationScreen id={route.id} />;
    case 'species':
      return <SpeciesPageScreen speciesKey={route.key} />;
    case 'privacy':
      return <PrivacyScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export function App() {
  const route = useRoute();
  const online = useOnline();

  // Move focus to the main region on navigation so screen readers announce the new view.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <HealthProvider>
      <LocationProvider>
        <SessionProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-card focus:p-3"
          >
            Skip to content
          </a>
          <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4">
            <nav
              className="safe-top flex items-center justify-between gap-2 pb-1"
              aria-label="Main"
            >
              {route.name === 'home' ? (
                // The big title below already names the app, so this corner shows location status.
                <LocationReadout />
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
                  active={
                    route.name === 'history' ||
                    route.name === 'observation' ||
                    route.name === 'species'
                  }
                >
                  <Icon name="book" className="h-5 w-5" />
                  <span className="sr-only">Field Journal</span>
                </NavLink>
                <NavLink href="#/privacy" active={route.name === 'privacy'}>
                  <Icon name="info" className="h-5 w-5" />
                  <span className="sr-only sm:not-sr-only">About</span>
                </NavLink>
                <NavLink href="#/settings" active={route.name === 'settings'}>
                  <Icon name="settings" className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </NavLink>
              </div>
            </nav>
            {!online && (
              <div
                role="status"
                className="mb-2 flex items-center gap-2 rounded-2xl bg-toast px-4 py-2.5 text-white"
                data-testid="offline-banner"
              >
                <Icon name="offline" className="h-5 w-5" /> You’re offline. Photos can be saved and
                identified when you’re back online.
              </div>
            )}
            {/* Only on calm screens, never mid-identification or on the live camera. */}
            {(route.name === 'home' || route.name === 'history') && <InstallPrompt />}
            <main id="main" tabIndex={-1} className="flex-1 pb-10 outline-none">
              <Suspense fallback={<div className="skeleton mt-4 h-64" aria-label="Loading" />}>
                <Screen route={route} />
              </Suspense>
            </main>
            <footer className="safe-bottom border-t border-line pt-4 text-center text-sm text-ink-muted">
              {BRAND.name} is an identification aid.{' '}
              <a href="#/privacy" className="underline">
                Privacy
              </a>
            </footer>
          </div>
          <UpdatePrompt />
          {/* Checks only on home and history; never mid-identification or on live. */}
          <RankUpMoment />
          {/* Identifies photos saved without signal once back online. */}
          <OfflineQueueRunner />
        </SessionProvider>
      </LocationProvider>
    </HealthProvider>
  );
}
