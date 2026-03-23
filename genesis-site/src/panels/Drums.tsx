import { useRef, useEffect, useState } from 'react';
import type { Chord } from '@chord/web';

const KITS = ['kick_drum','snare_drum','hi_hat','clap','tom'];
const LABELS = ['KICK','SNARE','HAT','CLAP','TOM'];
const COLORS = ['#ff4444','#44ff44','#4444ff','#ffff44','#ff44ff'];

export function DrumPanel({ chord, active }: { chord: Chord; active: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState(() => KITS.map(()=>Array(16).fill(false)));
  const [tempo, setTempo] = useState(120);
  const ids = useRef<Map<string,string>>(new Map());
  const intRef = useRef(0);

  useEffect(() => {
    for (const t of KITS) if (!ids.current.has(t)) {
      const id = chord.addNode(t);
      const g = chord.addNode('gain');
      const o = chord.addNode('output');
      chord.setParameter(g,'gain',0.6);
      chord.connect(id,'out',g,'in');
      chord.connect(g,'out',o,'in');
      ids.current.set(t, id);
    }
  }, [chord]);

  useEffect(() => {
    if (!playing||!active){clearInterval(intRef.current);return;}
    const ms=(60000/tempo)/4;
    intRef.current=window.setInterval(()=>{
      setStep(s=>{const n=(s+1)%16;
        grid.forEach((row,di)=>{if(row[n]){const id=ids.current.get(KITS[di]);if(id)chord.triggerNode(id);}});
        return n;});
    },ms);
    return()=>clearInterval(intRef.current);
  },[playing,active,grid,tempo,chord]);

  return (
    <div className="w-full max-w-4xl">
      <h2 className="text-3xl font-light mb-2">Neural Drums</h2>
      <p className="text-white/40 text-sm mb-4 font-mono">Every hit: chord.addNode('kick_drum') → chord.triggerNode(id)</p>
      <div className="flex items-center gap-4 mb-4">
        <button onClick={()=>setPlaying(!playing)} className="px-4 py-2 bg-[#c8ff00] text-black font-mono font-bold text-sm rounded">{playing?'STOP':'PLAY'}</button>
        <span className="text-white/40 text-sm font-mono">BPM: <input type="range" min={60} max={200} value={tempo} onChange={e=>setTempo(+e.target.value)} className="ml-1 align-middle"/> {tempo}</span>
      </div>
      <div className="grid gap-1" style={{gridTemplateColumns:`70px repeat(16,1fr)`}}>
        {KITS.map((_,di)=><>
          <div key={`l${di}`} className="text-xs font-mono flex items-center" style={{color:COLORS[di]}}>{LABELS[di]}</div>
          {Array.from({length:16},(_,si)=>
            <div key={`${di}-${si}`} onClick={()=>setGrid(g=>{const n=g.map(r=>[...r]);n[di][si]=!n[di][si];return n;})}
              className="aspect-square rounded cursor-pointer" style={{
                background:grid[di][si]?(si===step&&playing?'#fff':COLORS[di]):(si===step&&playing?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.03)'),
                border:`1px solid ${si%4===0?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.05)'}`}}/>
          )}
        </>)}
      </div>
      <div className="flex gap-2 mt-4">
        {KITS.map((t,i)=><button key={t} onClick={()=>{const id=ids.current.get(t);if(id)chord.triggerNode(id);}}
          className="flex-1 py-3 rounded font-mono text-xs font-bold active:scale-95"
          style={{background:COLORS[i]+'30',color:COLORS[i],border:`1px solid ${COLORS[i]}40`}}>{LABELS[i]}</button>)}
      </div>
    </div>
  );
}
