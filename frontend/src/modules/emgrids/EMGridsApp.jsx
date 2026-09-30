import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Plus, Box, Pencil, Trash2, X, Search, LayoutGrid, List, Download } from 'lucide-react';
import {
  fetchEMBoxes, fetchEMBox, createEMBox, updateEMBox, deleteEMBox,
  fetchEMGrids, createEMGrid, updateEMGrid, deleteEMGrid,
} from '../../services/api';
import * as XLSX from 'xlsx';
import { FIXED_LAYOUT_TYPES, getLayout, getPositions } from './boxLayouts';
import { gridStatusLabel } from '../../utils/labels';

// Defaults per box type. Quantifoil and EMS have a fixed physical layout
// (boxLayouts.js); row_labels/columns only define "Custom" boxes.
const BOX_PRESETS = {
  Quantifoil: {
    row_labels: 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T',
    columns: 10,
    default_grid_type: 'Quantifoil R2/1 + 2nm C, Cu 300',
  },
  EMS: {
    row_labels: 'A,B,C,D,E',
    columns: 10,
    default_grid_type: 'Carbon film, 400 mesh, Cu (CF400-CU)',
  },
  Custom: { row_labels: 'A,B,C,D', columns: 5, default_grid_type: '' },
};

const STAIN_SUGGESTIONS = ['Uranyl acetate 2%', 'Uranyl formate 0.75%', 'PTA 2%', 'Ammonium molybdate 2%', 'Nano-W', 'UA-Zero', 'UranyLess'];

const FIXATIVE_SUGGESTIONS = ['Glutaraldehyde 2.5%', 'Glutaraldehyde 0.1%', 'PFA 4%', 'PFA 2% + Glutaraldehyde 2.5%', 'Formaldehyde 4%'];
const DRYING_SUGGESTIONS = ['Filter paper blotting', 'Side blotting', 'Air dry', 'Blotting + air dry', 'Aspiration'];

// Status values are stored in Spanish; gridStatusLabel() gives the English label
const STATUSES = ['Almacenada', 'Imageada', 'Usada', 'Descartada'];
const IN_BOX = ['Almacenada', 'Imageada', 'Descartada'];

const STATUS_STYLE = {
  Almacenada: 'bg-violet-500/20 text-violet-300 border-violet-400/40',
  Imageada: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  Usada: 'bg-white/5 text-white/40 border-white/10',
  Descartada: 'bg-red-500/25 text-red-200 border-red-400/60',
};

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
      <div className="glass w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border-white/20">
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
    const { default_grid_type, ...layout } = BOX_PRESETS[type];
    // Fixed layouts always take their rows/columns; the default grid type is only prefilled on new boxes
    const keepLayout = box && !FIXED_LAYOUT_TYPES.includes(type);
    setForm({ ...form, box_type: type, ...(keepLayout ? {} : layout), ...(box ? {} : { default_grid_type }) });
  };
  const fixedLayout = FIXED_LAYOUT_TYPES.includes(form.box_type);

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

  const capacity = getPositions(form).length;

  return (
    <Modal title={box ? `Edit box ${box.box_number}` : 'New box'} subtitle="Box layout and details" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Box number *">
            <input required className={inputCls} value={form.box_number} onChange={set('box_number')} placeholder="001" />
          </Field>
          <Field label="Box type">
            <select className={inputCls} value={form.box_type} onChange={(e) => applyPreset(e.target.value)}>
              {Object.keys(BOX_PRESETS).map((t) => <option key={t} value={t} className="bg-slate-900">{t}</option>)}
            </select>
          </Field>
          {fixedLayout ? (
            <p className="col-span-2 text-xs font-mono text-white/40 -mt-1">
              {form.box_type === 'Quantifoil'
                ? 'Fixed layout: rows A–J and K–T, columns 1–10, staggered (5 grids per row).'
                : 'Fixed layout: rows A–E, columns 1–5 and 6–10.'}
            </p>
          ) : (
            <>
              <Field label="Rows (comma separated)">
                <input required className={inputCls} value={form.row_labels} onChange={set('row_labels')} />
              </Field>
              <Field label="Columns">
                <input required type="number" min="1" className={inputCls} value={form.columns} onChange={set('columns')} />
              </Field>
            </>
          )}
          <Field label="Default grid type">
            <input className={inputCls} value={form.default_grid_type || ''} onChange={set('default_grid_type')} />
          </Field>
          <Field label="Lot / manufacturer no.">
            <input className={inputCls} value={form.lot || ''} onChange={set('lot')} placeholder="295913" />
          </Field>
          <Field label="Physical location">
            <input className={inputCls} value={form.location || ''} onChange={set('location')} placeholder="Desiccator 1, shelf 2" />
          </Field>
          <div className="flex items-end pb-3 text-xs font-mono text-white/40">Capacity: {capacity} positions</div>
        </div>
        <Field label="Notes">
          <textarea rows={2} className={inputCls} value={form.notes || ''} onChange={set('notes')} />
        </Field>
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Cancel</button>
          <button type="submit" className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white hover:bg-violet-400">Save</button>
        </div>
      </form>
    </Modal>
  );
}

const fmt = (v, unit) => (v === null || v === undefined || v === '' ? '—' : `${v}${unit ? ` ${unit}` : ''}`);

const has = (v) => v !== null && v !== undefined && v !== '';

// One-line description of a staining step: "2× 20 µL wash → UranyLess 60 s → Blotting"
const describeStep = (st) => {
  const parts = [];
  if (has(st.wash_count) && Number(st.wash_count) > 0) {
    parts.push(`${st.wash_count}× ${has(st.wash_volume_ul) ? `${st.wash_volume_ul} µL ` : ''}wash`);
  }
  if (has(st.stain_type) || has(st.stain_time_s)) {
    parts.push([st.stain_type, has(st.stain_time_s) ? `${st.stain_time_s} s` : null].filter(Boolean).join(' '));
  }
  if (has(st.drying_method)) parts.push(st.drying_method);
  return parts.join(' → ');
};

// Stain sequence for tables/tooltips: "UranyLess 60 s + UA 2% 30 s"
const stainSummary = (g) =>
  (g.stain_steps || [])
    .filter((st) => has(st.stain_type) || has(st.stain_time_s))
    .map((st) => [st.stain_type, has(st.stain_time_s) ? `${st.stain_time_s} s` : null].filter(Boolean).join(' '))
    .join(' + ');

// fixed: true / false / null (not recorded)
const fixationLabel = (g) =>
  g.fixed === true ? `Fixed${g.fixative ? ` · ${g.fixative}` : ''}` : g.fixed === false ? 'Not fixed' : '—';

// dilution_factor is X in 1:X (1 = undiluted)
const dilutionLabel = (g) =>
  !has(g.dilution_factor) ? '—' : Number(g.dilution_factor) === 1 ? 'Undiluted' : `1:${g.dilution_factor}`;

const emptyStep = () => ({ wash_count: '', wash_volume_ul: '', stain_type: '', stain_time_s: '', drying_method: '' });

// ── Grid form ──────────────────────────────────────────────────────────────

const emptyGrid = (box, position) => ({
  box_id: box.id,
  position: position || '',
  sample: '',
  grid_type: box.default_grid_type || '',
  fixed: false,
  fixative: '',
  sample_volume_ul: '',
  dilution_factor: '',
  sample_time_s: '',
  stain_steps: [emptyStep()],
  prep_date: new Date().toISOString().split('T')[0],
  status: 'Almacenada',
  notes: '',
});

function GridModal({ grid, box, boxes, position, suggestions, onClose, onSaved }) {
  const blanks = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v ?? '']));
  const initialForm = () => {
    if (!grid) return emptyGrid(box, position);
    const steps = grid.stain_steps?.length ? grid.stain_steps : [emptyStep()];
    return { ...blanks(grid), stain_steps: steps.map(blanks) };
  };
  const [form, setForm] = useState(initialForm);
  // Existing grids open read-only; editing is an explicit step
  const [editing, setEditing] = useState(!grid);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setStep = (i, k) => (e) =>
    setForm({ ...form, stain_steps: form.stain_steps.map((st, j) => (j === i ? { ...st, [k]: e.target.value } : st)) });
  const addStep = () => setForm({ ...form, stain_steps: [...form.stain_steps, emptyStep()] });
  const removeStep = (i) => setForm({ ...form, stain_steps: form.stain_steps.filter((_, j) => j !== i) });

  const targetBox = boxes.find((b) => b.id === parseInt(form.box_id, 10)) || box;
  const positions = targetBox ? getPositions(targetBox) : [];

  const num = (v) => (v === '' || v === null ? null : parseFloat(v));
  const isFixed = form.fixed === true || form.fixed === 'true';

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      box_id: parseInt(form.box_id, 10),
      position: form.position,
      sample: form.sample.trim(),
      grid_type: form.grid_type || null,
      fixed: form.fixed === '' ? null : isFixed,
      fixative: isFixed ? form.fixative.trim() || null : null,
      sample_volume_ul: num(form.sample_volume_ul),
      dilution_factor: num(form.dilution_factor),
      sample_time_s: num(form.sample_time_s),
      stain_steps: form.stain_steps.map((st) => ({
        wash_count: st.wash_count === '' ? null : parseInt(st.wash_count, 10),
        wash_volume_ul: num(st.wash_volume_ul),
        stain_type: st.stain_type || null,
        stain_time_s: num(st.stain_time_s),
        drying_method: st.drying_method || null,
      })),
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
    if (!confirm(`Permanently delete the record of grid ${grid.position} (${grid.sample})? To keep its history, use the status "Discarded" (still in the box) or "Used" (no longer in the box) instead.`)) return;
    try {
      await deleteEMGrid(grid.id);
      onSaved(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelEdit = () => {
    if (!grid) return onClose();
    setForm(initialForm());
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    const detail = [
      ['Box', `${grid.box_number}${box ? ` (${box.box_type})` : ''}`],
      ['Position', grid.position],
      ['Prep date', fmt(grid.prep_date)],
      ['Grid type', fmt(grid.grid_type)],
      ['Fixation', fixationLabel(grid)],
      ['Sample volume', fmt(grid.sample_volume_ul, 'µL')],
      ['Dilution', dilutionLabel(grid)],
      ['Sample application time', fmt(grid.sample_time_s, 's')],
    ];
    const steps = (grid.stain_steps || []).filter((st) => describeStep(st));
    return (
      <Modal title={`Grid ${grid.box_number} · ${grid.position}`} subtitle="Preparation record" onClose={onClose}>
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className={labelCls}>Sample</span>
              <p className="text-xl font-black tracking-tight">{grid.sample}</p>
            </div>
            <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase ${STATUS_STYLE[grid.status]}`}>{gridStatusLabel(grid.status)}</span>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {detail.map(([k, v]) => (
              <div key={k} className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                <dt className={labelCls}>{k}</dt>
                <dd className="text-sm font-mono text-white/90 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <span className={labelCls}>Staining</span>
            {steps.length === 0 ? (
              <p className="text-sm font-mono text-white/40">—</p>
            ) : (
              <ol className="space-y-2">
                {steps.map((st, i) => (
                  <li key={st.id ?? i} className="flex gap-4 bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                    <span className="text-violet-300 font-black text-sm pt-4">{i + 1}</span>
                    <div className="grid grid-cols-3 gap-4 flex-1 text-sm font-mono">
                      {[
                        ['Washes', has(st.wash_count) ? `${st.wash_count}×${has(st.wash_volume_ul) ? ` ${st.wash_volume_ul} µL` : ''}` : '—'],
                        ['Stain', `${st.stain_type || '—'}${has(st.stain_time_s) ? ` · ${st.stain_time_s} s` : ''}`],
                        ['Drying', st.drying_method || '—'],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className={labelCls + ' mb-1'}>{k}</dt>
                          <dd className="text-white/90 break-words">{v}</dd>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {grid.notes && (
            <div>
              <span className={labelCls}>Notes</span>
              <p className="text-sm text-white/70 whitespace-pre-wrap">{grid.notes}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Close</button>
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white hover:bg-violet-400">
              <Pencil size={14} /> Edit
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={grid ? `Edit grid ${grid.box_number} · ${grid.position}` : `New grid · ${targetBox?.box_number ?? ''} ${form.position}`}
      subtitle="Preparation record"
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Box">
            <select className={inputCls} value={form.box_id} onChange={set('box_id')}>
              {boxes.map((b) => <option key={b.id} value={b.id} className="bg-slate-900">{b.box_number} ({b.box_type})</option>)}
            </select>
          </Field>
          <Field label="Position *">
            <select required className={inputCls} value={form.position} onChange={set('position')}>
              <option value="" className="bg-slate-900">—</option>
              {positions.map((p) => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900">{gridStatusLabel(s)}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Sample *">
              <input required className={inputCls} value={form.sample} onChange={set('sample')} list="em-samples" placeholder="Protein / construct / concentration" />
            </Field>
          </div>
          <Field label="Prep date">
            <input type="date" className={inputCls} value={form.prep_date} onChange={set('prep_date')} />
          </Field>
          <div className="col-span-2 md:col-span-3">
            <Field label="Grid type">
              <input className={inputCls} value={form.grid_type} onChange={set('grid_type')} list="em-grid-types" />
            </Field>
          </div>
          <Field label="Sample fixed">
            <select className={inputCls} value={form.fixed === '' ? '' : String(form.fixed)} onChange={set('fixed')}>
              <option value="" className="bg-slate-900">Not recorded</option>
              <option value="false" className="bg-slate-900">Not fixed</option>
              <option value="true" className="bg-slate-900">Fixed</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Fixative">
              <input
                className={`${inputCls} disabled:opacity-40`}
                value={isFixed ? form.fixative : ''}
                onChange={set('fixative')}
                list="em-fixatives"
                disabled={!isFixed}
                placeholder={isFixed ? 'Glutaraldehyde 2.5%, PFA 4%...' : '—'}
              />
            </Field>
          </div>
          <Field label={<>Sample volume <span className="normal-case">(µL)</span></>}>
            <input type="number" step="any" min="0" className={inputCls} value={form.sample_volume_ul} onChange={set('sample_volume_ul')} />
          </Field>
          <Field label="Dilution factor (1 = undiluted)">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-mono text-white/40">1 :</span>
              <input type="number" step="any" min="1" className={`${inputCls} pl-12`} value={form.dilution_factor} onChange={set('dilution_factor')} placeholder="10" />
            </div>
          </Field>
          <Field label="Sample application time (s)">
            <input type="number" step="any" min="0" className={inputCls} value={form.sample_time_s} onChange={set('sample_time_s')} />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={labelCls + ' mb-0'}>Staining · washes → stain → drying</span>
            <button type="button" onClick={addStep} className="flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-violet-500/30 text-violet-300">
              <Plus size={12} /> Add stain
            </button>
          </div>
          {form.stain_steps.map((st, i) => (
            <div key={i} className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-4 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-violet-300">Stain {i + 1}</span>
                {form.stain_steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="p-1 rounded-md text-white/30 hover:text-red-300 hover:bg-red-500/10" title="Remove step">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <Field label="Washes (no.)">
                    <input type="number" min="0" step="1" className={inputCls} value={st.wash_count} onChange={setStep(i, 'wash_count')} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label={<>Vol. <span className="normal-case">(µL)</span></>}>
                    <input type="number" step="any" min="0" className={inputCls} value={st.wash_volume_ul} onChange={setStep(i, 'wash_volume_ul')} />
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Stain">
                    <input className={inputCls} value={st.stain_type} onChange={setStep(i, 'stain_type')} list="em-stains" />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Time (s)">
                    <input type="number" step="any" min="0" className={inputCls} value={st.stain_time_s} onChange={setStep(i, 'stain_time_s')} />
                  </Field>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <Field label="Drying">
                    <input className={inputCls} value={st.drying_method} onChange={setStep(i, 'drying_method')} list="em-drying" />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Field label="Notes">
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} placeholder="Glow discharge, wash solution, imaging observations..." />
        </Field>

        <datalist id="em-samples">{suggestions.samples.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-stains">{suggestions.stains.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-fixatives">{suggestions.fixatives.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-drying">{DRYING_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="em-grid-types">{suggestions.gridTypes.map((s) => <option key={s} value={s} />)}</datalist>

        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-between gap-3 pt-2">
          <div>
            {grid && (
              <button type="button" onClick={remove} className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={cancelEdit} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Cancel</button>
            <button type="submit" className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white hover:bg-violet-400">Save</button>
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
  const { halves } = getLayout(box);
  const axis = 'text-[10px] font-mono text-white/30 font-bold text-center';

  // Each half is drawn as seen from above; the left half of commercial boxes
  // is printed upside down, so its column numbers go below.
  const renderHalf = (half, idx) => {
    const colsOnTop = halves.length === 1 || idx === halves.length - 1;
    const colHeader = (
      <tr>
        {idx === 0 && <th />}
        {half.cols.map((c) => <th key={c} className={axis}>{c}</th>)}
        {idx !== 0 && <th />}
      </tr>
    );
    const rowLabel = (r) => <th className={`${axis} ${idx === 0 ? 'pr-1' : 'pl-1'}`}>{r}</th>;
    return (
      <table key={idx} className="border-separate border-spacing-1">
        {colsOnTop && <thead>{colHeader}</thead>}
        <tbody>
          {half.rows.map((r) => (
            <tr key={r}>
              {idx === 0 && rowLabel(r)}
              {half.cols.map((c) => {
                const pos = `${r}${c}`;
                if (!half.hasSlot(r, c)) return <td key={pos} className="w-12 h-12" />;
                const g = bySlot[pos];
                return (
                  <td key={pos}>
                    <button
                      onClick={() => onSlotClick(pos, g)}
                      title={g ? `${pos} · ${g.sample}${stainSummary(g) ? ` · ${stainSummary(g)}` : ''}` : `${pos} · empty`}
                      className={`w-12 h-12 rounded-lg border text-left p-1 transition-all hover:scale-110 ${
                        g ? STATUS_STYLE[g.status] : 'border-dashed border-white/10 text-white/20 hover:border-violet-400/60 hover:text-violet-300'
                      }`}
                    >
                      <div className="text-[9px] font-mono font-bold opacity-80">{pos}</div>
                      {g && <div className="text-[9px] font-black leading-tight truncate">{g.sample}</div>}
                    </button>
                  </td>
                );
              })}
              {idx !== 0 && rowLabel(r)}
            </tr>
          ))}
        </tbody>
        {!colsOnTop && <tfoot>{colHeader}</tfoot>}
      </table>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex items-start justify-center gap-4 w-max mx-auto">
        {halves.map((h, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="self-stretch w-px bg-white/10 mx-1" />}
            {renderHalf(h, i)}
          </React.Fragment>
        ))}
      </div>
      <div className="flex gap-4 justify-center mt-4 text-[10px] font-mono uppercase tracking-widest text-white/40">
        {IN_BOX.map((s) => (
          <span key={s} className="flex items-center gap-2"><span className={`w-3 h-3 rounded border ${STATUS_STYLE[s]}`} />{gridStatusLabel(s)}</span>
        ))}
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded border border-dashed border-white/20" />Empty</span>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

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
      fixatives: uniq([...FIXATIVE_SUGGESTIONS, ...allGrids.map((g) => g.fixative)]),
      stains: uniq([...STAIN_SUGGESTIONS, ...allGrids.flatMap((g) => g.stain_steps.map((st) => st.stain_type))]),
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
      return [g.sample, g.fixative, ...g.stain_steps.map((st) => st.stain_type), ...g.stain_steps.map((st) => st.drying_method), g.grid_type, g.notes, g.box_number, g.position]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [allGrids, search, statusFilter]);

  const handleDeleteBox = async (box) => {
    if (!confirm(`Delete box ${box.box_number}? Only possible if it has no grids recorded.`)) return;
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
        Box: g.box_number,
        Position: g.position,
        Sample: g.sample,
        Fixed: g.fixed === true ? 'Yes' : g.fixed === false ? 'No' : '',
        Fixative: g.fixative ?? '',
        'Grid type': g.grid_type ?? '',
        'Volume (uL)': g.sample_volume_ul ?? '',
        'Dilution factor (1:X)': g.dilution_factor ?? '',
        'Sample time (s)': g.sample_time_s ?? '',
        'No. of stains': g.stain_steps.length,
        'Staining protocol': g.stain_steps.map((st, i) => `${i + 1}) ${describeStep(st)}`).join(' | '),
        'Prep date': g.prep_date ?? '',
        Status: gridStatusLabel(g.status),
        Notes: g.notes ?? '',
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
            <Home size={16} /> Home
          </button>
          <button onClick={() => setView('box')} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'box' ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
            <LayoutGrid size={16} /> Boxes
          </button>
          <button onClick={() => setView('list')} className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
            <List size={16} /> All grids
          </button>
          <button onClick={() => setBoxModal('new')} className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-violet-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <Plus size={16} /> New box
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
                  No boxes yet. Create the first one with “New box”.
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
                    <h2 className="text-2xl font-black tracking-tight">Box {boxDetail.box_number}</h2>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-xs font-mono text-white/40">
                      <span>{boxDetail.box_type}</span>
                      {boxDetail.default_grid_type && <span>{boxDetail.default_grid_type}</span>}
                      {boxDetail.lot && <span>Lot {boxDetail.lot}</span>}
                      {boxDetail.location && <span>{boxDetail.location}</span>}
                      <span>{boxDetail.occupied}/{boxDetail.capacity} occupied</span>
                    </div>
                    {boxDetail.notes && <p className="text-xs text-white/40 mt-2">{boxDetail.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBoxModal(boxDetail)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10" title="Edit box"><Pencil size={16} /></button>
                    <button onClick={() => handleDeleteBox(boxDetail)} className="p-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-red-300" title="Delete box"><Trash2 size={16} /></button>
                  </div>
                </div>
                <BoxMap box={boxDetail} onSlotClick={(position, grid) => setGridModal(grid ? { grid } : { position })} />
                {boxDetail.grids.some((g) => !IN_BOX.includes(g.status)) && (
                  <div>
                    <h3 className={labelCls}>History (used, no longer in the box)</h3>
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
                <input className={`${inputCls} pl-11`} placeholder="Search sample, stain, grid type, box..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="" className="bg-slate-900">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900">{gridStatusLabel(s)}</option>)}
              </select>
              <button onClick={exportExcel} className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-violet-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                <Download size={16} /> Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10">
                    {['Box', 'Pos.', 'Sample', 'Fixation', 'Grid type', 'Vol.', 'Dilution', 'Sample time', 'Staining', 'Date', 'Status'].map((h) => (
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
                      <td className="py-3 pr-4 text-white/70">{fixationLabel(g)}</td>
                      <td className="py-3 pr-4 text-white/60">{fmt(g.grid_type)}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.sample_volume_ul, 'µL')}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{dilutionLabel(g)}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.sample_time_s, 's')}</td>
                      <td className="py-3 pr-4">{stainSummary(g) || '—'}</td>
                      <td className="py-3 pr-4 font-mono whitespace-nowrap">{fmt(g.prep_date)}</td>
                      <td className="py-3 pr-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase ${STATUS_STYLE[g.status]}`}>{gridStatusLabel(g.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredGrids.length === 0 && (
                <p className="text-center py-12 text-white/20 font-mono text-xs uppercase tracking-widest">No matching grids</p>
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
