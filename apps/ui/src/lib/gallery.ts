// Client for the dev-server gallery API (apps/ui/server/gallery.ts).

export interface Snapshot {
  id: string;
  pieceId: string;
  seed: number;
  values: Record<string, unknown>;
  createdAt: string;
  thumb: string;
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const res = await fetch('/api/gallery');
  if (!res.ok) throw new Error(`gallery: ${res.status}`);
  return res.json();
}

export async function saveSnapshot(
  s: Pick<Snapshot, 'pieceId' | 'seed' | 'values'>,
  thumb: string,
): Promise<Snapshot> {
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...s, thumb }),
  });
  if (!res.ok) throw new Error(`gallery: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function deleteSnapshot(id: string) {
  const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`gallery: ${res.status}`);
}

/** Small JPEG of the current preview canvas. */
export function thumbnail(source: HTMLCanvasElement, width = 320): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * source.height) / source.width);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
