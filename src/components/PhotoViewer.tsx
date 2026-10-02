import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PhotoRecord, Trip } from '../types';
import { formatDateTime } from '../lib/format';
import { safeImageSrc } from '../lib/nav';
import { getProvider } from '../providers';

interface Props {
  trip: Trip;
  photos: PhotoRecord[];
  index: number;
  spotOf: (photo: PhotoRecord) => string | undefined;
  onIndex: (index: number) => void;
  onRemove: (photoId: string) => void;
  onClose: () => void;
}

/** Full-screen preview of a photo, using the preview kept in this browser. */
export function PhotoViewer({ trip, photos, index, spotOf, onIndex, onRemove, onClose }: Props) {
  const provider = getProvider(trip.providerId);
  const photo = photos[index];
  const src = safeImageSrc(photo.thumbnail);
  const url = provider.getViewUrl?.(photo.ref);
  const when = photo.localTime ? formatDateTime(photo.localTime) : undefined;
  const spot = spotOf(photo);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const touchX = useRef<number>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === undefined) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = undefined;
        if (dx > 50 && hasPrev) onIndex(index - 1);
        else if (dx < -50 && hasNext) onIndex(index + 1);
      }}
    >
      <header className="viewer-bar">
        <span>
          {index + 1} / {photos.length}
        </span>
        <button ref={closeRef} className="viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="viewer-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {hasPrev && (
          <button className="viewer-nav prev" onClick={() => onIndex(index - 1)} aria-label="Previous photo">
            ‹
          </button>
        )}
        {src ? (
          <img src={src} alt={`Photo${when ? ` from ${when}` : ''}${spot ? `, ${spot}` : ''}`} />
        ) : (
          <div className="viewer-empty">
            <span aria-hidden>📷</span>
            <p>No preview for this photo.</p>
            <p className="small">
              The browser couldn’t read this photo (for example a HEIC file on Windows). Use “+ Add photos” and choose
              it again as a JPEG to add a preview.
            </p>
          </div>
        )}
        {hasNext && (
          <button className="viewer-nav next" onClick={() => onIndex(index + 1)} aria-label="Next photo">
            ›
          </button>
        )}
      </div>

      <footer className="viewer-bar">
        <span>
          <strong>{when ?? 'Unknown time'}</strong>
          {spot && <span className="viewer-file"> · 📍 {spot}</span>}
        </span>
        {url && (
          <a className="viewer-find" href={url} target="_blank" rel="noopener noreferrer">
            {provider.viewLabel ?? 'Open original'} ↗
          </a>
        )}
        <button
          className="viewer-remove"
          onClick={() =>
            window.confirm('Remove this photo from the trip? The original in your photo library is not affected.') &&
            onRemove(photo.id)
          }
        >
          Remove from trip
        </button>
      </footer>
    </div>,
    document.body,
  );
}
