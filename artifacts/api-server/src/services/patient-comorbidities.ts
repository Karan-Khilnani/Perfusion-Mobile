export function normalizeComorbidities(value: string | null | undefined): string | null {
  if (!value) return null;

  const seen = new Set<string>();
  const entries: string[] = [];
  for (const rawEntry of value.split(/\r\n|\n|\r/)) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  return entries.length ? entries.join("\n") : null;
}