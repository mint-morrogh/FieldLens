import { describe, expect, it } from 'vitest';
import { detectPlatform, locationUnblockSteps } from '../../src/lib/platform';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
};

describe('platform detection', () => {
  it.each([
    [UA.iphoneSafari, false, 0, 'ios-safari'],
    [UA.iphoneSafari, true, 5, 'ios-app'],
    [UA.iphoneChrome, false, 5, 'ios-chrome'],
    [UA.ipad, false, 5, 'ios-safari'],
    [UA.androidChrome, false, 5, 'android-chrome'],
    [UA.samsung, false, 5, 'android-samsung'],
    [UA.androidFirefox, false, 5, 'android-firefox'],
    [UA.edge, false, 0, 'desktop-edge'],
    [UA.macSafari, false, 0, 'desktop-safari'],
  ] as const)('%#: detects %s', (ua, standalone, touch, expected) => {
    expect(detectPlatform(ua, standalone, touch)).toBe(expected);
  });

  it('gives platform-specific location steps', () => {
    expect(locationUnblockSteps('ios-safari').steps.join(' ')).toMatch(/Safari Websites/);
    expect(locationUnblockSteps('ios-chrome').steps.join(' ')).toMatch(/Chrome/);
    expect(locationUnblockSteps('android-samsung').title).toMatch(/Samsung Internet/);
    expect(locationUnblockSteps('ios-app').steps.join(' ')).toMatch(/home-screen apps use Safari/);
  });
});
