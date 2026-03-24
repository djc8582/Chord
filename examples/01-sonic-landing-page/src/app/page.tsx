'use client';

import { useEffect, useState } from 'react';
import { SonicSection } from '@/components/SonicSection';
import { SonicButton } from '@/components/SonicButton';
import { useScrollAudio } from '@/hooks/useScrollAudio';
import { useAudio } from '@/providers/AudioProvider';

// ---------------------------------------------------------------------------
// Landing page with 4 sections. Each section triggers a different pentatonic
// note when it scrolls into view. Scroll position continuously drives filter
// cutoff and reverb mix via useScrollAudio.
// ---------------------------------------------------------------------------

export default function HomePage() {
  const { engine, started } = useAudio();

  // We need the filter and reverb node IDs to wire up scroll audio.
  // The AudioProvider builds the patch internally, so we read the node IDs
  // by scanning the engine's node list. The provider creates nodes in a
  // deterministic order: osc1, osc2, mixer, filter, lfo, reverb, output.
  // We find filter (type 'filter') and reverb (type 'reverb') by type.
  const [scrollIds, setScrollIds] = useState<{
    filterId: string;
    reverbId: string;
  } | null>(null);

  useEffect(() => {
    if (!engine || !started) return;

    // Find the filter and reverb nodes by scanning IDs
    const ids = engine.getNodeIds();
    let filterId: string | null = null;
    let reverbId: string | null = null;

    for (const id of ids) {
      const type = engine.getNodeType(id);
      if (type === 'filter' && !filterId) filterId = id;
      if (type === 'reverb' && !reverbId) reverbId = id;
    }

    if (filterId && reverbId) {
      setScrollIds({ filterId, reverbId });
    }
  }, [engine, started]);

  // Connect scroll position to the engine
  useScrollAudio(engine, scrollIds);

  return (
    <main>
      {/* Click-to-start prompt */}
      {!started && <StartPrompt />}

      {/* ---------- Hero Section ---------- */}
      <SonicSection
        index={0}
        octave={1}
        className="section"
        style={sectionStyle({ minHeight: '100vh', justifyContent: 'center' })}
      >
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              margin: '0 0 24px',
              // Audio-reactive text glow
              textShadow:
                '0 0 40px rgba(96,165,250, calc(var(--chord-rms, 0) * 2))',
            }}
          >
            Sound meets interface.
          </h1>
          <p style={{ fontSize: 18, opacity: 0.7, lineHeight: 1.6, margin: '0 0 40px' }}>
            Every scroll, click, and transition plays through a real audio
            engine. This is what the web sounds like when you add Chord.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <SonicButton variant="primary">Get started</SonicButton>
            <SonicButton variant="secondary">Learn more</SonicButton>
          </div>
        </div>
      </SonicSection>

      {/* ---------- Features Section ---------- */}
      <SonicSection
        index={1}
        octave={0}
        style={sectionStyle({ padding: '120px 24px' })}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={headingStyle}>Features</h2>
          <div style={gridStyle}>
            <FeatureCard
              title="Scroll-driven audio"
              description="Filter cutoff and reverb depth change as you scroll, turning navigation into a musical experience."
            />
            <FeatureCard
              title="Intersection sounds"
              description="Each section plays a pentatonic note when it enters view. The page becomes a melody."
            />
            <FeatureCard
              title="Audio-reactive CSS"
              description="CSS custom properties like --chord-rms and --chord-bass update at 60fps for visual feedback."
            />
            <FeatureCard
              title="UI interaction sounds"
              description="Buttons, hovers, and transitions all produce tasteful audio cues through the Chord engine."
            />
            <FeatureCard
              title="Real audio graph"
              description="Two detuned oscillators, a filter, LFO, and reverb -- a real synthesizer patch, not samples."
            />
            <FeatureCard
              title="Zero configuration"
              description="Import Chord, build a patch, call start(). The engine handles Web Audio context, cleanup, and routing."
            />
          </div>
        </div>
      </SonicSection>

      {/* ---------- Testimonials Section ---------- */}
      <SonicSection
        index={2}
        octave={0}
        style={sectionStyle({ padding: '120px 24px' })}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={headingStyle}>What people say</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <Testimonial
              quote="Adding Chord to our landing page took 20 minutes. The scroll-synced pad alone made our conversion rate spike."
              author="Alex R., Frontend Lead"
            />
            <Testimonial
              quote="We replaced all our UI sound effects with a single Chord patch. Way more cohesive and about 200KB lighter."
              author="Sam K., Product Designer"
            />
            <Testimonial
              quote="The audio-reactive CSS properties are genius. Our hero section literally pulses with the music now."
              author="Jordan M., Creative Developer"
            />
          </div>
        </div>
      </SonicSection>

      {/* ---------- CTA Section ---------- */}
      <SonicSection
        index={3}
        octave={1}
        style={sectionStyle({
          padding: '120px 24px',
          minHeight: '60vh',
          justifyContent: 'center',
        })}
      >
        <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
          <h2
            style={{
              ...headingStyle,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            Ready to make your site sing?
          </h2>
          <p style={{ fontSize: 18, opacity: 0.6, lineHeight: 1.6, margin: '0 0 40px' }}>
            Install @chord/web, wire up a patch, and let your users hear what
            your product feels like.
          </p>
          <SonicButton variant="primary" onClick={() => {
            // Play a little success jingle
            const eng = engine;
            if (eng && eng.started) {
              eng.playScaleNote(0, 1, 0.2);
              setTimeout(() => eng.playScaleNote(2, 1, 0.2), 100);
              setTimeout(() => eng.playScaleNote(4, 1, 0.4), 200);
            }
          }}>
            Start building
          </SonicButton>
        </div>
      </SonicSection>

      {/* Footer */}
      <footer
        style={{
          textAlign: 'center',
          padding: '40px 24px',
          opacity: 0.4,
          fontSize: 14,
        }}
      >
        Built with Chord. The audio engine for the web.
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Overlay prompt shown until the user clicks to start audio. */
function StartPrompt() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
      }}
    >
      <p
        style={{
          fontSize: 20,
          fontWeight: 500,
          opacity: 0.8,
          letterSpacing: '-0.01em',
        }}
      >
        Click anywhere to start audio
      </p>
    </div>
  );
}

/** A single feature card in the grid. */
function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '28px 24px',
        // Subtle audio-reactive border glow
        boxShadow:
          '0 0 20px rgba(96,165,250, calc(var(--chord-bass, 0) * 0.15))',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      <h3
        style={{
          fontSize: 18,
          fontWeight: 700,
          margin: '0 0 8px',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 15, opacity: 0.6, lineHeight: 1.5, margin: 0 }}>
        {description}
      </p>
    </div>
  );
}

/** A testimonial block. */
function Testimonial({ quote, author }: { quote: string; author: string }) {
  return (
    <blockquote
      style={{
        margin: 0,
        padding: '24px 28px',
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '3px solid rgba(96,165,250,0.4)',
        borderRadius: '0 8px 8px 0',
      }}
    >
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: '0 0 12px', fontStyle: 'italic' }}>
        &ldquo;{quote}&rdquo;
      </p>
      <cite style={{ fontSize: 14, opacity: 0.5, fontStyle: 'normal' }}>
        &mdash; {author}
      </cite>
    </blockquote>
  );
}

// ---------------------------------------------------------------------------
// Shared inline styles (keeps the single-file layout clean)
// ---------------------------------------------------------------------------

function sectionStyle(
  overrides: React.CSSProperties = {},
): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    padding: '80px 24px',
    ...overrides,
  };
}

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  marginBottom: 48,
  textAlign: 'center' as const,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 20,
};
