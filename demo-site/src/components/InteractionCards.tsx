import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Chord } from '@chord/web';

// Pentatonic scale notes for card interactions
const SCALE_NOTES = [
  523.25, 622.25, 783.99, 830.61, 932.33, 1046.5, 1244.5, 1567.98,
];

interface PatchNodes {
  bass: string;
  pad1: string;
  pad2: string;
  pad3: string;
  filter: string;
  delay: string;
  reverb: string;
  lfo: string;
  noise: string;
  mixer: string;
  output: string;
  kick: string;
  snare: string;
  hat: string;
  drumMixer: string;
  drumGain: string;
}

interface CardProps {
  chord: Chord | null;
  patchNodes: PatchNodes | null;
}

interface InteractionCard {
  title: string;
  description: string;
  icon: string;
  noteIndex: number;
  color: string;
}

const CARDS: InteractionCard[] = [
  {
    title: 'Resonance',
    description: 'Hover to shift the harmonic spectrum',
    icon: '\u2248',
    noteIndex: 0,
    color: 'from-lime-500/20 to-emerald-500/10',
  },
  {
    title: 'Pulse',
    description: 'A rhythmic burst triggered by presence',
    icon: '\u25CB',
    noteIndex: 1,
    color: 'from-violet-500/20 to-purple-500/10',
  },
  {
    title: 'Drift',
    description: 'Slow frequency movement through space',
    icon: '\u223F',
    noteIndex: 2,
    color: 'from-cyan-500/20 to-blue-500/10',
  },
  {
    title: 'Shimmer',
    description: 'High harmonic overtones, crystalline',
    icon: '\u2726',
    noteIndex: 3,
    color: 'from-amber-500/20 to-orange-500/10',
  },
  {
    title: 'Depth',
    description: 'Sub-bass undertones emerge on contact',
    icon: '\u25BD',
    noteIndex: 4,
    color: 'from-rose-500/20 to-pink-500/10',
  },
  {
    title: 'Echo',
    description: 'Reverb tail that cascades endlessly',
    icon: '\u29D6',
    noteIndex: 5,
    color: 'from-teal-500/20 to-green-500/10',
  },
];

function SoundCard({ card, chord }: { card: InteractionCard; chord: Chord | null }) {
  const [isHovered, setIsHovered] = useState(false);

  const handleEnter = () => {
    setIsHovered(true);
    const note = SCALE_NOTES[card.noteIndex % SCALE_NOTES.length];
    chord?.playNote(note, 0.8);
  };

  const handleLeave = () => {
    setIsHovered(false);
  };

  return (
    <motion.div
      className={`relative rounded-2xl border border-white/5 bg-gradient-to-br ${card.color} p-6 cursor-pointer overflow-hidden backdrop-blur-sm`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Glow effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative z-10">
        <span className="text-3xl block mb-3 opacity-60">{card.icon}</span>
        <h3 className="text-lg font-medium text-white/90 mb-1">{card.title}</h3>
        <p className="text-sm text-white/40 leading-relaxed">{card.description}</p>
      </div>

      {/* Animated border */}
      <motion.div
        className="absolute inset-0 rounded-2xl border-2 border-lime-400/0"
        animate={{
          borderColor: isHovered ? 'rgba(200, 255, 0, 0.2)' : 'rgba(200, 255, 0, 0)',
        }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
}

// Drawing pad that creates waveform from strokes
function DrawingPad({ chord }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    lastPosRef.current = pos;
  };

  const onDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);

    // Draw the stroke
    ctx.strokeStyle = 'rgba(200, 255, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    // Map Y position to frequency and play via Chord
    const normalizedY = 1 - pos.y / canvas.height;
    const freq = 200 + normalizedY * 1500;
    chord?.playNote(freq, 0.15);

    lastPosRef.current = pos;
  }, [isDrawing, chord]);

  const endDraw = () => {
    setIsDrawing(false);
    // Fade out canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let opacity = 1;
    const fade = () => {
      opacity -= 0.02;
      if (opacity <= 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.fillStyle = `rgba(10, 10, 10, 0.05)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      requestAnimationFrame(fade);
    };
    fade();
  };

  return (
    <div className="relative rounded-2xl border border-white/5 overflow-hidden bg-white/[0.02]">
      <div className="px-6 pt-4 pb-2">
        <h3 className="text-lg font-medium text-white/90 mb-1">Draw Sound</h3>
        <p className="text-sm text-white/40">Draw on the pad below. Your strokes become sound.</p>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full cursor-crosshair"
        style={{ height: 200, touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={onDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={onDraw}
        onTouchEnd={endDraw}
      />
    </div>
  );
}

// Draggable orbs
function DraggableOrbs({ chord, patchNodes }: CardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const orbs = [
    { id: 'pitch', label: 'Pitch', color: '#c8ff00', defaultX: 100, defaultY: 80 },
    { id: 'reverb', label: 'Space', color: '#7c3aed', defaultX: 250, defaultY: 120 },
    { id: 'texture', label: 'Texture', color: '#06b6d4', defaultX: 400, defaultY: 80 },
  ];

  return (
    <div className="relative rounded-2xl border border-white/5 overflow-hidden bg-white/[0.02]">
      <div className="px-6 pt-4 pb-2">
        <h3 className="text-lg font-medium text-white/90 mb-1">Drag to Shape</h3>
        <p className="text-sm text-white/40">Move the orbs to control pitch, space, and texture.</p>
      </div>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: 200 }}
      >
        {orbs.map((orb) => (
          <motion.div
            key={orb.id}
            className="absolute w-14 h-14 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${orb.color}40, ${orb.color}10)`,
              border: `1px solid ${orb.color}30`,
              boxShadow: `0 0 30px ${orb.color}15`,
              left: orb.defaultX,
              top: orb.defaultY,
            }}
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            whileDrag={{ scale: 1.2 }}
            onDrag={(_e, info) => {
              const container = containerRef.current;
              if (!container || !chord || !patchNodes) return;
              const rect = container.getBoundingClientRect();
              const nx = Math.max(0, Math.min(1, (info.point.x - rect.left) / rect.width));
              const ny = Math.max(0, Math.min(1, (info.point.y - rect.top) / rect.height));

              if (orb.id === 'pitch') {
                // Pitch orb: X controls filter cutoff, Y controls pad pitch
                chord.setParameter(patchNodes.filter, 'cutoff', 200 + nx * 8000);
                chord.setParameter(patchNodes.pad1, 'detune', (nx - 0.5) * 400);
                chord.setParameter(patchNodes.pad2, 'detune', (ny - 0.5) * 400);
                // Play a continuous tone feedback
                chord.playNote(200 + nx * 800, 0.08, 0.1);
              } else if (orb.id === 'reverb') {
                // Space orb: X controls delay time, Y controls reverb mix
                chord.setParameter(patchNodes.reverb, 'mix', ny * 0.9);
                chord.setParameter(patchNodes.delay, 'time', 0.05 + nx * 0.7);
                chord.setParameter(patchNodes.delay, 'feedback', 0.1 + ny * 0.5);
              } else if (orb.id === 'texture') {
                // Texture orb: X controls LFO rate, Y controls resonance
                chord.setParameter(patchNodes.lfo, 'rate', 0.05 + nx * 3);
                chord.setParameter(patchNodes.filter, 'resonance', 0.5 + ny * 8);
              }
            }}
            onDragStart={() => chord?.playNote(
              orb.id === 'pitch' ? 523 : orb.id === 'reverb' ? 392 : 659, 0.3, 0.2
            )}
          >
            <span className="text-[10px] font-medium text-white/60 select-none">
              {orb.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function InteractionCards({ chord, patchNodes }: CardProps) {
  return (
    <div className="space-y-8">
      {/* Sound cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <SoundCard key={card.title} card={card} chord={chord} />
        ))}
      </div>

      {/* Drawing pad and orbs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DrawingPad chord={chord} patchNodes={patchNodes} />
        <DraggableOrbs chord={chord} patchNodes={patchNodes} />
      </div>
    </div>
  );
}
