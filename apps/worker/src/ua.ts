import UAParser from 'ua-parser-js';

export type ParsedUa = {
  device_type: 'mobile' | 'desktop' | 'tablet' | null;
  browser: string | null;
  os: string | null;
};

export function parseUserAgent(userAgent: string | null | undefined): ParsedUa {
  if (!userAgent || userAgent.trim().length < 8) {
    return { device_type: null, browser: null, os: null };
  }
  try {
    const parsed = new UAParser(userAgent).getResult();
    const type = parsed.device.type;
    const device_type = type === 'mobile' ? 'mobile' : type === 'tablet' ? 'tablet' : 'desktop';
    return {
      device_type,
      browser: parsed.browser.name ?? null,
      os: parsed.os.name ?? null
    };
  } catch {
    return { device_type: null, browser: null, os: null };
  }
}
