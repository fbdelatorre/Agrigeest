import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Vite emits the worker alongside the app and its service worker caches it.
setWorkerUrl(workerUrl);

export * from 'maplibre-gl';
