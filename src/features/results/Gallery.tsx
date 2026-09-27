import { useEffect, useRef, useState } from 'react';
import type { LicensedImage } from '../../../shared/types';
import { Icon } from '../../components/Icon';

/** Merge photo lists, dropping duplicates by URL, preserving order. */
export function mergeImages(...lists: (LicensedImage[] | undefined)[]): LicensedImage[] {
  const seen = new Set<string>();
  const out: LicensedImage[] = [];
  for (const img of lists.flat()) {
    if (!img || seen.has(img.url)) continue;
    seen.add(img.url);
    out.push(img);
  }
  return out;
}

export function credit(image: LicensedImage): string {
  const who = image.author ? image.author.replace(/^\(c\)\s*/i, '© ') : 'Photo';
  const author = /^©|no rights|no known/i.test(who) ? who : `© ${who}`;
  return [author, image.license, image.source].filter(Boolean).join(' · ');
}

/** Full-screen photo viewer: swipe or arrow keys to browse, Escape to close. */
export function Lightbox({
  images,
  index,
  title,
  onClose,
}: {
  images: LicensedImage[];
  index: number;
  title: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const startX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = images[i];
  const go = (delta: number) => setI((n) => (n + delta + images.length) % images.length);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % images.length);
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [images.length, onClose]);

  if (!image) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      data-testid="lightbox"
    >
      <div className="safe-top flex items-center gap-3 px-4 pb-2">
        <p className="min-w-0 flex-1 truncate font-semibold">
          {title}{' '}
          <span className="font-normal text-white/70">
            {i + 1} / {images.length}
          </span>
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          aria-label="Close photos"
        >
          <Icon name="close" />
        </button>
      </div>
      <div
        className="relative flex flex-1 touch-pan-y items-center justify-center overflow-hidden px-2"
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <img
          key={image.url}
          src={image.url}
          alt={`${title}, reference photo ${i + 1}`}
          className="fade-up max-h-full max-w-full select-none rounded-lg object-contain"
          draggable={false}
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/15"
              aria-label="Previous photo"
            >
              <Icon name="back" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 flex h-12 w-12 rotate-180 items-center justify-center rounded-full bg-white/15"
              aria-label="Next photo"
            >
              <Icon name="back" />
            </button>
          </>
        )}
      </div>
      <p className="safe-bottom px-4 pt-3 text-center text-sm text-white/80">
        {credit(image)}
        {image.sourceUrl && (
          <>
            {' · '}
            <a
              href={image.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              source<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** Horizontal strip of reference photos; tapping one opens the lightbox. */
export function ReferenceGallery({ images, title }: { images: LicensedImage[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <section aria-label={`Reference photos of ${title}`} data-testid="reference-gallery">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink-soft">What {title} looks like</p>
        <p className="text-xs text-ink-muted">{images.length} photos · tap to enlarge</p>
      </div>
      <ul className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1">
        {images.map((img, idx) => (
          <li key={img.url} className="snap-start">
            <button
              type="button"
              onClick={() => setOpen(idx)}
              className="block overflow-hidden rounded-xl"
              aria-label={`Open reference photo ${idx + 1} of ${images.length}`}
            >
              <img
                src={img.thumbnailUrl ?? img.url}
                alt=""
                loading="lazy"
                className="h-28 w-28 object-cover transition hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox images={images} index={open} title={title} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

/** A single thumbnail that opens its taxon's photos — used in candidate lists to compare look-alikes. */
export function CandidateThumb({
  images,
  title,
  size = 'h-16 w-16',
}: {
  images: LicensedImage[];
  title: string;
  size?: string;
}) {
  const [open, setOpen] = useState(false);
  const first = images[0];
  if (!first) {
    return (
      <span
        className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-moss-soft text-moss`}
        aria-hidden
      >
        <Icon name="leaf" />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative ${size} shrink-0 overflow-hidden rounded-xl`}
        aria-label={`See ${images.length} photo${images.length === 1 ? '' : 's'} of ${title}`}
      >
        <img
          src={first.thumbnailUrl ?? first.url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {images.length > 1 && (
          <span className="absolute bottom-0.5 right-0.5 rounded-md bg-black/60 px-1 text-[0.65rem] font-bold text-white">
            {images.length}
          </span>
        )}
      </button>
      {open && <Lightbox images={images} index={0} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
