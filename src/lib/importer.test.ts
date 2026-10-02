import { describe, expect, it } from 'vitest';
import { toPhotoRecords } from './importer';

describe('import progress', () => {
  it('reports progress and can be cancelled', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      ref: { providerId: 'icloud', externalId: `${i}`, fileName: `${i}.jpg` },
      metadata: { lat: i % 2 ? 1 : null, lon: i % 2 ? 1 : null, localTime: null, timestamp: null },
    }));
    const updates: { done: number; located: number }[] = [];
    const records = await toPhotoRecords(items, { onProgress: (p) => updates.push(p) });
    expect(records).toHaveLength(6);
    expect(updates.at(-1)).toMatchObject({ done: 6, total: 6, located: 3 });

    const controller = new AbortController();
    controller.abort();
    await expect(toPhotoRecords(items, { signal: controller.signal })).rejects.toThrow();
  });
});
