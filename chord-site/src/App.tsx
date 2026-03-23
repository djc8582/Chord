import { useState, useRef, useEffect, useCallback } from 'react'
import { Chord } from '@chord/web'

// Pentatonic scale for musical interactions
const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0]

function App() {
  const chordRef = useRef<Chord | null>(null)
  const [started, setStarted] = useState(false)
  const [typing, setTyping] = useState('')
  const [typingIdx, setTypingIdx] = useState(0)

  // The text that types out on hero
  const heroCode = `Chord.create('cinematic evolving atmosphere')`

  // Auto-type effect
  useEffect(() => {
    if (!started || typingIdx >= heroCode.length) return
    const t = setTimeout(() => {
      setTyping(heroCode.slice(0, typingIdx + 1))
      setTypingIdx(i => i + 1)
      // Play a subtle keystroke note through Chord
      if (chordRef.current) {
        const note = PENTA[typingIdx % PENTA.length]
        chordRef.current.playNote(note, 0.08, 0.06)
      }
    }, 60)
    return () => clearTimeout(t)
  }, [started, typingIdx, heroCode])

  const handleStart = useCallback(async () => {
    try {
      const chord = new Chord()
      await chord.start()
      chord.setMasterVolume(0.4)
      chordRef.current = chord

      // Build the ambient foundation — ALL through Chord
      const bass = chord.addNode('oscillator')
      chord.setParameter(bass, 'frequency', 65.41) // C2
      chord.setParameter(bass, 'waveform', 0) // sine
      chord.setParameter(bass, 'gain', 0.1)

      const pad1 = chord.addNode('oscillator')
      chord.setParameter(pad1, 'frequency', 261.6) // C4
      chord.setParameter(pad1, 'waveform', 1) // saw
      chord.setParameter(pad1, 'detune', -8)
      chord.setParameter(pad1, 'gain', 0.04)

      const pad2 = chord.addNode('oscillator')
      chord.setParameter(pad2, 'frequency', 392.0) // G4
      chord.setParameter(pad2, 'waveform', 1)
      chord.setParameter(pad2, 'detune', 6)
      chord.setParameter(pad2, 'gain', 0.04)

      const filter = chord.addNode('filter')
      chord.setParameter(filter, 'cutoff', 600)
      chord.setParameter(filter, 'resonance', 1.5)

      const lfo = chord.addNode('lfo')
      chord.setParameter(lfo, 'rate', 0.06)
      chord.setParameter(lfo, 'depth', 0.5)

      const delay = chord.addNode('delay')
      chord.setParameter(delay, 'time', 0.5)
      chord.setParameter(delay, 'feedback', 0.3)
      chord.setParameter(delay, 'mix', 0.2)

      const reverb = chord.addNode('reverb')
      chord.setParameter(reverb, 'room_size', 0.85)
      chord.setParameter(reverb, 'mix', 0.4)

      const gain = chord.addNode('gain')
      chord.setParameter(gain, 'gain', 0.5)

      const output = chord.addNode('output')

      // Wire: pads → filter ← LFO, bass + filter → delay → reverb → gain → output
      chord.connect(pad1, 'out', filter, 'in')
      chord.connect(pad2, 'out', filter, 'in')
      chord.connect(lfo, 'out', filter, 'cutoff_mod')
      const mixer = chord.addNode('mixer')
      chord.connect(bass, 'out', mixer, 'in1')
      chord.connect(filter, 'out', mixer, 'in2')
      chord.connect(mixer, 'out', delay, 'in')
      chord.connect(delay, 'out', reverb, 'in')
      chord.connect(reverb, 'out', gain, 'in')
      chord.connect(gain, 'out', output, 'in')

      // Opening boom
      chord.playNote(65, 5, 0.35)
      chord.playNote(44, 6, 0.2)

      setStarted(true)
    } catch (e) {
      console.error('Start failed:', e)
      setStarted(true) // show site anyway
    }
  }, [])

  // Mouse interaction: filter + reverb
  useEffect(() => {
    if (!started || !chordRef.current) return
    const onMove = (_e: MouseEvent) => {
      // Mouse position can drive filter/reverb via Chord — extensible
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [started])

  // ─── LANDING ───
  if (!started) {
    return (
      <div onClick={handleStart} style={{
        width: '100vw', height: '100vh', background: '#06060a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <h1 style={{ fontSize: 72, fontWeight: 200, color: '#e8e8ed', letterSpacing: '0.15em', margin: 0 }}>
          chord
        </h1>
        <p style={{ color: '#6e6e7a', fontSize: 18, marginTop: 16, fontWeight: 300 }}>
          The audio engine for everything.
        </p>
        <div style={{
          marginTop: 60, padding: '14px 32px', border: '1px solid #7c5cff40',
          borderRadius: 8, color: '#7c5cff', fontSize: 14, fontWeight: 500,
          letterSpacing: '0.05em', transition: 'all 0.3s',
        }}>
          Enter
        </div>
        <p style={{ color: '#6e6e7a40', fontSize: 11, marginTop: 40, fontFamily: 'monospace' }}>
          Audio starts on click
        </p>
      </div>
    )
  }

  // ─── MAIN SITE ───
  return (
    <div style={{ background: '#06060a', color: '#e8e8ed', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* HERO */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 64, fontWeight: 200, letterSpacing: '0.12em', margin: 0, color: '#e8e8ed' }}>
          chord
        </h1>
        <p style={{ color: '#6e6e7a', fontSize: 20, marginTop: 12, fontWeight: 300 }}>
          The audio engine for everything.
        </p>

        {/* Typing animation */}
        <div style={{
          marginTop: 60, padding: '16px 24px', background: '#0d0d12',
          borderRadius: 8, border: '1px solid #1a1a24', fontFamily: 'JetBrains Mono, monospace',
          fontSize: 15, color: '#00e5a0', minWidth: 500, textAlign: 'left',
        }}>
          <span style={{ color: '#6e6e7a' }}>const music = </span>
          {typing}
          <span style={{ animation: 'blink 1s infinite', color: '#7c5cff' }}>│</span>
        </div>

        <p style={{ color: '#6e6e7a60', fontSize: 12, marginTop: 20 }}>
          ↑ Each character you see was a note played through Chord
        </p>

        {/* Waveform viz placeholder */}
        <WaveformViz chord={chordRef.current} />

        <style>{`@keyframes blink { 0%,50% { opacity: 1 } 51%,100% { opacity: 0 } }`}</style>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '120px 40px', maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 42, fontWeight: 300, marginBottom: 16 }}>Describe sound, get sound.</h2>
        <p style={{ color: '#6e6e7a', fontSize: 16, lineHeight: 1.7, maxWidth: 600 }}>
          One line of code. No Web Audio boilerplate. No samples to load.
          Chord translates what you want into real-time synthesis.
        </p>

        <div style={{ marginTop: 40 }}>
          <CodeBlock>
{`// What you write with Chord:
const rain = Chord.create('gentle rain on a window');
rain.start();

// What you'd write without Chord:
// 847 lines of Web Audio API code...
// createOscillator, createGain, createBiquadFilter,
// createConvolver, createDynamicsCompressor, ...
// grain scheduling, noise generation, filter banks,
// envelope followers, gain staging, click prevention...`}
          </CodeBlock>
        </div>
      </section>

      {/* INTERACTIVE: Collision */}
      <section style={{ padding: '80px 40px', borderTop: '1px solid #1a1a24' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 300, marginBottom: 8 }}>Try it.</h2>
          <p style={{ color: '#6e6e7a', fontSize: 14, marginBottom: 24 }}>
            Click below to throw shapes. Every collision plays a note through <code style={{
              color: '#00e5a0', background: '#0d0d12', padding: '2px 6px', borderRadius: 4, fontSize: 13,
            }}>chord.playNote()</code>
          </p>
          <CollisionCanvas chord={chordRef.current} />
        </div>
      </section>

      {/* INTERACTIVE: Keyboard */}
      <section style={{ padding: '80px 40px', borderTop: '1px solid #1a1a24' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 300, marginBottom: 8 }}>Play it.</h2>
          <p style={{ color: '#6e6e7a', fontSize: 14, marginBottom: 24 }}>
            Click the keys. Every note is <code style={{
              color: '#00e5a0', background: '#0d0d12', padding: '2px 6px', borderRadius: 4, fontSize: 13,
            }}>chord.playNote(freq, 0.5)</code>
          </p>
          <PianoKeys chord={chordRef.current} />
        </div>
      </section>

      {/* INTERACTIVE: Drum pads */}
      <section style={{ padding: '80px 40px', borderTop: '1px solid #1a1a24' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 300, marginBottom: 8 }}>Hit it.</h2>
          <p style={{ color: '#6e6e7a', fontSize: 14, marginBottom: 24 }}>
            Drum pads. Each is <code style={{
              color: '#00e5a0', background: '#0d0d12', padding: '2px 6px', borderRadius: 4, fontSize: 13,
            }}>chord.addNode('kick_drum')</code> — synthesized, not sampled.
          </p>
          <DrumPads chord={chordRef.current} />
        </div>
      </section>

      {/* INSTALL */}
      <section style={{ padding: '120px 40px', textAlign: 'center', borderTop: '1px solid #1a1a24' }}>
        <h2 style={{ fontSize: 42, fontWeight: 300, marginBottom: 24 }}>Get started.</h2>
        <div style={{
          display: 'inline-block', padding: '14px 32px', background: '#0d0d12',
          borderRadius: 8, border: '1px solid #1a1a24', fontFamily: 'monospace',
          fontSize: 16, color: '#00e5a0', cursor: 'pointer',
        }} onClick={() => navigator.clipboard?.writeText('npm install @chord/web')}>
          npm install @chord/web
        </div>
        <div style={{ marginTop: 40, color: '#6e6e7a', fontSize: 14, lineHeight: 2 }}>
          <code style={{ color: '#e8e8ed', fontFamily: 'monospace' }}>
            {`import { Chord } from '@chord/web';\nconst music = new Chord();\nawait music.start();\nmusic.playNote(440, 1);`}
          </code>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '80px 40px', textAlign: 'center', borderTop: '1px solid #1a1a24' }}>
        <p style={{ color: '#6e6e7a', fontSize: 13, maxWidth: 500, margin: '0 auto', lineHeight: 1.8 }}>
          Every sound on this site was synthesized in real-time by Chord.
          No audio files. No recordings. Just math, making sound, in your browser.
        </p>
        <p style={{ color: '#7c5cff', fontSize: 12, marginTop: 24, fontFamily: 'monospace' }}>
          chord.audio
        </p>
      </footer>
    </div>
  )
}

// ─── Waveform visualization ───
function WaveformViz({ chord }: { chord: Chord | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!chord) return
    let raf: number
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { raf = requestAnimationFrame(draw); return }
      const ctx = canvas.getContext('2d')!
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const data = chord.getWaveformData?.() ?? []
      if (data.length === 0) { raf = requestAnimationFrame(draw); return }

      ctx.strokeStyle = '#7c5cff40'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * w
        const y = h / 2 + (data[i] ?? 0) * h * 0.4
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [chord])

  return <canvas ref={canvasRef} width={600} height={80} style={{ marginTop: 40, opacity: 0.6 }} />
}

// ─── Collision canvas ───
function CollisionCanvas({ chord }: { chord: Chord | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const balls = useRef<Array<{x:number;y:number;vx:number;vy:number;r:number;h:number}>>([])

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!chord || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    balls.current.push({ x, y, vx: (Math.random()-.5)*6, vy: (Math.random()-.5)*6, r: 12+Math.random()*20, h: Math.random()*360 })
    chord.playNote(PENTA[Math.floor(Math.random()*PENTA.length)], 0.3, 0.15)
  }, [chord])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    const animate = () => {
      const w = canvas.width = canvas.clientWidth, h = canvas.height = canvas.clientHeight
      ctx.fillStyle = 'rgba(6,6,10,0.2)'; ctx.fillRect(0,0,w,h)
      for (const b of balls.current) {
        b.vy += 0.12; b.x += b.vx; b.y += b.vy
        if (b.x-b.r<0||b.x+b.r>w) { b.vx*=-0.9; b.x=Math.max(b.r,Math.min(w-b.r,b.x)); if(chord&&Math.abs(b.vx)>1) chord.playNote(200+Math.random()*600,0.1,0.08) }
        if (b.y+b.r>h) { b.vy*=-0.85; b.y=h-b.r; if(chord&&Math.abs(b.vy)>1) chord.playNote(100+Math.random()*400,0.12,0.1) }
        ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2)
        ctx.fillStyle=`hsla(${b.h},60%,55%,0.8)`; ctx.fill()
      }
      raf=requestAnimationFrame(animate)
    }
    raf=requestAnimationFrame(animate)
    return()=>cancelAnimationFrame(raf)
  }, [chord])

  return <canvas ref={ref} onClick={onClick} style={{ width:'100%', height:350, borderRadius:8, border:'1px solid #1a1a24', background:'#0a0a0f', cursor:'crosshair' }} />
}

// ─── Piano keys ───
function PianoKeys({ chord }: { chord: Chord | null }) {
  const notes = [
    { name: 'C', freq: 261.6, black: false },
    { name: 'D', freq: 293.7, black: false },
    { name: 'E', freq: 329.6, black: false },
    { name: 'F', freq: 349.2, black: false },
    { name: 'G', freq: 392.0, black: false },
    { name: 'A', freq: 440.0, black: false },
    { name: 'B', freq: 493.9, black: false },
    { name: 'C', freq: 523.3, black: false },
  ]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {notes.map((n, i) => (
        <button key={i} onClick={() => chord?.playNote(n.freq, 0.6, 0.25)}
          style={{
            flex: 1, height: 120, background: '#0d0d12', border: '1px solid #1a1a24',
            borderRadius: 6, color: '#6e6e7a', fontSize: 12, fontFamily: 'monospace',
            cursor: 'pointer', transition: 'all 0.1s',
          }}
          onMouseDown={e => (e.currentTarget.style.background = '#7c5cff20')}
          onMouseUp={e => (e.currentTarget.style.background = '#0d0d12')}
          onMouseLeave={e => (e.currentTarget.style.background = '#0d0d12')}
        >
          {n.name}
        </button>
      ))}
    </div>
  )
}

// ─── Drum pads ───
function DrumPads({ chord }: { chord: Chord | null }) {
  const drums = useRef<Map<string, string>>(new Map())

  const trigger = useCallback((type: string) => {
    if (!chord) return
    if (!drums.current.has(type)) {
      const id = chord.addNode(type)
      const g = chord.addNode('gain')
      const o = chord.addNode('output')
      chord.setParameter(g, 'gain', 0.6)
      chord.connect(id, 'out', g, 'in')
      chord.connect(g, 'out', o, 'in')
      drums.current.set(type, id)
    }
    chord.triggerNode(drums.current.get(type)!)
  }, [chord])

  const pads = [
    { type: 'kick_drum', label: 'KICK', color: '#ff5c5c' },
    { type: 'snare_drum', label: 'SNARE', color: '#00e5a0' },
    { type: 'hi_hat', label: 'HAT', color: '#7c5cff' },
    { type: 'clap', label: 'CLAP', color: '#ffd700' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {pads.map(p => (
        <button key={p.type} onClick={() => trigger(p.type)}
          style={{
            height: 100, background: p.color + '15', border: `1px solid ${p.color}30`,
            borderRadius: 8, color: p.color, fontSize: 13, fontFamily: 'monospace',
            fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s',
          }}
          onMouseDown={e => (e.currentTarget.style.background = p.color + '30')}
          onMouseUp={e => (e.currentTarget.style.background = p.color + '15')}
          onMouseLeave={e => (e.currentTarget.style.background = p.color + '15')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Code block ───
function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{
      background: '#0d0d12', border: '1px solid #1a1a24', borderRadius: 8,
      padding: 20, fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
      color: '#6e6e7a', lineHeight: 1.7, overflow: 'auto', whiteSpace: 'pre-wrap',
    }}>
      {children}
    </pre>
  )
}

export default App
