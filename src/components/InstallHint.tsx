import { useState } from 'react';
import { currentPlatform } from '../providers/icloud';
import { dismissInstallHint, isInstallHintDismissed, isStandalone, shouldShowInstallHint } from '../lib/install';

/** One-time iPhone/iPad hint: Home Screen apps keep their data; Safari tabs may lose it after 7 days. */
export function InstallHint({ hasTrips }: { hasTrips: boolean }) {
  const [show, setShow] = useState(() => shouldShowInstallHint(currentPlatform, isStandalone(), isInstallHintDismissed()));
  if (!show) return null;

  return (
    <aside className="card install-hint" role="note">
      <header>
        <strong>📲 Keep your trips safe: add WhereThen to your Home Screen</strong>
        <button
          className="link"
          aria-label="Dismiss"
          onClick={() => {
            dismissInstallHint();
            setShow(false);
          }}
        >
          ✕
        </button>
      </header>
      <p className="small">
        Safari may delete data from websites you haven’t opened for 7 days. WhereThen on your Home Screen keeps your
        trips and opens full screen like an app.
      </p>
      <ol className="small">
        <li>
          Tap <strong>Share</strong> <span aria-hidden>(□↑)</span>, then <strong>Add to Home Screen</strong>.
        </li>
        <li>Open WhereThen from your Home Screen from now on.</li>
        {hasTrips && (
          <li>
            The Home Screen app has its own storage, so move your existing trips: tap <strong>Export all trips</strong>{' '}
            below, then <strong>Import trip file…</strong> in the Home Screen app.
          </li>
        )}
      </ol>
    </aside>
  );
}
