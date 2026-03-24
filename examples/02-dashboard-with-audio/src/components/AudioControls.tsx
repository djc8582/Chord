import React, { useState } from 'react';
import type { Chord } from '@chord/web';

interface AudioControlsProps {
  engine: Chord;
  isPlaying: boolean;
  onStart: () => Promise<void>;
  onStop: () => void;
}

/**
 * Audio transport controls: start/stop, volume slider, mute toggle.
 */
export function AudioControls({ engine, isPlaying, onStart, onStop }: AudioControlsProps) {
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (!muted) {
      engine.setMasterVolume(v);
    }
  };

  const handleMute = () => {
    if (muted) {
      engine.setMasterVolume(volume);
      setMuted(false);
    } else {
      engine.setMasterVolume(0);
      setMuted(true);
    }
  };

  const handleToggle = async () => {
    if (isPlaying) {
      onStop();
    } else {
      await onStart();
    }
  };

  return (
    <div className="audio-controls">
      <div className="controls-header">Audio Engine</div>

      <button
        className={`control-button ${isPlaying ? 'playing' : ''}`}
        onClick={handleToggle}
      >
        {isPlaying ? 'Stop Audio' : 'Start Audio'}
      </button>

      <div className="volume-control">
        <label className="volume-label">Volume</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
          className="volume-slider"
        />
        <span className="volume-value">{muted ? '0' : Math.round(volume * 100)}%</span>
      </div>

      <button
        className={`mute-button ${muted ? 'muted' : ''}`}
        onClick={handleMute}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>

      {isPlaying && (
        <div className="engine-status">
          <div className="status-dot" />
          <span>Engine active</span>
        </div>
      )}
    </div>
  );
}
