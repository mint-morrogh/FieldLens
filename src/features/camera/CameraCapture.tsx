import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button, Notice } from '../../components/ui';
import { usePhotoPicker } from './usePhotoPicker';

type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

export function CameraCapture({
  onCapture,
  onClose,
  hint,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? 'starting'
      : 'unavailable',
  );
  const [busy, setBusy] = useState(false);
  const library = usePhotoPicker(onCapture);
  const nativeCamera = usePhotoPicker(onCapture, { capture: true });

  useEffect(() => {
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStatus('live');
      })
      .catch((error: DOMException) => {
        if (cancelled) return;
        setStatus(
          error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
            ? 'denied'
            : error?.name === 'NotFoundError'
              ? 'unavailable'
              : 'error',
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.92,
    );
  };

  const fallbackMessage =
    status === 'denied'
      ? 'Camera access is blocked. You can allow it in your browser’s site settings, or use your phone’s camera instead.'
      : status === 'unavailable'
        ? 'A live camera preview isn’t available in this browser. You can still take a photo with your camera app.'
        : status === 'error'
          ? 'The camera couldn’t start. You can still take a photo with your camera app or choose one.'
          : undefined;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      <div className="safe-top flex items-center justify-between px-4 pb-2">
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          aria-label="Close camera"
        >
          <Icon name="close" />
        </button>
        <p className="text-center text-base font-medium text-white/90">
          {hint ?? 'Frame the organism, then tap the shutter'}
        </p>
        <span className="h-12 w-12" aria-hidden />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${status === 'live' ? '' : 'hidden'}`}
          aria-label="Live camera preview"
        />
        {status === 'starting' && (
          <p className="absolute inset-0 flex items-center justify-center text-white/80">
            Starting camera…
          </p>
        )}
        {fallbackMessage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <Icon name="camera" className="h-12 w-12 text-white/70" />
            <p className="max-w-sm text-lg">{fallbackMessage}</p>
            <Button size="lg" onClick={nativeCamera.open}>
              <Icon name="camera" /> Open camera app
            </Button>
          </div>
        )}
      </div>

      <div className="safe-bottom flex items-center justify-between gap-4 px-6 pt-4">
        <button
          type="button"
          onClick={library.open}
          className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 font-semibold"
        >
          <Icon name="image" /> Library
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={status !== 'live' || busy}
          aria-label="Take photo"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
        />
        <span className="w-[6.5rem]" aria-hidden />
      </div>
      {(library.error || nativeCamera.error) && (
        <div className="absolute inset-x-4 top-20">
          <Notice tone="error" role="alert">
            {library.error ?? nativeCamera.error}
          </Notice>
        </div>
      )}
      {library.input}
      {nativeCamera.input}
    </div>
  );
}
