import type { CampusRoute, RouteRequest } from '@yourtj/campus-navigation';

interface NavigationWorkerResponse {
  error?: string;
  id: number;
  routes?: CampusRoute[];
}

let sequence = 0;
let worker: Worker | null = null;
const pending = new Map<number, { reject: (error: Error) => void; resolve: (routes: CampusRoute[]) => void }>();

function navigationWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../../workers/navigation.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<NavigationWorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.routes ?? []);
  });
  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'Navigation worker failed'));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function requestCampusRoutes(request: RouteRequest): Promise<CampusRoute[]> {
  const id = sequence += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    navigationWorker().postMessage({ id, request });
  });
}
