import React, { useEffect, useRef, useState } from 'react';
import { bindAudioToCSS } from '@chord/web';
import { useChordEngine } from './hooks/useChordEngine';
import { MetricCard } from './components/MetricCard';
import { WaveformHeader } from './components/WaveformHeader';
import { SpectrumChart } from './components/SpectrumChart';
import { AudioControls } from './components/AudioControls';

interface Metric {
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'flat';
}

/** Simulate dashboard metrics that change over time. */
function useSimulatedMetrics(): Metric[] {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Active Users', value: 12847, unit: '', trend: 'up' },
    { label: 'Revenue', value: 48293, unit: '$', trend: 'up' },
    { label: 'Latency', value: 42, unit: 'ms', trend: 'down' },
    { label: 'Error Rate', value: 0.12, unit: '%', trend: 'flat' },
    { label: 'Throughput', value: 3420, unit: 'req/s', trend: 'up' },
    { label: 'CPU Usage', value: 67, unit: '%', trend: 'flat' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(m => {
        const jitter = (Math.random() - 0.45) * 0.06; // slight upward bias
        const newValue = m.unit === '%' && m.label === 'Error Rate'
          ? Math.max(0, +(m.value + jitter * 0.5).toFixed(2))
          : m.unit === 'ms'
            ? Math.max(1, Math.round(m.value * (1 + jitter)))
            : m.unit === '%'
              ? Math.min(100, Math.max(0, Math.round(m.value * (1 + jitter))))
              : Math.max(0, Math.round(m.value * (1 + jitter)));

        const delta = newValue - m.value;
        const trend: Metric['trend'] =
          Math.abs(delta) < (Math.abs(m.value) * 0.005 || 0.5) ? 'flat'
            : delta > 0 ? 'up' : 'down';

        return { ...m, value: newValue, trend };
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}

export function App() {
  const { engine, isPlaying, start, stop } = useChordEngine();
  const metrics = useSimulatedMetrics();
  const cssBindCleanup = useRef<(() => void) | null>(null);

  // Bind audio-reactive CSS custom properties to document root
  useEffect(() => {
    if (isPlaying) {
      cssBindCleanup.current = bindAudioToCSS(engine, document.documentElement);
    }
    return () => {
      cssBindCleanup.current?.();
      cssBindCleanup.current = null;
    };
  }, [engine, isPlaying]);

  return (
    <>
      <style>{styles}</style>
      <div className="dashboard">
        {/* Header with decorative waveform */}
        <header className="dashboard-header">
          <div className="header-content">
            <h1 className="header-title">Analytics Dashboard</h1>
            <p className="header-subtitle">
              Data sonification &middot; Audio-reactive UI &middot; Powered by Chord
            </p>
          </div>
          <WaveformHeader engine={engine} isPlaying={isPlaying} />
        </header>

        <div className="dashboard-body">
          {/* Main content area */}
          <main className="dashboard-main">
            {/* Metric cards grid */}
            <section className="metrics-grid">
              {metrics.map(m => (
                <MetricCard
                  key={m.label}
                  label={m.label}
                  value={m.value}
                  unit={m.unit}
                  trend={m.trend}
                  engine={engine}
                />
              ))}
            </section>

            {/* Chart area with spectrum background */}
            <section className="chart-section">
              <SpectrumChart engine={engine} isPlaying={isPlaying} />
            </section>
          </main>

          {/* Sidebar with audio controls */}
          <aside className="dashboard-sidebar">
            <AudioControls
              engine={engine}
              isPlaying={isPlaying}
              onStart={start}
              onStop={stop}
            />

            <div className="sidebar-info">
              <div className="info-header">How It Works</div>
              <p className="info-text">
                Click <strong>Start Audio</strong> to activate the ambient
                engine. The waveform and spectrum visualizers react to the audio
                signal. Metric cards play notes when values shift. CSS custom
                properties like <code>--chord-rms</code> and <code>--chord-bass</code> drive
                the glow and border effects on every card.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/* ---------- Styles ---------- */

const styles = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: #09090b;
    color: #fafafa;
    -webkit-font-smoothing: antialiased;
  }

  .dashboard {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* --- Header --- */

  .dashboard-header {
    position: relative;
    padding: 2rem 2rem 1.5rem;
    border-bottom: 1px solid #27272a;
    overflow: hidden;
  }

  .header-content {
    position: relative;
    z-index: 1;
  }

  .header-title {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .header-subtitle {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #71717a;
  }

  .waveform-header-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.25;
  }

  .waveform-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* --- Body layout --- */

  .dashboard-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .dashboard-main {
    flex: 1;
    padding: 1.5rem 2rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .dashboard-sidebar {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid #27272a;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* --- Metric cards --- */

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
  }

  .metric-card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 1.25rem;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
    box-shadow:
      0 0 calc(var(--chord-rms, 0) * 40px) rgba(124, 58, 237, 0.3),
      0 1px 3px rgba(0, 0, 0, 0.3);
    border-color: hsl(
      calc(270 + var(--chord-bass, 0) * 40),
      calc(20% + var(--chord-bass, 0) * 40%),
      calc(18% + var(--chord-rms, 0) * 12%)
    );
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a1a1aa;
    margin-bottom: 0.5rem;
  }

  .metric-value {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .metric-unit {
    font-size: 0.875rem;
    font-weight: 400;
    color: #71717a;
    margin-left: 0.15em;
  }

  .metric-trend {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  /* --- Chart section --- */

  .chart-section {
    flex: 1;
    min-height: 240px;
  }

  .spectrum-chart-container {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: #18181b;
    border: 1px solid #27272a;
  }

  .spectrum-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .chart-overlay {
    position: absolute;
    top: 1.25rem;
    left: 1.25rem;
    z-index: 1;
    pointer-events: none;
  }

  .chart-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .chart-subtitle {
    font-size: 0.75rem;
    color: #71717a;
    margin-top: 0.25rem;
  }

  /* --- Audio controls --- */

  .audio-controls {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .controls-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a1a1aa;
  }

  .control-button {
    width: 100%;
    padding: 0.625rem;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    background: #27272a;
    color: #fafafa;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .control-button:hover {
    background: #3f3f46;
    border-color: #52525b;
  }

  .control-button.playing {
    background: #7c3aed;
    border-color: #8b5cf6;
  }

  .control-button.playing:hover {
    background: #6d28d9;
  }

  .volume-control {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .volume-label {
    font-size: 0.75rem;
    color: #a1a1aa;
  }

  .volume-slider {
    width: 100%;
    accent-color: #7c3aed;
    cursor: pointer;
  }

  .volume-value {
    font-size: 0.75rem;
    color: #71717a;
    font-variant-numeric: tabular-nums;
  }

  .mute-button {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    background: transparent;
    color: #a1a1aa;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .mute-button:hover {
    background: #27272a;
    color: #fafafa;
  }

  .mute-button.muted {
    color: #ef4444;
    border-color: #7f1d1d;
  }

  .engine-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #71717a;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* --- Sidebar info --- */

  .sidebar-info {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 1.25rem;
  }

  .info-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a1a1aa;
    margin-bottom: 0.625rem;
  }

  .info-text {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #a1a1aa;
  }

  .info-text strong {
    color: #fafafa;
  }

  .info-text code {
    font-size: 0.75rem;
    background: #27272a;
    padding: 0.125em 0.375em;
    border-radius: 4px;
    color: #a78bfa;
  }

  /* --- Responsive --- */

  @media (max-width: 768px) {
    .dashboard-body {
      flex-direction: column;
    }

    .dashboard-sidebar {
      width: 100%;
      border-left: none;
      border-top: 1px solid #27272a;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;
