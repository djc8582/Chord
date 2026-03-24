/**
 * App — Single-page creative portfolio with generative audio.
 *
 * Demonstrates the full Chord integration pattern:
 * 1. Build the audio graph from a DSL patch definition
 * 2. Start/stop the engine from a user gesture (autoplay policy)
 * 3. Bind audio analysis to CSS custom properties for page-wide reactivity
 * 4. Wire up mouse position to exposed patch parameters
 * 5. Play interaction sounds on project card hover
 *
 * Sections: Hero (particles + title), Projects (interactive grid),
 * About, Contact. All wrapped in a dark theme with audio-reactive accents.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord, bindAudioToCSS } from '@chord/web';
import ambientPatch from './audio/ambient-patch';
import { ParticleHero } from './components/ParticleHero';
import { ProjectCard } from './components/ProjectCard';
import { AudioToggle } from './components/AudioToggle';
import { useMouseAudio } from './hooks/useMouseAudio';

// ---------------------------------------------------------------------------
// Project data
// ---------------------------------------------------------------------------

const PROJECTS = [
  {
    title: 'Generative Landscapes',
    description: 'Procedural terrain generation with real-time audio mapping. Every mountain range has its own frequency signature.',
    tags: ['WebGL', 'Chord', 'Procedural'],
  },
  {
    title: 'Rhythm Machine',
    description: 'A collaborative drum sequencer that syncs across devices using CRDTs. Euclidean rhythms meet social music.',
    tags: ['React', 'Yjs', 'Web Audio'],
  },
  {
    title: 'Sound Garden',
    description: 'An interactive installation where plants generate music based on soil moisture, light, and touch sensors.',
    tags: ['IoT', 'Max/MSP', 'Arduino'],
  },
  {
    title: 'Type & Tone',
    description: 'A typography experiment where each letter triggers a unique synthesized sound. Words become melodies.',
    tags: ['TypeScript', 'Chord DSL', 'SVG'],
  },
  {
    title: 'Data Sonification',
    description: 'Turning climate datasets into ambient soundscapes. 100 years of temperature data become a 10-minute composition.',
    tags: ['D3', 'Chord', 'Data Viz'],
  },
  {
    title: 'Spatial Audio Gallery',
    description: 'A 3D art gallery where each painting emits spatialized audio. Walk through sound as you walk through art.',
    tags: ['Three.js', 'Web Audio', 'HRTF'],
  },
];

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

export default function App() {
  const engineRef = useRef<Chord | null>(null);
  const cleanupCSSRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [engine, setEngine] = useState<Chord | null>(null);

  // Build the audio graph from the DSL patch definition.
  // This constructs nodes and connections on the Chord engine by reading
  // the compiled patch definition (nodes, connections, params).
  const buildPatch = useCallback((chord: Chord) => {
    // Add each node from the DSL definition to the engine
    const idMap = new Map<string, string>();
    for (const nodeDef of ambientPatch.nodes) {
      const realId = chord.addNode(nodeDef.type);
      idMap.set(nodeDef.id, realId);

      // Apply all parameters from the DSL definition
      for (const [param, value] of Object.entries(nodeDef.params)) {
        chord.setParameter(realId, param, value);
      }
    }

    // Wire up all connections from the DSL definition
    for (const conn of ambientPatch.connections) {
      const fromId = idMap.get(conn.fromId);
      const toId = idMap.get(conn.toId);
      if (fromId && toId) {
        chord.connect(fromId, conn.fromPort, toId, conn.toPort);
      }
    }

    // Remap exposed parameter node IDs so the mouse hook can find them
    // The DSL-generated IDs (e.g., "filter_3") need to map to the engine's
    // real IDs (e.g., "node-3").
    for (const param of ambientPatch.exposedParams) {
      const realId = idMap.get(param.nodeId);
      if (realId) {
        param.nodeId = realId;
      }
    }
  }, []);

  // Toggle audio on/off. The first call creates the engine and starts it
  // (satisfying browser autoplay policy via user gesture).
  const toggleAudio = useCallback(async () => {
    if (playing && engineRef.current) {
      // Stop: clean up CSS binding and shut down the engine
      cleanupCSSRef.current?.();
      cleanupCSSRef.current = null;
      engineRef.current.stop();
      engineRef.current = null;
      setEngine(null);
      setPlaying(false);
      return;
    }

    // Start: create a fresh engine, build the patch, and start playback
    const chord = new Chord();
    engineRef.current = chord;
    buildPatch(chord);

    await chord.start();
    chord.setMasterVolume(0.35);

    // Bind audio analysis to CSS custom properties on <html>.
    // This injects --chord-rms, --chord-bass, --chord-beat, etc.
    // so any CSS in the page can react to the audio.
    cleanupCSSRef.current = bindAudioToCSS(chord, document.documentElement);

    setEngine(chord);
    setPlaying(true);
  }, [playing, buildPatch]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupCSSRef.current?.();
      engineRef.current?.stop();
    };
  }, []);

  // Wire mouse position to the patch's exposed parameters.
  // mouseX -> brightness (filter cutoff), mouseY -> space (reverb mix).
  useMouseAudio({ engine, patchDef: ambientPatch });

  return (
    <div style={styles.root}>
      {/* Global CSS reset and audio-reactive variables */}
      <style>{globalCSS}</style>

      {/* Hero section with audio-reactive particle canvas */}
      <ParticleHero engine={engine} />

      {/* Projects section with interactive sonic cards */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Selected Work</h2>
        <div style={styles.grid}>
          {PROJECTS.map((project, i) => (
            <ProjectCard
              key={project.title}
              index={i}
              title={project.title}
              description={project.description}
              tags={project.tags}
              engine={engine}
            />
          ))}
        </div>
      </section>

      {/* About section */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>About</h2>
        <div style={styles.aboutContent}>
          <p style={styles.aboutText}>
            I build things that sound as good as they look. With a background in
            audio engineering and creative coding, I create interactive experiences
            where sound is a first-class citizen -- not an afterthought.
          </p>
          <p style={styles.aboutText}>
            This portfolio itself is an example: the ambient music is generated in
            real time using the Chord DSL, the particles react to audio analysis,
            and your mouse position shapes the sound. Every project card plays a
            note from a pentatonic scale when you hover over it.
          </p>
        </div>
      </section>

      {/* Contact section */}
      <section style={{ ...styles.section, ...styles.contactSection }}>
        <h2 style={styles.sectionTitle}>Get In Touch</h2>
        <p style={styles.contactText}>
          Interested in working together on something that sounds beautiful?
        </p>
        <div style={styles.contactLinks}>
          <a href="mailto:hello@example.com" style={styles.link}>Email</a>
          <a href="https://github.com" style={styles.link}>GitHub</a>
          <a href="https://twitter.com" style={styles.link}>Twitter</a>
        </div>
      </section>

      {/* Floating audio toggle button */}
      <AudioToggle playing={playing} onToggle={toggleAudio} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global CSS — reset + audio-reactive custom property usage
// ---------------------------------------------------------------------------

const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html {
    /* Audio-reactive CSS custom properties are injected here by bindAudioToCSS.
       Default values (0) are used when audio is not playing. */
    --chord-rms: 0;
    --chord-bass: 0;
    --chord-beat: 0;
    --chord-smooth-rms: 0;
    --chord-hue: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #fff;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  a { text-decoration: none; }

  /* Subtle page-wide background shift on beats */
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    background: radial-gradient(
      ellipse at 50% 0%,
      rgba(255, 107, 53, calc(var(--chord-beat) * 0.04)),
      transparent 70%
    );
    transition: background 0.2s ease-out;
  }
`;

// ---------------------------------------------------------------------------
// Component styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
  },
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '80px 24px',
  },
  sectionTitle: {
    fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
    fontWeight: 600,
    marginBottom: 40,
    letterSpacing: '-0.01em',
    color: '#fff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 20,
  },
  aboutContent: {
    maxWidth: 700,
  },
  aboutText: {
    fontSize: '1.1rem',
    lineHeight: 1.7,
    color: 'rgba(255, 255, 255, 0.65)',
    marginBottom: 20,
  },
  contactSection: {
    paddingBottom: 120,
    textAlign: 'center',
  },
  contactText: {
    fontSize: '1.1rem',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 32,
  },
  contactLinks: {
    display: 'flex',
    gap: 24,
    justifyContent: 'center',
  },
  link: {
    fontSize: '1rem',
    color: '#ff6b35',
    padding: '10px 24px',
    borderRadius: 8,
    border: '1px solid rgba(255, 107, 53, 0.3)',
    transition: 'all 0.2s',
  },
};
