import { useState } from 'react';
import { APP_VERSION } from '../../../shared/config';
import { Button, Card, ExternalLink, Notice } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { useAreaSize, useDistance } from '../../lib/units';
import { clearAllLocalData } from '../history/historyStore';

export function PrivacyScreen() {
  const fine = useDistance(1);
  const coarse = useAreaSize(10);
  const [cleared, setCleared] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="pt-2 font-serif text-3xl font-bold">Privacy &amp; About</h1>

      <Card>
        <h2 className="mb-2 text-lg font-bold">How your data is used</h2>
        <ul className="list-disc space-y-2 pl-5 text-ink-soft">
          <li>
            When you ask for an identification, the cropped photo is sent to an identification
            provider: Pl@ntNet for plants, and FieldLens’s own BioCLIP 2 service (hosted on Hugging
            Face) for everything else. Photo metadata such as camera details and GPS tags is removed
            first.
          </li>
          <li>
            Live identify analyses the camera view on your device (Google’s MediaPipe detector,
            downloaded when you first open it). Video never leaves your phone: only a few still
            frames, cropped to the box, are sent for identification, the same way as photos.
          </li>
          <li>
            Bird calls are recorded only while you’re listening. The clip is converted on your
            device to a short sound file, sent once for identification and not kept; your history
            keeps only the picture of the sound (a spectrogram). If you turn on “Identify bird calls
            on this device” in Settings, BirdNET runs on your phone instead and only the names it
            heard are sent, so the recording never leaves your device.
          </li>
          <li>
            Location is optional. If you allow it, an approximate position (rounded to about {fine})
            is used to check which species are recorded nearby on GBIF, iNaturalist and eBird, and
            which are expected there from iNaturalist’s range maps. A coarser position (about{' '}
            {coarse}) is sent to Open-Meteo to look up the ground elevation.
          </li>
          <li>
            With each identification, FieldLens also sends the local hour the photo was taken and,
            for camera photos, whether the phone was pointing up, level or down. These only nudge
            the ranking and are not kept.
          </li>
          <li>{BRAND.name} does not intentionally store your location or photos on its servers.</li>
          <li>
            For photos from your library, FieldLens can read the location saved in the photo — on
            your device, only if you choose “Where the photo was taken” — and rounds it to about{' '}
            {fine} before using it.
          </li>
          <li>
            Your history (a thumbnail, a larger copy of your photo, the result, and a coarse ~
            {coarse} area label) stays in this browser’s local storage.
          </li>
          <li>
            If you’re offline, a photo can be saved to identify later. Until it’s identified, this
            browser keeps the cropped photo, an EXIF-free copy for your journal, when it was taken,
            and the same approximate position (about {fine}) the identification would send. It’s
            sent automatically once you’re back online, and then the saved copy and its position are
            deleted; removing it from the list deletes it too. If you allow notifications, they’re
            shown silently by your device and nothing extra is sent.
          </li>
          <li>
            External providers have their own privacy policies:{' '}
            <ExternalLink href="https://plantnet.org/en/privacy-policy/">Pl@ntNet</ExternalLink>,{' '}
            <ExternalLink href="https://www.gbif.org/terms/privacy-policy">GBIF</ExternalLink>,{' '}
            <ExternalLink href="https://www.inaturalist.org/pages/privacy">
              iNaturalist
            </ExternalLink>
            , <ExternalLink href="https://www.birds.cornell.edu/home/privacy/">eBird</ExternalLink>,{' '}
            <ExternalLink href="https://open-meteo.com/en/terms">Open-Meteo</ExternalLink>,{' '}
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
          handle, or use medicinally. The “Edibility &amp; safety” section only repeats what its
          sources report; it never says anything is safe to eat. Observe wildlife from a respectful
          distance.
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
            <ExternalLink href="https://huggingface.co/imageomics/bioclip-2">
              BioCLIP 2
            </ExternalLink>{' '}
            (Imageomics, MIT) — identification of fungi, insects, spiders, birds, mammals, reptiles,
            amphibians and fish, run on our own Hugging Face Space, with Apple’s MobileCLIP-S1
            checking whether a photo shows a person
          </li>
          <li>
            <ExternalLink href="https://www.gbif.org/">GBIF</ExternalLink> — taxonomy and occurrence
            records
          </li>
          <li>
            <ExternalLink href="https://zenodo.org/records/15758276">TPPT</ExternalLink> (Agroscope,
            CC BY 4.0) — plant toxicity data
          </li>
          <li>
            <ExternalLink href="https://doi.org/10.6084/m9.figshare.3559887.v1">
              EltonTraits 1.0
            </ExternalLink>{' '}
            (Wilman et al. 2014, CC0) — bird and mammal size, diet, activity and feeding height
          </li>
          <li>
            <ExternalLink href="https://doi.org/10.1111/ele.13898">AVONET</ExternalLink> (Tobias et
            al. 2022, CC BY 4.0) — bird bill shapes
          </li>
          <li>
            <ExternalLink href="https://www.inaturalist.org/pages/range_maps">
              iNaturalist Open Range Map Dataset
            </ExternalLink>{' '}
            (CC BY 4.0) — where species are expected to occur
          </li>
          <li>
            <ExternalLink href="https://ebird.org/">eBird</ExternalLink> (Cornell Lab of
            Ornithology) — recent bird sightings
          </li>
          <li>
            <ExternalLink href="https://open-meteo.com/en/docs/elevation-api">
              Open-Meteo
            </ExternalLink>{' '}
            (Copernicus DEM GLO-90, CC BY 4.0) — ground elevation
          </li>
          <li>
            <ExternalLink href="https://github.com/birdnet-team/BirdNET-Analyzer">
              BirdNET
            </ExternalLink>{' '}
            (K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology,
            and Chemnitz University of Technology;{' '}
            <ExternalLink href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
              CC BY-NC-SA 4.0
            </ExternalLink>
            ) — bird call identification. The on-device option downloads the unmodified v2.4 model
            files, with this licence stored beside them, for non-commercial use.
          </li>
          <li>
            Home screen photos:{' '}
            <ExternalLink href="https://www.inaturalist.org/">iNaturalist</ExternalLink> observers
            (CC0)
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
