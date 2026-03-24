/**
 * ProjectCard — Interactive portfolio card with audio feedback.
 *
 * Demonstrates:
 * - engine.playScaleNote(index) to play a pentatonic note on hover
 * - Framer Motion for smooth hover/tap animations
 * - Each card gets a unique note based on its grid index
 * - Audio-reactive CSS: card border glows with --chord-bass energy
 *
 * The pentatonic scale (C minor: C, Eb, F, G, Bb) guarantees every note
 * combination sounds musical, no matter what order cards are hovered.
 */

import { motion } from 'framer-motion';
import type { Chord } from '@chord/web';

interface ProjectCardProps {
  /** Card index in the grid — determines which pentatonic note to play. */
  index: number;
  title: string;
  description: string;
  tags: string[];
  /** The running Chord engine (null if not yet started). */
  engine: Chord | null;
}

export function ProjectCard({ index, title, description, tags, engine }: ProjectCardProps) {
  function handleHoverStart() {
    if (!engine || !engine.started) return;

    // playScaleNote takes a 0-based scale degree and an optional octave offset.
    // The engine's built-in C minor pentatonic scale ensures every note is consonant.
    // We spread cards across two octaves for variety.
    const octave = index < 5 ? 0 : 1;
    engine.playScaleNote(index, octave, 0.4);
  }

  function handleTap() {
    if (!engine || !engine.started) return;

    // On tap/click, play the same note an octave higher with a shorter duration
    // for a satisfying "select" feel.
    engine.playScaleNote(index, 1, 0.2);
  }

  return (
    <motion.div
      style={styles.card}
      // Framer Motion: smooth scale on hover, subtle press on tap
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onHoverStart={handleHoverStart}
      onTap={handleTap}
    >
      {/* Color accent bar — hue rotates with card index for visual variety */}
      <div
        style={{
          ...styles.accent,
          background: `hsl(${(index * 50 + 20) % 360}, 70%, 55%)`,
        }}
      />

      <h3 style={styles.title}>{title}</h3>
      <p style={styles.description}>{description}</p>

      <div style={styles.tags}>
        {tags.map((tag) => (
          <span key={tag} style={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 24,
    cursor: 'pointer',
    // Audio-reactive border: glows subtly with bass energy via CSS custom property
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 0 calc(var(--chord-bass, 0) * 20px) rgba(255, 107, 53, calc(var(--chord-bass, 0) * 0.3))',
    transition: 'box-shadow 0.15s ease-out',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  accent: {
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  description: {
    fontSize: '0.9rem',
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.5,
    margin: 0,
    flex: 1,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    fontSize: '0.75rem',
    padding: '3px 10px',
    borderRadius: 99,
    background: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: '0.02em',
  },
};
