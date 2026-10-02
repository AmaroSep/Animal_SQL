import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Refrigerator, Search, ArrowLeft, Lock, Pencil, Trash2, Plus, History, RotateCcw, AlertTriangle, FileSpreadsheet, Layers, ChevronRight,
  Upload, Tags,
} from 'lucide-react';
import {
  fetchM80Freezers, createM80Freezer, updateM80Freezer, deleteM80Freezer,
  createM80Compartment, updateM80Compartment, deleteM80Compartment,
  createM80Rack, updateM80Rack, deleteM80Rack,
  fetchM80Box, createM80Box, updateM80Box, deleteM80Box,
  fetchM80Tubes, createM80Tubes, updateM80Tube, removeM80Tube, restoreM80Tube, deleteM80Tube, fetchM80SampleTypes,
} from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import {
  TypeFieldsInput, SampleTypesPanel, M80ImportPanel, AnimalInfo, typeStyle, typeColor, visibleFields, formatValue,
} from './sampleTypes';
import { today, has, fmt, colorFor, labelCls, Field, Modal as BaseModal } from '../storage/shared';
import { exportM80Inventory, shortLocation, coord, coordList } from './exportInventory';
import RecordStamp from '../../components/RecordStamp';

const ACCENT = 'text-indigo-300';
const Modal = (props) => <BaseModal accent={ACCENT} {...props} />;
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-indigo-400 focus:outline-none';
const btnPrimary = 'flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-30';
const btnGhost = 'flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10';
const btnSmall = 'flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-white/60';
const btnDanger = 'flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10';

// Any layout is allowed (rows A–Z × up to 30 columns); these are just shortcuts
const BOX_PRESETS = [[9, 9], [10, 10], [6, 10], [8, 12], [5, 5], [2, 2]];
const MAX_ROWS = 26;
const MAX_COLUMNS = 30;

function BoxSizeField({ rows, columns, onChange, disabled, hint }) {
  const n = (v) => (v === '' ? '' : Math.max(0, parseInt(v, 10) || 0));
  const total = (Number(rows) || 0) * (Number(columns) || 0);
  const valid = rows >= 1 && rows <= MAX_ROWS && columns >= 1 && columns <= MAX_COLUMNS;
  return (
    <div className="space-y-2">
      <span className={labelCls}>Box size {hint && <span className="normal-case font-normal text-white/30">· {hint}</span>}</span>
      <div className="flex items-center gap-2">
        <input type="number" min="1" max={MAX_ROWS} required disabled={disabled} className={`${inputCls} w-24 text-center disabled:opacity-40`}
          value={rows} onChange={(e) => onChange({ rows: n(e.target.value), columns })} aria-label="Rows" />
        <span className="text-white/40 font-bold">×</span>
        <input type="number" min="1" max={MAX_COLUMNS} required disabled={disabled} className={`${inputCls} w-24 text-center disabled:opacity-40`}
          value={columns} onChange={(e) => onChange({ rows, columns: n(e.target.value) })} aria-label="Columns" />
        <span className={`text-xs font-mono ml-2 ${valid ? 'text-white/50' : 'text-red-300'}`}>
          {valid ? `${rows} rows × ${columns} columns = ${total} positions` : `1–${MAX_ROWS} rows, 1–${MAX_COLUMNS} columns`}
        </span>
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {BOX_PRESETS.map(([r, c]) => (
            <button key={`${r}x${c}`} type="button" onClick={() => onChange({ rows: r, columns: c })}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono ${Number(rows) === r && Number(columns) === c ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}>
              {r}×{c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const fullLocation = (l) =>
  `${l.freezer}${l.room ? ` (${l.room})` : ''} · Compartment ${l.compartment}${l.compartment_name ? ` ${l.compartment_name}` : ''} · Rack ${l.rack} · Level ${l.level} · Position ${l.slot}`;

// Run an API call inside a form: show its error or close on success
function useAction(onDone) {
  const [error, setError] = useState(null);
  const run = async (fn) => {
    try {
      setError(null);
      onDone(await fn());
    } catch (err) {
      setError(err.message);
    }
  };
  return [error, run];
}

const ErrorLine = ({ error }) => (error ? <p className="text-red-400 text-sm font-mono">{error}</p> : null);

// ── Configuration forms ────────────────────────────────────────────────────

function FreezerModal({ freezer, onClose, onSaved }) {
  const [form, setForm] = useState({ name: freezer?.name || '', room: freezer?.room || '', notes: freezer?.notes || '', compartments: 2 });
  const [error, run] = useAction(onSaved);
  const submit = (e) => {
    e.preventDefault();
    run(() => (freezer
      ? updateM80Freezer(freezer.id, { name: form.name, room: form.room, notes: form.notes })
      : createM80Freezer({ ...form, compartments: Number(form.compartments) })));
  };
  return (
    <Modal title={freezer ? `Edit ${freezer.name}` : 'New -80 freezer'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name *"><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="-80 A" /></Field>
        <Field label="Room"><input className={inputCls} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Room 204" /></Field>
        {!freezer && (
          <Field label="Compartments (levels / doors)">
            <input type="number" min="1" max="10" required className={inputCls} value={form.compartments} onChange={(e) => setForm({ ...form, compartments: e.target.value })} />
          </Field>
        )}
        <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <ErrorLine error={error} />
        <div className="flex justify-between gap-3">
          <div>
            {freezer && (
              <button type="button" className={btnDanger}
                onClick={() => confirm(`Delete freezer ${freezer.name}? Only possible when it has no boxes.`) && run(() => deleteM80Freezer(freezer.id))}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CompartmentModal({ compartment, onClose, onSaved }) {
  const [name, setName] = useState(compartment.name || '');
  const [error, run] = useAction(onSaved);
  return (
    <Modal title={`Compartment ${compartment.number}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run(() => updateM80Compartment(compartment.id, { name })); }} className="space-y-4">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Top, Bottom..." /></Field>
        <ErrorLine error={error} />
        <div className="flex justify-between gap-3">
          <button type="button" className={btnDanger}
            onClick={() => confirm(`Delete compartment ${compartment.number}? Only possible when its racks have no boxes.`) && run(() => deleteM80Compartment(compartment.id))}>
            <Trash2 size={14} /> Delete
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function RackModal({ rack, compartmentId, onClose, onSaved }) {
  const [form, setForm] = useState({ levels: rack?.levels ?? 6, depth: rack?.depth ?? 4, label: rack?.label || '' });
  const [error, run] = useAction(onSaved);
  const submit = (e) => {
    e.preventDefault();
    const data = { levels: Number(form.levels), depth: Number(form.depth), label: form.label };
    run(() => (rack ? updateM80Rack(rack.id, data) : createM80Rack({ ...data, compartment_id: compartmentId })));
  };
  return (
    <Modal title={rack ? `Edit rack ${rack.number}` : 'New rack'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Levels (shelves)"><input type="number" min="1" max="20" required className={inputCls} value={form.levels} onChange={(e) => setForm({ ...form, levels: e.target.value })} /></Field>
          <Field label="Boxes per level (front → back)"><input type="number" min="1" max="20" required className={inputCls} value={form.depth} onChange={(e) => setForm({ ...form, depth: e.target.value })} /></Field>
        </div>
        <Field label="Label"><input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Tau project" /></Field>
        <p className="text-xs font-mono text-white/40">Room for {Number(form.levels || 0) * Number(form.depth || 0)} boxes.</p>
        <ErrorLine error={error} />
        <div className="flex justify-between gap-3">
          <div>
            {rack && (
              <button type="button" className={btnDanger}
                onClick={() => confirm(`Delete rack ${rack.number}? Only possible when it has no boxes.`) && run(() => deleteM80Rack(rack.id))}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function NewBoxModal({ rack, level, slot, onClose, onSaved }) {
  const [size, setSize] = useState({ rows: 9, columns: 9 });
  const [label, setLabel] = useState('');
  const [error, run] = useAction(onSaved);
  return (
    <Modal title="New box" subtitle={`Rack ${rack.number} · Level ${level} · Position ${slot}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run(() => createM80Box({ rack_id: rack.id, level, slot, rows: Number(size.rows), columns: Number(size.columns), label })); }} className="space-y-4">
        <BoxSizeField rows={size.rows} columns={size.columns} onChange={setSize} hint="rows × columns" />
        <Field label="Label"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. PS19 brain lysates" /></Field>
        <ErrorLine error={error} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" className={btnPrimary}>Create box</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Freezer view: compartments → racks → levels × positions ────────────────

// Breadcrumb: Freezer › Compartment › Rack › Box
function Crumbs({ items }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs font-black uppercase tracking-widest">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={12} className="text-white/20" />}
          {it.onClick ? (
            <button onClick={it.onClick} className="text-white/40 hover:text-indigo-300">{it.label}</button>
          ) : (
            <span className="text-white/80">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

const occupancyCls = (b) => {
  const pct = b.capacity ? b.occupied / b.capacity : 0;
  if (pct > 0.9) return 'bg-rose-400/80 border-rose-300/60';
  if (pct > 0) return 'bg-indigo-400/70 border-indigo-300/60';
  return 'bg-indigo-400/20 border-indigo-300/40';
};

// Front view of the freezer, like opening the door: compartments are shelves,
// racks sit side by side as compact tiles with a mini map of their levels.
function FreezerView({ freezer, onOpenRack, onChanged, onExport }) {
  const [modal, setModal] = useState(null); // {type, ...}
  const done = () => { setModal(null); onChanged(); };
  const boxes = freezer.compartments.flatMap((c) => c.racks.flatMap((r) => r.boxes));
  const used = boxes.reduce((a, b) => a + b.occupied, 0);
  const cap = boxes.reduce((a, b) => a + b.capacity, 0);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{freezer.name}{freezer.room && <span className="text-white/40 font-bold"> · {freezer.room}</span>}</h2>
          <p className="text-xs font-mono text-white/40 mt-1">{boxes.length} boxes · {used}/{cap} tubes · click a rack to see inside</p>
          {freezer.notes && <p className="text-xs text-white/50 mt-1">{freezer.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onExport} className={btnSmall}><FileSpreadsheet size={12} /> Export Excel</button>
          <button onClick={() => setModal({ type: 'freezer' })} className={btnSmall}><Pencil size={12} /> Edit freezer</button>
          <button onClick={async () => { try { await createM80Compartment({ freezer_id: freezer.id }); onChanged(); } catch (err) { alert(err.message); } }} className={btnSmall}>
            <Plus size={12} /> Compartment
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl p-4 space-y-3 max-w-5xl">
        {freezer.compartments.map((c) => (
          <div key={c.id} className="bg-black/20 border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <button onClick={() => setModal({ type: 'compartment', compartment: c })} className="flex items-center gap-2 font-black text-sm hover:text-indigo-300" title="Rename / delete compartment">
                <Layers size={14} className="text-indigo-300" /> Compartment {c.number}{c.name && <span className="text-white/50 font-bold"> · {c.name}</span>}
              </button>
              <span className="text-[10px] font-mono text-white/30">{c.racks.length} rack{c.racks.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {c.racks.map((r) => {
                const bySlot = Object.fromEntries(r.boxes.map((b) => [`${b.level}-${b.slot}`, b]));
                const rUsed = r.boxes.reduce((a, b) => a + b.occupied, 0);
                return (
                  <button key={r.id} onClick={() => onOpenRack(r.id)} title={`Rack ${r.number}: ${r.boxes.length}/${r.levels * r.depth} boxes, ${rUsed} tubes`}
                    className="flex-1 min-w-[8.5rem] max-w-[12rem] text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-indigo-500/10 hover:border-indigo-400/50 p-2.5 transition-all">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-black text-sm">Rack {r.number}</span>
                      <span className="text-[9px] font-mono text-white/40">{r.boxes.length}/{r.levels * r.depth}</span>
                    </div>
                    <div className="text-[10px] text-indigo-300 font-bold truncate h-4">{r.label || ''}</div>
                    {/* Mini map: one row per level, one square per box position (front → back) */}
                    <div className="mt-1.5 space-y-[3px]">
                      {Array.from({ length: r.levels }, (_, li) => (
                        <div key={li} className="flex gap-[3px]">
                          {Array.from({ length: r.depth }, (_, si) => {
                            const b = bySlot[`${li + 1}-${si + 1}`];
                            return <span key={si} className={`flex-1 h-2.5 rounded-sm border ${b ? occupancyCls(b) : 'border-dashed border-white/10'}`} />;
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] font-mono text-white/30 mt-1.5">{rUsed} tubes</div>
                  </button>
                );
              })}
              <button onClick={() => setModal({ type: 'rack', compartmentId: c.id })}
                className="min-w-[6rem] rounded-xl border border-dashed border-white/15 text-white/30 hover:text-indigo-300 hover:border-indigo-400/60 text-[10px] font-black uppercase tracking-widest flex flex-col items-center justify-center gap-1 py-4">
                <Plus size={14} /> Rack
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-[10px] font-mono uppercase tracking-widest text-white/40">
        <span className="flex items-center gap-2"><span className="w-3 h-2.5 rounded-sm border bg-indigo-400/20 border-indigo-300/40" /> Empty box</span>
        <span className="flex items-center gap-2"><span className="w-3 h-2.5 rounded-sm border bg-indigo-400/70 border-indigo-300/60" /> Box in use</span>
        <span className="flex items-center gap-2"><span className="w-3 h-2.5 rounded-sm border bg-rose-400/80 border-rose-300/60" /> Almost full</span>
        <span className="flex items-center gap-2"><span className="w-3 h-2.5 rounded-sm border border-dashed border-white/20" /> Free position</span>
      </div>

      {modal?.type === 'freezer' && <FreezerModal freezer={freezer} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'compartment' && <CompartmentModal compartment={modal.compartment} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'rack' && <RackModal compartmentId={modal.compartmentId} onClose={() => setModal(null)} onSaved={done} />}
    </section>
  );
}

// Inside one rack: levels (top → bottom) × positions (front → back)
function RackView({ freezer, rackId, onOpenBox, onOpenRack, onBack, onChanged }) {
  const [modal, setModal] = useState(null);
  const done = () => { setModal(null); onChanged(); };
  const comp = freezer.compartments.find((c) => c.racks.some((r) => r.id === rackId));
  const rack = comp?.racks.find((r) => r.id === rackId);
  if (!rack) return null;
  const siblings = comp.racks;
  const idx = siblings.findIndex((r) => r.id === rackId);
  const bySlot = Object.fromEntries(rack.boxes.map((b) => [`${b.level}-${b.slot}`, b]));

  return (
    <section className="space-y-5">
      <Crumbs items={[
        { label: `${freezer.name}${freezer.room ? ` (${freezer.room})` : ''}`, onClick: onBack },
        { label: `Compartment ${comp.number}${comp.name ? ` · ${comp.name}` : ''}`, onClick: onBack },
        { label: `Rack ${rack.number}` },
      ]} />
      <div className="glass rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Rack {rack.number}{rack.label && <span className="text-indigo-300"> · {rack.label}</span>}</h2>
            <p className="text-xs font-mono text-white/40 mt-1">{rack.levels} levels × {rack.depth} boxes · {rack.boxes.length} boxes · {rack.boxes.reduce((a, b) => a + b.occupied, 0)} tubes</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={idx <= 0} onClick={() => onOpenRack(siblings[idx - 1].id)} className={`${btnSmall} disabled:opacity-30`}><ArrowLeft size={12} /> Rack {idx > 0 ? siblings[idx - 1].number : ''}</button>
            <button disabled={idx >= siblings.length - 1} onClick={() => onOpenRack(siblings[idx + 1].id)} className={`${btnSmall} disabled:opacity-30`}>Rack {idx < siblings.length - 1 ? siblings[idx + 1].number : ''} <ChevronRight size={12} /></button>
            <button onClick={() => setModal({ type: 'rack' })} className={btnSmall}><Pencil size={12} /> Edit rack</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-2 mx-auto">
            <thead>
              <tr>
                <th />
                {Array.from({ length: rack.depth }, (_, i) => (
                  <th key={i} className="text-[10px] font-mono text-white/30 font-bold uppercase">{i === 0 ? 'Front' : i === rack.depth - 1 ? 'Back' : `Pos ${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rack.levels }, (_, li) => li + 1).map((level) => (
                <tr key={level}>
                  <th className="text-[10px] font-mono text-white/30 font-bold pr-2">Level {level}</th>
                  {Array.from({ length: rack.depth }, (_, si) => si + 1).map((slot) => {
                    const b = bySlot[`${level}-${slot}`];
                    if (!b) {
                      return (
                        <td key={slot}>
                          <button onClick={() => setModal({ type: 'box', level, slot })} title={`Level ${level} · Position ${slot}: add a box`}
                            className="w-36 h-16 rounded-xl border border-dashed border-white/10 text-white/20 hover:border-indigo-400/60 hover:text-indigo-300 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest">
                            <Plus size={14} /> Box
                          </button>
                        </td>
                      );
                    }
                    const pct = (b.occupied / b.capacity) * 100;
                    return (
                      <td key={slot}>
                        <button onClick={() => onOpenBox(b.id)} title={`${b.label || 'Box'} · ${b.occupied}/${b.capacity}`}
                          className="w-36 h-16 rounded-xl border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/25 px-2.5 py-2 text-left flex flex-col justify-between">
                          <span className="flex items-center gap-1 text-xs font-bold leading-tight w-full">
                            {b.restriction && <AlertTriangle size={11} className="text-amber-300 shrink-0" />}
                            <span className="truncate">{b.label || `Box (${b.rows}×${b.columns})`}</span>
                          </span>
                          <span className="flex items-center gap-2 w-full">
                            <span className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <span className={`block h-full ${pct > 90 ? 'bg-rose-400' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
                            </span>
                            <span className="text-[9px] font-mono text-white/50">{b.occupied}/{b.capacity}</span>
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal?.type === 'rack' && <RackModal rack={rack} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />}
      {modal?.type === 'box' && <NewBoxModal rack={rack} level={modal.level} slot={modal.slot} onClose={() => setModal(null)} onSaved={done} />}
    </section>
  );
}

// ── Tube forms ─────────────────────────────────────────────────────────────

const emptyTube = (typeId = '') => ({
  sample_name: '', sample_type_id: typeId, data: {}, aliquot_number: '', volume: '', frozen_date: today(), frozen_by: '', comment: '', reserved: false,
});

const toPayload = (f) => ({
  sample_name: f.sample_name.trim(),
  sample_type_id: f.sample_type_id ? Number(f.sample_type_id) : null,
  data: f.data || {},
  aliquot_number: f.aliquot_number === '' || f.aliquot_number === null ? null : Number(f.aliquot_number),
  volume: f.volume || null,
  frozen_date: f.frozen_date || null,
  frozen_by: f.frozen_by ? f.frozen_by.trim().toUpperCase() : null,
  comment: f.comment || null,
  reserved: !!f.reserved,
});

// Common tube data, then the fields of the chosen sample type
function TubeFields({ form, setForm, suggestions, types, canSee, perAliquot = false }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const type = types.find((t) => t.id === Number(form.sample_type_id));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Sample type">
          <select className={inputCls} value={form.sample_type_id || ''} onChange={(e) => setForm({ ...form, sample_type_id: e.target.value })}>
            <option value="" className="bg-slate-900">— none —</option>
            {types.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>)}
          </select>
        </Field>
        <Field label="Name on tube *">
          <input required className={inputCls} value={form.sample_name} onChange={set('sample_name')} list="m80-samples" placeholder={type?.name === 'CSF' ? 'V00011.BL' : 'PS19 cortex lysate'} />
        </Field>
        {!perAliquot && <Field label="Aliquot #"><input type="number" min="1" className={inputCls} value={form.aliquot_number ?? ''} onChange={set('aliquot_number')} /></Field>}
        <Field label={perAliquot ? 'Volume (default for all aliquots)' : 'Volume'}><input className={inputCls} value={form.volume} onChange={set('volume')} placeholder="50 µL" /></Field>
        <Field label="Date received / frozen"><input type="date" className={inputCls} value={form.frozen_date} onChange={set('frozen_date')} /></Field>
        <Field label="Frozen by (initials)"><input className={inputCls} value={form.frozen_by} onChange={set('frozen_by')} maxLength={6} /></Field>
      </div>
      <TypeFieldsInput type={type} data={form.data || {}} setData={(data) => setForm({ ...form, data })} canSee={canSee} />
      <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
        <Field label="Notes" className="col-span-2"><textarea rows={2} className={inputCls} value={form.comment} onChange={set('comment')} /></Field>
        <label className="col-span-2 flex items-center gap-3 text-sm text-white/80 cursor-pointer">
          <input type="checkbox" checked={!!form.reserved} onChange={set('reserved')} className="w-4 h-4 accent-amber-400" />
          <Lock size={14} className="text-amber-300" /> Reserved — do not use without asking
        </label>
      </div>
      <datalist id="m80-samples">{suggestions.samples.map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}

function AddTubesModal({ box, wells, suggestions, types, canSee, onClose, onSaved }) {
  const sorted = [...wells].sort((a, b) => a - b);
  const [form, setForm] = useState(() => emptyTube(types.find((t) => t.name === 'General')?.id || ''));
  // One aliquot per selected position: number 1..N and its own volume (empty = the default)
  const [items, setItems] = useState(() => sorted.map((w, i) => ({ well: w, aliquot_number: i + 1, volume: '' })));
  const [error, run] = useAction(onSaved);
  const many = sorted.length > 1;
  const setItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const submit = (e) => {
    e.preventDefault();
    const data = toPayload(form);
    run(() => createM80Tubes({
      box_id: box.id, wells: sorted, data,
      items: many ? items.map((it) => ({ well: it.well, aliquot_number: it.aliquot_number === '' ? null : Number(it.aliquot_number), volume: it.volume || data.volume })) : null,
    }));
  };
  return (
    <Modal wide title={`Store ${sorted.length} tube${many ? 's' : ''}`} subtitle={`${fullLocation(box.location)} · positions ${coordList(sorted, box.columns)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        {box.restriction && (
          <p className="flex gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {box.restriction}</p>
        )}
        <TubeFields form={form} setForm={setForm} suggestions={suggestions} types={types} canSee={canSee} perAliquot={many} />
        {many && (
          <div className="border-t border-white/10 pt-4">
            <span className={labelCls}>Aliquots — same sample data, one per position</span>
            <div className="grid grid-cols-[4rem_7rem_1fr] gap-2 items-center text-xs">
              <span className="text-white/30 font-mono">Pos.</span><span className="text-white/30 font-mono">Aliquot #</span><span className="text-white/30 font-mono">Volume</span>
              {items.map((it, i) => (
                <React.Fragment key={it.well}>
                  <span className="font-mono text-white/60">{coord(it.well, box.columns)}</span>
                  <input type="number" min="1" className={`${inputCls} py-2`} value={it.aliquot_number} onChange={(e) => setItem(i, { aliquot_number: e.target.value })} />
                  <input className={`${inputCls} py-2`} value={it.volume} placeholder={form.volume || 'default'} onChange={(e) => setItem(i, { volume: e.target.value })} />
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        <ErrorLine error={error} />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save {sorted.length} tube{many ? 's' : ''}</button>
        </div>
      </form>
    </Modal>
  );
}

function TubeModal({ tube, box, freezers, suggestions, types, canSee, onClose, onSaved }) {
  const [mode, setMode] = useState('view'); // view | edit | remove
  const blank = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? '']));
  const [form, setForm] = useState(() => ({ ...blank(tube), data: tube.data || {}, sample_type_id: tube.sample_type_id || '' }));
  const type = types.find((t) => t.id === tube.sample_type_id);
  const [removal, setRemoval] = useState({ status: 'Used', removed_date: today(), removed_by: '', removed_note: '' });
  const [error, run] = useAction(onSaved);
  const inFreezer = tube.status === 'In freezer';
  const pos = coord(tube.well, box.columns);
  const where = `${fullLocation(box.location)} · position ${pos}`;

  const startRemove = (status) => {
    if (tube.reserved && !confirm(`${tube.sample_name} ${pos} is RESERVED. Use or discard it anyway?`)) return;
    setRemoval({ ...removal, status });
    setMode('remove');
  };

  if (mode === 'edit') {
    const allBoxes = freezers.flatMap((f) => f.compartments.flatMap((c) => c.racks.flatMap((r) => r.boxes.map((b) => ({
      id: b.id, capacity: b.capacity, rows: b.rows, columns: b.columns, name: `${f.name} · C${c.number} · R${r.number} · L${b.level} · P${b.slot}${b.label ? ` (${b.label})` : ''}`,
    })))));
    const target = allBoxes.find((b) => b.id === Number(form.box_id));
    // Position as row-column of the chosen box
    const cols = target?.columns || box.columns;
    const posRow = Math.floor((Number(form.well) - 1) / cols) + 1;
    const posCol = ((Number(form.well) - 1) % cols) + 1;
    const setPos = (r, c) => setForm({ ...form, well: (Number(r) - 1) * cols + Number(c) });
    const save = (e) => {
      e.preventDefault();
      run(() => updateM80Tube(tube.id, {
        ...toPayload(form), box_id: Number(form.box_id), well: Number(form.well),
        ...(inFreezer ? {} : { removed_date: form.removed_date || null, removed_by: form.removed_by || null, removed_note: form.removed_note || null }),
      }));
    };
    return (
      <Modal wide title={`Edit tube · ${tube.sample_name}`} subtitle={where} onClose={onClose}>
        <form onSubmit={save} className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Box" className="col-span-2">
              <select className={inputCls} value={form.box_id} onChange={(e) => setForm({ ...form, box_id: e.target.value })}>
                {allBoxes.map((b) => <option key={b.id} value={b.id} className="bg-slate-900">{b.name}</option>)}
              </select>
            </Field>
            <Field label="Position (row-column)">
              <div className="flex items-center gap-2">
                <input type="number" min="1" max={target?.rows || box.rows} required className={`${inputCls} text-center`} value={posRow} onChange={(e) => setPos(e.target.value, posCol)} aria-label="Row" />
                <span className="text-white/40 font-bold">-</span>
                <input type="number" min="1" max={cols} required className={`${inputCls} text-center`} value={posCol} onChange={(e) => setPos(posRow, e.target.value)} aria-label="Column" />
              </div>
            </Field>
          </div>
          <TubeFields form={form} setForm={setForm} suggestions={suggestions} types={types} canSee={canSee} />
          {!inFreezer && (
            <div className="grid grid-cols-2 gap-4">
              <Field label={`${tube.status} on`}><input type="date" className={inputCls} value={form.removed_date} onChange={(e) => setForm({ ...form, removed_date: e.target.value })} /></Field>
              <Field label="By"><input className={inputCls} value={form.removed_by} onChange={(e) => setForm({ ...form, removed_by: e.target.value })} /></Field>
              <Field label="Note" className="col-span-2"><input className={inputCls} value={form.removed_note} onChange={(e) => setForm({ ...form, removed_note: e.target.value })} /></Field>
            </div>
          )}
          <ErrorLine error={error} />
          <div className="flex justify-between gap-3">
            <button type="button" className={btnDanger}
              onClick={() => confirm(`Permanently delete this record of ${tube.sample_name}? To keep its history, use "Used" or "Discard" instead.`) && run(() => deleteM80Tube(tube.id))}>
              <Trash2 size={14} /> Delete record
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setForm({ ...blank(tube), data: tube.data || {}, sample_type_id: tube.sample_type_id || '' }); setMode('view'); }} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save</button>
            </div>
          </div>
        </form>
      </Modal>
    );
  }

  if (mode === 'remove') {
    const use = removal.status === 'Used';
    return (
      <Modal title={use ? 'Use tube' : 'Discard tube'} subtitle={`${tube.sample_name} · ${pos}`} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-white/60">The tube leaves the freezer and its position becomes free. The record stays in the history.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date"><input type="date" className={inputCls} value={removal.removed_date} onChange={(e) => setRemoval({ ...removal, removed_date: e.target.value })} /></Field>
            <Field label="By (initials)"><input className={inputCls} value={removal.removed_by} maxLength={6} onChange={(e) => setRemoval({ ...removal, removed_by: e.target.value.toUpperCase() })} /></Field>
            <Field label={use ? 'Used for' : 'Reason'} className="col-span-2">
              <input className={inputCls} value={removal.removed_note} onChange={(e) => setRemoval({ ...removal, removed_note: e.target.value })} placeholder={use ? 'e.g. WB 2026-10-01' : 'e.g. thawed by accident'} />
            </Field>
          </div>
          <ErrorLine error={error} />
          <div className="flex justify-end gap-3">
            <button onClick={() => setMode('view')} className={btnGhost}>Back</button>
            <button onClick={() => run(() => removeM80Tube(tube.id, { ...removal, removed_by: removal.removed_by || null, removed_note: removal.removed_note || null }))}
              className={use ? btnPrimary : 'flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500 text-white hover:bg-red-400'}>
              Confirm
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const rows = [
    ['Location', where],
    ['Type', fmt(tube.sample_type)],
    ['Aliquot #', fmt(tube.aliquot_number)],
    ['Volume', fmt(tube.volume)],
    ['Received / frozen', tube.frozen_date ? `${tube.frozen_date}${tube.frozen_by ? ` · ${tube.frozen_by}` : ''}` : fmt(tube.frozen_by)],
    // Older tubes recorded these without a sample type
    ...(has(tube.source) ? [['Source', tube.source]] : []),
    ...(has(tube.concentration) ? [['Concentration', tube.concentration]] : []),
  ];
  const typeRows = visibleFields(type, canSee).filter((f) => f.type !== 'animal');
  const hiddenCount = (type?.fields || []).length - visibleFields(type, canSee).length;
  return (
    <Modal wide title={tube.sample_name} subtitle={`Position ${pos}${tube.aliquot_number ? ` · aliquot ${tube.aliquot_number}` : ''}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase ${inFreezer ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40' : 'bg-white/5 text-white/50 border-white/10'}`}>{tube.status}</span>
          {tube.reserved && <span className="flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-black uppercase bg-amber-500/20 text-amber-200 border-amber-400/40"><Lock size={11} /> Reserved</span>}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {rows.map(([k, v]) => (
            <div key={k} className={`bg-white/5 border border-white/5 rounded-xl px-4 py-3 ${k === 'Location' ? 'col-span-2' : ''}`}>
              <dt className={labelCls}>{k}</dt>
              <dd className="text-sm font-mono text-white/90 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {type && (
          <div className="space-y-2">
            <span className={labelCls} style={{ color: typeColor(type) }}>{type.name} information</span>
            <AnimalInfo animal={tube.animal} collectionDate={tube.data?.collection_date} />
            {type.fields.some((f) => f.type === 'animal' && has(tube.data?.[f.key])) && !tube.animal && (
              <p className="text-xs text-amber-200/80">Animal {type.fields.filter((f) => f.type === 'animal').map((f) => tube.data?.[f.key]).filter(Boolean).join(', ')} is not in Bioterio.</p>
            )}
            <dl className="grid grid-cols-3 gap-2">
              {typeRows.map((f) => (
                <div key={f.key} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                  <dt className="text-[9px] font-black uppercase tracking-widest text-white/40">{f.label}{f.restricted && <Lock size={9} className="inline ml-1 text-amber-300" />}</dt>
                  <dd className="text-sm font-mono text-white/90 break-words">{formatValue(f, tube.data?.[f.key])}</dd>
                </div>
              ))}
            </dl>
            {hiddenCount > 0 && <p className="text-[11px] text-white/40 flex items-center gap-1"><Lock size={11} /> {hiddenCount} restricted field{hiddenCount === 1 ? '' : 's'} hidden.</p>}
          </div>
        )}
        {tube.comment && (<div><span className={labelCls}>Notes</span><p className="text-sm text-white/70 whitespace-pre-wrap">{tube.comment}</p></div>)}
        {!inFreezer && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
            <span className={labelCls}>{tube.status}</span>
            <p className="font-mono text-white/80">{fmt(tube.removed_date)}{tube.removed_by ? ` · ${tube.removed_by}` : ''}</p>
            {tube.removed_note && <p className="text-white/50 mt-1">{tube.removed_note}</p>}
          </div>
        )}
        <ErrorLine error={error} />
        <div className="flex flex-wrap items-end justify-end gap-3 pt-2">
          <RecordStamp record={tube} className="mr-auto self-center" />
          <button onClick={onClose} className={btnGhost}>Close</button>
          <button onClick={() => setMode('edit')} className={btnGhost}><Pencil size={14} /> Edit</button>
          {inFreezer ? (
            <>
              <button onClick={() => startRemove('Discarded')} className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Discard</button>
              <button onClick={() => startRemove('Used')} className={btnPrimary}>Use</button>
            </>
          ) : (
            <button onClick={() => run(() => restoreM80Tube(tube.id))} className={btnPrimary}><RotateCcw size={14} /> Back in freezer</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function BoxEditModal({ box, freezers, onClose, onSaved }) {
  const [form, setForm] = useState({
    label: box.label || '', restriction: box.restriction || '', notes: box.notes || '',
    rack_id: box.rack_id, level: box.level, slot: box.slot, rows: box.rows, columns: box.columns,
  });
  const hasTubes = box.tubes.some((t) => t.status === 'In freezer');
  const [error, run] = useAction(onSaved);
  const racks = freezers.flatMap((f) => f.compartments.flatMap((c) => c.racks.map((r) => ({ ...r, name: `${f.name} · Compartment ${c.number} · Rack ${r.number}` }))));
  const rack = racks.find((r) => r.id === Number(form.rack_id));
  const submit = (e) => {
    e.preventDefault();
    run(() => updateM80Box(box.id, {
      label: form.label, restriction: form.restriction, notes: form.notes,
      rack_id: Number(form.rack_id), level: Number(form.level), slot: Number(form.slot),
      ...(hasTubes ? {} : { rows: Number(form.rows), columns: Number(form.columns) }),
    }));
  };
  return (
    <Modal wide title="Edit box" subtitle={fullLocation(box.location)} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Label"><input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <div className="col-span-2">
            <BoxSizeField rows={form.rows} columns={form.columns} disabled={hasTubes}
              hint={hasTubes ? 'can only change while the box is empty' : 'rows × columns'}
              onChange={(sz) => setForm({ ...form, ...sz })} />
          </div>
          <Field label="Rule (shown as a warning)" className="col-span-2"><input className={inputCls} value={form.restriction} onChange={(e) => setForm({ ...form, restriction: e.target.value })} placeholder="Only for Tau project samples" /></Field>
          <Field label="Notes" className="col-span-2"><textarea rows={3} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="border-t border-white/10 pt-4">
          <span className={labelCls}>Move box</span>
          <div className="grid grid-cols-4 gap-3">
            <select className={`${inputCls} col-span-2`} value={form.rack_id} onChange={(e) => setForm({ ...form, rack_id: e.target.value })}>
              {racks.map((r) => <option key={r.id} value={r.id} className="bg-slate-900">{r.name}</option>)}
            </select>
            <select className={inputCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              {Array.from({ length: rack?.levels || 1 }, (_, i) => <option key={i} value={i + 1} className="bg-slate-900">Level {i + 1}</option>)}
            </select>
            <select className={inputCls} value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>
              {Array.from({ length: rack?.depth || 1 }, (_, i) => <option key={i} value={i + 1} className="bg-slate-900">Position {i + 1}{i === 0 ? ' (front)' : ''}</option>)}
            </select>
          </div>
        </div>
        <ErrorLine error={error} />
        <div className="flex justify-between gap-3">
          <button type="button" className={btnDanger}
            onClick={() => confirm('Delete this box? Only possible if it never had tubes recorded.') && run(() => deleteM80Box(box.id))}>
            <Trash2 size={14} /> Delete box
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Box view: tube grid ────────────────────────────────────────────────────

function BoxView({ boxId, freezers, suggestions, types, canSee, onBack, onFreezer, onChanged }) {
  const [box, setBox] = useState(null);
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null); // 'add' | 'edit' | tube
  const load = async () => {
    try {
      setBox(await fetchM80Box(boxId));
    } catch (err) {
      console.error('Error loading box:', err);
      onBack();
    }
  };
  useEffect(() => { load(); setSelected([]); }, [boxId]);
  const done = () => { setModal(null); setSelected([]); load(); onChanged(); };

  if (!box) return <div className="glass rounded-3xl p-12 text-center text-white/30 font-mono text-xs">Loading…</div>;

  const byWell = {};
  box.tubes.filter((t) => t.status === 'In freezer').forEach((t) => { byWell[t.well] = t; });
  const history = box.tubes.filter((t) => t.status !== 'In freezer').sort((a, b) => (b.removed_date || '').localeCompare(a.removed_date || ''));
  const typeOf = (t) => types.find((x) => x.id === t.sample_type_id);
  const legend = Object.entries(Object.values(byWell).reduce((acc, t) => ({ ...acc, [t.sample_name]: (acc[t.sample_name] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const typeLegend = Object.entries(Object.values(byWell).reduce((acc, t) => (t.sample_type_id ? { ...acc, [t.sample_type_id]: (acc[t.sample_type_id] || 0) + 1 } : acc), {}));
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
            <div className="mb-3">
              <Crumbs items={[
                { label: `${box.location.freezer}${box.location.room ? ` (${box.location.room})` : ''}`, onClick: onFreezer },
                { label: `Compartment ${box.location.compartment}`, onClick: onFreezer },
                { label: `Rack ${box.location.rack}`, onClick: onBack },
                { label: `Level ${box.location.level} · Pos ${box.location.slot}` },
              ]} />
            </div>
            <h2 className="text-2xl font-black tracking-tight">{box.label || 'Box'} <span className="text-white/40 text-base font-bold">({box.rows}×{box.columns})</span></h2>
            <p className="text-xs font-mono text-white/40 mt-1">{fullLocation(box.location)} · {box.occupied}/{box.capacity} tubes · {free} free</p>
          </div>
          <button onClick={() => setModal('edit')} className={btnGhost}><Pencil size={14} /> Edit / move box</button>
        </div>
        {box.restriction && <p className="flex gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {box.restriction}</p>}
        {box.notes && <p className="text-xs text-white/50 whitespace-pre-wrap">{box.notes}</p>}

        <div className="flex flex-wrap items-center gap-3 bg-black/30 rounded-2xl px-4 py-3">
          <span className="text-xs font-mono text-white/50">
            {selected.length ? `${selected.length} selected: ${coordList(selected, box.columns)}` : 'Click empty positions to select where to store new tubes.'}
          </span>
          <div className="flex gap-2 ml-auto">
            {!selected.length && free > 0 && (
              <button onClick={() => setSelected(nextFree(Math.min(box.columns, free)))} className={btnSmall}>Select next {Math.min(box.columns, free)} free</button>
            )}
            {selected.length > 0 && (
              <>
                <button onClick={() => setSelected([])} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Clear</button>
                <button onClick={() => setModal('add')} className={btnPrimary}><Plus size={14} /> Store {selected.length} tube{selected.length === 1 ? '' : 's'}</button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid gap-1.5 mx-auto w-max items-center" style={{ gridTemplateColumns: `1.5rem repeat(${box.columns}, 4.25rem)` }}>
            <span />
            {Array.from({ length: box.columns }, (_, i) => <span key={`c${i}`} className="text-center text-[10px] font-mono font-bold text-white/30">{i + 1}</span>)}
            {Array.from({ length: box.capacity }, (_, i) => i + 1).flatMap((w) => {
              const t = byWell[w];
              const isSel = selected.includes(w);
              const cell = (
                <button key={w} onClick={() => (t ? setModal(t) : toggle(w))}
                  title={t ? `${coord(w, box.columns)} · ${t.sample_name}${t.aliquot_number ? ` · aliquot ${t.aliquot_number}` : ''}${t.sample_type ? ` · ${t.sample_type}` : ''}${t.volume ? ` · ${t.volume}` : ''}${t.reserved ? ' · RESERVED' : ''}` : `${coord(w, box.columns)} · empty`}
                  style={t && typeOf(t) ? typeStyle(typeOf(t)) : undefined}
                  className={`relative h-[4.25rem] rounded-lg border p-1.5 text-left transition-all hover:scale-105 ${
                    t ? (typeOf(t) ? '' : colorFor(t.sample_name)) : isSel ? 'border-indigo-300 bg-indigo-400/30' : 'border-dashed border-white/10 hover:border-indigo-400/60'
                  }`}>
                  <div className="text-[9px] font-mono font-bold text-white/60">{coord(w, box.columns)}{t?.aliquot_number ? <span className="text-white/40"> · a{t.aliquot_number}</span> : ''}</div>
                  {t && <div className="text-[10px] font-black leading-tight text-white line-clamp-3 break-words">{t.sample_name}</div>}
                  {t?.reserved && <Lock size={10} className="absolute top-1.5 right-1.5 text-amber-200" />}
                </button>
              );
              // Row number before the first position of each row
              return (w - 1) % box.columns === 0
                ? [<span key={`r${w}`} className="text-right pr-1 text-[10px] font-mono font-bold text-white/30">{Math.ceil(w / box.columns)}</span>, cell]
                : [cell];
            })}
          </div>
        </div>
        {typeLegend.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {typeLegend.map(([id, n]) => {
              const t = types.find((x) => x.id === Number(id));
              return <span key={id} style={typeStyle(t)} className="px-2 py-1 rounded-md border text-[11px] font-black">{t?.name} · {n}</span>;
            })}
          </div>
        )}
        {legend.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {legend.map(([name, n]) => <span key={name} className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono">{name} · {n}</span>)}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="glass rounded-3xl p-6">
          <h3 className={labelCls}><History size={12} className="inline mr-1" /> Removed from this box ({history.length})</h3>
          <div className="divide-y divide-white/5">
            {history.map((t) => (
              <button key={t.id} onClick={() => setModal(t)} className="w-full flex flex-wrap gap-x-4 py-2 text-left text-xs font-mono hover:bg-white/5">
                <span className="text-white/40 w-12">{coord(t.well, box.columns)}</span>
                <span className="text-white/80 w-56 truncate">{t.sample_name}</span>
                <span className="text-white/50">{t.status} {fmt(t.removed_date)}{t.removed_by ? ` · ${t.removed_by}` : ''}</span>
                {t.removed_note && <span className="text-white/30 truncate max-w-md">{t.removed_note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {modal === 'add' && <AddTubesModal box={box} wells={selected} suggestions={suggestions} types={types} canSee={canSee} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'edit' && <BoxEditModal box={box} freezers={freezers} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); load(); }} />}
      {modal && typeof modal === 'object' && <TubeModal tube={modal} box={box} freezers={freezers} suggestions={suggestions} types={types} canSee={canSee} onClose={() => setModal(null)} onSaved={done} />}
    </section>
  );
}

// ── Sample search ──────────────────────────────────────────────────────────

// With a sample type chosen: one row per tube with that type's own columns
function TypeTable({ type, tubes, canSee, onOpenBox }) {
  const fields = visibleFields(type, canSee);
  const th = 'px-2 py-2 text-left text-[9px] font-black uppercase tracking-widest text-white/40 whitespace-nowrap';
  const td = 'px-2 py-1.5 whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono">
        <thead><tr className="border-b border-white/10">
          <th className={th}>Name on tube</th><th className={th}>Aliq.</th><th className={th}>Volume</th>
          {fields.map((f) => <th key={f.key} className={th}>{f.label}{f.restricted && <Lock size={9} className="inline ml-1 text-amber-300" />}</th>)}
          <th className={th}>Genotype</th><th className={th}>Location</th>
        </tr></thead>
        <tbody>
          {tubes.map((t) => (
            <tr key={t.id} onClick={() => onOpenBox(t.box_id)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer">
              <td className={`${td} font-bold`}>{t.sample_name}</td><td className={td}>{fmt(t.aliquot_number)}</td><td className={td}>{fmt(t.volume)}</td>
              {fields.map((f) => <td key={f.key} className={td}>{formatValue(f, t.data?.[f.key])}</td>)}
              <td className={td}>{t.animal?.genotype || ''}</td>
              <td className={`${td} text-white/50`}>{shortLocation(t.location)} · {coord(t.well, t.location.columns)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tubes.length === 0 && <p className="py-10 text-center text-white/30 font-mono text-xs uppercase tracking-widest">No tubes match</p>}
    </div>
  );
}

function SearchView({ tubes, types, canSee, onOpenBox }) {
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const query = q.trim().toLowerCase();
  const type = types.find((t) => t.id === Number(typeId));
  // Every word must appear somewhere: name, notes, box, or the type's field values ("CSF BL 24MO", "Female")
  const matches = (t) => (!type || t.sample_type_id === type.id) && (!query || query.split(/\s+/).every((w) =>
    [t.sample_name, t.sample_type, t.source, t.comment, t.frozen_by, t.box_label, t.animal?.genotype, ...Object.values(t.data || {}).map(String)]
      .some((x) => x && x.toLowerCase().includes(w))));

  const groups = useMemo(() => {
    const bySample = {};
    tubes.filter((t) => t.status === 'In freezer' && matches(t)).forEach((t) => {
      const g = (bySample[t.sample_name] ??= { name: t.sample_name, types: new Set(), count: 0, reserved: 0, boxes: {} });
      if (t.sample_type) g.types.add(t.sample_type);
      g.count += 1;
      if (t.reserved) g.reserved += 1;
      (g.boxes[t.box_id] ??= { loc: shortLocation(t.location), columns: t.location.columns, wells: [] }).wells.push(t.well);
    });
    return Object.values(bySample).sort((a, b) => a.name.localeCompare(b.name));
  }, [tubes, query, typeId]);
  const removed = useMemo(() => tubes.filter((t) => t.status !== 'In freezer' && matches(t))
    .sort((a, b) => (b.removed_date || '').localeCompare(a.removed_date || '')), [tubes, query, typeId]);

  return (
    <section className="glass rounded-3xl p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input autoFocus className={`${inputCls} pl-11`} placeholder="Search name, notes, box or any field value (e.g. V00011, 24MO, Female)..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-48`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="" className="bg-slate-900">All sample types</option>
          {types.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="accent-indigo-400" /> Show used / discarded
        </label>
      </div>
      <p className="text-xs font-mono text-white/40">{groups.length} sample{groups.length === 1 ? '' : 's'} · {groups.reduce((a, g) => a + g.count, 0)} tubes in the freezers</p>
      {type ? (
        <TypeTable type={type} canSee={canSee} onOpenBox={onOpenBox}
          tubes={tubes.filter((t) => t.status === 'In freezer' && matches(t)).sort((a, b) => a.sample_name.localeCompare(b.sample_name) || (a.aliquot_number || 0) - (b.aliquot_number || 0))} />
      ) : (
      <div className="divide-y divide-white/5">
        {groups.map((g) => (
          <div key={g.name} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
            <div className="w-72 min-w-0">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-2 border ${colorFor(g.name)}`} />
              <span className="font-bold text-sm">{g.name}</span>
              {g.types.size > 0 && <span className="block text-[10px] text-white/40 ml-5">{[...g.types].join(', ')}</span>}
            </div>
            <span className="text-sm font-black w-20">{g.count} tube{g.count === 1 ? '' : 's'}</span>
            {g.reserved > 0 && <span className="flex items-center gap-1 text-[10px] text-amber-200"><Lock size={11} /> {g.reserved} reserved</span>}
            <div className="flex flex-wrap gap-2 flex-1">
              {Object.entries(g.boxes).map(([boxId, b]) => (
                <button key={boxId} onClick={() => onOpenBox(Number(boxId))} className="px-2 py-1 rounded-md bg-white/5 hover:bg-indigo-500/30 text-[11px] font-mono text-white/70">
                  {b.loc}: {coordList(b.wells, b.columns)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="py-10 text-center text-white/30 font-mono text-xs uppercase tracking-widest">No tubes match</p>}
      </div>
      )}
      {showRemoved && (
        <div className="pt-4">
          <h3 className={labelCls}><History size={12} className="inline mr-1" /> Used / discarded ({removed.length})</h3>
          <div className="divide-y divide-white/5">
            {removed.map((t) => (
              <button key={t.id} onClick={() => onOpenBox(t.box_id)} className="w-full flex flex-wrap gap-x-4 py-2 text-left text-xs font-mono hover:bg-white/5">
                <span className="text-white/80 w-64 truncate">{t.sample_name}</span>
                <span className="text-white/40 w-72">{shortLocation(t.location)} · {coord(t.well, t.location.columns)}</span>
                <span className="text-white/50">{t.status} {fmt(t.removed_date)}{t.removed_by ? ` · ${t.removed_by}` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function M80App() {
  const navigate = useNavigate();
  const [freezers, setFreezers] = useState([]);
  const [tubes, setTubes] = useState([]);
  const [freezerId, setFreezerId] = useState(null);
  const [rackId, setRackId] = useState(null);
  const [boxId, setBoxId] = useState(null);
  const [view, setView] = useState('freezer'); // freezer | search
  const [creating, setCreating] = useState(false);
  const [types, setTypes] = useState([]);
  const [panel, setPanel] = useState(null); // 'types' | 'import'
  const { user, isAdmin, canEdit } = useAuth();
  const canSee = isAdmin || !!user?.restricted_access;

  const load = async () => {
    try {
      const [f, t, st] = await Promise.all([fetchM80Freezers(), fetchM80Tubes(), fetchM80SampleTypes()]);
      setFreezers(f);
      setTubes(t);
      setTypes(st);
      setFreezerId((id) => (f.some((x) => x.id === id) ? id : f[0]?.id ?? null));
    } catch (err) {
      console.error('Error loading freezers:', err);
    }
  };
  useEffect(() => { load(); }, []);

  const suggestions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean).map((s) => s.trim()))].sort();
    return { samples: uniq(tubes.map((t) => t.sample_name)) };
  }, [tubes]);

  const freezer = freezers.find((f) => f.id === freezerId);
  const stats = (f) => {
    const boxes = f.compartments.flatMap((c) => c.racks.flatMap((r) => r.boxes));
    return { boxes: boxes.length, used: boxes.reduce((a, b) => a + b.occupied, 0) };
  };
  const openBox = (id) => {
    for (const f of freezers) {
      for (const c of f.compartments) {
        const r = c.racks.find((x) => x.boxes.some((b) => b.id === id));
        if (r) { setFreezerId(f.id); setRackId(r.id); }
      }
    }
    setBoxId(id);
    setView('freezer');
  };
  const selectFreezer = (id) => { setFreezerId(id); setRackId(null); setBoxId(null); };
  // A rack deleted from its own view: fall back to the freezer front view
  const rackExists = freezer?.compartments.some((c) => c.racks.some((r) => r.id === rackId));
  const tabCls = (active) => `flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-indigo-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`;

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-400/30">
      <header className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-screen-2xl mx-auto w-full">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em] flex items-center gap-3">
            <span className="bg-indigo-500 text-white px-2 py-0.5 rounded italic">-80 °C</span>
            <span className="text-white">FREEZERS</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">{tubes.filter((t) => t.status === 'In freezer').length} tubes stored</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all"><Home size={16} /> Home</button>
          <button onClick={() => { setView('freezer'); setRackId(null); setBoxId(null); }} className={tabCls(view === 'freezer')}><Refrigerator size={16} /> Freezers</button>
          <button onClick={() => setView('search')} className={tabCls(view === 'search')}><Search size={16} /> Find samples</button>
          <button onClick={() => exportM80Inventory(freezers, tubes, null, types, canSee)} disabled={!freezers.length} className={`${tabCls(false)} disabled:opacity-30`}><FileSpreadsheet size={16} /> Export all</button>
          {canEdit && <button onClick={() => setPanel('import')} className={tabCls(false)}><Upload size={16} /> Import Excel</button>}
          {isAdmin && <button onClick={() => setPanel('types')} className={tabCls(false)}><Tags size={16} /> Sample types</button>}
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-4 space-y-6">
        {view === 'search' ? (
          <SearchView tubes={tubes} types={types} canSee={canSee} onOpenBox={openBox} />
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {freezers.map((f) => {
                const s = stats(f);
                return (
                  <button key={f.id} onClick={() => selectFreezer(f.id)}
                    className={`text-left rounded-2xl px-5 py-3 border transition-all ${f.id === freezerId ? 'bg-indigo-500/15 border-indigo-400/50' : 'glass-card hover:bg-white/5'}`}>
                    <div className="font-black">{f.name}</div>
                    <div className="text-[10px] font-mono text-white/40">{f.room || 'No room'} · {s.boxes} boxes · {s.used} tubes</div>
                  </button>
                );
              })}
              <button onClick={() => setCreating(true)} className="rounded-2xl px-5 py-3 border border-dashed border-white/15 text-white/40 hover:text-indigo-300 hover:border-indigo-400/60 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Plus size={14} /> New freezer
              </button>
            </div>

            {freezers.length === 0 ? (
              <div className="glass rounded-3xl p-12 text-center space-y-3">
                <Refrigerator size={40} className="mx-auto text-indigo-300/60" />
                <p className="text-white/60">No freezers configured yet.</p>
                <p className="text-xs font-mono text-white/30">Create a freezer, then add racks to each compartment (levels × boxes per level) and boxes in the empty slots.</p>
              </div>
            ) : boxId ? (
              <BoxView boxId={boxId} freezers={freezers} suggestions={suggestions} types={types} canSee={canSee} onBack={() => setBoxId(null)} onFreezer={() => { setBoxId(null); setRackId(null); }} onChanged={load} />
            ) : freezer && rackId && rackExists ? (
              <RackView freezer={freezer} rackId={rackId} onOpenBox={setBoxId} onOpenRack={setRackId} onBack={() => setRackId(null)} onChanged={load} />
            ) : freezer ? (
              <FreezerView freezer={freezer} onOpenRack={setRackId} onChanged={load} onExport={() => exportM80Inventory(freezers, tubes, freezer.id, types, canSee)} />
            ) : null}
          </>
        )}
      </main>

      {panel === 'types' && (
        <Modal wide title="Sample types" subtitle="Each type has its own fields; 🔒 = restricted clinical data" onClose={() => setPanel(null)}>
          <SampleTypesPanel types={types} onChanged={load} />
        </Modal>
      )}
      {panel === 'import' && (
        <Modal wide title="Import tubes from Excel" subtitle="One sample type per file" onClose={() => setPanel(null)}>
          <M80ImportPanel types={types} onImported={load} />
        </Modal>
      )}
      {creating && <FreezerModal onClose={() => setCreating(false)} onSaved={(f) => { setCreating(false); if (f?.id) selectFreezer(f.id); load(); }} />}
    </div>
  );
}
