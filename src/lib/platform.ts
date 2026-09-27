/** Rough platform/browser detection, used only to tailor help text. */
export type Platform =
  | 'ios-safari'
  | 'ios-app' // installed to the iPhone home screen
  | 'ios-chrome'
  | 'ios-firefox'
  | 'ios-other'
  | 'android-chrome'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'other';

export function detectPlatform(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  standalone: boolean = typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true),
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): Platform {
  // iPadOS reports a Mac user agent; touch support gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS/.test(ua)) return 'ios-firefox';
    if (/EdgiOS|OPiOS|GSA\//.test(ua)) return 'ios-other';
    return standalone ? 'ios-app' : 'ios-safari';
  }
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    if (/Firefox/.test(ua)) return 'android-firefox';
    if (/Chrome/.test(ua)) return 'android-chrome';
    return 'android-other';
  }
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Firefox/.test(ua)) return 'desktop-firefox';
  if (/Chrome/.test(ua)) return 'desktop-chrome';
  if (/Safari/.test(ua)) return 'desktop-safari';
  return 'other';
}

const IOS_SYSTEM = 'Settings → Privacy & Security → Location Services: make sure it’s on.';

/** Steps to allow location for this site on the given platform. */
export function locationUnblockSteps(platform: Platform): { title: string; steps: string[] } {
  switch (platform) {
    case 'ios-safari':
      return {
        title: 'On iPhone (Safari)',
        steps: [
          IOS_SYSTEM,
          'In the same screen, tap Safari Websites and choose “While Using the App”.',
          'Back in Safari, tap “aA” (or the page menu) in the address bar → Website Settings → Location → Allow.',
        ],
      };
    case 'ios-app':
      return {
        title: 'On iPhone (home-screen app)',
        steps: [
          IOS_SYSTEM,
          'In the same screen, tap Safari Websites and choose “While Using the App” — home-screen apps use Safari’s setting.',
          'Close FieldLens completely and open it again.',
        ],
      };
    case 'ios-chrome':
      return {
        title: 'On iPhone (Chrome)',
        steps: [
          IOS_SYSTEM,
          'In the same screen, scroll to Chrome and choose “While Using the App”.',
          'Reload this page and allow location when asked.',
        ],
      };
    case 'ios-firefox':
      return {
        title: 'On iPhone (Firefox)',
        steps: [
          IOS_SYSTEM,
          'In the same screen, scroll to Firefox and choose “While Using the App”.',
          'Reload this page and allow location when asked.',
        ],
      };
    case 'ios-other':
      return {
        title: 'On iPhone',
        steps: [
          IOS_SYSTEM,
          'In the same screen, find the browser you’re using and choose “While Using the App”.',
          'Reload this page and allow location when asked.',
        ],
      };
    case 'android-chrome':
      return {
        title: 'On Android (Chrome)',
        steps: [
          'Tap the icon to the left of the web address → Permissions (or Site settings) → Location → Allow.',
          'If it’s still blocked: phone Settings → Location → make sure it’s on, then Apps → Chrome → Permissions → Location → Allow.',
        ],
      };
    case 'android-samsung':
      return {
        title: 'On Android (Samsung Internet)',
        steps: [
          'Tap the icon to the left of the web address → Permissions → Location → Allow.',
          'If it’s still blocked: phone Settings → Location → on, then Apps → Samsung Internet → Permissions → Location → Allow.',
        ],
      };
    case 'android-firefox':
      return {
        title: 'On Android (Firefox)',
        steps: [
          'Tap the lock icon in the address bar → Permissions → Location → Allowed.',
          'If it’s still blocked: phone Settings → Apps → Firefox → Permissions → Location → Allow.',
        ],
      };
    case 'android-other':
      return {
        title: 'On Android',
        steps: [
          'Tap the icon beside the web address and allow Location for this site.',
          'If it’s still blocked: phone Settings → Apps → your browser → Permissions → Location → Allow.',
        ],
      };
    case 'desktop-chrome':
    case 'desktop-edge':
      return {
        title: platform === 'desktop-edge' ? 'In Edge' : 'In Chrome',
        steps: [
          'Click the icon to the left of the web address → Site settings (or Permissions) → Location → Allow.',
          'Reload the page.',
        ],
      };
    case 'desktop-safari':
      return {
        title: 'In Safari on Mac',
        steps: [
          'Safari menu → Settings → Websites → Location → set this site to Allow.',
          'If needed: System Settings → Privacy & Security → Location Services → turn on Safari.',
        ],
      };
    case 'desktop-firefox':
      return {
        title: 'In Firefox',
        steps: [
          'Click the permissions icon (left of the address) → clear “Blocked” for Location.',
          'Reload the page and allow location when asked.',
        ],
      };
    default:
      return {
        title: 'In your browser',
        steps: [
          'Open this site’s settings (usually the icon beside the web address) and allow Location.',
          'Make sure location services are turned on for your device.',
        ],
      };
  }
}
