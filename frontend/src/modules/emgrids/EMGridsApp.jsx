import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Plus, Box, Pencil, Trash2, X, Search, LayoutGrid, List, Download } from 'lucide-react';
import {
  fetchEMBoxes, fetchEMBox, createEMBox, updateEMBox, deleteEMBox,
  fetchEMGrids, createEMGrid, updateEMGrid, deleteEMGrid,
} from '../../services/api';
import * as XLSX from 'xlsx';

// Box layouts matching the physical boxes in use. Editable per box afterwards.
const BOX_PRESETS = {
  Quantifoil: {
    row_labels: 'A,B,C,D,E,F,G,H,I,J',
    columns: 10,
    default_grid_type: 'Quantifoil R2/1 + 2nm C, Cu 300',
  },
  EMS: {
    row_labels: 'A,B,C,D,E',
    columns: 10,
    default_grid_type: 'Carbon film, 400 mesh, Cu (CF400-CU)',
  },
  Personalizada: { row_labels: 'A,B,C,D', columns: 5, default_grid_type: '' },
};

const STAIN_SUGGESTIONS = ['Uranyl acetate 2%', 'Uranyl formate 0.75%', 'PTA 2%', 'Ammonium molybdate 2%', 'Nano-W', 'UA-Zero'];

const STATUSES = ['Almacenada', 'Imageada', 'Usada', 'Descartada'];
const IN_BOX = ['Almacenada', 'Imageada'];

const STATUS_STYLE = {
  Almacenada: 'bg-violet-500/20 text-violet-300 border-violet-400/40',
  Imageada: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  Usada: 'bg-white/5 text-white/40 border-white/10',
  Descartada: 'bg-red-500/10 text-red-300/70 border-red-500/20',
};

const rowsOf = (box) => box.row_labels.split(',').map((r) => r.trim()).filter(Boolean);

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-violet-400 focus:outline-none';
const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border-white/20">
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-black tracking-tighter text-violet-300 uppercase italic">{title}</h2>
            {subtitle && <p className="text-white/40 text-[10px] font-mono tracking-[0.3em] mt-1 uppercase">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all">
            <X size={22} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── Box form ───────────────────────────────────────────────────────────────

function BoxModal({ box, onClose, onSaved }) {
  const [form, setForm] = useState(
    box || { box_number: '', box_type: 'Quantifoil', lot: '', location: '', notes: '', ...BOX_PRESETS.Quantifoil }
  );
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const applyPreset = (type) => {
    setForm({ ...form, box_type: type, ...(box ? {} : BOX_PRESETS[type]) });
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      box_number: form.box_number.trim(),
      box_type: form.box_type,
      row_labels: form.row_labels.split(',').map((r) => r.trim()).filter(Boolean).join(','),
      columns: parseInt(form.columns, 10),
      lot: form.lot || null,
      default_grid_type: form.default_grid_type || null,
      location: form.location || null,
      notes: form.notes || null,
    };
    try {
      const saved = box ? await updateEMBox(box.id, payload) : await createEMBox(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    }
  };

  const capacity = form.row_labels.split(',').filter((r) => r.trim()).length * (parseInt(form.columns, 10) || 0);

  return (
    <Modal title={box ? `Editar caja ${box.box_number}` : 'Nueva caja'} subtitle="Formato y datos de la caja" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nº de caja *">
            <input required className={inputCls} value={form.box_number} onChange={set('box_number')} placeholder="295913" />
          </Field>
          <Field label="Tipo de caja">
            <select className={inputCls} value={form.box_type} onChange={(e) => applyPreset(e.target.value)}>
              {Object.keys(BOX_PRESETS).map((t) => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
            </select>
          </Field>
          <Field label="Filas (separadas por coma)">
            <input required className={inputCls} value={form.row_labels} onChange={set('row_labels')} />
          </Field>
          <Field label="Columnas">
            <input required type="number" min="1" className={inputCls} value={form.columns} onChange={set('columns')} />
          </Field>
          <Field label="Tipo de grid por defecto">
            <input className={inputCls} value={form.default_grid_type || ''} onChange={set('default_grid_type')} />
          </Field>
          <Field label="Lote">
            <input className={inputCls} value={form.lot || ''} onChange={set('lot')} placeholder="251110" />
          </Field>
          <Field label="Ubicación física">
            <input className={inputCls} value={form.location || ''} onChange={set('location')} placeholder="Desecador 1, repisa 2" />
          </Field>
          <div className="flex items-end pb-3 text-xs font-mono text-white/40">Capacidad: {capacity} posiciones</div>
        </div>
        <Field label="Notas">
          <textarea rows={2} className={inputCls} value={form.notes || ''} onChange={set('notes')} />
        </Field>
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Cancelar</button>
          <button type="submit" className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white hover:bg-violet-400">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Grid form ──────────────────────────────────────────────────────────────

const emptyGrid = (box, position) => ({
  box_id: box.id,
  position: position || '',
  sample: '',
  grid_type: box.default_grid_type || '',
  sample_volume_ul: '',
  sample_time_s: '',
  stain_type: '',
  stain_time_s: '',
  prep_date: new Date().toISOString().split('T')[0],
  status: 'Almacenada',
  notes: '',
});

function GridModal({ grid, box, boxes, position, suggestions, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    grid ? Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v ?? ''])) : emptyGrid(box, position)
  );
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const targetBox = boxes.find((b) => b.id === parseInt(form.box_id, 10)) || box;
  const positions = targetBox ? rowsOf(targetBox).flatMap((r) => Array.from({ length: targetBox.columns }, (_, i) => `${r}${i + 1}`)) : [];

  const num = (v) => (v === '' || v === null ? null : parseFloat(v));

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      box_id: parseInt(form.box_id, 10),
      position: form.position,
      sample: form.sample.trim(),
      grid_type: form.grid_type || null,
      sample_volume_ul: num(form.sample_volume_ul),
      sample_time_s: num(form.sample_time_s),
      stain_type: form.stain_type || null,
      stain_time_s: num(form.stain_time_s),
      prep_date: form.prep_date || null,
      status: form.status,
      notes: form.notes || null,
    };
    try {
      const saved = grid ? await updateEMGrid(grid.id, payload) : await createEMGrid(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar definitivamente el registro de la grid ${grid.position} (${grid.sample})? Si ya no está en la caja, usa el estado "Usada" o "Descartada" para conservar el historial.`)) return;
    try {
      await deleteEMGrid(grid.id);
      onSaved(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal
      title={grid ? `Grid ${grid.box_number} · ${grid.position}` : `Nueva grid · ${targetBox?.box_number ?? ''} ${form.position}`}
      subtitle="Registro de preparación"
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Caja">
            <select className={inputCls} value={form.box_id} onChange={set('box_id')}>
              {boxes.map((b) => <option key={b.id} value={b.id} className="bg-slate-900">{b.box_number} ({b.box_type})</option>)}
            </select>
          </Field>
          <Field label="Posición *">
            <select required className={inputCls} value={form.position} onChange={set('position')}>
              <option value="" className="bg-slate-900">—</option>
              {positions.map((p) => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className={inputCls} value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Muestra *">
              <input required className={inputCls} value={form.sample} onChange={set('sample')} list="em-samples" placeholder="Proteína / constructo / concentración" />
            </Field>
          </div>
          <Field label="Fecha preparación">
            <input type="date" className={inputCls} value={form.prep_date} onChange={set('prep_date')} />
          </Field>
          <div className="col-span-2 md:col-span-3">
            <Field label="Tipo de grid">
              <input className={inputCls} value={form.grid_type} onChange={set('grid_type')} list="em-grid-types" />
            </Field>
          </div>
          <Field label={<>Volumen muestra <span className="normal-case">(µL)</span></>}>
            <input type="number" step="any" min="0" className={inputCls} value={form.sample_volume_ul} onChange={set('sample_volume_ul')} />
          </Field>
          <Field label="Tiempo aplicación muestra (s)">
            <input type="number" step="any" min="0" className={inputCls} value={form.sample_time_s} onChange={set('sample_time_s')} />
          </Field>
          <div className="hidden md:block" />
          <div className="col-span-2 md:col-span-1">
            <Field label="Tipo de tinción">
              <input className={inputCls} value={form.stain_type} onChange={set('stain_type')} list="em-stains" />
            </Field>
          </div>
          <Field label="Incubación tinción (s)">
            <input type="number" step="any" min="0" className={inputCls} value={form.stain_time_s} onChange={set('stain_time_s')} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} placeholder="Glow discharge, blotting, lavados, observaciones de imagen..." />
        </Field>

        <datalist id="em-samples">{suggestions.samples.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-stains">{suggestions.stains.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-grid-types">{suggestions.gridTypes.map((s) => <option key={s} value={s} />)}</datalist>

        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-between gap-3 pt-2">
          <div>
            {grid && (
              <button type="button" onClick={remove} className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10">
                <Trash2 size={14} /> Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Cancelar</button>
            <button type="submit" className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white hover:bg-violet-400">Guardar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Box map ────────────────────────────────────────────────────────────────

function BoxMap({ box, onSlotClick }) {
  const bySlot = useMemo(() => {
    const m = {};
    box.grids.filter((g) => IN_BOX.includes(g.status)).forEach((g) => { m[g.position] = g; });
    return m;
  }, [box]);
  const rows = rowsOf(box);
  const cols = Array.from({ length: box.columns }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1.5 mx-auto">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} className="text-[10px] font-mono text-white/30 font-bold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th className="text-[10px] font-mono text-white/30 font-bold pr-1">{r}</th>
              {cols.map((c) => {
                const pos = `${r}${c}`;
                const g = bySlot[pos];
                return (
                  <td key={pos}>
                    <button
                      onClick={() => onSlotClick(pos, g)}
                      title={g ? `${pos} · ${g.sample}${g.stain_type ? ` · ${g.stain_type}` : ''}` : `${pos} · libre`}
                      className={`w-16 h-16 rounded-xl border text-left p-1.5 transition-all hover:scale-105 ${
                        g ? STATUS_STYLE[g.status] : 'border-dashed border-white/10 text-white/15 hover:border-violet-400/60 hover:text-violet-300'
                      }`}
                    >
                      <div className="text-[9px] font-mono font-bold opacity-70">{pos}</div>
                      {g ? (
                        <div className="text-[10px] font-black leading-tight truncate">{g.sample}</div>
                      ) : (
                        <Plus size={14} className="mx-auto mt-1" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-4 justify-center mt-4 text-[10px] font-mono uppercase tracking-widest text-white/40">
        {IN_BOX.map((s) => (
          <span key={s} className="flex items-center gap-2"><span className={`w-3 h-3 rounded border ${STATUS_STYLE[s]}`} />{s}</span>
        ))}
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded border border-dashed border-white/20" />Libre</span>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

const fmt = (v, unit) => (v === null || v === undefined || v === '' ? '—' : `${v}${unit ? ` ${unit}` : ''}`);

export default function EMGridsApp() {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [boxDetail, setBoxDetail] = useState(null);
  const [allGrids, setAllGrids] = useState([]);
  const [view, setView] = useState('box'); // 'box' | 'list'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [boxModal, setBoxModal] = useState(null);   // null | 'new' | box
  const [gridModal, setGridModal] = useState(null); // null | { grid?, position? }

  const loadBoxes = async () => {
    try {
      const data = await fetchEMBoxes();
      setBoxes(data);
      if (data.length && !data.some((b) => b.id === selectedBoxId)) setSelectedBoxId(data[0].id);
      if (!data.length) setSelectedBoxId(null);
    } catch (err) {
      console.error('Error loading boxes:', err);
    }
  };

  const loadBoxDetail = async () => {
    if (!selectedBoxId) { setBoxDetail(null); return; }
    try {
      setBoxDetail(await fetchEMBox(selectedBoxId));
    } catch (err) {
      console.error('Error loading box:', err);
    }
  };

  const loadGrids = async () => {
    try {
      setAllGrids(await fetchEMGrids());
    } catch (err) {
      console.error('Error loading grids:', err);
    }
  };

  const refresh = () => { loadBoxes(); loadBoxDetail(); loadGrids(); };

  useEffect(() => { loadBoxes(); loadGrids(); }, []);
  useEffect(() => { loadBoxDetail(); }, [selectedBoxId]);

  const suggestions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    return {
      samples: uniq(allGrids.map((g) => g.sample)),
      stains: uniq([...STAIN_SUGGESTIONS, ...allGrids.map((g) => g.stain_type)]),
      gridTypes: uniq([
        ...Object.values(BOX_PRESETS).map((p) => p.default_grid_type),
        ...boxes.map((b) => b.default_grid_type),
        ...allGrids.map((g) => g.grid_type),
      ]),
    };
  }, [allGrids, boxes]);

  const filteredGrids = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGrids.filter((g) => {
      if (statusFilter && g.status !== statusFilter) return false;
      if (!q) return true;
      return [g.sample, g.stain_type, g.grid_type, g.notes, g.box_number, g.position]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [allGrids, search, statusFilter]);

  const handleDeleteBox = async (box) => {
    if (!confirm(`¿Eliminar la caja ${box.box_number}? Solo es posible si no tiene grids registradas.`)) return;
    try {
      await deleteEMBox(box.id);
      setSelectedBoxId(null);
      refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(
      filteredGrids.map((g) => ({
        Caja: g.box_number,
        Posicion: g.position,
        Muestra: g.sample,
        'Tipo de grid': g.grid_type ?? '',
        'Volumen (uL)': g.sample_volume_ul ?? '',
        'Tiempo muestra (s)': g.sample_time_s ?? '',
        Tincion: g.stain_type ?? '',
        'Incubacion tincion (s)': g.stain_time_s ?? '',
        'Fecha preparacion': g.prep_date ?? '',
        Estado: g.status,
        Notas: g.notes ?? '',
      }))
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'EM Grids');
    XLSX.writeFile(book, `em_grids_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const openGrid = (grid) => {
    setSelectedBoxId(grid.box_id);
    setGridModal({ grid });
  };

  const gridModalBox = gridModal?.grid ? boxes.find((b) => b.id === gridModal.grid.box_id) : boxDetail;

  return (
    <div className="min-h-screen flex flex-col selection:bg-violet-400/30">
      <header className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-screen-2xl mx-auto w-full">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em] flex items-center gap-3">
            <span className="bg-violet-500 text-white px-2 py-0.5 rounded italic">EM GRIDS</span>
            <span className="text-white">INVENTORY</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">Negative stain · grid boxes</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <Home size={16} /> Inicio
          </button>
          <button onClick={() => setView('box')} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'box' ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
            <LayoutGrid size={16} /> Cajas
          </button>
          <button onClick={() => setView('list')} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
            <List size={16} /> Todas las grids
          </button>
          <button onClick={() => setBoxModal('new')} className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-violet-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <Plus size={16} /> Nueva caja
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-4">
        {view === 'box' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            {/* Box list */}
            <aside className="space-y-2">
              {boxes.length === 0 && (
                <div className="glass-card rounded-2xl p-6 text-center text-white/30 text-xs font-mono">
                  Aún no hay cajas. Crea la primera con “Nueva caja”.
                </div>
              )}
              {boxes.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBoxId(b.id)}
                  className={`w-full text-left rounded-2xl p-4 border transition-all ${b.id === selectedBoxId ? 'bg-violet-500/15 border-violet-400/50' : 'glass-card hover:bg-white/5'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-black"><Box size={14} className="text-violet-300" />{b.box_number}</span>
                    <span className="text-[10px] font-mono text-white/40">{b.occupied}/{b.capacity}</span>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-white/30 mt-1">{b.box_type}{b.location ? ` · ${b.location}` : ''}</div>
                  <div className="h-1 mt-3 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400" style={{ width: `${b.capacity ? (b.occupied / b.capacity) * 100 : 0}%` }} />
                  </div>
                </button>
              ))}
            </aside>

            {/* Selected box */}
            {boxDetail && (
              <section className="glass rounded-3xl p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Caja {boxDetail.box_number}</h2>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-xs font-mono text-white/40">
                      <span>{boxDetail.box_type}</span>
                      {boxDetail.default_grid_type && <span>{boxDetail.default_grid_type}</span>}
                      {boxDetail.lot && <span>Lote {boxDetail.lot}</span>}
                      {boxDetail.location && <span>{boxDetail.location}</span>}
                      <span>{boxDetail.occupied}/{boxDetail.capacity} ocupadas</span>
                    </div>
                    {boxDetail.notes && <p className="text-xs text-white/40 mt-2">{boxDetail.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBoxModal(boxDetail)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10" title="Editar caja"><Pencil size={16} /></button>
                    <button onClick={() => handleDeleteBox(boxDetail)} className="p-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-red-300" title="Eliminar caja"><Trash2 size={16} /></button>
                  </div>
                </div>
                <BoxMap box={boxDetail} onSlotClick={(position, grid) => setGridModal(grid ? { grid } : { position })} />
                {boxDetail.grids.some((g) => !IN_BOX.includes(g.status)) && (
                  <div>
                    <h3 className={labelCls}>Historial (usadas / descartadas)</h3>
                    <div className="flex flex-wrap gap-2">
                      {boxDetail.grids.filter((g) => !IN_BOX.includes(g.status)).map((g) => (
                        <button key={g.id} onClick={() => setGridModal({ grid: g })} className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono ${STATUS_STYLE[g.status]}`}>
                          {g.position} · {g.sample}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <section className="glass rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input className={`${inputCls} pl-11`} placeholder="Buscar muestra, tinción, tipo de grid, caja..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="" className="bg-slate-900">Todos los estados</option>
                {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
              </select>
              <button onClick={exportExcel} className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-violet-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                <Download size={16} /> Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10">
                    {['Caja', 'Pos.', 'Muestra', 'Tipo de grid', 'Vol.', 'T. muestra', 'Tinción', 'T. tinción', 'Fecha', 'Estado'].map((h) => (
                      <th key={h} className="py-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredGrids.map((g) => (
                    <tr key={g.id} onClick={() => openGrid(g)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer">
                      <td className="py-3 pr-4 font-mono">{g.box_number}</td>
                      <td className="py-3 pr-4 font-mono font-bold">{g.position}</td>
                      <td className="py-3 pr-4 font-bold">{g.sample}</td>
                      <td className="py-3 pr-4 text-white/60">{fmt(g.grid_type)}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.sample_volume_ul, 'µL')}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.sample_time_s, 's')}</td>
                      <td className="py-3 pr-4">{fmt(g.stain_type)}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.stain_time_s, 's')}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.prep_date)}</td>
                      <td className="py-3 pr-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase ${STATUS_STYLE[g.status]}`}>{g.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredGrids.length === 0 && (
                <p className="text-center py-12 text-white/20 font-mono text-xs uppercase tracking-widest">Sin grids que coincidan</p>
              )}
            </div>
          </section>
        )}
      </main>

      {boxModal && (
        <BoxModal
          box={boxModal === 'new' ? null : boxModal}
          onClose={() => setBoxModal(null)}
          onSaved={(saved) => { setBoxModal(null); setSelectedBoxId(saved.id); refresh(); }}
        />
      )}
      {gridModal && gridModalBox && (
        <GridModal
          grid={gridModal.grid}
          position={gridModal.position}
          box={gridModalBox}
          boxes={boxes}
          suggestions={suggestions}
          onClose={() => setGridModal(null)}
          onSaved={() => { setGridModal(null); refresh(); }}
        />
      )}
    </div>
  );
}
