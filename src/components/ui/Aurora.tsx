import { useEffect, useRef } from 'react';

/**
 * The animated background gradient. One GPU-composited element.
 * Pauses itself when the tab is hidden so it costs nothing in the background —
 * important on a phone that a spectator leaves open for three hours.
 */
export function Aurora() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onVisibility = () => {
      el.style.animationPlayState = document.hidden ? 'paused' : 'running';
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return <div ref={ref} className="aurora" aria-hidden />;
}
