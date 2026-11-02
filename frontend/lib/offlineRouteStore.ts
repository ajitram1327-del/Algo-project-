/**
 * IndexedDB Offline Route Snapshot Store
 * Persists complete route geometry, energy telemetry, and charger stops
 * for seamless offline / zero-reception corridor navigation.
 */

export interface RouteSnapshot {
  id: string; // e.g. "origin_dest_variant"
  saved_at: string;
  origin_name: string;
  dest_name: string;
  origin_coords: [number, number];
  dest_coords: [number, number];
  route_geometry: [number, number][];
  telemetry_profile?: any[];
  summary: any;
  planned_stops?: any[];
  is_cached_snapshot: boolean;
}

const DB_NAME = "unstranded_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "route_snapshots";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported in this environment"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("saved_at", "saved_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRouteSnapshot(snapshot: RouteSnapshot): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(snapshot);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not save route snapshot to IndexedDB:", err);
  }
}

export async function getLatestRouteSnapshot(): Promise<RouteSnapshot | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("saved_at");
      const req = index.openCursor(null, "prev"); // latest first

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          resolve(cursor.value as RouteSnapshot);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not read route snapshot from IndexedDB:", err);
    return null;
  }
}

export async function getRouteSnapshotByKey(key: string): Promise<RouteSnapshot | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as RouteSnapshot) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
