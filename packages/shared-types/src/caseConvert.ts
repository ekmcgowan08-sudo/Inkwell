/**
 * Local/mobile domain models are camelCase (this package); Postgres columns
 * are snake_case. Shared by apps/web and apps/mobile so both convert the
 * same way instead of maintaining two implementations.
 */
export function toSnakeRow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    out[snake] = value;
  }
  return out;
}

export function toCamelRow<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    out[camel] = value;
  }
  return out as T;
}
