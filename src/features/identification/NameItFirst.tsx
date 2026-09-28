import { useState, type FormEvent } from 'react';
import type { IdentifyResponse } from '../../../shared/types';
import { Button, Card, Chip } from '../../components/ui';
import { matchGuess, type Guess } from '../journal/fieldSkills';
import { JOURNAL_GROUPS, type JournalGroup } from '../journal/journal';

/**
 * "Name it first" (optional setting, off by default): before the result is shown, guess the
 * group with a chip or type a name. Always skippable; the guess is only compared, never judged.
 */
export function NameItFirst({
  result,
  photoUrl,
  onDone,
}: {
  result: IdentifyResponse;
  photoUrl?: string;
  /** Called with the guess, or nothing when skipped. */
  onDone: (guess?: Guess) => void;
}) {
  const [group, setGroup] = useState<JournalGroup>();
  const [text, setText] = useState('');
  const name = text.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!group && !name) return;
    const guess = { text: name || undefined, group };
    onDone({ ...guess, result: matchGuess(guess, result) });
  };

  return (
    <Card aria-labelledby="name-it-title" data-testid="name-it-first">
      <form onSubmit={submit} className="space-y-4">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Your photo"
            className="max-h-64 w-full rounded-2xl object-cover"
          />
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">Name it first</p>
          <h1 id="name-it-title" className="mt-1 text-2xl font-bold">
            What do you think it is?
          </h1>
          <p className="mt-1 text-[0.95rem] text-ink-soft">
            The result is ready. Pick a group, type a name, or both.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Group">
          {JOURNAL_GROUPS.map((g) => (
            <Chip
              key={g.id}
              selected={group === g.id}
              onClick={() => setGroup(group === g.id ? undefined : g.id)}
            >
              {g.label}
            </Chip>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold">Name (common or scientific)</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="e.g. red maple, or Acer rubrum"
            className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-base text-ink placeholder:text-ink-muted"
            data-testid="guess-input"
          />
        </label>
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={!group && !name} data-testid="guess-submit">
            Check my guess
          </Button>
          <Button variant="ghost" onClick={() => onDone()} data-testid="guess-skip">
            Just show me
          </Button>
        </div>
      </form>
    </Card>
  );
}
