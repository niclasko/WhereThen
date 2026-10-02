import { useEffect, useState } from 'react';

export interface ImportProgress {
  done: number;
  total: number;
  located: number;
  startedAt: number;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 5) return 'almost done';
  if (s < 60) return `about ${s} s left`;
  return `about ${Math.ceil(s / 60)} min left`;
}

interface Props {
  picking: boolean;
  progress?: ImportProgress;
  onCancel: () => void;
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ImportProgressPanel({ picking, progress, onCancel }: Props) {
  const [, tick] = useState(0);
  const [waitingSince] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (picking || !progress) {
    const waited = Date.now() - waitingSince;
    return (
      <div className="progress-panel" role="status" aria-live="polite">
        <div className="progress-head">
          <strong>Waiting for your photos… {formatElapsed(waited)}</strong>
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <div className="progress-track indeterminate">
          <span />
        </div>
        <p className="muted small">
          Your device is preparing the photos and downloads any that are stored only in iCloud. It doesn’t tell
          websites how far along it is, so the progress bar starts once all photos have arrived. Keep this screen open.
        </p>
        {waited > 30_000 && (
          <p className="muted small">
            Taking long? Next time, pick about 50 photos at a time and add the rest with “+ Add photos”.
          </p>
        )}
      </div>
    );
  }

  const { done, total, located, startedAt } = progress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const elapsed = Date.now() - startedAt;
  const remaining = done >= 3 && done < total ? (elapsed / done) * (total - done) : undefined;

  return (
    <div className="progress-panel" role="status" aria-live="polite">
      <div className="progress-head">
        <strong>
          Reading photo details… {done} of {total}
        </strong>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Photos processed"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-stats muted small">
        <span>{pct}%</span>
        <span>📍 {located} with location</span>
        {remaining !== undefined && <span>{formatRemaining(remaining)}</span>}
      </div>
    </div>
  );
}
