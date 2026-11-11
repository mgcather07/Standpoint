// lidarZones / lidarZone with the work done in a Web Worker (engine/lidar.worker.ts) when the browser has one.
// The search takes a second or more on a phone; on the main thread it froze the map while a walk-in refined.
//
// Results are identical to calling engine/lidar.ts directly, which is what this falls back to when there is no
// Worker (tests, very old browsers) or when the outline options carry a function that cannot be sent to a worker
// (your club's outlines, which also read the main thread's road index).
import type { WalkNetwork } from './spot';
import { lidarZone, lidarZones, type LidarLayers, type Target, type ZoneRefinement } from './lidar';
import type { ShapeOptions } from './shape';
import type { LidarWorkerRequest, LidarWorkerResponse } from './lidar.worker';

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const sentContexts = new Set<string>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./lidar.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = (ev: MessageEvent<LidarWorkerResponse>) => {
      const r = ev.data, w = waiting.get(r.id);
      if (!w) return;
      waiting.delete(r.id);
      if (r.ok) w.resolve(r.result);
      else w.reject(r.aborted ? new DOMException('Aborted', 'AbortError') : new Error(r.error));
    };
    worker.onerror = () => {
      // a broken worker (failed to load, crashed): fail what is pending and use the main thread from now on
      for (const w of waiting.values()) w.reject(new Error('lidar worker failed'));
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

// Stable ids for the network and layer objects, so each area's data is copied to the worker once, not per zone.
const ids = new WeakMap<object, number>();
let nextObj = 1;
const idOf = (o: object | undefined) => { if (!o) return 0; let i = ids.get(o); if (!i) { i = nextObj++; ids.set(o, i); } return i; };
const contextKey = (net: WalkNetwork, l: LidarLayers) => [net, l.ownership, l.open, l.walkable, l.water, ...l.lines].map((o) => idOf(o as object | undefined)).join('.');

type Job = Extract<LidarWorkerRequest, { type: 'zones' | 'zone' }>;
type JobBody = Job extends infer J ? (J extends Job ? Omit<J, 'id' | 'key'> : never) : never;

const portable = (shape: ShapeOptions | false | undefined) => !shape || typeof shape.allowed !== 'function';

function call<T>(w: Worker, net: WalkNetwork, layers: LidarLayers, msg: JobBody, signal?: AbortSignal): Promise<T> {
  const key = contextKey(net, layers);
  if (!sentContexts.has(key)) { w.postMessage({ type: 'context', key, net, layers } satisfies LidarWorkerRequest); sentContexts.add(key); }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
    signal?.addEventListener('abort', () => w.postMessage({ type: 'abort', id } satisfies LidarWorkerRequest), { once: true });
    w.postMessage({ ...msg, id, key } as LidarWorkerRequest);
  });
}

export function lidarZonesAsync(targets: Target[], net: WalkNetwork, layers: LidarLayers, opts: { marginM?: number; signal?: AbortSignal; shape?: ShapeOptions | false } = {}): Promise<Record<string, ZoneRefinement>> {
  const w = portable(opts.shape) ? getWorker() : null;
  if (!w || !targets.length) return lidarZones(targets, net, layers, opts);
  return call(w, net, layers, { type: 'zones', targets, marginM: opts.marginM, shape: opts.shape ?? {} }, opts.signal);
}

export function lidarZoneAsync(center: [number, number], net: WalkNetwork, layers: LidarLayers, opts: { radiusM?: number; signal?: AbortSignal; shape?: ShapeOptions | false } = {}): Promise<ZoneRefinement | null> {
  const w = portable(opts.shape) ? getWorker() : null;
  if (!w) return lidarZone(center, net, layers, opts);
  return call(w, net, layers, { type: 'zone', center, radiusM: opts.radiusM, shape: opts.shape ?? {} }, opts.signal);
}
