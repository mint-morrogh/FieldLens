import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';

function speechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  );
}

/**
 * Reads the common and scientific names aloud with the device's built-in speech
 * (free, offline, no network). Scientific names are read slowly by an English voice,
 * so they're approximate.
 */
export function PronounceButton({
  commonName,
  scientificName,
}: {
  commonName?: string;
  scientificName: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(
    () => () => {
      if (speechAvailable()) window.speechSynthesis.cancel();
    },
    [],
  );
  if (!speechAvailable()) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const parts: [string, number][] = [];
    if (commonName) parts.push([commonName, 1]);
    parts.push([scientificName, 0.8]);
    parts.forEach(([text, rate], i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;
      if (i === 0) u.onstart = () => setSpeaking(true);
      if (i === parts.length - 1) {
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
      }
      synth.speak(u);
    });
  };

  return (
    <button
      type="button"
      onClick={speak}
      title="Latin names are read by an English voice, so they're approximate."
      className="mt-2 inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-moss hover:bg-moss-soft"
      aria-label={`Hear how to pronounce ${commonName ? `${commonName} and ` : ''}${scientificName}`}
      data-testid="pronounce"
    >
      <Icon name="speaker" className="h-4 w-4" />
      {speaking ? 'Speaking…' : 'Hear it'}
    </button>
  );
}
