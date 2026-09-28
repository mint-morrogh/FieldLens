/**
 * Silent "results are ready" notifications for queued photos. Only used if the user said
 * yes when their first photo was queued; nothing is asked at any other time.
 */

const ASKED_KEY = 'fieldlens.queueNotifyAsked';

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Whether to offer "Notify me" now: supported, undecided, and not offered before. */
export function shouldOfferNotifications(): boolean {
  if (!notificationsSupported() || Notification.permission !== 'default') return false;
  try {
    return localStorage.getItem(ASKED_KEY) === null;
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* storage unavailable: it may be offered again, which is harmless */
  }
}

/** Asks the browser for permission (inside the user's tap). Resolves true if granted. */
export async function requestNotifications(): Promise<boolean> {
  markAsked();
  if (!notificationsSupported()) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function declineNotifications() {
  markAsked();
}

export function notificationsGranted(): boolean {
  return notificationsSupported() && Notification.permission === 'granted';
}

/** The in-app link to an observation, as a full URL the service worker can open. */
export function observationUrl(id: string): string {
  return `${window.location.origin}/#/history/${id}`;
}

/**
 * Shows a silent notification that opens the observation when tapped. Uses the service
 * worker when there is one (required on Android and installed iOS apps), else the page's
 * own Notification. Never throws.
 */
export async function showReadyNotification(
  id: string,
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsGranted()) return;
  const url = observationUrl(id);
  const options: NotificationOptions = {
    body,
    tag: `fieldlens-queue-${id}`,
    silent: true,
    icon: '/pwa-192.png',
    data: { url },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    /* fall back to a page notification */
  }
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      window.location.hash = `#/history/${id}`;
      notification.close();
    };
  } catch {
    /* e.g. Android Chrome, which only allows service-worker notifications */
  }
}
