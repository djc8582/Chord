import { patch, osc, filter, noise, delay, reverb, lfo, gain, mixer, output, compile } from '../src/dsl/index.js';

const ambient = patch('evening-ambient', {
  tempo: 68,
  key: 'Eb',
  scale: 'dorian',
  description: 'Warm evening ambient',
}, (p) => {
  const vibrato = lfo({ rate: 0.2, depth: 0.15 });
  const pad = osc({ waveform: 'saw', freq: p.scaleNote(3, 0) });
  const pad2 = osc({ waveform: 'saw', freq: p.scaleNote(3, 2), detune: 7 });
  const padFilter = filter({ cutoff: 600, resonance: 0.3 });

  pad.modulate('frequency', vibrato);
  pad.connect(padFilter);
  pad2.connect(padFilter);

  const rain = noise({ color: 'pink' });
  const rainGain = gain({ level: -18 });
  rain.connect(rainGain);

  const mix = mixer();
  padFilter.connect(mix, 'out', 'in1');
  rainGain.connect(mix, 'out', 'in2');

  const verb = reverb({ decay: 3.5, mix: 0.35 });
  const del = delay({ time: 0.375, feedback: 0.25, mix: 0.15 });
  const out = output();

  mix.connect(del).connect(verb).connect(out);

  p.expose('brightness', padFilter, 'cutoff', { min: 200, max: 4000 });
  p.expose('wetness', verb, 'mix', { min: 0, max: 1 });
});

// Compile to JSON
console.log(compile(ambient));
