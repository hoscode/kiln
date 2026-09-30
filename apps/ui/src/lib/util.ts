const KEY = 'kiln:v1';

export interface Saved {
  pieceId?: string;
  seeds?: Record<string, number>;
  values?: Record<string, Record<string, unknown>>;
}

export function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function save(state: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode etc.) — state just won't persist
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL hash state: #piece=<id>&seed=<n>&p=<json of changed params> */
export interface HashState {
  pieceId?: string;
  seed?: number;
  values?: Record<string, unknown>;
}

export function readHash(): HashState {
  try {
    const q = new URLSearchParams(location.hash.slice(1));
    const seed = q.get('seed');
    const p = q.get('p');
    return {
      pieceId: q.get('piece') ?? undefined,
      seed: seed !== null && Number.isFinite(Number(seed)) ? Number(seed) : undefined,
      values: p ? JSON.parse(p) : undefined,
    };
  } catch {
    return {};
  }
}

export function writeHash(pieceId: string, seed: number, values?: Record<string, unknown>) {
  const q = new URLSearchParams({ piece: pieceId, seed: String(seed) });
  if (values && Object.keys(values).length) q.set('p', JSON.stringify(values));
  history.replaceState(null, '', `#${q}`);
}
