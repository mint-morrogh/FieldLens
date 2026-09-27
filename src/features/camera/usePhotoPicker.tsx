import { useCallback, useRef, useState, type ReactElement } from 'react';
import { ACCEPTED_INPUT, MAX_SOURCE_BYTES } from '../../lib/image';

/**
 * Hidden <input type=file> wrapper. With `capture`, phones open the native
 * camera app directly: full resolution, autofocus and HDR, which identifies far
 * better than frames grabbed from a live video preview. Desktop browsers ignore
 * `capture` and show a file picker.
 */
export function usePhotoPicker(onPick: (file: File) => void, options: { capture?: boolean } = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const open = useCallback(() => {
    setError(undefined);
    inputRef.current?.click();
  }, []);

  const input: ReactElement = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture={options.capture ? 'environment' : undefined}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-testid={options.capture ? 'camera-file-input' : 'photo-file-input'}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!ACCEPTED_INPUT.test(file.type)) {
          setError('That file isn’t a photo. Please choose an image.');
          return;
        }
        if (file.size > MAX_SOURCE_BYTES) {
          setError('That photo is too large. Please choose a smaller one.');
          return;
        }
        onPick(file);
      }}
    />
  );

  return { open, input, error };
}
