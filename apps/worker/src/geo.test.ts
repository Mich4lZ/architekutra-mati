import { describe, expect, it } from 'vitest';
import { lookupGeo } from './geo.js';

describe('lookupGeo', () => {
  it('returns null location on timeout', async () => {
    const slowLookup = () => new Promise<{ country: string; city: string }>((resolve) => {
      setTimeout(() => resolve({ country: 'PL', city: 'Warsaw' }), 20);
    });
    await expect(lookupGeo('8.8.8.8', 1, slowLookup)).resolves.toEqual({ country: null, city: null });
  });
});
