import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Snowflake, Search, ArrowLeft, Download, Lock, Pencil, Trash2, History, RotateCcw, AlertTriangle,
} from 'lucide-react';
import {
  fetchLNTank, fetchLNBox, updateLNBox, fetchLNVials, createLNVials, updateLNVial, removeLNVial, restoreLNVial, deleteLNVial,
} from '../../services/api';
import { exportRackToExcel } from './exportLabFormat';
import { today, has, fmt, colorFor, compressWells, labelCls, Field, Modal } from '../storage/shared';

const LOW_STOCK = 2; // highlight cell lines with this many vials or fewer

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-sky-400 focus:outline-none';
const btnPrimary = 'flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-30';
const btnGhost = 'flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10';

const location = (v) => `Rack ${v.rack_number} · Box ${v.box_number} · #${v.well}`;

// ── Vial form (freeze a batch / edit one vial) ─────────────────────────────

const emptyVial = () => ({
  cell_line: '', protein_expression: '', culture_method: '', freeze_date: today(), frozen_by: '',
  freeze_note: '', cells_per_vial: '', comment: '', additional_comment: '', master_stock: false,
});

const toPayload = (f) => ({
  cell_line: f.cell_line.trim(),
  protein_expression: f.protein_expression || null,
  culture_method: f.culture_method || null,
  freeze_date: f.freeze_date || null,
  frozen_by: f.frozen_by ? f.frozen_by.trim().toUpperCase() : null,
  freeze_note: f.freeze_note || null,
  cells_per_vial: f.cells_per_vial || null,
  comment: f.comment || null,
  additional_comment: f.additional_comment || null,
  master_stock: !!f.master_stock,
});

function VialFields({ form, setForm, suggestions }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Cell line *" className="col-span-2">
        <input required className={inputCls} value={form.cell_line} onChange={set('cell_line')} list="ln-cell-lines" placeholder="HEK 293T, SH-SY5Y..." />
      </Field>
      <Field label="Protein expression">
        <input className={inputCls} value={form.protein_expression} onChange={set('protein_expression')} />
      </Field>
      <Field label="Culture method">
        <input className={inputCls} value={form.culture_method} onChange={set('culture_method')} list="ln-methods" placeholder="DMEM/10% FBS, Glu, P/S" />
      </Field>
      <Field label="Freeze date">
        <input type="date" className={inputCls} value={form.freeze_date} onChange={set('freeze_date')} />
      </Field>
      <Field label="Frozen by (initials)">
        <input className={inputCls} value={form.frozen_by} onChange={set('frozen_by')} maxLength={6} placeholder="YJ" />
      </Field>
      <Field label="Cells per vial">
        <input className={inputCls} value={form.cells_per_vial} onChange={set('cells_per_vial')} placeholder="2E6" />
      </Field>
      <Field label="Comment (passage #)">
        <input className={inputCls} value={form.comment} onChange={set('comment')} placeholder="P3, ATCC CRL-3216" />
      </Field>
      <Field label="Additional comment" className="col-span-2">
        <textarea rows={2} className={inputCls} value={form.additional_comment} onChange={set('additional_comment')} />
      </Field>
      {has(form.freeze_note) && (
        <Field label="Original date note (from spreadsheet)" className="col-span-2">
          <input className={inputCls} value={form.freeze_note} onChange={set('freeze_note')} />
        </Field>
      )}
      <label className="col-span-2 flex items-center gap-3 text-sm text-white/80 cursor-pointer">
        <input type="checkbox" checked={!!form.master_stock} onChange={set('master_stock')} className="w-4 h-4 accent-amber-400" />
        <Lock size={14} className="text-amber-300" /> Master stock — do not thaw without asking
      </label>
      <datalist id="ln-cell-lines">{suggestions.cellLines.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="ln-methods">{suggestions.methods.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function FreezeModal({ box, wells, suggestions, onClose, onSaved }) {
  const [form, setForm] = useState(emptyVial);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await createLNVials({ box_id: box.id, wells, data: toPayload(form) });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal wide title={`Freeze ${wells.length} vial${wells.length === 1 ? '' : 's'}`} subtitle={`Rack ${box.rack_number} · Box ${box.number} · positions ${compressWells(wells)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        {box.restriction && (
          <p className="flex gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {box.restriction}
          </p>
        )}
        <VialFields form={form} setForm={setForm} suggestions={suggestions} />
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" className={btnPrimary}><Snowflake size={14} /> Save {wells.length} vial{wells.length === 1 ? '' : 's'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Vial detail: read-only, with edit / thaw / discard ─────────────────────

function VialModal({ vial, tank, suggestions, onClose, onSaved }) {
  const [mode, setMode] = useState('view'); // view | edit | remove
  const blank = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? '']));
  const [form, setForm] = useState(() => blank(vial));
  const [removal, setRemoval] = useState({ status: 'Thawed', removed_date: today(), removed_by: '', removed_note: '' });
  const [error, setError] = useState(null);
  const inTank = vial.status === 'In tank';
  const allBoxes = tank.flatMap((r) => r.boxes);

  const act = async (fn) => {
    try {
      await fn();
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  const startRemove = (status) => {
    if (vial.master_stock && !confirm(`${vial.cell_line} #${vial.well} is a MASTER STOCK. Thaw or discard it anyway?`)) return;
    setRemoval({ ...removal, status });
    setMode('remove');
  };

  if (mode === 'edit') {
    const box = allBoxes.find((b) => b.id === Number(form.box_id));
    const save = (e) => {
      e.preventDefault();
      act(() => updateLNVial(vial.id, {
        ...toPayload(form),
        box_id: Number(form.box_id),
        well: Number(form.well),
        ...(inTank ? {} : { removed_date: form.removed_date || null, removed_by: form.removed_by || null, removed_note: form.removed_note || null }),
      }));
    };
    return (
      <Modal wide title={`Edit vial · ${vial.cell_line}`} subtitle={location(vial)} onClose={onClose}>
        <form onSubmit={save} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Box">
              <select className={inputCls} value={form.box_id} onChange={(e) => setForm({ ...form, box_id: e.target.value })}>
                {tank.map((r) => (
                  <optgroup key={r.id} label={`Rack ${r.number}`} className="bg-slate-900">
                    {r.boxes.map((b) => (
                      <option key={b.id} value={b.id} className="bg-slate-900">Rack {r.number} · Box {b.number}{b.label ? ` (${b.label})` : ''}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Position">
              <input type="number" min="1" max={box ? box.capacity : 81} required className={inputCls} value={form.well} onChange={(e) => setForm({ ...form, well: e.target.value })} />
            </Field>
          </div>
          <VialFields form={form} setForm={setForm} suggestions={suggestions} />
          {!inTank && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={`${vial.status} on`}>
                <input type="date" className={inputCls} value={form.removed_date} onChange={(e) => setForm({ ...form, removed_date: e.target.value })} />
              </Field>
              <Field label="By">
                <input className={inputCls} value={form.removed_by} onChange={(e) => setForm({ ...form, removed_by: e.target.value })} />
              </Field>
              <Field label="Note" className="col-span-2">
                <input className={inputCls} value={form.removed_note} onChange={(e) => setForm({ ...form, removed_note: e.target.value })} />
              </Field>
            </div>
          )}
          {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
          <div className="flex justify-between gap-3">
            <button type="button" className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10"
              onClick={() => confirm(`Permanently delete this record of ${vial.cell_line} (${location(vial)})? To keep its history, use Thaw or Discard instead.`) && act(() => deleteLNVial(vial.id))}>
              <Trash2 size={14} /> Delete record
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setForm(blank(vial)); setError(null); setMode('view'); }} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save</button>
            </div>
          </div>
        </form>
      </Modal>
    );
  }

  if (mode === 'remove') {
    const thaw = removal.status === 'Thawed';
    return (
      <Modal title={`${thaw ? 'Thaw' : 'Discard'} vial`} subtitle={`${vial.cell_line} · ${location(vial)}`} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-white/60">The vial leaves the tank and its position becomes free. The record stays in the history.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <input type="date" className={inputCls} value={removal.removed_date} onChange={(e) => setRemoval({ ...removal, removed_date: e.target.value })} />
            </Field>
            <Field label="By (initials)">
              <input className={inputCls} value={removal.removed_by} maxLength={6} onChange={(e) => setRemoval({ ...removal, removed_by: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={thaw ? 'Purpose / note' : 'Reason'} className="col-span-2">
              <input className={inputCls} value={removal.removed_note} onChange={(e) => setRemoval({ ...removal, removed_note: e.target.value })} placeholder={thaw ? 'e.g. expand for WB control' : 'e.g. contaminated'} />
            </Field>
          </div>
          {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setMode('view')} className={btnGhost}>Back</button>
            <button onClick={() => act(() => removeLNVial(vial.id, { ...removal, removed_by: removal.removed_by || null, removed_note: removal.removed_note || null }))}
              className={thaw ? btnPrimary : 'flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500 text-white hover:bg-red-400'}>
              Confirm {thaw ? 'thaw' : 'discard'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const rows = [
    ['Location', location(vial)],
    ['Protein expression', fmt(vial.protein_expression)],
    ['Culture method', fmt(vial.culture_method)],
    ['Freeze date', vial.freeze_date ? `${vial.freeze_date}${vial.frozen_by ? ` · ${vial.frozen_by}` : ''}` : fmt(vial.frozen_by)],
    ['Cells per vial', fmt(vial.cells_per_vial)],
    ['Comment (passage #)', fmt(vial.comment)],
  ];
  return (
    <Modal wide title={vial.cell_line} subtitle={location(vial)} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase ${inTank ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/5 text-white/50 border-white/10'}`}>{vial.status}</span>
          {vial.master_stock && <span className="flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-black uppercase bg-amber-500/20 text-amber-200 border-amber-400/40"><Lock size={11} /> Master stock</span>}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
              <dt className={labelCls}>{k}</dt>
              <dd className="text-sm font-mono text-white/90 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {vial.freeze_note && <p className="text-xs text-white/40 font-mono">Original date note: {vial.freeze_note}</p>}
        {vial.additional_comment && (
          <div>
            <span className={labelCls}>Additional comment</span>
            <p className="text-sm text-white/70 whitespace-pre-wrap">{vial.additional_comment}</p>
          </div>
        )}
        {!inTank && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
            <span className={labelCls}>{vial.status}</span>
            <p className="font-mono text-white/80">{fmt(vial.removed_date)}{vial.removed_by ? ` · ${vial.removed_by}` : ''}</p>
            {vial.removed_note && <p className="text-white/50 mt-1">{vial.removed_note}</p>}
          </div>
        )}
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button onClick={onClose} className={btnGhost}>Close</button>
          <button onClick={() => setMode('edit')} className={btnGhost}><Pencil size={14} /> Edit</button>
          {inTank ? (
            <>
              <button onClick={() => startRemove('Discarded')} className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Discard</button>
              <button onClick={() => startRemove('Thawed')} className={btnPrimary}>Thaw</button>
            </>
          ) : (
            <button onClick={() => act(() => restoreLNVial(vial.id))} className={btnPrimary}><RotateCcw size={14} /> Back in tank</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Box editor ─────────────────────────────────────────────────────────────

function BoxEditModal({ box, onClose, onSaved }) {
  const [form, setForm] = useState({ label: box.label || '', restriction: box.restriction || '', notes: box.notes || '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await updateLNBox(box.id, form);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title={`Edit box · Rack ${box.rack_number} · Box ${box.number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Label"><input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="iPSCs, HP, Primary..." /></Field>
        <Field label="Rule (shown as a warning)"><input className={inputCls} value={form.restriction} onChange={(e) => setForm({ ...form, restriction: e.target.value })} placeholder="Use exclusively for primary cells" /></Field>
        <Field label="Notes"><textarea rows={5} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Box view: 9x9 map ──────────────────────────────────────────────────────

function BoxView({ boxId, tank, suggestions, onBack, onChanged }) {
  const [box, setBox] = useState(null);
  const [selected, setSelected] = useState([]);
  const [freezing, setFreezing] = useState(false);
  const [openVial, setOpenVial] = useState(null);
  const [editingBox, setEditingBox] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const load = async () => {
    try {
      setBox(await fetchLNBox(boxId));
    } catch (err) {
      console.error('Error loading box:', err);
    }
  };
  useEffect(() => { load(); setSelected([]); }, [boxId]);

  const afterChange = () => { setFreezing(false); setOpenVial(null); setEditingBox(false); setSelected([]); load(); onChanged(); };

  if (!box) return <div className="glass rounded-3xl p-12 text-center text-white/30 font-mono text-xs">Loading…</div>;

  const byWell = {};
  box.vials.filter((v) => v.status === 'In tank').forEach((v) => { byWell[v.well] = v; });
  const history = box.vials.filter((v) => v.status !== 'In tank').sort((a, b) => (b.removed_date || '').localeCompare(a.removed_date || ''));
  const legend = Object.entries(Object.values(byWell).reduce((acc, v) => ({ ...acc, [v.cell_line]: (acc[v.cell_line] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]);
  const free = box.capacity - Object.keys(byWell).length;
  const toggle = (w) => setSelected((s) => (s.includes(w) ? s.filter((x) => x !== w) : [...s, w]));
  const nextFree = (n) => {
    const out = [];
    for (let w = 1; w <= box.capacity && out.length < n; w++) if (!byWell[w]) out.push(w);
    return out;
  };

  return (
    <section className="space-y-6">
      <div className="glass rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={onBack} className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white mb-2"><ArrowLeft size={14} /> Tank</button>
            <h2 className="text-2xl font-black tracking-tight">Rack {box.rack_number} · Box {box.number}{box.label && <span className="text-sky-300"> · {box.label}</span>}</h2>
            <p className="text-xs font-mono text-white/40 mt-1">{box.occupied}/{box.capacity} vials · {free} free</p>
          </div>
          <button onClick={() => setEditingBox(true)} className={btnGhost}><Pencil size={14} /> Edit box</button>
        </div>
        {box.restriction && (
          <p className="flex gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {box.restriction}
          </p>
        )}
        {box.notes && (
          <div className="text-xs text-white/50">
            <button onClick={() => setShowNotes(!showNotes)} className="font-black uppercase tracking-widest text-white/40 hover:text-white">
              {showNotes ? '▾' : '▸'} Box notes ({box.notes.split('\n').length})
            </button>
            {showNotes && <pre className="mt-2 whitespace-pre-wrap font-mono bg-black/30 rounded-xl p-3">{box.notes}</pre>}
          </div>
        )}

        {/* Selection bar */}
        <div className="flex flex-wrap items-center gap-3 bg-black/30 rounded-2xl px-4 py-3">
          <span className="text-xs font-mono text-white/50">
            {selected.length ? `${selected.length} selected: ${compressWells(selected)}` : 'Click empty positions to select where to freeze new vials.'}
          </span>
          <div className="flex gap-2 ml-auto">
            {!selected.length && free > 0 && (
              <button onClick={() => setSelected(nextFree(Math.min(9, free)))} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white/60">
                Select next {Math.min(9, free)} free
              </button>
            )}
            {selected.length > 0 && (
              <>
                <button onClick={() => setSelected([])} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Clear</button>
                <button onClick={() => setFreezing(true)} className={btnPrimary}><Snowflake size={14} /> Freeze {selected.length} vial{selected.length === 1 ? '' : 's'}</button>
              </>
            )}
          </div>
        </div>

        {/* 9x9 grid, numbered row by row like the physical box */}
        <div className="overflow-x-auto">
          <div className="grid gap-1.5 mx-auto w-max" style={{ gridTemplateColumns: `repeat(${box.columns}, 4.5rem)` }}>
            {Array.from({ length: box.capacity }, (_, i) => i + 1).map((w) => {
              const v = byWell[w];
              const isSel = selected.includes(w);
              return (
                <button
                  key={w}
                  onClick={() => (v ? setOpenVial(v) : toggle(w))}
                  title={v ? `#${w} · ${v.cell_line}${v.freeze_date ? ` · ${v.freeze_date}` : ''}${v.master_stock ? ' · MASTER STOCK' : ''}` : `#${w} · empty`}
                  className={`relative h-[4.5rem] rounded-lg border p-1.5 text-left transition-all hover:scale-105 ${
                    v ? colorFor(v.cell_line) : isSel ? 'border-sky-300 bg-sky-400/30' : 'border-dashed border-white/10 hover:border-sky-400/60'
                  }`}
                >
                  <div className="text-[9px] font-mono font-bold text-white/60">{w}</div>
                  {v && <div className="text-[10px] font-black leading-tight text-white line-clamp-3 break-words">{v.cell_line}</div>}
                  {!v && isSel && <Snowflake size={14} className="text-sky-200 mx-auto mt-1" />}
                  {v?.master_stock && <Lock size={10} className="absolute top-1.5 right-1.5 text-amber-200" />}
                </button>
              );
            })}
          </div>
        </div>

        {legend.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {legend.map(([name, n]) => (
              <span key={name} className={`px-2 py-1 rounded-md border text-[11px] font-mono ${colorFor(name)}`}>{name} · {n}</span>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="glass rounded-3xl p-6">
          <h3 className={labelCls}><History size={12} className="inline mr-1" /> Removed from this box ({history.length})</h3>
          <div className="divide-y divide-white/5">
            {history.map((v) => (
              <button key={v.id} onClick={() => setOpenVial(v)} className="w-full flex flex-wrap gap-x-4 py-2 text-left text-xs font-mono hover:bg-white/5">
                <span className="text-white/40 w-10">#{v.well}</span>
                <span className="text-white/80 w-56 truncate">{v.cell_line}</span>
                <span className="text-white/50">{v.status} {fmt(v.removed_date)}{v.removed_by ? ` · ${v.removed_by}` : ''}</span>
                {v.removed_note && <span className="text-white/30 truncate max-w-md">{v.removed_note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {freezing && <FreezeModal box={box} wells={selected} suggestions={suggestions} onClose={() => setFreezing(false)} onSaved={afterChange} />}
      {openVial && <VialModal vial={openVial} tank={tank} suggestions={suggestions} onClose={() => setOpenVial(null)} onSaved={afterChange} />}
      {editingBox && <BoxEditModal box={box} onClose={() => setEditingBox(false)} onSaved={afterChange} />}
    </section>
  );
}

// ── Tank overview ──────────────────────────────────────────────────────────

function TankView({ tank, onOpenBox }) {
  const [exporting, setExporting] = useState(null);
  const exportRack = async (rack) => {
    setExporting(rack.id);
    try {
      const boxes = await Promise.all(rack.boxes.map((b) => fetchLNBox(b.id)));
      exportRackToExcel(rack, boxes);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
    setExporting(null);
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {tank.map((rack) => {
        const used = rack.boxes.reduce((a, b) => a + b.occupied, 0);
        const cap = rack.boxes.reduce((a, b) => a + b.capacity, 0);
        return (
          <section key={rack.id} className="glass rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight">Rack {rack.number}</h2>
                <p className="text-[10px] font-mono text-white/40">{used}/{cap} vials</p>
              </div>
              <button onClick={() => exportRack(rack)} disabled={exporting === rack.id} title="Download this rack in the lab spreadsheet format"
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-sky-500 disabled:opacity-40">
                <Download size={12} /> {exporting === rack.id ? '…' : 'Excel'}
              </button>
            </div>
            {rack.boxes.map((b) => {
              const pct = b.capacity ? (b.occupied / b.capacity) * 100 : 0;
              return (
                <button key={b.id} onClick={() => onOpenBox(b.id)} className="w-full text-left rounded-2xl p-3 border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-sky-400/50 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm truncate">
                      Box {b.number}{b.label && <span className="text-sky-300 font-bold"> · {b.label}</span>}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-white/40 shrink-0">
                      {b.restriction && <AlertTriangle size={11} className="text-amber-300" />}
                      {b.occupied}/{b.capacity}
                    </span>
                  </div>
                  <div className="h-1.5 mt-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${pct > 90 ? 'bg-rose-400' : 'bg-sky-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ── Stock search ───────────────────────────────────────────────────────────

function StockView({ vials, onOpenBox }) {
  const [q, setQ] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const query = q.trim().toLowerCase();
  const matches = (v) => !query || [v.cell_line, v.protein_expression, v.comment, v.additional_comment, v.frozen_by]
    .some((x) => x && x.toLowerCase().includes(query));

  const groups = useMemo(() => {
    const byLine = {};
    vials.filter((v) => v.status === 'In tank' && matches(v)).forEach((v) => {
      const g = (byLine[v.cell_line] ??= { name: v.cell_line, count: 0, master: 0, boxes: {} });
      g.count += 1;
      if (v.master_stock) g.master += 1;
      const key = `${v.rack_number}-${v.box_number}`;
      (g.boxes[key] ??= { rack: v.rack_number, box: v.box_number, boxId: v.box_id, wells: [] }).wells.push(v.well);
    });
    return Object.values(byLine).sort((a, b) => a.name.localeCompare(b.name));
  }, [vials, query]);

  const removed = useMemo(
    () => vials.filter((v) => v.status !== 'In tank' && matches(v)).sort((a, b) => (b.removed_date || '').localeCompare(a.removed_date || '')),
    [vials, query],
  );

  return (
    <section className="glass rounded-3xl p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input autoFocus className={`${inputCls} pl-11`} placeholder="Search cell line, construct, comment, initials..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="accent-sky-400" /> Show thawed / discarded
        </label>
      </div>
      <p className="text-xs font-mono text-white/40">
        {groups.length} cell line{groups.length === 1 ? '' : 's'} · {groups.reduce((a, g) => a + g.count, 0)} vials in the tank
      </p>
      <div className="divide-y divide-white/5">
        {groups.map((g) => (
          <div key={g.name} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
            <div className="w-72 min-w-0">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-2 border ${colorFor(g.name)}`} />
              <span className="font-bold text-sm">{g.name}</span>
            </div>
            <span className={`text-sm font-black w-24 ${g.count <= LOW_STOCK ? 'text-rose-300' : 'text-white'}`}>
              {g.count} vial{g.count === 1 ? '' : 's'}{g.count <= LOW_STOCK && <span className="ml-1 text-[9px] uppercase">low</span>}
            </span>
            {g.master > 0 && <span className="flex items-center gap-1 text-[10px] text-amber-200"><Lock size={11} /> {g.master} master</span>}
            <div className="flex flex-wrap gap-2 flex-1">
              {Object.values(g.boxes).map((b) => (
                <button key={`${b.rack}-${b.box}`} onClick={() => onOpenBox(b.boxId)} className="px-2 py-1 rounded-md bg-white/5 hover:bg-sky-500/30 text-[11px] font-mono text-white/70">
                  R{b.rack}·B{b.box}: {compressWells(b.wells)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="py-10 text-center text-white/30 font-mono text-xs uppercase tracking-widest">No vials in the tank match</p>}
      </div>
      {showRemoved && (
        <div className="pt-4">
          <h3 className={labelCls}><History size={12} className="inline mr-1" /> Thawed / discarded ({removed.length})</h3>
          <div className="divide-y divide-white/5">
            {removed.map((v) => (
              <button key={v.id} onClick={() => onOpenBox(v.box_id)} className="w-full flex flex-wrap gap-x-4 py-2 text-left text-xs font-mono hover:bg-white/5">
                <span className="text-white/80 w-64 truncate">{v.cell_line}</span>
                <span className="text-white/40 w-36">{location(v)}</span>
                <span className="text-white/50">{v.status} {fmt(v.removed_date)}{v.removed_by ? ` · ${v.removed_by}` : ''}</span>
                {v.removed_note && <span className="text-white/30 truncate max-w-md">{v.removed_note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LN2App() {
  const navigate = useNavigate();
  const [tank, setTank] = useState([]);
  const [vials, setVials] = useState([]);
  const [view, setView] = useState('tank'); // tank | stock
  const [boxId, setBoxId] = useState(null);

  const load = async () => {
    try {
      const [t, v] = await Promise.all([fetchLNTank(), fetchLNVials()]);
      setTank(t);
      setVials(v);
    } catch (err) {
      console.error('Error loading LN2 tank:', err);
    }
  };
  useEffect(() => { load(); }, []);

  const suggestions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean).map((s) => s.trim()))].sort();
    return { cellLines: uniq(vials.map((v) => v.cell_line)), methods: uniq(vials.map((v) => v.culture_method)) };
  }, [vials]);

  const totals = useMemo(() => {
    const boxes = tank.flatMap((r) => r.boxes);
    return { used: boxes.reduce((a, b) => a + b.occupied, 0), cap: boxes.reduce((a, b) => a + b.capacity, 0) };
  }, [tank]);

  const openBox = (id) => { setBoxId(id); setView('tank'); };
  const tabCls = (active) => `flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`;

  return (
    <div className="min-h-screen flex flex-col selection:bg-sky-400/30">
      <header className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-screen-2xl mx-auto w-full">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em] flex items-center gap-3">
            <span className="bg-sky-500 text-white px-2 py-0.5 rounded italic">LN2</span>
            <span className="text-white">TANK</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">{totals.used}/{totals.cap} positions in use</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
            <Home size={16} /> Home
          </button>
          <button onClick={() => { setView('tank'); setBoxId(null); }} className={tabCls(view === 'tank')}><Snowflake size={16} /> Tank</button>
          <button onClick={() => setView('stock')} className={tabCls(view === 'stock')}><Search size={16} /> Find stock</button>
        </div>
      </header>
      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-4">
        {view === 'stock' ? (
          <StockView vials={vials} onOpenBox={openBox} />
        ) : boxId ? (
          <BoxView boxId={boxId} tank={tank} suggestions={suggestions} onBack={() => setBoxId(null)} onChanged={load} />
        ) : (
          <TankView tank={tank} onOpenBox={openBox} />
        )}
      </main>
    </div>
  );
}
