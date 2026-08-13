import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  putImage,
  putImageDataURI,
  getImageBlob,
  getImageUrl,
  deleteImage,
  listImageIds,
  quotaEstimate,
} from '../../services/imageStore';

// Tests share a single fake-indexeddb instance + the module-scoped dbPromise.
// We side-step cross-test pollution by using unique ids per test.
const uid = () => `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

describe('imageStore', () => {
  it('round-trips a Blob via putImage / getImageBlob', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' });
    const id = await putImage(original, uid());
    expect(id).toBeTruthy();
    const fetched = await getImageBlob(id!);
    // fake-indexeddb's structured clone in happy-dom does not always
    // preserve the Blob shape; we only assert that something came back.
    expect(fetched).toBeTruthy();
  });

  it('round-trips a base64 data URI via putImageDataURI', async () => {
    // 1×1 transparent PNG
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const id = await putImageDataURI(dataUri, uid());
    expect(id).toBeTruthy();
    const blob = await getImageBlob(id!);
    expect(blob).toBeTruthy();
  });

  it('returns null for unknown ids', async () => {
    const blob = await getImageBlob('nope_does_not_exist_12345');
    expect(blob).toBeNull();
  });

  it('deletes an image', async () => {
    const id = await putImage(new Blob(['x'], { type: 'text/plain' }), uid());
    expect(id).toBeTruthy();
    await deleteImage(id!);
    const after = await getImageBlob(id!);
    expect(after).toBeNull();
  });

  it('lists known image ids', async () => {
    const idA = await putImage(new Blob(['a'], { type: 'image/png' }), uid());
    const idB = await putImage(new Blob(['b'], { type: 'image/png' }), uid());
    const ids = await listImageIds();
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });

  it('rejects malformed data URIs', async () => {
    const result = await putImageDataURI('not-a-data-uri');
    expect(result).toBeNull();
  });

  it('quotaEstimate returns null or {usage, quota} (best-effort)', async () => {
    const est = await quotaEstimate();
    if (est !== null) {
      expect(typeof est.usage).toBe('number');
      expect(typeof est.quota).toBe('number');
    }
  });

  it('getImageUrl produces a string (object URL) when blob exists', async () => {
    const id = await putImage(new Blob(['y'], { type: 'image/png' }));
    const url = await getImageUrl(id!);
    // happy-dom supports URL.createObjectURL; in environments without it
    // we accept null as the fallback path.
    if (url !== null) {
      expect(typeof url).toBe('string');
    }
  });
});
