import type { ApproxLocation, FeatureId, IdentifyTarget, TiltBucket } from '../../../shared/types';

/**
 * A photo saved on the device while there was no signal, waiting to be identified.
 *
 * Privacy: only what the identify request itself would send is kept — the cropped,
 * EXIF-free photos, an EXIF-free display copy, the capture time, and the same ~1 km
 * position the request uses. The whole record (and so the position) is deleted as soon
 * as the photo has been identified and saved to the Field Journal, or when removed.
 */
export type QueuedIdentification = {
  /** The observation id; the Field Journal entry gets the same id. */
  id: string;
  queuedAt: string;
  category: IdentifyTarget;
  /** Cropped, re-encoded JPEGs exactly as they would be uploaded. */
  images: { blob: Blob; feature: FeatureId }[];
  /** EXIF-free copy (≤2048 px) for the Field Journal's viewer; never the original file. */
  photo?: Blob;
  /** ~1 km, as sent with identification requests. Deleted with the item. */
  location?: ApproxLocation;
  locationSource?: 'photo';
  capturedAt: string;
  timeSource?: 'device' | 'photo';
  tilt?: TiltBucket;
  /** Failed attempts so far (going offline mid-way doesn't count). */
  attempts: number;
  /** Epoch ms before which it isn't retried (backoff). */
  nextAttemptAt?: number;
  /** waiting = will be tried automatically; failed = needs the user (retry or remove). */
  status: 'waiting' | 'failed';
  /** Why the last attempt failed, in plain words. */
  error?: string;
};
