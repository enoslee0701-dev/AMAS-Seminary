// imageStore.ts — IndexedDB-backed key/value blob store.
//
// Replaces the previous pattern of stuffing base64 data URIs into the
// `amas_chat_messages` / `amas_courses` localStorage payloads (which hits
// the 5–10 MB quota within a handful of images).
//
// Storage shape (object store `images`):
//   { id: string, mime: string, blob: Blob, sizeBytes: number, createdAt: number }
//
// All functions are best-effort: if IDB is unavailable (private mode, very
// old WebKit), they log a warning and return null/no-op rather than throw,
// so the UI degrades gracefully to the legacy data-URI fallback path.

import { useEffect, useState } from 'react';

const DB_NAME = 'amas_images';
const DB_VERSION = 1;
const STORE = 'images';
const SOFT_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB

interface ImageRecord {
  id: string;
  mime: string;
  blob: Blob;
  sizeBytes: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn('[imageStore] IndexedDB unavailable in this runtime.');
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('[imageStore] open failed:', req.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('tx aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('tx errored'));
  });
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function totalSize(db: IDBDatabase): Promise<number> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    let total = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const rec = cursor.value as ImageRecord;
        total += rec.sizeBytes || (rec.blob?.size ?? 0);
        cursor.continue();
      } else {
        resolve(total);
      }
    };
    req.onerror = () => resolve(0);
  });
}

export async function putImage(blob: Blob, id?: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const existing = await totalSize(db);
    if (existing + blob.size > SOFT_QUOTA_BYTES) {
      console.warn(`[imageStore] soft 50MB quota would be exceeded; refusing put. (existing=${existing} add=${blob.size})`);
      return null;
    }
    const rec: ImageRecord = {
      id: id ?? newId(),
      mime: blob.type || 'application/octet-stream',
      blob,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    await txDone(tx);
    return rec.id;
  } catch (err) {
    console.warn('[imageStore] putImage failed:', err);
    return null;
  }
}

function dataUriToBlob(dataUri: string): Blob | null {
  const match = dataUri.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch (err) {
    console.warn('[imageStore] dataUriToBlob parse failed:', err);
    return null;
  }
}

export async function putImageDataURI(dataUri: string, id?: string): Promise<string | null> {
  const blob = dataUriToBlob(dataUri);
  if (!blob) return null;
  return putImage(blob, id);
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const rec = req.result as ImageRecord | undefined;
        resolve(rec?.blob ?? null);
      };
      req.onerror = () => resolve(null);
    } catch (err) {
      console.warn('[imageStore] getImageBlob failed:', err);
      resolve(null);
    }
  });
}

export async function getImageUrl(id: string): Promise<string | null> {
  const blob = await getImageBlob(id);
  if (!blob) return null;
  try {
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn('[imageStore] createObjectURL failed:', err);
    return null;
  }
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } catch (err) {
    console.warn('[imageStore] deleteImage failed:', err);
  }
}

export async function listImageIds(): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => resolve([]);
    } catch (err) {
      console.warn('[imageStore] listImageIds failed:', err);
      resolve([]);
    }
  });
}

export async function quotaEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return null;
  }
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch (err) {
    return null;
  }
}

/**
 * Returns an object URL for the given id, revoking it on unmount.
 * Returns null while loading or if the image doesn't exist.
 */
export function useImageUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      const u = await getImageUrl(id);
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      createdUrl = u;
      setUrl(u);
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id]);
  return url;
}
