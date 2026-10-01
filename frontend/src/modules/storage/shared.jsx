import React from 'react';
import { X } from 'lucide-react';

// Helpers shared by the sample-storage modules (LN2 tank, -80 freezers)

// Today in local time (toISOString would give tomorrow's date in the evening west of UTC)
export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const has = (v) => v !== null && v !== undefined && v !== '';
export const fmt = (v) => (has(v) ? v : '—');

// Stable colour per sample name so the same material looks the same in every box
const PALETTE = [
  'bg-sky-500/30 border-sky-400/60', 'bg-emerald-500/30 border-emerald-400/60', 'bg-amber-500/30 border-amber-400/60',
  'bg-fuchsia-500/30 border-fuchsia-400/60', 'bg-rose-500/30 border-rose-400/60', 'bg-lime-500/30 border-lime-400/60',
  'bg-indigo-500/30 border-indigo-400/60', 'bg-orange-500/30 border-orange-400/60', 'bg-teal-500/30 border-teal-400/60',
  'bg-violet-500/30 border-violet-400/60', 'bg-cyan-500/30 border-cyan-400/60', 'bg-pink-500/30 border-pink-400/60',
];
export const colorFor = (name) => {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// [1,2,3,5,7,8] -> "1–3, 5, 7–8"
export const compressWells = (wells) => {
  const w = [...wells].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < w.length; i++) {
    let j = i;
    while (j + 1 < w.length && w[j + 1] === w[j] + 1) j++;
    out.push(j > i ? `${w[i]}–${w[j]}` : `${w[i]}`);
    i = j;
  }
  return out.join(', ');
};

export const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2';

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, subtitle, onClose, children, wide, accent = 'text-sky-300' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className={`glass w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border-white/20`}>
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className={`text-xl font-black tracking-tighter uppercase italic ${accent}`}>{title}</h2>
            {subtitle && <p className="text-white/40 text-[10px] font-mono tracking-[0.3em] mt-1 uppercase">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={22} /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
