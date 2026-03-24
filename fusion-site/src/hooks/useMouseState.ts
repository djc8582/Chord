import { useCallback, useEffect, useRef, useState } from 'react';

export interface MouseState {
  x: number;       // 0-1 normalized X position
  y: number;       // 0-1 normalized Y position (0=top, 1=bottom)
  velocity: number; // 0-1 normalized speed
  idle: boolean;    // true if no movement for 5+ seconds
}

export function useMouseState(): MouseState {
  const [state, setState] = useState<MouseState>({
    x: 0.5, y: 0.5, velocity: 0, idle: false,
  });

  const lastPos = useRef({ x: 0, y: 0 });
  const lastTime = useRef(Date.now());
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const velocityDecay = useRef(0);

  const onMove = useCallback((e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;

    const x = clientX / window.innerWidth;
    const y = clientY / window.innerHeight;
    const now = Date.now();
    const dt = Math.max(now - lastTime.current, 1);
    const dx = clientX - lastPos.current.x;
    const dy = clientY - lastPos.current.y;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    const velocity = Math.min(speed / 2, 1); // normalize

    lastPos.current = { x: clientX, y: clientY };
    lastTime.current = now;
    velocityDecay.current = velocity;

    setState({ x, y: 1 - y, velocity, idle: false }); // invert Y so top=1

    // Reset idle timer
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setState(s => ({ ...s, idle: true }));
    }, 5000);
  }, []);

  // Decay velocity when not moving
  useEffect(() => {
    const interval = setInterval(() => {
      if (velocityDecay.current > 0.01) {
        velocityDecay.current *= 0.9;
        setState(s => ({ ...s, velocity: velocityDecay.current }));
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [onMove]);

  return state;
}
