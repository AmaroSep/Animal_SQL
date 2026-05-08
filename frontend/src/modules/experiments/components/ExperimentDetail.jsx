import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Microscope, FlaskConical, Plus, Trash2, CheckCircle, RefreshCw, MapPin } from 'lucide-react';
import {
  fetchExperiment, updateExperiment, createGroup, deleteGroup,
  fetchExperimentAnimals, assignAnimal, updateAnimalAssignment, removeAnimalFromExperiment,
  fetchRacks,
} from '../../../services/api';
import GelViewer from './GelViewer';
import ExtractionLog from './ExtractionLog';
import BioterioAnimalPanel from './BioterioAnimalPanel';

const TABS = [
  { id: 'groups', label: 'Grupos & Animales', icon: Users },
  { id: 'gels',   label: 'Geles de Genotipo', icon: Microscope },
  { id: 'extractions', label: 'Extracciones', icon: FlaskConical },
];

const STATUS_COLORS = {
  'Asignado':  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Validado':  'bg-green-500/20 text-green-400 border-green-500/30',
  'Excluido':  'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function ExperimentDetail({ experimentId, onBack }) {
  const [exp, setExp] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [allAnimals, setAllAnimals] = useState([]);
  const [tab, setTab] = useState('groups');
  const [loading, setLoading] = useState(true);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAssignAnimal, setShowAssignAnimal] = useState(null); // groupId
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupN, setNewGroupN] = useState('');
  const [animalSearch, setAnimalSearch] = useState('');
  const [editStatus, setEditStatus] = useState(null);
  const [bioterioPanel, setBioterioPanel] = useState(null); // animalId

  const load = async () => {
    setLoading(true);
    try {
      const [expData, assignData, racksData] = await Promise.all([
        fetchExperiment(experimentId),
        fetchExperimentAnimals(experimentId),
        fetchRacks(),
      ]);
      setExp(expData);
      setAssignments(assignData);
      setAllAnimals(racksData.flatMap(r => r.cages).flatMap(c => c.animals));
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [experimentId]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await createGroup(experimentId, { name: newGroupName, n_required: parseInt(newGroupN) || 0 });
    setNewGroupName(''); setNewGroupN(''); setShowAddGroup(false);
    load();
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('¿Eliminar grupo?')) return;
    await deleteGroup(experimentId, groupId);
    load();
  };

  const handleAssignAnimal = async (animalId, groupId) => {
    try {
      await assignAnimal(experimentId, { animal_id: animalId, group_id: groupId });
      setShowAssignAnimal(null); setAnimalSearch('');
      load();
    } catch (e) { alert(e.message); }
  };

  const handleStatusChange = async (assignId, newStatus) => {
    await updateAnimalAssignment(experimentId, assignId, { status: newStatus });
    load();
  };

  const handleRemoveAnimal = async (assignId) => {
    if (!confirm('¿Remover animal del experimento?')) return;
    await removeAnimalFromExperiment(experimentId, assignId);
    load();
  };

  const handleStatusUpdate = async (newStatus) => {
    await updateExperiment(experimentId, { status: newStatus });
    load();
  };

  const assignedIds = assignments.map(a => a.animal_id);
  const availableAnimals = allAnimals.filter(a =>
    a.status === 'Vivo' &&
    !assignedIds.includes(a.id) &&
    (a.id.toLowerCase().includes(animalSearch.toLowerCase()) ||
     a.genotype.toLowerCase().includes(animalSearch.toLowerCase()))
  );

  if (loading || !exp) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-violet-400" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-violet-400/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="p-8 max-w-screen-2xl mx-auto w-full relative z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-black uppercase tracking-widest mb-6 transition-colors">
          <ArrowLeft size={16} /> Experimentos
        </button>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white mb-2">{exp.name}</h1>
            {exp.objective && <p className="text-white/40 font-mono text-sm max-w-2xl">{exp.objective}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Status selector */}
            <select
              value={exp.status}
              onChange={e => handleStatusUpdate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-violet-500 transition-colors"
            >
              <option value="Diseño">Diseño</option>
              <option value="Activo">Activo</option>
              <option value="Completado">Completado</option>
              <option value="Archivado">Archivado</option>
            </select>
          </div>
        </div>

        {/* Stats summary */}
        {exp.n_recommended && (
          <div className="mt-6 flex flex-wrap gap-4">
            <div className="px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs font-mono text-violet-400">
              <span className="font-black">{exp.n_per_group}</span> mín/grupo · <span className="font-black">{exp.n_recommended}</span> rec/grupo · <span className="font-black">{exp.stat_test}</span>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="px-8 max-w-screen-2xl mx-auto w-full relative z-10">
        <div className="flex border-b border-white/10 gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px ${tab === t.id ? 'text-violet-400 border-violet-400' : 'text-white/30 border-transparent hover:text-white/60'}`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <main className="flex-1 px-8 py-8 max-w-screen-2xl mx-auto w-full relative z-10">

        {tab === 'groups' && (
          <div className="space-y-6">
            {/* Groups */}
            {exp.groups.map(group => {
              const groupAssignments = assignments.filter(a => a.group_id === group.id);
              const filled = groupAssignments.filter(a => a.status !== 'Excluido').length;
              const pct = group.n_required > 0 ? Math.min(100, (filled / group.n_required) * 100) : 0;

              return (
                <div key={group.id} className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                  {/* Group header */}
                  <div className="p-6 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-black text-sm">
                        {filled}
                      </div>
                      <div>
                        <h3 className="font-black text-white text-lg">{group.name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-mono text-white/30">{filled} / {group.n_required} animales</span>
                          {group.validated_count > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-green-400">
                              <CheckCircle size={10} /> {group.validated_count} validados
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Progress bar */}
                      <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <button
                        onClick={() => setShowAssignAnimal(group.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-500/30 transition-all"
                      >
                        <Plus size={12} /> Asignar
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-white/20 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Animals table */}
                  {groupAssignments.length > 0 && (
                    <div className="divide-y divide-white/5">
                      {groupAssignments.map(assign => (
                        <div key={assign.id} className="flex items-center gap-4 px-6 py-3 hover:bg-white/[0.02] transition-colors">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${assign.animal?.sex === 'M' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-pink-500/20 text-pink-400 border-pink-500/30'}`}>
                            {assign.animal?.sex}
                          </span>
                          <span className="font-mono text-sm text-white flex-1">{assign.animal_id}</span>
                          <span className="text-xs font-mono text-white/40">{assign.animal?.genotype}</span>
                          {assign.animal?.genotype_validated && (
                            <CheckCircle size={14} className="text-green-400" />
                          )}
                          <span className="text-xs font-mono text-white/30">{assign.animal?.age_display}</span>
                          <select
                            value={assign.status}
                            onChange={e => handleStatusChange(assign.id, e.target.value)}
                            className={`text-[9px] font-black uppercase tracking-widest rounded-lg border px-2 py-1 outline-none transition-colors ${STATUS_COLORS[assign.status]} bg-transparent`}
                          >
                            <option value="Asignado">Asignado</option>
                            <option value="Validado">Validado</option>
                            <option value="Excluido">Excluido</option>
                          </select>
                          <button
                            onClick={() => setBioterioPanel(assign.animal_id)}
                            className="p-1.5 text-white/20 hover:text-cyan-400 transition-colors"
                            title="Ver en Bioterio"
                          >
                            <MapPin size={13} />
                          </button>
                          <button onClick={() => handleRemoveAnimal(assign.id)} className="p-1.5 text-white/20 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {groupAssignments.length === 0 && (
                    <div className="px-6 py-8 text-center text-white/20 text-xs font-mono">Sin animales asignados</div>
                  )}
                </div>
              );
            })}

            {/* Add group form */}
            {showAddGroup ? (
              <div className="flex items-end gap-4 p-6 rounded-2xl bg-white/[0.03] border border-violet-500/30">
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Nombre del Grupo</label>
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="Ej: Control, KO, HFD..."
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono placeholder-white/20"
                  />
                </div>
                <div className="w-36 flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">N requerido</label>
                  <input
                    type="number" min={0}
                    value={newGroupN}
                    onChange={e => setNewGroupN(e.target.value)}
                    placeholder={exp.n_recommended || '10'}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono placeholder-white/20"
                  />
                </div>
                <button onClick={handleCreateGroup} className="px-6 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all">
                  Crear
                </button>
                <button onClick={() => setShowAddGroup(false)} className="px-4 py-3 border border-white/10 text-white/40 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddGroup(true)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-white/20 text-white/30 hover:text-white/60 hover:border-white/30 text-xs font-black uppercase tracking-widest transition-all"
              >
                <Plus size={14} /> Agregar Grupo
              </button>
            )}
          </div>
        )}

        {tab === 'gels' && <GelViewer experimentId={experimentId} onGenotypeUpdated={load} />}
        {tab === 'extractions' && <ExtractionLog experimentId={experimentId} animals={assignments.map(a => a.animal).filter(Boolean)} />}
      </main>

      {/* Bioterio Panel */}
      {bioterioPanel && (
        <BioterioAnimalPanel animalId={bioterioPanel} onClose={() => setBioterioPanel(null)} />
      )}

      {/* Assign Animal Modal */}
      {showAssignAnimal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[2rem] overflow-hidden border border-violet-500/30 bg-[#0a0a0f] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">Asignar Animal</h3>
              <button onClick={() => { setShowAssignAnimal(null); setAnimalSearch(''); }} className="p-2 text-white/40 hover:text-white">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                autoFocus
                value={animalSearch}
                onChange={e => setAnimalSearch(e.target.value)}
                placeholder="Buscar por ID o genotipo..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 text-white font-mono text-xs placeholder-white/20"
              />
              <div className="max-h-72 overflow-y-auto space-y-1">
                {availableAnimals.slice(0, 30).map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleAssignAnimal(a.id, showAssignAnimal)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-violet-500/10 hover:border-violet-500/30 border border-transparent text-left transition-all"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${a.sex === 'M' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{a.sex}</span>
                    <span className="font-mono text-sm text-white flex-1">{a.id}</span>
                    <span className="text-xs font-mono text-white/40">{a.genotype}</span>
                    <span className="text-xs font-mono text-white/20">{a.age_display}</span>
                    {a.genotype_validated && <CheckCircle size={12} className="text-green-400" />}
                  </button>
                ))}
                {availableAnimals.length === 0 && (
                  <div className="text-center text-white/30 text-xs font-mono py-8">Sin animales disponibles</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
