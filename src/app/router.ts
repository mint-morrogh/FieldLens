import { useSyncExternalStore } from 'react';

/**
 * Tiny hash router. Hash routes need no server rewrites, which keeps static
 * hosting and the PWA offline shell simple.
 */
export type Route =
  | { name: 'home' }
  | { name: 'identify' }
  | { name: 'live' }
  | { name: 'listen' }
  | { name: 'history' }
  | { name: 'observation'; id: string }
  /** A species' Field Journal page, keyed by its lower-case scientific name. */
  | { name: 'species'; key: string }
  | { name: 'privacy' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/identify') return { name: 'identify' };
  if (path === '/live') return { name: 'live' };
  if (path === '/listen') return { name: 'listen' };
  if (path === '/history') return { name: 'history' };
  if (path === '/privacy') return { name: 'privacy' };
  if (path === '/settings') return { name: 'settings' };
  const obs = path.match(/^\/history\/([A-Za-z0-9_-]+)$/);
  if (obs) return { name: 'observation', id: obs[1] };
  const species = path.match(/^\/journal\/([^/]+)$/);
  if (species) {
    try {
      return { name: 'species', key: decodeURIComponent(species[1]).toLowerCase() };
    } catch {
      return { name: 'history' };
    }
  }
  return { name: 'home' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'observation':
      return `#/history/${route.id}`;
    case 'species':
      return `#/journal/${encodeURIComponent(route.key)}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const href = routeHref(route);
  if (options.replace) window.location.replace(href);
  else window.location.hash = href;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return parseRoute(hash);
}
