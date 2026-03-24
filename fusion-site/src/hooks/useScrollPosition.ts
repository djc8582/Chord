import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollPosition() {
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [velocity, setVelocity] = useState(0);
  const lastScroll = useRef(0);
  const lastTime = useRef(Date.now());

  const onScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const t = maxScroll > 0 ? scrollY / maxScroll : 0;

    const now = Date.now();
    const dt = Math.max(now - lastTime.current, 1);
    const dy = Math.abs(scrollY - lastScroll.current);
    const v = Math.min(dy / dt, 1); // normalize to 0-1

    setDirection(scrollY > lastScroll.current ? 'down' : 'up');
    setVelocity(v);
    setProgress(t);

    lastScroll.current = scrollY;
    lastTime.current = now;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // initial
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  return { progress, direction, velocity };
}
