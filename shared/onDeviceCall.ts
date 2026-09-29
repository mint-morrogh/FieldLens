import { z } from 'zod';
import { AUDIO } from './config.js';

/**
 * A bird call identified by BirdNET on the phone (opt-in), sent to /api/identify in place of
 * the recording so the server can still add names, ranges, sightings and facts. Same fields
 * as the Space's `identify_audio` response (see server/providers/birdnet/birdnet.ts).
 */
export const onDeviceCallSchema = z.object({
  model: z.literal('birdnet-v2.4-tfjs'),
  /** Length of the recording analysed. */
  seconds: z
    .number()
    .min(AUDIO.minSeconds - 0.25)
    .max(AUDIO.maxSeconds + 1),
  results: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(3)
          .max(100)
          .regex(/^[A-Z][A-Za-z.\- ()]+$/),
        common: z.string().trim().max(100).optional(),
        score: z.number().min(0).max(1),
        mean: z.number().min(0).max(1),
        segments: z.number().int().min(0).max(100).optional(),
        of: z.number().int().min(0).max(100).optional(),
      }),
    )
    .max(10),
  sound: z.string().trim().max(60).nullable().optional(),
});

export type OnDeviceCall = z.infer<typeof onDeviceCallSchema>;
