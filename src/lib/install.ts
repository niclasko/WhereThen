import type { DevicePlatform } from '../providers/icloud';

const DISMISS_KEY = 'wherethen.installHintDismissed';

/** True when running as an installed (Home Screen) app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/**
 * On iPhone/iPad, Safari may delete a website's storage after 7 days without a visit; Home Screen apps are
 * exempt. Android and desktop browsers don't do this, so the hint is only shown on iOS in a browser tab.
 */
export function shouldShowInstallHint(platform: DevicePlatform, standalone: boolean, dismissed: boolean): boolean {
  return platform === 'ios' && !standalone && !dismissed;
}

export function isInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* private mode */
  }
}
