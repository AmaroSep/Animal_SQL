import React, { useState } from 'react';
import { X, FlaskConical, Calculator, ChevronRight, Info } from 'lucide-react';
import { createExperiment, calculateN } from '../../../services/api';

const STAT_TESTS = [
  { value: 't-test', label: 't-test', desc: '2 grupos independientes' },
  { value: 'ANOVA', label: 'ANOVA', desc: 'Múltiples grupos' },
  { value: 'Mann-Whitney', label: 'Mann-Whitney', desc: '2 grupos, no paramétrico' },
  { value: 'Kruskal-Wallis', label: 'Kruskal-Wallis', desc: 'Múltiples grupos, no paramétrico' },
];

const EFFECT_SIZES = [
  { value: 'pequeño', label: 'Pequeño', cohen: 'd = 0.2', desc: 'Diferencia sutil' },
  { value: 'mediano', label: 'Mediano', cohen: 'd = 0.5', desc: 'Diferencia moderada' },
  { value: 'grande', label: 'Grande', cohen: 'd = 0.8', desc: 'Diferencia marcada' },
];

export default function NewExperimentModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', description: '', objective: '',
    stat_test: 't-test', alpha: 0.05, power: 0.80,
    effect_size: 'mediano', effect_size_custom: '',
    dropout_rate: 0.10, n_groups: 2,
  });
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCalculate = async () => {
    setCalcLoading(true);
    try {
      const payload = {
        stat_test: form.stat_test,
        alpha: parseFloat(form.alpha),
        power: parseFloat(form.power),
        dropout_rate: parseFloat(form.dropout_rate),
        n_groups: parseInt(form.n_groups),
      };
      if (form.effect_size_custom) {
        payload.effect_size_custom = parseFloat(form.effect_size_custom);
      } else {
        payload.effect_size = form.effect_size;
      }
      setCalcResult(await calculateN(payload));
    } catch (e) {
      alert('Error calculando n: ' + e.message);
    }
    setCalcLoading(false);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { alert('El nombre es requerido'); return; }
    setCreating(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        objective: form.objective || null,
        stat_test: form.stat_test,
        alpha: parseFloat(form.alpha),
        power: parseFloat(form.power),
        dropout_rate: parseFloat(form.dropout_rate),
        effect_size: form.effect_size_custom ? null : form.effect_size,
        effect_size_custom: form.effect_size_custom ? parseFloat(form.effect_size_custom) : null,
      };
      const exp = await createExperiment(payload);
      onCreated(exp);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div className="w-full max-w-2xl rounded-[2.5rem] overflow-hidden border border-violet-500/30 bg-[#0a0a0f] shadow-[0_0_80px_rgba(139,92,246,0.2)] animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="p-8 border-b border-white/10 bg-violet-500/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
              <FlaskConical size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">Nuevo Experimento</h2>
              <p className="text-white/30 text-[10px] font-mono uppercase tracking-widest">Paso {step} de 2</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/40"><X size={20} /></button>
        </div>

        {/* Step indicators */}
        <div className="flex border-b border-white/10">
          {['Información General', 'Diseño Estadístico'].map((label, i) => (
            <button
              key={i}
              onClick={() => setStep(i + 1)}
              className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${step === i + 1 ? 'text-violet-400 border-b-2 border-violet-400' : 'text-white/20 hover:text-white/40'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-8 max-h-[60vh] overflow-y-auto space-y-6">
          {step === 1 && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Nombre del Experimento *</label>
                <input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Ej: Efecto HFD en metabolismo"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-mono text-white placeholder-white/20"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Objetivo</label>
                <textarea
                  value={form.objective}
                  onChange={e => set('objective', e.target.value)}
                  placeholder="Hipótesis y objetivo principal del experimento..."
                  rows={3}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-mono text-white placeholder-white/20 resize-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Detalles adicionales del protocolo..."
                  rows={3}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-mono text-white placeholder-white/20 resize-none"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Prueba estadística */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Prueba Estadística</label>
                <div className="grid grid-cols-2 gap-2">
                  {STAT_TESTS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => set('stat_test', t.value)}
                      className={`p-4 rounded-xl border text-left transition-all ${form.stat_test === t.value ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                    >
                      <div className={`font-black text-sm ${form.stat_test === t.value ? 'text-violet-400' : 'text-white/60'}`}>{t.label}</div>
                      <div className="text-[10px] text-white/30 font-mono mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Alpha, Power, Grupos, Dropout */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Alpha (α)</label>
                  <select value={form.alpha} onChange={e => set('alpha', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono">
                    <option value={0.05}>0.05</option>
                    <option value={0.01}>0.01</option>
                    <option value={0.10}>0.10</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Poder (1-β)</label>
                  <select value={form.power} onChange={e => set('power', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono">
                    <option value={0.80}>0.80</option>
                    <option value={0.90}>0.90</option>
                    <option value={0.95}>0.95</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">N° de Grupos</label>
                  <input type="number" min={2} max={10} value={form.n_groups} onChange={e => set('n_groups', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">% Pérdida estimada</label>
                  <select value={form.dropout_rate} onChange={e => set('dropout_rate', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono">
                    <option value={0.05}>5%</option>
                    <option value={0.10}>10%</option>
                    <option value={0.15}>15%</option>
                    <option value={0.20}>20%</option>
                  </select>
                </div>
              </div>

              {/* Tamaño de efecto */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Tamaño de Efecto (Cohen's d)</label>
                <div className="grid grid-cols-3 gap-2">
                  {EFFECT_SIZES.map(e => (
                    <button
                      key={e.value}
                      onClick={() => { set('effect_size', e.value); set('effect_size_custom', ''); }}
                      className={`p-4 rounded-xl border text-left transition-all ${form.effect_size === e.value && !form.effect_size_custom ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                    >
                      <div className={`font-black text-sm ${form.effect_size === e.value && !form.effect_size_custom ? 'text-violet-400' : 'text-white/60'}`}>{e.label}</div>
                      <div className="text-[10px] text-violet-400/60 font-mono">{e.cohen}</div>
                      <div className="text-[10px] text-white/20 font-mono mt-0.5">{e.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30">O ingresa Cohen's d manualmente:</label>
                  <input
                    type="number" min={0.1} max={3} step={0.1}
                    value={form.effect_size_custom}
                    onChange={e => set('effect_size_custom', e.target.value)}
                    placeholder="Ej: 0.65"
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono placeholder-white/20"
                  />
                </div>
              </div>

              {/* Calculate button */}
              <button
                onClick={handleCalculate}
                disabled={calcLoading}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-400 font-black uppercase tracking-widest text-xs hover:bg-violet-500/30 transition-all disabled:opacity-50"
              >
                <Calculator size={16} />
                {calcLoading ? 'Calculando...' : 'Calcular n recomendado'}
              </button>

              {/* Result */}
              {calcResult && (
                <div className="p-6 rounded-2xl bg-green-500/5 border border-green-500/20 space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-black text-green-400">{calcResult.n_per_group}</div>
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">n mínimo/grupo</div>
                    </div>
                    <div>
                      <div className="text-3xl font-black text-green-300">{calcResult.n_recommended}</div>
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">n recomendado/grupo</div>
                    </div>
                    <div>
                      <div className="text-3xl font-black text-white">{calcResult.n_total}</div>
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">n total</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-white/5 rounded-xl">
                    <Info size={14} className="text-white/30 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-white/50 font-mono leading-relaxed">{calcResult.justification_text}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/10 bg-white/[0.02] flex justify-between">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="px-6 py-3 rounded-xl border border-white/10 text-white/40 font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all">
              Atrás
            </button>
          ) : <div />}

          {step < 2 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!form.name.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-30 transition-all"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-30 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
            >
              {creating ? 'Creando...' : 'Crear Experimento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
