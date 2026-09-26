const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export { MONTHS_SHORT };

/** "September 21" (this year) or "September 21, 2024". Accepts YYYY-MM-DD or ISO strings. */
export function formatDate(value: string | undefined, now = new Date()): string | undefined {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return undefined;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function titleCase(name: string): string {
  return name.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** "Red maple" or the scientific name when no common name exists. */
export function displayName(c: { commonName?: string; scientificName: string }): string {
  return c.commonName ? titleCase(c.commonName) : c.scientificName;
}
