import React, { useState, useEffect, useRef } from 'react';
import { Upload, Plus, CheckCircle, Microscope, Trash2, Info, RefreshCw, ZoomIn } from 'lucide-react';
import { fetchGels, uploadGel, updateLane, deleteGel, gelImageUrl } from '../../../services/api';

const GENOTYPE_OPTIONS = [
  { value: '',     label: '—', className: 'text-white/30' },
  { value: 'WT',   label: 'WT',   className: 'text-green-400' },
  { value: 'HET',  label: 'HET',  className: 'text-yellow-400' },
  { value: 'KO',   label: 'KO',   className: 'text-red-400' },
  { value: 'FAIL', label: 'FAIL', className: 'text-white/30' },
];

const GENOTYPE_COLORS = {
  WT:   'bg-green-500/20 border-green-500/40 text-green-400',
  HET:  'bg-yellow-500/20 border-yellow-500/40 text-yellow-400',
  KO:   'bg-red-500/20 border-red-500/40 text-red-400',
  FAIL: 'bg-white/5 border-white/10 text-white/30',
};

export default function GelViewer({ experimentId, onGenotypeUpdated }) {
  const [gels, setGels] = useState([]);
  const [selectedGel, setSelectedGel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState({});
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ notes: '', validatedBy: '', laneCount: 12 });
  const [imageZoomed, setImageZoomed] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGels(experimentId);
      setGels(data);
      if (data.length > 0 && !selectedGel) setSelectedGel(data[0]);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [experimentId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const gel = await uploadGel(file, {
        experimentId,
        notes: uploadForm.notes || null,
        validatedBy: uploadForm.validatedBy || null,
        laneCount: parseInt(uploadForm.laneCount) || 12,
      });
      await load();
      setSelectedGel(gel);
      setShowUpload(false);
      setUploadForm({ notes: '', validatedBy: '', laneCount: 12 });
    } catch (e) {
      alert('Error subiendo gel: ' + e.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleLaneUpdate = async (gelId, lane, field, value) => {
    const key = `${lane.id}-${field}`;
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const payload = { [field]: value || null };
      await updateLane(gelId, lane.id, payload);
      // Refresh gel to get updated data
      const updated = await fetchGels(experimentId);
      setGels(updated);
      const refreshed = updated.find(g => g.id === gelId);
      if (refreshed) setSelectedGel(refreshed);
      if (field === 'called_genotype' && value && value !== 'FAIL' && lane.animal_id) {
        onGenotypeUpdated?.();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(s => ({ ...s, [key]: false }));
  };

  const handleDelete = async (gelId) => {
    if (!confirm('¿Eliminar este gel?')) return;
    await deleteGel(gelId);
    setSelectedGel(null);
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="animate-spin text-violet-400" size={32} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-white/40">
          {gels.length} Gel{gels.length !== 1 ? 'es' : ''} cargado{gels.length !== 1 ? 's' : ''}
        </h3>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-500/30 transition-all"
        >
          <Upload size={14} /> Subir Gel
        </button>
      </div>

      {gels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 border border-dashed border-white/10 rounded-2xl">
          <Microscope size={40} className="text-white/20" />
          <p className="text-white/30 text-xs font-mono">Sin geles cargados para este experimento</p>
        </div>
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-6">
          {/* Gel list */}
          <div className="space-y-2">
            {gels.map(gel => {
              const annotated = gel.lanes.filter(l => l.called_genotype && !l.marker_lane).length;
              const total = gel.lanes.filter(l => !l.marker_lane).length;
              return (
                <button
                  key={gel.id}
                  onClick={() => setSelectedGel(gel)}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${selectedGel?.id === gel.id ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
                >
                  <div className="text-xs font-mono text-white truncate">
                    {new Date(gel.uploaded_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </div>
                  {gel.validated_by && (
                    <div className="text-[10px] text-white/30 font-mono truncate">{gel.validated_by}</div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${total > 0 ? (annotated/total)*100 : 0}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-white/30">{annotated}/{total}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Gel detail */}
          {selectedGel && (
            <div className="space-y-4">
              {/* Image */}
              <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 group">
                <img
                  src={gelImageUrl(selectedGel.image_path)}
                  alt="Gel de agarosa"
                  className={`w-full object-contain transition-all cursor-zoom-in ${imageZoomed ? 'max-h-none' : 'max-h-80'}`}
                  onClick={() => setImageZoomed(z => !z)}
                />
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setImageZoomed(z => !z)} className="p-2 bg-black/60 rounded-lg text-white/60 hover:text-white">
                    <ZoomIn size={14} />
                  </button>
                  <button onClick={() => handleDelete(selectedGel.id)} className="p-2 bg-black/60 rounded-lg text-white/60 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Notes */}
              {selectedGel.notes && (
                <div className="flex items-start gap-2 p-4 bg-white/5 rounded-xl">
                  <Info size={13} className="text-white/30 mt-0.5 shrink-0" />
                  <p className="text-xs font-mono text-white/50">{selectedGel.notes}</p>
                </div>
              )}

              {/* Lanes table */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Anotación de Carriles</h4>
                  <p className="text-[10px] font-mono text-white/20">Al asignar genotipo, se actualiza el animal en bioterio</p>
                </div>
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {selectedGel.lanes.sort((a, b) => a.lane_number - b.lane_number).map(lane => {
                    const savingGenotype = saving[`${lane.id}-called_genotype`];
                    const savingAnimal = saving[`${lane.id}-animal_id`];
                    const genoColor = lane.called_genotype ? GENOTYPE_COLORS[lane.called_genotype] : '';
                    return (
                      <div key={lane.id} className="flex items-center gap-4 px-6 py-3">
                        {/* Lane number */}
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-white/40 shrink-0">
                          {lane.lane_number}
                        </div>

                        {/* Marker toggle */}
                        <button
                          onClick={() => handleLaneUpdate(selectedGel.id, lane, 'marker_lane', !lane.marker_lane)}
                          className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border transition-all shrink-0 ${lane.marker_lane ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/5 border-white/10 text-white/20 hover:text-white/40'}`}
                        >
                          {lane.marker_lane ? 'Ladder' : 'Muestra'}
                        </button>

                        {!lane.marker_lane && (
                          <>
                            {/* Animal ID input */}
                            <input
                              defaultValue={lane.animal_id || ''}
                              onBlur={e => {
                                if (e.target.value !== (lane.animal_id || '')) {
                                  handleLaneUpdate(selectedGel.id, lane, 'animal_id', e.target.value.trim() || null);
                                }
                              }}
                              placeholder="ID del animal..."
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-violet-500 transition-colors"
                            />

                            {/* Genotype selector */}
                            <select
                              value={lane.called_genotype || ''}
                              onChange={e => handleLaneUpdate(selectedGel.id, lane, 'called_genotype', e.target.value || null)}
                              disabled={savingGenotype}
                              className={`px-3 py-1.5 rounded-lg text-xs font-black border outline-none transition-all ${lane.called_genotype ? genoColor : 'bg-white/5 border-white/10 text-white/30'} ${savingGenotype ? 'opacity-50' : ''}`}
                            >
                              {GENOTYPE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>

                            {/* Confirmed indicator */}
                            {lane.confirmed_at && lane.called_genotype && lane.called_genotype !== 'FAIL' && (
                              <CheckCircle size={14} className="text-green-400 shrink-0" />
                            )}
                          </>
                        )}
                        {lane.marker_lane && <div className="flex-1" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-md rounded-[2rem] overflow-hidden border border-violet-500/30 bg-[#0a0a0f] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">Cargar Gel de Agarosa</h3>
              <button onClick={() => setShowUpload(false)} className="p-2 text-white/40 hover:text-white">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Responsable de lectura</label>
                <input
                  value={uploadForm.validatedBy}
                  onChange={e => setUploadForm(f => ({ ...f, validatedBy: e.target.value }))}
                  placeholder="Nombre del investigador..."
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Número de carriles</label>
                <input
                  type="number" min={1} max={50}
                  value={uploadForm.laneCount}
                  onChange={e => setUploadForm(f => ({ ...f, laneCount: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Notas</label>
                <textarea
                  value={uploadForm.notes}
                  onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Condiciones del gel, protocolo, etc..."
                  rows={2}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-violet-500 placeholder-white/20 resize-none"
                />
              </div>

              <label className={`flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/60 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={28} className="text-violet-400" />
                <div className="text-center">
                  <p className="text-sm font-black text-white">{uploading ? 'Subiendo...' : 'Seleccionar imagen'}</p>
                  <p className="text-[10px] font-mono text-white/30 mt-1">JPG, PNG, TIF — Imagen del gel de agarosa</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.tif,.tiff,.bmp"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
