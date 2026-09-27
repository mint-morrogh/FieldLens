import { useState } from 'react';
import { APP_VERSION } from '../../../shared/config';
import { Button, Card, ExternalLink, Notice } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { clearAllLocalData } from '../history/historyStore';

export function PrivacyScreen() {
  const [cleared, setCleared] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="pt-2 font-serif text-3xl font-bold">Privacy &amp; About</h1>

      <Card>
        <h2 className="mb-2 text-lg font-bold">How your data is used</h2>
        <ul className="list-disc space-y-2 pl-5 text-ink-soft">
          <li>
            When you ask for an identification, the cropped photo is sent to an identification
            provider (Pl@ntNet for plants). Photo metadata such as camera details and GPS tags is
            removed first.
          </li>
          <li>
            Location is optional. If you allow it, an approximate position (rounded to about 1 km)
            is used to check which species are recorded nearby on GBIF and iNaturalist.
          </li>
          <li>{BRAND.name} does not intentionally store your location or photos on its servers.</li>
          <li>
            Your history (a small thumbnail, the result, and a coarse ~10 km area label) stays in
            this browser’s local storage.
          </li>
          <li>
            External providers have their own privacy policies:{' '}
            <ExternalLink href="https://plantnet.org/en/privacy-policy/">Pl@ntNet</ExternalLink>,{' '}
            <ExternalLink href="https://www.gbif.org/terms/privacy-policy">GBIF</ExternalLink>,{' '}
            <ExternalLink href="https://www.inaturalist.org/pages/privacy">
              iNaturalist
            </ExternalLink>
            ,{' '}
            <ExternalLink href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">
              Wikimedia
            </ExternalLink>
            .
          </li>
          <li>You can clear all local data at any time.</li>
        </ul>
        <div className="mt-4">
          {cleared ? (
            <Notice role="status">
              All local {BRAND.name} data on this device has been cleared.
            </Notice>
          ) : (
            <Button
              variant="danger"
              onClick={() => void clearAllLocalData().then(() => setCleared(true))}
            >
              Clear Local Data
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">About identifications</h2>
        <p className="text-ink-soft">
          {BRAND.name} is an identification aid, not an authority. Confidence scores are estimates,
          and the “From iNaturalist” card shows community context that does not confirm an
          identification.
        </p>
        <p className="mt-2 font-medium">
          Do not use this identification alone to decide whether an organism is safe to eat, touch,
          handle, or use medicinally. Observe wildlife from a respectful distance.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Data sources</h2>
        <ul className="space-y-1 text-ink-soft">
          <li>
            <ExternalLink href="https://plantnet.org/">Pl@ntNet</ExternalLink> — plant image
            identification
          </li>
          <li>
            <ExternalLink href="https://www.gbif.org/">GBIF</ExternalLink> — taxonomy and occurrence
            records
          </li>
          <li>
            <ExternalLink href="https://www.inaturalist.org/">iNaturalist</ExternalLink> — community
            observations
          </li>
          <li>
            <ExternalLink href="https://www.wikidata.org/">Wikidata</ExternalLink> and{' '}
            <ExternalLink href="https://en.wikipedia.org/">Wikipedia</ExternalLink> — names and
            summaries (CC0 / CC BY-SA)
          </li>
          <li>
            <ExternalLink href="https://powo.science.kew.org/">
              Plants of the World Online (Kew)
            </ExternalLink>{' '}
            — reference links
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-muted">
          Version {APP_VERSION} · build {__BUILD_ID__}
        </p>
      </Card>
    </div>
  );
}
