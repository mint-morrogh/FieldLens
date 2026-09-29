import { useEffect, useState } from 'react';
import type { UsageResponse } from '../../../shared/usage';
import { Icon } from '../../components/Icon';
import { Button, Card, Chip, Notice, SectionTitle } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { setSetting, useSettings, type CameraMode, type Units } from '../../lib/settings';
import { clearAllLocalData } from '../history/historyStore';
import { OnDeviceModel } from '../listen/birdnet/OnDeviceModel';

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

/** An on/off setting: the whole row is the switch. */
function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={`${id}-desc`}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 py-1 text-left"
      data-testid={`setting-${id}`}
    >
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        <span id={`${id}-desc`} className="mt-0.5 block text-sm text-ink-muted">
          {description}
        </span>
      </span>
      <span
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-moss' : 'bg-paper-deep ring-1 ring-line'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

/** A small set of choices, one selected. */
function Choice<T extends string>({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div data-testid={`setting-${id}`}>
      <p id={`${id}-label`} className="font-semibold text-ink">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <Chip key={o.value} selected={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Clear everything on this device, after a confirm step. */
function ClearData() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  if (step === 'done') {
    return (
      <Notice role="status">All local {BRAND.name} data on this device has been cleared.</Notice>
    );
  }
  if (step === 'confirm') {
    return (
      <div className="rounded-2xl border border-rust/30 bg-rust-soft p-4" role="alert">
        <p className="font-semibold text-rust">Clear everything on this device?</p>
        <p className="mt-1 text-sm text-ink-soft">
          Your Field Journal, photos, home patch and these settings will be removed. This can’t be
          undone.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => void clearAllLocalData().then(() => setStep('done'))}
            data-testid="clear-data-confirm"
          >
            Yes, Clear Everything
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStep('idle')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Button variant="danger" size="sm" onClick={() => setStep('confirm')} data-testid="clear-data">
      Clear Local Data
    </Button>
  );
}

/** Settings: today's use of the free identification services, then the app's own settings. */
export function SettingsScreen() {
  const settings = useSettings();
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

      <Card as="section" aria-labelledby="identify-title" data-testid="identify-settings">
        <SectionTitle id="identify-title">Identifying</SectionTitle>
        <div className="space-y-5">
          <Choice<CameraMode>
            id="camera-mode"
            label="Default camera mode"
            description="The main button on the home screen."
            value={settings.defaultCameraMode}
            options={[
              { value: 'live', label: 'Live identify' },
              { value: 'photo', label: 'Take a photo' },
            ]}
            onChange={(v) => setSetting('defaultCameraMode', v)}
          />
          <Toggle
            id="name-it-first"
            label="Name it first"
            description="Before the result appears, have a guess at the group or the name. A good way to learn."
            checked={settings.nameItFirst}
            onChange={(v) => setSetting('nameItFirst', v)}
          />
          <div className="space-y-3">
            <Toggle
              id="on-device-calls"
              label="Identify bird calls on this device"
              description="Runs BirdNET on your phone, so recordings aren’t uploaded. Needs a one-time download of about 60 MB. Names and details still come from FieldLens."
              checked={settings.onDeviceCalls}
              onChange={(v) => setSetting('onDeviceCalls', v)}
            />
            <OnDeviceModel enabled={settings.onDeviceCalls} />
          </div>
        </div>
      </Card>

      <Card as="section" aria-labelledby="display-title">
        <SectionTitle id="display-title">Units</SectionTitle>
        <Choice<Units>
          id="units"
          label="Measurements"
          description="Distances and weights, such as “within 10 km” or an animal’s weight."
          value={settings.units}
          options={[
            { value: 'metric', label: 'Metric (km, kg)' },
            { value: 'imperial', label: 'Imperial (mi, lb)' },
          ]}
          onChange={(v) => setSetting('units', v)}
        />
      </Card>

      <Card as="section" aria-labelledby="data-title">
        <SectionTitle id="data-title">Data</SectionTitle>
        <div className="space-y-5">
          <Toggle
            id="data-saver"
            label="Data saver"
            description="Sends smaller photos and fewer live frames. Identification may be a little less sure."
            checked={settings.dataSaver}
            onChange={(v) => setSetting('dataSaver', v)}
          />
          <div>
            <p className="font-semibold text-ink">Your data</p>
            <p className="mb-3 mt-0.5 text-sm text-ink-muted">
              Your journal and photos are stored only on this device. See the{' '}
              <a href="#/privacy" className="font-semibold text-moss underline">
                privacy page
              </a>{' '}
              for what is sent where.
            </p>
            <ClearData />
          </div>
        </div>
      </Card>
    </div>
  );
}
