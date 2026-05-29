import { useCallback, useRef, useState } from 'react';
import { load, save } from '../persistence';

/**
 * Hook partagé : panneau droit redimensionnable par drag.
 * Utilisé par BriefingView et SuivisView.
 */
export function useResizableRightPanel(
  storageKey: string,
  initialWidth: number,
  minRight = 280,
  minLeft = 280,
) {
  const [width, setWidth] = useState(() => load<number>(storageKey, initialWidth));
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const clamp = (raw: number) => {
    const containerW = containerRef.current?.getBoundingClientRect().width ?? Infinity;
    return Math.max(minRight, Math.min(containerW - minLeft, raw));
  };

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setWidth(clamp(rect.right - ev.clientX));
      };
      const onUp = (ev: MouseEvent) => {
        dragging.current = false;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const next = clamp(rect.right - ev.clientX);
          setWidth(next);
          save(storageKey, next);
        }
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [storageKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { width, containerRef, onMouseDown };
}
