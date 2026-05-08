import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FlaskConical, MapPin, RefreshCw } from 'lucide-react';
import { fetchExtractions, createExtraction, deleteExtraction } from '../../../services/api';

const EXTRACTION_TYPES = [
  { value: 'Sangre', label: 'Sangre', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  { value: 'Tejido', label: 'Tejido', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { value: 'DNA',    label: 'DNA',    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { value: 'RNA',    label: 'RNA',    color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { value: 'Otro',   label: 'Otro',   color: 'text-white/40 bg-white/5 border-white/10' },
];

const typeColor = (type) => EXTRACTION_TYPES.find(t => t.value === type)?.color || 'text-white/40 bg-white/5 border-white/10';

const EMPTY_FORM = {
  animal_id: '', extraction_type: 'Sangre', date: new Date().toISOString().split('T')[0],
  quantity: '', unit: 'mL', storage_location: '', storage_box: '', storage_position: '',
  notes: '', extracted_by: '',
};

export default function ExtractionLog({ experimentId, animals }) {
  const [extractions, setExtractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [filterAnimal, setFilterAnimal] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true);
    try { setExtractions(await fetchExtractions({ experimentId })); } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [experimentId]);

  const handleCreate = async () => {
    if (!form.animal_id) { alert('Selecciona un animal'); return; }
    setSaving(true);
    try {
      await createExtraction({
        animal_id: form.animal_id,
        experiment_id: experimentId,
        extraction_type: form.extraction_type,
        date: form.date,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        unit: form.unit || null,
        storage_location: form.storage_location || null,
        storage_box: form.storage_box || null,
        storage_position: form.storage_position || null,
        notes: form.notes || null,
        extracted_by: form.extracted_by || null,
      });
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta extracción?')) return;
    await deleteExtraction(id);
    load();
  };

  const filtered = filterAnimal
    ? extractions.filter(e => e.animal_id.toLowerCase().includes(filterAnimal.toLowerCase()))
    : extractions;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="animate-spin text-violet-400" size={32} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <input
          value={filterAnimal}
          onChange={e => setFilterAnimal(e.target.value)}
          placeholder="Filtrar por animal ID..."
          className="flex-1 max-w-xs bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20"
        />
        <div className="ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-500/30 transition-all"
          >
            <Plus size={14} /> Registrar Extracción
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-4 border border-dashed border-white/10 rounded-2xl">
          <FlaskConical size={36} className="text-white/20" />
          <p className="text-white/30 text-xs font-mono">Sin extracciones registradas</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                {['Animal', 'Tipo', 'Fecha', 'Cantidad', 'Ubicación', 'Responsable', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(ext => (
                <tr key={ext.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-sm text-white">{ext.animal_id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${typeColor(ext.extraction_type)}`}>
                      {ext.extraction_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-white/60">{ext.date}</td>
                  <td className="px-4 py-3 text-xs font-mono text-white/60">
                    {ext.quantity != null ? `${ext.quantity} ${ext.unit || ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {ext.storage_location && (
                      <div className="flex items-start gap-1.5">
                        <MapPin size={11} className="text-white/30 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-mono text-white/60">{ext.storage_location}</div>
                          {ext.storage_box && (
                            <div className="text-[10px] font-mono text-white/30">
                              Box {ext.storage_box}{ext.storage_position ? ` · Pos ${ext.storage_position}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!ext.storage_location && <span className="text-white/20 text-xs font-mono">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-white/40">{ext.extracted_by || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(ext.id)} className="p-1.5 text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-[2rem] overflow-hidden border border-violet-500/30 bg-[#0a0a0f] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">Registrar Extracción</h3>
              <button onClick={() => setShowForm(false)} className="p-2 text-white/40 hover:text-white">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Animal */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Animal *</label>
                <select
                  value={form.animal_id}
                  onChange={e => set('animal_id', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500"
                >
                  <option value="">Seleccionar animal...</option>
                  {animals.map(a => (
                    <option key={a.id} value={a.id}>{a.id} · {a.genotype} · {a.sex}</option>
                  ))}
                </select>
              </div>

              {/* Type + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Tipo *</label>
                  <select value={form.extraction_type} onChange={e => set('extraction_type', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500">
                    {EXTRACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Fecha *</label>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500" />
                </div>
              </div>

              {/* Quantity + Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Cantidad</label>
                  <input type="number" step="any" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="Ej: 0.5" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Unidad</label>
                  <select value={form.unit} onChange={e => set('unit', e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500">
                    <option value="mL">mL</option>
                    <option value="µL">µL</option>
                    <option value="mg">mg</option>
                    <option value="µg">µg</option>
                    <option value="ng">ng</option>
                    <option value="U">U</option>
                  </select>
                </div>
              </div>

              {/* Storage */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Ubicación de almacenamiento</label>
                <input value={form.storage_location} onChange={e => set('storage_location', e.target.value)} placeholder="Ej: -80°C, Congelador 3" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Box / Caja</label>
                  <input value={form.storage_box} onChange={e => set('storage_box', e.target.value)} placeholder="Ej: Box-A3" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Posición</label>
                  <input value={form.storage_position} onChange={e => set('storage_position', e.target.value)} placeholder="Ej: A1, B4" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20" />
                </div>
              </div>

              {/* Extracted by + Notes */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Responsable</label>
                <input value={form.extracted_by} onChange={e => set('extracted_by', e.target.value)} placeholder="Nombre del investigador" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Notas</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones adicionales..." rows={2} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20 resize-none" />
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-6 py-3 border border-white/10 text-white/40 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving} className="px-8 py-3 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
