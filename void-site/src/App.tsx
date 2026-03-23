import { useState, useRef, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { VoidEngine } from "./audio/VoidEngine";
import * as THREE from "three";

function App() {
  const [engine] = useState(() => new VoidEngine());
  const [phase, setPhase] = useState<"void" | "boom" | "ambient">("void");
  const [started, setStarted] = useState(false);

  const handleClick = useCallback(async () => {
    if (started) return;
    await engine.start();
    setStarted(true);
    engine.playBoom();
    setPhase("boom");
    setTimeout(() => setPhase("ambient"), 4000);
  }, [engine, started]);

  return (
    <div
      className="w-screen h-screen bg-black overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <ambientLight intensity={0.1} />
        <VoidParticles phase={phase} engine={engine} started={started} />
        {phase !== "void" && <Stars />}
      </Canvas>

      {/* Overlay text */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <div
              className="text-white/30 text-6xl font-light tracking-[0.3em]"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              VOID
            </div>
            <div className="text-white/20 text-sm mt-8 tracking-widest uppercase">
              Click to begin
            </div>
          </div>
        </div>
      )}

      {/* Powered by Chord badge */}
      <div className="absolute bottom-4 right-4 text-white/10 text-xs font-mono z-10">
        Built with Chord
      </div>
    </div>
  );
}

// Particle system that reacts to the boom
function VoidParticles({
  phase,
  engine,
  started,
}: {
  phase: string;
  engine: VoidEngine;
  started: boolean;
}) {
  const meshRef = useRef<THREE.Points>(null);
  const particleCount = 2000;

  const positions = useRef(new Float32Array(particleCount * 3));
  const velocities = useRef(new Float32Array(particleCount * 3));
  const colors = useRef(new Float32Array(particleCount * 3));

  // Initialize particles at center
  useEffect(() => {
    for (let i = 0; i < particleCount; i++) {
      positions.current[i * 3] = 0;
      positions.current[i * 3 + 1] = 0;
      positions.current[i * 3 + 2] = 0;
      colors.current[i * 3] = 0.8;
      colors.current[i * 3 + 1] = 0.9;
      colors.current[i * 3 + 2] = 1.0;
    }
  }, []);

  // On boom: explode particles outward
  useEffect(() => {
    if (phase === "boom") {
      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 0.02 + Math.random() * 0.08;
        velocities.current[i * 3] =
          Math.sin(phi) * Math.cos(theta) * speed;
        velocities.current[i * 3 + 1] =
          Math.sin(phi) * Math.sin(theta) * speed;
        velocities.current[i * 3 + 2] = Math.cos(phi) * speed;
      }
    }
  }, [phase]);

  // Animation loop
  useEffect(() => {
    if (!meshRef.current) return;
    let raf: number;
    const animate = () => {
      const rms = started ? engine.getRMS() : 0;
      const posAttr = meshRef.current?.geometry.attributes.position;
      if (!posAttr) {
        raf = requestAnimationFrame(animate);
        return;
      }

      for (let i = 0; i < particleCount; i++) {
        positions.current[i * 3] += velocities.current[i * 3];
        positions.current[i * 3 + 1] += velocities.current[i * 3 + 1];
        positions.current[i * 3 + 2] += velocities.current[i * 3 + 2];

        // Damping
        velocities.current[i * 3] *= 0.998;
        velocities.current[i * 3 + 1] *= 0.998;
        velocities.current[i * 3 + 2] *= 0.998;

        // Audio reactivity: jitter based on RMS
        positions.current[i * 3] += (Math.random() - 0.5) * rms * 0.02;
        positions.current[i * 3 + 1] +=
          (Math.random() - 0.5) * rms * 0.02;
      }

      (posAttr as THREE.BufferAttribute).set(positions.current);
      posAttr.needsUpdate = true;

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [started, engine]);

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
          count={particleCount}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors.current, 3]}
          count={particleCount}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

function Stars() {
  const count = 5000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 2] = -Math.random() * 100;
  }

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        transparent
        opacity={0.6}
        sizeAttenuation={false}
      />
    </points>
  );
}

export default App;
