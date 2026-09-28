import { useEffect, useState } from 'react';
import type { UsageResponse } from '../../../shared/usage';
import { Icon } from '../../components/Icon';
import { Button, Card, Notice, SectionTitle } from '../../components/ui';

async function fetchUsage(): Promise<UsageResponse | undefined> {
  try {
    const res = await fetch('/api/usage', { headers: { Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as UsageResponse) : undefined;
  } catch {
    return undefined;
  }
}

function Meter({ used, limit }: { used: number; limit: number }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  const tone = share >= 0.9 ? 'bg-rust' : share >= 0.7 ? 'bg-amber' : 'bg-moss';
  return (
    <div
      className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={used}
    >
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(2, share * 100)}%` }}
      />
    </div>
  );
}

/** Settings. First section: today's use of the free identification services. */
export function SettingsScreen() {
  const [usage, setUsage] = useState<UsageResponse | null>();
  useEffect(() => {
    void fetchUsage().then((u) => setUsage(u ?? null));
  }, []);
  const load = () => {
    setUsage(undefined);
    void fetchUsage().then((u) => setUsage(u ?? null));
  };

  return (
    <div className="space-y-4" data-testid="settings">
      <h1 className="pt-2 font-serif text-3xl font-bold">Settings</h1>

      <Card as="section" aria-labelledby="usage-title" data-testid="usage">
        <SectionTitle id="usage-title" eyebrow="Free services">
          Today’s identification usage
        </SectionTitle>
        {usage === undefined && <div className="skeleton h-24" aria-label="Loading usage" />}
        {usage === null && (
          <Notice tone="warn">Usage couldn’t be checked right now. Try again in a moment.</Notice>
        )}
        {usage?.mock && (
          <p className="text-ink-soft">Demo mode is on, so no free quota is being used.</p>
        )}
        {usage && !usage.mock && (
          <div className="space-y-5">
            <div data-testid="usage-plantnet">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">Plants · Pl@ntNet</p>
                {usage.plantnet && (
                  <p className="tabular-nums text-ink-soft">
                    {usage.plantnet.used} / {usage.plantnet.limit}
                  </p>
                )}
              </div>
              {usage.plantnet ? (
                <>
                  <Meter used={usage.plantnet.used} limit={usage.plantnet.limit} />
                  <p className="mt-1.5 text-sm text-ink-muted">
                    {usage.plantnet.remaining > 0
                      ? `${usage.plantnet.remaining} identifications left today.`
                      : 'Today’s limit is reached.'}{' '}
                    Resets at midnight UTC.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">Not available right now.</p>
              )}
            </div>
            {usage.bioclip && (
              <div data-testid="usage-bioclip">
                <p className="font-semibold">Animals, fungi & insects · BioCLIP 2</p>
                <p className="mt-1 text-sm text-ink-muted">{usage.bioclip.allowance}.</p>
                {usage.bioclip.quotaReachedAt ? (
                  <p className="mt-1.5 text-sm font-semibold text-rust">
                    Limit reached
                    {usage.bioclip.retryIn
                      ? ` · resets in about ${usage.bioclip.retryIn}`
                      : ' · resets within a day'}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-soft">
                    Available. Hugging Face doesn’t report how much is left, so you’ll see a message
                    here if today’s limit runs out.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
          <Icon name="refresh" className="h-4 w-4" /> Refresh
        </Button>
      </Card>

      <Card as="section" aria-labelledby="data-title">
        <SectionTitle id="data-title">Your data</SectionTitle>
        <p className="text-ink-soft">
          Your journal and photos are stored only on this device. You can clear them on the{' '}
          <a href="#/privacy" className="font-semibold text-moss underline">
            privacy page
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
