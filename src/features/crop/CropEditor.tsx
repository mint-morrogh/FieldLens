import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AUTO_FEATURE, getTarget } from '../../../shared/categories';
import type { FeatureId, IdentifyTarget } from '../../../shared/types';
import { Icon } from '../../components/Icon';
import { Button, Chip } from '../../components/ui';
import {
  DEFAULT_BOX,
  FULL_BOX,
  boxFromPoints,
  moveBox,
  resizeBox,
  type Box,
  type Corner,
} from './cropMath';

type Drag =
  | { mode: 'move'; startX: number; startY: number; startBox: Box }
  | { mode: 'resize'; corner: Corner; startX: number; startY: number; startBox: Box }
  | { mode: 'draw'; startX: number; startY: number };

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const CORNER_POS: Record<Corner, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

export function CropEditor({
  imageUrl,
  category,
  initialFeature = 'auto',
  onCancel,
  onConfirm,
  confirmLabel = 'Identify selection',
  locationQuestion,
}: {
  imageUrl: string;
  category: IdentifyTarget;
  initialFeature?: FeatureId;
  onCancel: () => void;
  onConfirm: (box: Box, feature: FeatureId) => void;
  confirmLabel?: string;
  /** Asked for photos from the library: where was it taken? */
  locationQuestion?: {
    choice: 'here' | 'photo' | 'none';
    hasPhotoLocation: boolean;
    onChange: (choice: 'here' | 'photo' | 'none') => void;
  };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [container, setContainer] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [box, setBox] = useState<Box>(DEFAULT_BOX);
  const [feature, setFeature] = useState<FeatureId>(initialFeature);
  const drag = useRef<Drag | null>(null);
  const categoryDef = getTarget(category);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainer({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const stage = (() => {
    if (!natural || !container.w || !container.h) return undefined;
    const scale = Math.min(container.w / natural.w, container.h / natural.h);
    return { w: natural.w * scale, h: natural.h * scale };
  })();

  const pointToNorm = (e: PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const begin = (e: PointerEvent<HTMLElement>, next: (p: { x: number; y: number }) => Drag) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    drag.current = next(pointToNorm(e));
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = pointToNorm(e);
    if (d.mode === 'move') setBox(moveBox(d.startBox, p.x - d.startX, p.y - d.startY));
    else if (d.mode === 'resize')
      setBox(resizeBox(d.startBox, d.corner, p.x - d.startX, p.y - d.startY));
    else setBox(boxFromPoints(d.startX, d.startY, p.x, p.y));
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (stageRef.current?.hasPointerCapture(e.pointerId))
      stageRef.current.releasePointerCapture(e.pointerId);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.altKey ? 0.005 : 0.02;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setBox((b) => (e.shiftKey ? resizeBox(b, 'se', d[0], d[1]) : moveBox(b, d[0], d[1])));
  };

  const features = categoryDef.features.length ? [AUTO_FEATURE, ...categoryDef.features] : [];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#11140f] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-title"
    >
      <div className="safe-top flex items-center gap-3 px-4 pb-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10"
          aria-label="Cancel and discard photo"
        >
          <Icon name="close" />
        </button>
        <h1 id="crop-title" className="text-lg font-semibold">
          Box what you want identified.
        </h1>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden px-3 py-3"
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            ref={stageRef}
            data-testid="crop-stage"
            className="relative overflow-hidden"
            style={stage ? { width: stage.w, height: stage.h } : { width: '100%', height: '100%' }}
            onPointerDown={(e) => begin(e, (p) => ({ mode: 'draw', startX: p.x, startY: p.y }))}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <img
              src={imageUrl}
              alt="Your photo"
              draggable={false}
              className="pointer-events-none h-full w-full object-contain"
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
            />
            {stage && (
              <div
                data-testid="crop-box"
                tabIndex={0}
                role="group"
                aria-label="Selection box. Drag to move, drag corners to resize. Arrow keys move it; Shift plus arrow keys resize it."
                onKeyDown={onKey}
                onPointerDown={(e) =>
                  begin(e, (p) => ({ mode: 'move', startX: p.x, startY: p.y, startBox: box }))
                }
                className="absolute cursor-move rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] focus-visible:outline-4 focus-visible:outline-[#9fd08a]"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
                  aria-hidden
                >
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/15" />
                  ))}
                </div>
                {CORNERS.map((corner) => (
                  <div
                    key={corner}
                    data-testid={`crop-handle-${corner}`}
                    aria-hidden
                    onPointerDown={(e) =>
                      begin(e, (p) => ({
                        mode: 'resize',
                        corner,
                        startX: p.x,
                        startY: p.y,
                        startBox: box,
                      }))
                    }
                    className={`absolute flex h-12 w-12 items-center justify-center ${CORNER_POS[corner]}`}
                  >
                    <span className="h-6 w-6 rounded-full border-[3px] border-white bg-moss shadow-md" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="safe-bottom space-y-3 bg-[#11140f] px-4 pt-3">
        {locationQuestion && (
          <fieldset data-testid="photo-location-question">
            <legend className="mb-2 text-sm font-semibold text-white/80">
              Where was this photo taken?
            </legend>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&>button]:shrink-0 [&>button:not([aria-pressed=true])]:border-white/20 [&>button:not([aria-pressed=true])]:bg-white/10 [&>button:not([aria-pressed=true])]:text-white">
              <Chip
                selected={locationQuestion.choice === 'here'}
                onClick={() => locationQuestion.onChange('here')}
              >
                Near here
              </Chip>
              {locationQuestion.hasPhotoLocation && (
                <Chip
                  selected={locationQuestion.choice === 'photo'}
                  onClick={() => locationQuestion.onChange('photo')}
                >
                  Where the photo was taken
                </Chip>
              )}
              <Chip
                selected={locationQuestion.choice === 'none'}
                onClick={() => locationQuestion.onChange('none')}
              >
                Somewhere else
              </Chip>
            </div>
            <p className="mt-1 text-xs text-white/60">
              {locationQuestion.choice === 'photo'
                ? 'Uses the location saved in the photo (rounded to about 1 km).'
                : locationQuestion.choice === 'here'
                  ? 'Uses your current approximate location.'
                  : 'Location won’t be used for this identification.'}
            </p>
          </fieldset>
        )}
        {features.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-white/80">
              What are we looking at? <span className="font-normal">(optional)</span>
            </legend>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&>button]:shrink-0 [&>button:not([aria-pressed=true])]:border-white/20 [&>button:not([aria-pressed=true])]:bg-white/10 [&>button:not([aria-pressed=true])]:text-white">
              {features.map((f) => (
                <Chip key={f.id} selected={feature === f.id} onClick={() => setFeature(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="md"
            className="flex-1 !border-white/20 !bg-white/10 !text-white"
            onClick={() => setBox(DEFAULT_BOX)}
          >
            Reset
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1 !border-white/20 !bg-white/10 !text-white"
            onClick={() => setBox(FULL_BOX)}
          >
            Use entire image
          </Button>
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={() => onConfirm(box, feature)}
          disabled={!stage}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
