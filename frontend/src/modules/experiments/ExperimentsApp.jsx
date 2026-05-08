import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Plus, Home, RefreshCw, ChevronRight, CheckCircle, Clock, Archive, Beaker } from 'lucide-react';
import { fetchExperiments } from '../../services/api';
import ExperimentDetail from './components/ExperimentDetail';
import NewExperimentModal from './components/NewExperimentModal';

const STATUS_STYLES = {
  'Diseño':    { bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  'Activo':    { bg: 'bg-green-500/10 text-green-400 border-green-500/30',  dot: 'bg-green-400' },
  'Completado':{ bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',    dot: 'bg-blue-400' },
  'Archivado': { bg: 'bg-white/5 text-white/30 border-white/10',           dot: 'bg-white/30' },
};

export default function ExperimentsApp() {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setExperiments(await fetchExperiments()); } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (selectedId) {
    return (
      <ExperimentDetail
        experimentId={selectedId}
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-violet-400/30">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8 max-w-screen-2xl mx-auto w-full relative z-10">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em] flex items-center gap-3">
            <span className="bg-violet-500 text-white px-2 py-0.5 rounded italic">EXPERIMENT</span>
            <span className="text-white">MANAGER</span>
            <span className="text-violet-400/40 font-mono text-sm align-super">V2.0</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">Diseño Experimental · Validación Genotípica · Extracciones</p>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <Home size={16} />
          </button>
          <button onClick={load} className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white rounded-xl transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-6 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)]"
          >
            <Plus size={16} />
            Nuevo Experimento
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-8 pb-8 max-w-screen-2xl mx-auto w-full relative z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <RefreshCw className="animate-spin text-violet-400 mb-6" size={48} />
            <span className="font-mono text-xs tracking-[0.5em] text-white/30 uppercase">Cargando experimentos...</span>
          </div>
        ) : experiments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
            <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <FlaskConical size={40} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-white/60 mb-2">Sin experimentos</h3>
              <p className="text-white/30 text-sm font-mono">Crea tu primer diseño experimental</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-8 py-4 bg-violet-500 hover:bg-violet-400 text-white rounded-2xl font-black uppercase tracking-widest transition-all"
            >
              <Plus size={18} /> Crear Experimento
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {experiments.map(exp => {
              const style = STATUS_STYLES[exp.status] || STATUS_STYLES['Diseño'];
              const totalAssigned = exp.groups.reduce((s, g) => s + g.assigned_count, 0);
              const totalRequired = exp.groups.reduce((s, g) => s + g.n_required, 0);
              return (
                <button
                  key={exp.id}
                  onClick={() => setSelectedId(exp.id)}
                  className="group w-full flex items-center gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/40 hover:bg-white/[0.06] transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                    <Beaker size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-black text-white truncate">{exp.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 shrink-0 ${style.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {exp.status}
                      </span>
                    </div>
                    {exp.objective && (
                      <p className="text-white/40 text-xs font-mono truncate">{exp.objective}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-8 shrink-0">
                    <div className="text-center">
                      <div className="text-xl font-black text-white">{exp.groups.length}</div>
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">grupos</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-black text-violet-400">{totalAssigned}/{totalRequired}</div>
                      <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">animales</div>
                    </div>
                    {exp.n_recommended && (
                      <div className="text-center">
                        <div className="text-xl font-black text-green-400">{exp.n_recommended}</div>
                        <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">n rec.</div>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={20} className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </main>

      {showNew && (
        <NewExperimentModal
          onClose={() => setShowNew(false)}
          onCreated={(exp) => { setShowNew(false); setSelectedId(exp.id); load(); }}
        />
      )}
    </div>
  );
}
