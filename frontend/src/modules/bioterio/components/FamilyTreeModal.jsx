import React, { useEffect, useState } from 'react';
import { X, GitBranch, Search, ChevronLeft } from 'lucide-react';
import { fetchFamily } from '../../../services/api';

// Family tree of one animal: grandparents, parents, the animal and its offspring.
// Parents are linked by Animal Code; parents that are not in the system, suppliers
// ("Jackson Lab") and uncertain parents ("BN 463/462") are drawn as dashed cards.

const SEX = { M: { sign: '♂', cls: 'text-blue-400' }, F: { sign: '♀', cls: 'text-pink-400' } };

function AnimalCard({ n, big = false, onOpen }) {
  const sex = SEX[n.sex] || { sign: '?', cls: 'text-white/40' };
  const removed = n.status !== 'Alive';
  return (
    <button
      onClick={onOpen ? () => onOpen(n.id) : undefined}
      disabled={!onOpen}
      title={[n.responsible && `Responsible: ${n.responsible}`, n.note && `Written as: ${n.note}`].filter(Boolean).join('\n')}
      className={`w-full text-left rounded-xl bg-white/5 border border-white/10 border-l-4 px-3 py-2 transition-all
        ${onOpen ? 'hover:bg-white/10 hover:border-violet-400 cursor-pointer' : 'cursor-default'}
        ${big ? 'ring-2 ring-violet-400/60 bg-violet-500/10 px-5 py-3' : ''} ${removed ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: n.color || 'rgba(255,255,255,0.2)' }}
    >
      <div className="flex items-center gap-2">
        <span className={`font-black ${sex.cls} ${big ? 'text-xl' : ''}`}>{sex.sign}</span>
        <span className={`font-mono font-bold truncate ${big ? 'text-lg' : 'text-sm'}`}>{n.code || `${n.mark} #${n.id}`}</span>
      </div>
      <div className="text-[11px] italic text-white/70 truncate">{n.genotype}</div>
      <div className="text-[10px] font-mono text-white/40 truncate">
        {[n.age, n.status, n.position].filter(Boolean).join(' · ')}
      </div>
    </button>
  );
}

function PlaceholderCard({ n, onOpen }) {
  if (!n || n.kind === 'empty') return <div />;
  const text = {
    unknown: ['—', 'not recorded'],
    unregistered: [n.label, 'not in the system'],
    origin: [n.label, 'origin'],
    uncertain: [n.label, 'uncertain parent'],
  }[n.kind] || [n.label, ''];
  return (
    <div className="w-full rounded-xl border border-dashed border-white/20 px-3 py-2 text-white/50">
      <div className="font-mono text-sm truncate">{text[0]}{n.kind === 'uncertain' && ' ?'}</div>
      <div className="text-[10px] uppercase tracking-widest text-white/30">{text[1]}</div>
      {n.kind === 'uncertain' && n.options?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {n.options.map((o) => (
            <button key={o.id} onClick={() => onOpen(o.id)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 hover:bg-violet-500 hover:text-white">{o.code}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const Card = ({ n, onOpen, big }) => (n?.kind === 'animal' ? <AnimalCard n={n} big={big} onOpen={onOpen} /> : <PlaceholderCard n={n} onOpen={onOpen} />);

// Bracket joining two cards above to the one below
const Join = ({ show = true }) => (
  <div className="h-6 flex flex-col items-center">
    {show && <><div className="w-1/2 h-3 border-x border-b border-white/20 rounded-b" /><div className="w-px h-3 bg-white/20" /></>}
  </div>
);

export default function FamilyTreeModal({ animalId, onClose }) {
  const [history, setHistory] = useState(animalId != null ? [animalId] : []);
  const [code, setCode] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const current = history[history.length - 1];

  const load = async (query) => {
    setBusy(true); setError(null);
    try {
      const d = await fetchFamily(query);
      setData(d);
      return d;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (current != null) load({ id: current }); }, [current]);

  const open = (id) => setHistory((h) => [...h, id]);
  const search = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    const d = await load({ code: code.trim() });
    if (d) setHistory((h) => [...h, d.animal.id]);
  };

  const a = data?.animal;
  const parents = a?.parents || [];
  const grand = parents.flatMap((p) => (p.kind === 'animal' && p.parents?.some((g) => g.kind !== 'unknown') ? p.parents : [{ kind: 'empty' }, { kind: 'empty' }]));
  const hasGrand = grand.some((g) => g.kind !== 'empty');
  const hasParents = parents.some((p) => p.kind !== 'unknown');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden border-white/20">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            {history.length > 1 && (
              <button onClick={() => setHistory((h) => h.slice(0, -1))} title="Back" className="p-2 hover:bg-white/10 rounded-full"><ChevronLeft size={20} /></button>
            )}
            <h2 className="text-xl font-black tracking-tighter text-violet-300 uppercase italic flex items-center gap-2">
              <GitBranch size={20} /> Family tree
            </h2>
          </div>
          <form onSubmit={search} className="flex items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Animal Code (e.g. BN 520)"
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono w-56 focus:border-violet-400 outline-none" />
            <button type="submit" className="p-2 rounded-lg bg-violet-500/20 hover:bg-violet-500 text-violet-200 hover:text-white"><Search size={16} /></button>
            <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-full ml-2"><X size={22} /></button>
          </form>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && <p className="text-red-400 font-mono text-xs mb-4">{error}</p>}
          {!a && !busy && !error && <p className="text-white/40 text-sm">Search an animal by its Animal Code, or open the tree from an animal in a cage.</p>}
          {busy && !a && <p className="text-white/40 font-mono text-xs">Loading…</p>}

          {a && (
            <div className={busy ? 'opacity-60' : ''}>
              {hasGrand && (
                <>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Grandparents</p>
                  <div className="grid grid-cols-4 gap-3">{grand.map((g, i) => <Card key={i} n={g} onOpen={open} />)}</div>
                  <div className="grid grid-cols-2">
                    <Join show={grand[0].kind !== 'empty'} /><Join show={grand[2].kind !== 'empty'} />
                  </div>
                </>
              )}

              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Parents</p>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-start-1 col-span-2 px-[12%]"><Card n={parents[0]} onOpen={open} /></div>
                <div className="col-span-2 px-[12%]"><Card n={parents[1]} onOpen={open} /></div>
              </div>
              <Join show={hasParents} />

              <div className="mx-auto max-w-xs"><AnimalCard n={a} big /></div>
              {a.responsible && <p className="text-center text-[10px] text-white/30 mt-1">Responsible: {a.responsible}</p>}

              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Offspring ({data.children.length})</p>
                {data.children.length === 0 ? (
                  <p className="text-white/30 text-xs">{a.code ? 'No animal lists this one as a parent.' : 'This animal has no Animal Code, so offspring cannot be linked.'}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {data.children.map((c) => <AnimalCard key={c.id} n={c} onOpen={open} />)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
