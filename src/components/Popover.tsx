import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Position of the clicked element, in page (document) coordinates. */
export interface Anchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function anchorFrom(el: Element | null | undefined): Anchor | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY };
}

const GAP = 10;
const MARGIN = 8;
const MAX_WIDTH = 560;

interface Props {
  anchor: Anchor;
  /** Clicks on elements matching this selector don't close the popover (they open another place instead). */
  keepOpenOn: string;
  onClose: () => void;
  children: ReactNode;
}

/** A card that floats right below (or above, if there's more room) the element it was opened from. */
export function Popover({ anchor, keepOpenOn, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const vw = document.documentElement.clientWidth;
      const width = Math.min(MAX_WIDTH, vw - 2 * MARGIN);
      el.style.width = `${width}px`;
      const center = (anchor.left + anchor.right) / 2;
      const left = Math.min(Math.max(center - width / 2, scrollX + MARGIN), scrollX + vw - width - MARGIN);
      const height = el.offsetHeight;
      const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
      const roomAbove = anchor.top - scrollY - Math.max(headerBottom, 0);
      const roomBelow = scrollY + innerHeight - anchor.bottom;
      // Prefer below (the page can scroll there); go above only when it fits there and not below.
      const placeAbove = roomBelow < height + GAP && roomAbove >= height + GAP;
      el.style.left = `${left}px`;
      el.style.top = `${placeAbove ? anchor.top - GAP - height : anchor.bottom + GAP}px`;
      el.style.scrollMarginTop = `${Math.max(headerBottom, 0) + MARGIN}px`;
      el.dataset.side = placeAbove ? 'above' : 'below';
    };
    place();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target) || target.closest(`${keepOpenOn}, .viewer`)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      // The photo viewer handles Escape itself while it's open.
      if (e.key === 'Escape' && !document.querySelector('.viewer')) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [keepOpenOn, onClose]);

  return createPortal(
    <div ref={ref} className="popover">
      {children}
    </div>,
    document.body,
  );
}
