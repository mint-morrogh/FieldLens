/**
 * Minimal structured logger. In production only the event name and small,
 * non-sensitive fields are written — never photos, coordinates, keys, or payloads.
 */
type Fields = Record<string, string | number | boolean | undefined>;

const SENSITIVE = /key|token|secret|lat|lng|lon|coord|image|photo|payload|body/i;

function scrub(fields: Fields | undefined, production: boolean): Fields | undefined {
  if (!fields) return undefined;
  if (!production) return fields;
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) if (!SENSITIVE.test(k)) out[k] = v;
  return out;
}

const isProd = () =>
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const quiet = () => process.env.NODE_ENV === 'test';

export const logger = {
  debug(event: string, fields?: Fields) {
    if (isProd() || quiet()) return;
    console.debug(JSON.stringify({ level: 'debug', event, ...fields }));
  },
  info(event: string, fields?: Fields) {
    if (quiet()) return;
    console.info(JSON.stringify({ level: 'info', event, ...scrub(fields, isProd()) }));
  },
  warn(event: string, fields?: Fields) {
    if (quiet()) return;
    console.warn(JSON.stringify({ level: 'warn', event, ...scrub(fields, isProd()) }));
  },
};
