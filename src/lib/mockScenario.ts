/** Dev/demo helper: `?mock=low` selects a server fixture when the API runs in mock mode. */
const KEY = 'fieldlens.mockScenario';

export function initMockScenarioFromUrl(): void {
  try {
    const value = new URLSearchParams(window.location.search).get('mock');
    if (value) localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable */
  }
}

export function getMockScenario(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setMockScenario(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable */
  }
}

export const MOCK_SCENARIO_OPTIONS = [
  { id: 'high', label: 'High confidence' },
  { id: 'medium', label: 'Medium confidence' },
  { id: 'low', label: 'Low confidence' },
  { id: 'zero', label: 'No match' },
  { id: 'gbif-down', label: 'GBIF unavailable' },
  { id: 'inat-down', label: 'iNaturalist unavailable' },
  { id: 'quota', label: 'Quota exhausted' },
  { id: 'network', label: 'Provider down' },
  { id: 'timeout', label: 'Provider timeout' },
];
