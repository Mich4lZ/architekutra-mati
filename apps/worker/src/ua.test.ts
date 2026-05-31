import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './ua.js';

describe('parseUserAgent', () => {
  it('maps iPhone to mobile', () => {
    const parsed = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    expect(parsed.device_type).toBe('mobile');
  });

  it('returns null fields for unknown input and does not throw', () => {
    expect(parseUserAgent('???')).toEqual({ device_type: null, browser: null, os: null });
  });
});
