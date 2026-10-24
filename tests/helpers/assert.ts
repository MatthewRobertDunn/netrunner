/**
 * Tiny offline assertion helpers (no network, no dependencies).
 */

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  const a = JSON.stringify(actual, sortKeys);
  const e = JSON.stringify(expected, sortKeys);
  if (a !== e) {
    throw new Error(msg ?? `expected ${e}, got ${a}`);
  }
}

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) throw new Error(msg ?? "assertion failed");
}

export function assertTruthy<T>(value: T | null | undefined, msg?: string): T {
  if (value === null || value === undefined) throw new Error(msg ?? "value is null/undefined");
  return value;
}

export function assertDefined<T>(value: T | undefined, msg?: string): T {
  if (value === undefined) throw new Error(msg ?? "value is undefined");
  return value;
}

export function assertThrows(fn: () => unknown, msg?: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(msg ?? "expected function to throw");
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = (value as Record<string, unknown>)[k];
    }
    return out;
  }
  return value;
}
