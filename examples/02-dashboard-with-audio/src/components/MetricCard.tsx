import React, { useEffect, useRef } from 'react';
import type { Chord } from '@chord/web';

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  trend: 'up' | 'down' | 'flat';
  engine: Chord;
}

const trendArrows: Record<string, string> = {
  up: '+',
  down: '-',
  flat: '~',
};

const trendColors: Record<string, string> = {
  up: '#22c55e',
  down: '#ef4444',
  flat: '#a1a1aa',
};

/**
 * Displays a metric with label, value, and trend indicator.
 * When the value changes significantly, plays a sonification note
 * through the Chord engine. Higher pitch for increases, lower for decreases.
 *
 * Uses CSS custom properties set by bindAudioToCSS for reactive styling:
 *   --chord-rms   controls glow intensity
 *   --chord-bass  shifts border hue
 */
export function MetricCard({ label, value, unit = '', trend, engine }: MetricCardProps) {
  const prevValueRef = useRef(value);

  useEffect(() => {
    const prev = prevValueRef.current;
    const delta = value - prev;
    const threshold = Math.abs(prev) * 0.02 || 1; // 2% change or at least 1

    if (Math.abs(delta) > threshold && engine.started) {
      // Sonify: higher pitch for increase, lower for decrease
      if (delta > 0) {
        engine.playNote(523.25, 0.3, 0.15); // C5
      } else {
        engine.playNote(261.63, 0.3, 0.15); // C4
      }
    }

    prevValueRef.current = value;
  }, [value, engine]);

  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <div className="metric-trend" style={{ color: trendColors[trend] }}>
        {trendArrows[trend]} {trend}
      </div>
    </div>
  );
}
