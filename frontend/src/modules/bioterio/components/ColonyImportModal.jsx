import React, { useState } from 'react';
import { X, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseColonyWorkbook } from '../../../utils/colonyFormat';
import { importColonyRows } from '../../../services/api';

// Import animals from the lab's colony workbook: read → preview (dry run) → confirm
export default function ColonyImportModal({ directory, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);       // { rows, warnings }
  const [responsible, setResponsible] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const runPreview = async (p = parsed, resp = responsible) => {
    setBusy(true); setError(null);
    try {
      setPreview(await importColonyRows(p.rows, resp || null, true));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const pickFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setPreview(null); setResult(null); setError(null);
    try {
      const p = parseColonyWorkbook(await f.arrayBuffer());
      if (!p.rows.length) throw new Error('No animals found. The sheet needs a header row with "Cage Position" and "Animal Code".');
      setParsed(p);
      runPreview(p);
    } catch (err) {
      setParsed(null);
      setError(err.message);
    }
  };

  const doImport = async () => {
    setBusy(true); setError(null);
    try {
      setResult(await importColonyRows(parsed.rows, responsible || null, false));
      onImported();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const box = 'bg-white/5 border border-white/10 rounded-2xl p-4';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border-white/20">
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-black tracking-tighter text-biotech-accent uppercase italic">Import colony (Excel)</h2>
            <p className="text-white/40 text-[10px] font-mono tracking-[0.3em] mt-1 uppercase">Shared format: Cage Position · BCM Cage · Animal Code · ID · DOB · Sex · Genotype · Status · Parents · Responsible</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={22} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          <label className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-dashed border-white/20 hover:border-biotech-accent cursor-pointer">
            <Upload size={18} className="text-biotech-accent" />
            <span>{file ? file.name : 'Choose the colony workbook (.xlsx)'}</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pickFile} />
          </label>

          {parsed && (
            <div className={`${box} flex flex-wrap items-center gap-3`}>
              <span className="text-white/70">{parsed.rows.length} animals read.</span>
              <span className="text-white/40 text-xs">Cages without a "Responsible" go to:</span>
              <select value={responsible} onChange={(e) => { setResponsible(e.target.value); runPreview(parsed, e.target.value); }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
                <option value="" className="bg-slate-900">me</option>
                {directory.map((u) => <option key={u.id} value={u.username} className="bg-slate-900">{u.full_name || u.username}</option>)}
              </select>
            </div>
          )}
          {parsed?.warnings.length > 0 && (
            <div className={`${box} text-amber-200 text-xs space-y-1`}>{parsed.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>
          )}

          {busy && <p className="text-white/40 font-mono text-xs">Checking…</p>}

          {preview && !result && (
            <div className={`${box} space-y-3`}>
              <div className="flex flex-wrap gap-6 text-sm">
                <span><b className="text-emerald-300">{preview.created}</b> new</span>
                <span><b className="text-sky-300">{preview.updated}</b> updated (same Animal Code)</span>
                <span><b className="text-white">{preview.cages}</b> cages</span>
                <span><b className={preview.skipped.length ? 'text-amber-300' : 'text-white/40'}>{preview.skipped.length}</b> left out</span>
              </div>
              {preview.skipped.length > 0 && (
                <div className="max-h-48 overflow-y-auto text-xs font-mono border-t border-white/10 pt-2 space-y-1">
                  {preview.skipped.map((s, i) => (
                    <div key={i} className="text-amber-200/80">
                      <AlertTriangle size={11} className="inline mr-1" />
                      Row {s.line} · {s.animal_code || s.mark || '?'}: {s.reason}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-white/40">Nothing has been saved yet. Animals are never put into a cage that holds another cage's animals or belongs to someone else.</p>
            </div>
          )}

          {result && (
            <div className={`${box} flex items-center gap-3 text-emerald-200`}>
              <CheckCircle2 size={18} /> Imported: {result.created} new, {result.updated} updated, {result.skipped.length} left out.
            </div>
          )}
          {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
        </div>
        <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button onClick={doImport} disabled={!preview || busy || preview.created + preview.updated === 0}
              className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-biotech-accent text-biotech-blue disabled:opacity-30">
              Import {preview ? preview.created + preview.updated : ''} animals
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
