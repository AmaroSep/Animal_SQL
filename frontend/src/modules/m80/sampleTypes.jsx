import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Lock, Plus, Trash2, ArrowUp, ArrowDown, Upload, CheckCircle2, AlertTriangle, Pencil } from 'lucide-react';
import {
  fetchFamily, createM80SampleType, updateM80SampleType, deleteM80SampleType, importM80Tubes,
} from '../../services/api';
import { Field, labelCls, has } from '../storage/shared';

// Sample types: each kind of sample (CSF, brain, ...) records its own fields on top
// of the common tube data. Restricted fields hold clinical data and are only sent to
// admins and users with restricted access (the API leaves them out for everyone else).

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-indigo-400 focus:outline-none';
const btnPrimary = 'flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-30';
const btnGhost = 'flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10';

export const FIELD_TYPES = [
  ['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['choice', 'List of options'],
  ['animal', 'Bioterio animal (Animal Code)'], ['formula', 'Calculated (a / b)'],
];

export const typeColor = (type) => type?.color || '#818cf8';
// Tube cell colours from the type colour (hex + alpha)
export const typeStyle = (type) => (type ? { backgroundColor: `${typeColor(type)}40`, borderColor: `${typeColor(type)}aa` } : undefined);

export const visibleFields = (type, canSee) => (type?.fields || []).filter((f) => canSee || !f.restricted);

export const formatValue = (f, v) => {
  if (!has(v)) return '—';
  if (f.type === 'formula' && typeof v === 'number') return String(Math.round(v * 10000) / 10000);
  return `${v}${f.unit ? ` ${f.unit}` : ''}`;
};

// Age between two ISO dates, e.g. "7m,13d"
export const ageBetween = (from, to) => {
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (b < a) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) months -= 1;
  const anchor = new Date(a.getFullYear(), a.getMonth() + months, a.getDate());
  return `${months}m,${Math.round((b - anchor) / 86400000)}d`;
};

const computeFormula = (f, data) => {
  const m = (f.formula || '').match(/^\s*(\w+)\s*([-+*/])\s*(\w+)\s*$/);
  if (!m) return null;
  const a = parseFloat(data[m[1]]);
  const b = parseFloat(data[m[3]]);
  if (Number.isNaN(a) || Number.isNaN(b) || (m[2] === '/' && b === 0)) return null;
  return { '+': a + b, '-': a - b, '*': a * b, '/': a / b }[m[2]];
};

// Animal card: what Bioterio knows about the animal named in a Brain tube
export function AnimalInfo({ animal, collectionDate }) {
  if (!animal) return null;
  const age = ageBetween(animal.dob, collectionDate || animal.removed_on);
  return (
    <div className="text-xs font-mono text-white/70 bg-pink-500/10 border border-pink-400/30 rounded-xl px-3 py-2">
      <span className={animal.sex === 'M' ? 'text-blue-300' : 'text-pink-300'}>{animal.sex === 'M' ? '♂' : '♀'}</span>{' '}
      <b>{animal.code}</b> · {animal.genotype} · DOB {animal.dob}{age ? ` · ${age} at collection` : ''}
      {animal.status && animal.status !== 'Vivo' && <span className="text-white/40"> · {animal.status === 'Muerto' ? 'Dead' : 'Eliminated'} {animal.removed_on || ''}</span>}
    </div>
  );
}

function AnimalField({ value, onChange, collectionDate }) {
  const [animal, setAnimal] = useState(null);
  const [state, setState] = useState('');
  const look = async (code) => {
    if (!code?.trim()) { setAnimal(null); setState(''); return; }
    try {
      const d = await fetchFamily({ code: code.trim() });
      const a = d.animal;
      setAnimal({ id: a.id, code: a.code, genotype: a.genotype, sex: a.sex, dob: a.dob, status: a.status === 'Alive' ? 'Vivo' : a.status === 'Dead' ? 'Muerto' : 'Eliminado' });
      setState('');
    } catch {
      setAnimal(null);
      setState('Not found in Bioterio (it is saved anyway)');
    }
  };
  useEffect(() => { look(value); }, []);
  return (
    <div className="space-y-2">
      <input className={inputCls} value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={(e) => look(e.target.value)} placeholder="e.g. BN 520" />
      {animal && <AnimalInfo animal={animal} collectionDate={collectionDate} />}
      {state && <p className="text-[11px] text-amber-200/80">{state}</p>}
    </div>
  );
}

// Inputs for the type's own fields
export function TypeFieldsInput({ type, data, setData, canSee }) {
  if (!type) return null;
  const fields = visibleFields(type, canSee);
  const hidden = (type.fields || []).length - fields.length;
  const set = (k, v) => setData({ ...data, [k]: v });
  const collection = data.collection_date;
  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <span className={labelCls} style={{ color: typeColor(type) }}>{type.name} information</span>
      <div className="grid grid-cols-2 gap-4">
        {fields.map((f) => {
          const label = <>{f.label}{f.unit ? ` (${f.unit})` : ''}{f.restricted && <Lock size={10} className="inline ml-1 text-amber-300" />}</>;
          const v = data[f.key] ?? '';
          let input;
          if (f.type === 'choice') {
            input = (
              <select className={inputCls} value={v} onChange={(e) => set(f.key, e.target.value)}>
                <option value="" className="bg-slate-900">—</option>
                {(f.options || []).map((o) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
                {has(v) && !(f.options || []).includes(v) && <option value={v} className="bg-slate-900">{v}</option>}
              </select>
            );
          } else if (f.type === 'formula') {
            const c = computeFormula(f, data);
            input = <div className={`${inputCls} text-white/60 font-mono`}>{c === null ? '—' : Math.round(c * 10000) / 10000} <span className="text-[10px] text-white/30">= {f.formula}</span></div>;
          } else if (f.type === 'animal') {
            return <div key={f.key} className="col-span-2"><span className={labelCls}>{label}</span><AnimalField value={v} onChange={(x) => set(f.key, x)} collectionDate={collection} /></div>;
          } else {
            input = <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step="any" className={inputCls} value={v} onChange={(e) => set(f.key, e.target.value)} />;
          }
          return <label key={f.key} className="block"><span className={labelCls}>{label}</span>{input}</label>;
        })}
      </div>
      {hidden > 0 && <p className="text-[11px] text-white/40 flex items-center gap-1"><Lock size={11} /> {hidden} restricted field{hidden === 1 ? '' : 's'} hidden: you do not have access to clinical data.</p>}
    </div>
  );
}

// ── Admin: define sample types ─────────────────────────────────────────────

const keyFrom = (label) => label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1') || 'field';

function TypeEditor({ type, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: type?.name || '', color: type?.color || '#818cf8', description: type?.description || '',
    fields: (type?.fields || []).map((f) => ({ ...f, optionsText: (f.options || []).join(', '), keyLocked: true })),
  }));
  const [error, setError] = useState(null);
  const setField = (i, patch) => setForm({ ...form, fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const move = (i, d) => {
    const fields = [...form.fields];
    [fields[i], fields[i + d]] = [fields[i + d], fields[i]];
    setForm({ ...form, fields });
  };
  const save = async (e) => {
    e.preventDefault();
    const fields = form.fields.map((f) => ({
      key: f.key || keyFrom(f.label), label: f.label.trim(), type: f.type,
      options: f.type === 'choice' ? f.optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      unit: f.unit || undefined, formula: f.type === 'formula' ? f.formula : undefined, restricted: !!f.restricted,
    }));
    const data = { name: form.name, color: form.color, description: form.description, fields };
    try {
      onSaved(type ? await updateM80SampleType(type.id, data) : await createM80SampleType(data));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <Field label="Name *"><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Serum" /></Field>
        <Field label="Colour"><input type="color" className="h-[46px] w-16 rounded-xl bg-transparent" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
        <Field label="Description" className="col-span-2"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </div>
      <div>
        <span className={labelCls}>Fields (besides name on tube, aliquot #, volume, date, notes and location)</span>
        <div className="space-y-2">
          {form.fields.map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-[1fr_12rem_auto] gap-2 items-center">
                <input required className={inputCls} value={f.label} placeholder="Label (Excel column)"
                  onChange={(e) => setField(i, { label: e.target.value, ...(f.keyLocked ? {} : { key: keyFrom(e.target.value) }) })} />
                <select className={inputCls} value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                  {FIELD_TYPES.map(([v, t]) => <option key={v} value={v} className="bg-slate-900">{t}</option>)}
                </select>
                <div className="flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-20"><ArrowUp size={14} /></button>
                  <button type="button" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-20"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => setForm({ ...form, fields: form.fields.filter((_, j) => j !== i) })} className="p-2 rounded-lg hover:bg-red-500/20 text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-white/30">key: {f.key || keyFrom(f.label)}</span>
                {f.type === 'choice' && <input className={`${inputCls} flex-1 py-2`} value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} placeholder="Options, separated by commas" />}
                {f.type === 'formula' && <input className={`${inputCls} flex-1 py-2 font-mono`} value={f.formula || ''} onChange={(e) => setField(i, { formula: e.target.value })} placeholder="ptau / ab42 (use the keys)" />}
                {f.type === 'number' && <input className={`${inputCls} w-28 py-2`} value={f.unit || ''} onChange={(e) => setField(i, { unit: e.target.value })} placeholder="Unit" />}
                <label className="flex items-center gap-1.5 text-white/70 ml-auto">
                  <input type="checkbox" checked={!!f.restricted} onChange={(e) => setField(i, { restricted: e.target.checked })} className="accent-amber-400" />
                  <Lock size={11} className="text-amber-300" /> Restricted (clinical)
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, fields: [...form.fields, { label: '', type: 'text', optionsText: '' }] })}
            className="w-full py-2 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-indigo-300 hover:border-indigo-400/60 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
            <Plus size={12} /> Add field
          </button>
        </div>
        {type && <p className="text-[11px] text-white/30 mt-2">Removing a field hides it; values already stored in tubes are kept.</p>}
      </div>
      {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
      <div className="flex justify-between gap-3">
        <div>
          {type && (
            <button type="button" className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10"
              onClick={async () => { if (!confirm(`Delete sample type ${type.name}? Only possible if no tube uses it.`)) return; try { await deleteM80SampleType(type.id); onSaved(); } catch (err) { setError(err.message); } }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Back</button>
          <button type="submit" className={btnPrimary}>Save type</button>
        </div>
      </div>
    </form>
  );
}

export function SampleTypesPanel({ types, onChanged }) {
  const [editing, setEditing] = useState(null); // type | 'new'
  if (editing) {
    return <TypeEditor type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />;
  }
  return (
    <div className="space-y-3">
      {types.map((t) => (
        <button key={t.id} onClick={() => setEditing(t)} className="w-full text-left flex items-center gap-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3">
          <span className="w-4 h-4 rounded" style={{ background: typeColor(t) }} />
          <span className="flex-1 min-w-0">
            <span className="font-black">{t.name}</span>
            <span className="block text-[11px] text-white/40 truncate">{t.fields.map((f) => f.label + (f.restricted ? ' 🔒' : '')).join(' · ') || 'No extra fields'}</span>
          </span>
          <span className="text-[10px] font-mono text-white/40">{t.tubes} tubes</span>
          <Pencil size={14} className="text-white/40" />
        </button>
      ))}
      <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={14} /> New sample type</button>
    </div>
  );
}

// ── Excel import ───────────────────────────────────────────────────────────

const iso = (v) => (v instanceof Date && !Number.isNaN(v) ? new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : v);

// First row with a "Name on Tube"-like header, then one object per data row
export function readSheetRows(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const head = grid.findIndex((r) => r.some((c) => /^(name on tube|sample name|sample)$/i.test(String(c ?? '').trim())));
  if (head < 0) throw new Error('No header row with a "Name on Tube" column was found in the first sheet.');
  const headers = grid[head].map((h) => String(h ?? '').trim());
  return grid.slice(head + 1).map((r, i) => {
    const o = { _line: head + i + 2 };
    headers.forEach((h, j) => { if (h && r[j] !== null && r[j] !== '') o[h] = iso(r[j]); });
    return o;
  }).filter((o) => Object.keys(o).length > 1);
}

export function M80ImportPanel({ types, onImported }) {
  const [typeId, setTypeId] = useState(types[0]?.id || '');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === Number(typeId));

  const check = async (r = rows, id = typeId) => {
    if (!r || !id) return;
    setBusy(true); setError(null); setResult(null);
    try { setPreview(await importM80Tubes({ sample_type_id: Number(id), rows: r }, true)); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const pick = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setPreview(null); setResult(null);
    try {
      const r = readSheetRows(await f.arrayBuffer());
      setRows(r);
      const named = types.find((t) => r.some((x) => String(x.Type || '').toLowerCase() === t.name.toLowerCase()));
      if (named) setTypeId(named.id);
      check(r, named?.id || typeId);
    } catch (err) {
      setRows(null); setError(err.message);
    }
  };
  const run = async () => {
    setBusy(true); setError(null);
    try { setResult(await importM80Tubes({ sample_type_id: Number(typeId), rows }, false)); onImported(); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const box = 'bg-white/5 border border-white/10 rounded-2xl p-4';
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-white/50">
        One row per tube. Columns: the sample type's fields (same names), <b>Name on Tube</b>, Aliquot #, Aliquot size (ul), Date received, Notes,
        and the location: <b>Freezer · Compartment · Rack · Level · Depth · Box Name · Location in Box</b> (e.g. "1-3" = row 1, column 3).
        Missing boxes are created; racks must already exist. A <b>Status</b> column (In freezer / Used / Discarded) or a note like "Finished by …" records the aliquot as used.
      </p>
      <div className="grid grid-cols-[12rem_1fr] gap-3">
        <select className={inputCls} value={typeId} onChange={(e) => { setTypeId(e.target.value); check(rows, e.target.value); }}>
          {types.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>)}
        </select>
        <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-indigo-400 cursor-pointer">
          <Upload size={16} className="text-indigo-300" />
          <span className="truncate">{file ? `${file.name} · ${rows?.length ?? 0} rows` : 'Choose the Excel file (.xlsx)'}</span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pick} />
        </label>
      </div>
      {type && rows && (() => {
        const cols = new Set(rows.flatMap((r) => Object.keys(r)).map((c) => c.toLowerCase()));
        const missing = type.fields.filter((f) => f.type !== 'formula' && !cols.has(f.label.toLowerCase()) && !cols.has(f.key));
        return missing.length > 0 && <p className="text-[11px] text-amber-200/80">Columns not in the file (left empty): {missing.map((f) => f.label).join(', ')}</p>;
      })()}
      {busy && <p className="text-white/40 font-mono text-xs">Checking…</p>}
      {preview && !result && (
        <div className={`${box} space-y-2`}>
          <div className="flex flex-wrap gap-6">
            <span><b className="text-emerald-300">{preview.created - (preview.used || 0)}</b> tubes to store</span>
            {preview.used > 0 && <span><b className="text-white/70">{preview.used}</b> already used up (go to the history, position stays free)</span>}
            <span><b className={preview.skipped.length ? 'text-amber-300' : 'text-white/40'}>{preview.skipped.length}</b> left out</span>
          </div>
          {preview.new_boxes.length > 0 && <div className="text-xs text-indigo-200">New box{preview.new_boxes.length === 1 ? '' : 'es'}: {preview.new_boxes.join(' | ')}</div>}
          {preview.skipped.length > 0 && (
            <div className="max-h-44 overflow-y-auto text-xs font-mono border-t border-white/10 pt-2 space-y-1">
              {preview.skipped.map((s, i) => <div key={i} className="text-amber-200/80"><AlertTriangle size={11} className="inline mr-1" />Row {s.line} · {s.name || '?'}: {s.reason}</div>)}
            </div>
          )}
          <p className="text-[11px] text-white/40">Nothing has been saved yet.</p>
        </div>
      )}
      {result && <div className={`${box} flex items-center gap-2 text-emerald-200`}><CheckCircle2 size={16} /> Stored {result.created} tubes{result.skipped.length ? `, ${result.skipped.length} left out` : ''}.</div>}
      {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
      {!result && (
        <div className="flex justify-end">
          <button onClick={run} disabled={!preview || busy || preview.created === 0} className={btnPrimary}>Import {preview?.created || ''} tubes</button>
        </div>
      )}
    </div>
  );
}
