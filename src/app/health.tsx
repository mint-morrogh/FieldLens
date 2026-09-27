import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CATEGORIES, getTarget, targetMembers } from '../../shared/categories';
import type { HealthResponse, IdentifyTarget } from '../../shared/types';
import { getHealth } from '../lib/api';

const HealthContext = createContext<HealthResponse | undefined>(undefined);

/** Fetches /api/health once and shares what the server can identify. */
export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse>();
  useEffect(() => {
    void getHealth().then(setHealth);
  }, []);
  return <HealthContext.Provider value={health}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthResponse | undefined {
  return useContext(HealthContext);
}

/** Whether a picker choice can be identified right now (falls back to the registry before health loads). */
export function isTargetAvailable(id: IdentifyTarget, health: HealthResponse | undefined): boolean {
  if (id === 'auto') return health ? health.autoDetect !== false : true;
  if (!health) return getTarget(id).available;
  return targetMembers(id).some((m) => health.supportedCategories.includes(m) && CATEGORIES[m]);
}
