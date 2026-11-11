// Runs lidar walk-ins (the 3DEP download, the walkability burn-in and the least-effort search) off the main thread,
// so the map and lists stay responsive while a zone's route refines. Same code as the main-thread path
// (engine/lidar.ts); src/engine/lidarClient.ts decides which one runs.
import type { WalkNetwork } from './spot';
import { lidarZone, lidarZones, type LidarLayers, type Target } from './lidar';
import type { ShapeOptions } from './shape';

export type LidarWorkerRequest =
  | { type: 'context'; key: string; net: WalkNetwork; layers: LidarLayers }
  | { type: 'zones'; id: number; key: string; targets: Target[]; marginM?: number; shape: ShapeOptions | false }
  | { type: 'zone'; id: number; key: string; center: [number, number]; radiusM?: number; shape: ShapeOptions | false }
  | { type: 'abort'; id: number };

export type LidarWorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; aborted: boolean };

const contexts = new Map<string, { net: WalkNetwork; layers: LidarLayers }>();
const running = new Map<number, AbortController>();

self.onmessage = async (ev: MessageEvent<LidarWorkerRequest>) => {
  const m = ev.data;
  if (m.type === 'context') {
    // a handful of areas at most (public regions, your club); keep the latest few
    contexts.set(m.key, { net: m.net, layers: m.layers });
    while (contexts.size > 4) contexts.delete(contexts.keys().next().value!);
    return;
  }
  if (m.type === 'abort') { running.get(m.id)?.abort(); return; }
  const ctx = contexts.get(m.key);
  const ctl = new AbortController();
  running.set(m.id, ctl);
  try {
    if (!ctx) throw new Error('lidar worker: unknown context');
    const result = m.type === 'zones'
      ? await lidarZones(m.targets, ctx.net, ctx.layers, { marginM: m.marginM, signal: ctl.signal, shape: m.shape })
      : await lidarZone(m.center, ctx.net, ctx.layers, { radiusM: m.radiusM, signal: ctl.signal, shape: m.shape });
    (self as unknown as Worker).postMessage({ id: m.id, ok: true, result } satisfies LidarWorkerResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e), aborted: ctl.signal.aborted } satisfies LidarWorkerResponse);
  } finally {
    running.delete(m.id);
  }
};
