import React, { useState, useEffect } from 'react';
import { X, Skull, Trash2, Plus, Pencil, HeartOff, RefreshCw, Hash, GitBranch, Move } from 'lucide-react';
import { updateAnimalStatus, endBreedingSession, updateCageNumber, updateCageCard, setCageOwner, moveCage, updateCageBreedingDates } from '../../../services/api';
import { weanBadge, isoDate } from '../../../utils/wean';
import { useAuth } from '../../../auth/AuthContext';
import { animalStatusLabel } from '../../../utils/labels';

export default function CageModal({ cage, racks = [], canModify = true, directory = [], onClose, onUpdate, onAddAnimal, onEditAnimal, onMergeStart, onShowFamily }) {
  const { isAdmin, user } = useAuth();
  const [showMove, setShowMove] = useState(false);
  const [moveRackId, setMoveRackId] = useState(null);
  const [moveTo, setMoveTo] = useState(null); // target cage slot
  const [handTo, setHandTo] = useState('');
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endOption, setEndOption] = useState('Home');
  const [newCageId, setNewCageId] = useState('');
  const [cageNumberInput, setCageNumberInput] = useState('');
  const [editingCageNumber, setEditingCageNumber] = useState(false);
  const [pairedOn, setPairedOn] = useState('');
  const [litterOn, setLitterOn] = useState('');

  // The modal stays mounted between cages: reset per-cage dialogs when the cage changes
  useEffect(() => {
    setShowEndDialog(false);
    setEndOption('Home');
    setNewCageId('');
    setEditingCageNumber(false);
    setShowMove(false);
    setMoveTo(null);
    setPairedOn(cage?.breeding_since || '');
    setLitterOn(cage?.litter_dob || '');
  }, [cage?.id, cage?.breeding_since, cage?.litter_dob]);

  if (!cage) return null;

  const editCard = async () => {
    const value = window.prompt('Cage card (e.g. CM002, 1176615). Leave empty to clear:', cage.card_id || '');
    if (value === null) return;
    try {
      await updateCageCard(cage.id, value);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const openMove = () => {
    setMoveRackId(cage.rack_id ?? racks.find(r => r.cages.some(c => c.id === cage.id))?.id ?? racks[0]?.id);
    setMoveTo(null);
    setShowMove(true);
  };

  // A position can take the cage when nothing lives there and nobody else holds it
  const isFree = (c) => c.id !== cage.id && !(c.animals?.length) && !c.is_breeding_pair &&
    (c.owner_id == null || c.owner_id === user?.id || isAdmin);

  const doMove = async () => {
    const rack = racks.find(r => r.id === moveRackId);
    if (!moveTo || !rack) return;
    try {
      await moveCage(cage.id, rack.id, moveTo.row, moveTo.column);
      setShowMove(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handOver = async () => {
    const to = directory.find(u => u.id === Number(handTo));
    if (!to || !confirm(`Hand cage ${cage.cage_number != null ? '#' + cage.cage_number : cage.display_id} over to ${to.full_name || to.username}? You will no longer be able to change it.`)) return;
    try {
      await setCageOwner([cage.id], to.id);
      setHandTo('');
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveCageNumber = async () => {
    const num = cageNumberInput.trim() === '' ? null : parseInt(cageNumberInput);
    try {
      await updateCageNumber(cage.id, num);
      setEditingCageNumber(false);
      onUpdate();
    } catch (err) {
      alert('Error saving cage number: ' + err.message);
    }
  };

  const handleAction = async (animalId, newStatus) => {
    const reason = window.prompt(`Reason for marking as ${animalStatusLabel(newStatus)}:`);
    if (reason === null) return; // Cancelled
    if (!reason.trim()) {
      alert('A reason is required');
      return;
    }

    try {
      await updateAnimalStatus(animalId, newStatus, reason);
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Error updating animal status');
    }
  };

  const toggleBreedingPair = async () => {
    try {
      const { updateCageBreedingStatus } = await import('../../../services/api');
      await updateCageBreedingStatus(cage.id, !cage.is_breeding_pair);
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Error updating breeding status');
    }
  };

  const saveBreedingDates = async () => {
    try {
      await updateCageBreedingDates(cage.id, { breeding_since: pairedOn || null, litter_dob: litterOn || null });
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const markWeaned = async () => {
    if (!window.confirm('Pups weaned today? The wean date is recorded on the breeders and the cage waits for its next litter.')) return;
    try {
      await updateCageBreedingDates(cage.id, { weaned: true });
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMergeStart = () => {
    onMergeStart(cage);
    onClose();
  };

  const handleEndBreeding = async () => {
    if (endOption === 'New' && !newCageId) {
      alert('Select the cage the animals will move to');
      return;
    }
    try {
      await endBreedingSession(cage.id, {
        target_option: endOption,
        new_cage_id: endOption === 'New' ? parseInt(newCageId) : null
      });
      alert('Breeding phase terminated.');
      onUpdate();
      onClose();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass w-full max-w-4xl rounded-3xl overflow-hidden border-white/20 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-biotech-accent uppercase">
                CAGE {cage.display_id}: ANIMAL LIST
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Hash size={12} className="text-white/30" />
                {editingCageNumber ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Cage number"
                      value={cageNumberInput}
                      onChange={e => setCageNumberInput(e.target.value)}
                      className="bg-black/40 border border-biotech-accent/50 rounded-lg px-2 py-1 text-xs font-mono text-white outline-none w-28"
                      autoFocus
                    />
                    <button onClick={handleSaveCageNumber} className="text-[9px] font-black uppercase tracking-widest text-biotech-accent hover:text-white transition-colors">Save</button>
                    <button onClick={() => setEditingCageNumber(false)} className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setCageNumberInput(cage.cage_number != null ? String(cage.cage_number) : ''); setEditingCageNumber(true); }}
                    disabled={!canModify}
                    className="disabled:pointer-events-none text-[9px] font-mono text-white/30 hover:text-biotech-accent transition-colors uppercase tracking-widest"
                  >
                    {cage.cage_number != null ? `Cage number: ${cage.cage_number}` : '+ Assign cage number'}
                  </button>
                )}
              </div>
              {/* Facility cage card */}
              <button onClick={editCard} disabled={!canModify}
                className="mt-1 text-[9px] font-mono uppercase tracking-widest text-white/30 hover:text-biotech-accent disabled:pointer-events-none">
                {cage.card_id ? `Cage card: ${cage.card_id}` : (canModify ? '+ Add cage card' : '')}
              </button>
              {/* Responsible user and hand-over */}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-mono">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: cage.owner ? (cage.owner.color || '#64748b') : 'transparent', border: cage.owner ? 'none' : '1px dashed rgba(255,255,255,0.3)' }} />
                <span className="text-white/60 uppercase tracking-widest">
                  {cage.owner ? `Responsible: ${cage.owner.full_name || cage.owner.username}` : 'No responsible person'}
                </span>
                {canModify && (cage.owner || isAdmin) && (
                  <span className="flex items-center gap-1 ml-2">
                    <select value={handTo} onChange={e => setHandTo(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white outline-none">
                      <option value="" className="bg-slate-900">Hand over to…</option>
                      {directory.filter(u => u.id !== cage.owner_id).map(u => (
                        <option key={u.id} value={u.id} className="bg-slate-900">{u.full_name || u.username}</option>
                      ))}
                    </select>
                    {handTo && <button onClick={handOver} className="px-2 py-1 rounded-lg bg-biotech-accent/20 text-biotech-accent font-black uppercase tracking-widest hover:bg-biotech-accent hover:text-biotech-blue">OK</button>}
                  </span>
                )}
              </div>
            </div>
            
            {/* Breeding Pair Toggle */}
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
              <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${cage.is_breeding_pair ? 'text-pink-400' : 'text-white/20'}`}>
                Breeding Pair
              </span>
              <button 
                onClick={toggleBreedingPair}
                disabled={!canModify}
                className={`disabled:opacity-40 disabled:cursor-not-allowed w-10 h-5 rounded-full relative transition-all duration-300 ${cage.is_breeding_pair ? 'bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${cage.is_breeding_pair ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {cage.is_breeding_pair && canModify && (
              <button 
                onClick={() => setShowEndDialog(true)}
                className="flex items-center gap-2 px-6 py-3 bg-pink-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.3)]"
              >
                <HeartOff size={14} />
                Terminate Breeding
              </button>
            )}

            <button
              onClick={openMove}
              disabled={!canModify}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-biotech-accent hover:text-biotech-blue border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Move size={14} />
              Move Cage
            </button>

            <button 
              onClick={handleMergeStart}
              disabled={!canModify || !cage.animals || cage.animals.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-biotech-accent hover:text-biotech-blue border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
              Merge Cage
            </button>

            <button 
              onClick={onAddAnimal}
              disabled={!canModify}
              className="disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 px-6 py-3 bg-biotech-accent/10 hover:bg-biotech-accent text-biotech-accent hover:text-biotech-blue border border-biotech-accent/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group"
            >
              <Plus size={14} className="group-hover:rotate-90 transition-transform" />
              Add Animal
            </button>
            
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-all group"
            >
              <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>
        
        {/* Breeding dates: pairing and current litter (pups are weaned at 21 days) */}
        {cage.is_breeding_pair && (() => {
          const wean = weanBadge({ ...cage, litter_dob: litterOn || null });
          const changed = pairedOn !== (cage.breeding_since || '') || litterOn !== (cage.litter_dob || '');
          const field = 'bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white outline-none focus:border-pink-400 disabled:opacity-50 [color-scheme:dark]';
          return (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-8 py-3 bg-pink-500/5 border-b border-pink-500/20 text-[10px] font-mono uppercase tracking-widest text-pink-200/70">
              <label className="flex items-center gap-2">
                Paired
                <input type="date" value={pairedOn} max={isoDate(new Date())} disabled={!canModify}
                  onChange={e => setPairedOn(e.target.value)} className={field} />
              </label>
              <label className="flex items-center gap-2">
                Litter born
                <input type="date" value={litterOn} max={isoDate(new Date())} disabled={!canModify}
                  onChange={e => setLitterOn(e.target.value)} className={field} />
              </label>
              {changed && canModify && (
                <button onClick={saveBreedingDates} className="px-3 py-1 rounded-lg bg-pink-500 text-white font-black hover:scale-105 transition-all">Save</button>
              )}
              {wean ? (
                <span className={`px-2 py-1 rounded-lg font-black normal-case tracking-normal text-xs ${wean.level === 'due' ? 'bg-red-500 text-white' : wean.level === 'soon' ? 'bg-amber-400 text-black' : 'bg-pink-500/20 text-pink-100'}`}>
                  Wean on {isoDate(wean.due)} · {wean.daysLeft > 0 ? `in ${wean.daysLeft} days` : wean.daysLeft === 0 ? 'today' : `${-wean.daysLeft} days late`}
                </span>
              ) : (
                <span className="normal-case tracking-normal text-white/30">No litter yet</span>
              )}
              {cage.litter_dob && !changed && canModify && (
                <button onClick={markWeaned} className="ml-auto px-3 py-1 rounded-lg border border-pink-400/40 text-pink-200 font-black hover:bg-pink-500 hover:text-white transition-all">Pups weaned</button>
              )}
            </div>
          );
        })()}

        {!canModify && (
          <div className="px-8 py-3 bg-white/5 border-b border-white/10 text-xs text-white/50">
            View only — {cage.owner ? `this cage belongs to ${cage.owner.full_name || cage.owner.username}` : 'this cage has no responsible person yet; an administrator can assign it'}.
          </div>
        )}
        <div className={`p-8 max-h-[70vh] overflow-y-auto relative ${showEndDialog || showMove ? 'min-h-[560px]' : ''}`}>
          {/* Move the whole cage to a free position (any rack) */}
          {showMove && (() => {
            const rack = racks.find(r => r.id === moveRackId);
            const cells = rack?.cages || [];
            const rows = Math.max(0, ...cells.map(c => c.row));
            const cols = Math.max(0, ...cells.map(c => c.column));
            const at = Object.fromEntries(cells.map(c => [`${c.row}-${c.column}`, c]));
            const here = racks.find(r => r.cages.some(c => c.id === cage.id));
            return (
              <div className="absolute inset-0 z-10 bg-biotech-blue/95 backdrop-blur-md overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto space-y-5">
                  <div className="text-center">
                    <h3 className="text-xl font-black text-biotech-accent uppercase tracking-tighter">Move cage</h3>
                    <p className="text-white/40 text-xs mt-2">
                      From {here?.name} {String.fromCharCode(64 + cage.column)}{cage.row}{cage.card_id ? ` (${cage.card_id})` : ''}. Animals, card, responsible person and breeding state move with it.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {racks.map(r => (
                      <button key={r.id} onClick={() => { setMoveRackId(r.id); setMoveTo(null); }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${r.id === moveRackId ? 'bg-biotech-accent text-biotech-blue border-biotech-accent' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                        {r.name}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-1.5 mx-auto w-max" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, 3.5rem)` }}>
                    <span />
                    {Array.from({ length: cols }, (_, i) => <span key={i} className="text-center text-[10px] font-mono text-white/30">{String.fromCharCode(65 + i)}</span>)}
                    {Array.from({ length: rows }, (_, ri) => ri + 1).flatMap(row => [
                      <span key={`r${row}`} className="text-right pr-1 text-[10px] font-mono text-white/30 self-center">{row}</span>,
                      ...Array.from({ length: cols }, (_, ci) => ci + 1).map(col => {
                        const c = at[`${row}-${col}`];
                        if (!c) return <span key={`${row}-${col}`} />;
                        const isSelf = c.id === cage.id;
                        const free = isFree(c);
                        const chosen = moveTo && moveTo.row === row && moveTo.column === col;
                        return (
                          <button key={c.id} disabled={!free} onClick={() => setMoveTo({ row, column: col })}
                            title={isSelf ? 'This cage' : free ? `Move here: ${String.fromCharCode(64 + col)}${row}` : `${String.fromCharCode(64 + col)}${row}: ${c.card_id || (c.owner ? c.owner.full_name || c.owner.username : 'in use')}`}
                            className={`h-10 rounded-lg border text-[9px] font-mono leading-tight px-0.5 truncate ${
                              isSelf ? 'border-biotech-accent bg-biotech-accent/30 text-white font-black'
                                : chosen ? 'border-emerald-300 bg-emerald-400/40 text-white font-black'
                                  : free ? 'border-emerald-400/40 bg-emerald-500/5 text-emerald-200/60 hover:bg-emerald-500/20'
                                    : 'border-white/5 bg-white/5 text-white/25 cursor-not-allowed'}`}>
                            {isSelf ? 'HERE' : free ? `${String.fromCharCode(64 + col)}${row}` : (c.card_id || c.owner?.initials || '•')}
                          </button>
                        );
                      }),
                    ])}
                  </div>
                  <p className="text-center text-[10px] font-mono text-white/40">Green = free position · grey = in use or reserved by someone else</p>
                  <div className="flex gap-4">
                    <button onClick={() => setShowMove(false)} className="flex-1 px-8 py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5">Cancel</button>
                    <button onClick={doMove} disabled={!moveTo}
                      className="flex-1 px-8 py-4 disabled:opacity-30 bg-biotech-accent rounded-2xl text-[10px] font-black uppercase tracking-widest text-biotech-blue">
                      {moveTo ? `Move to ${rack?.name} ${String.fromCharCode(64 + moveTo.column)}${moveTo.row}` : 'Choose a free position'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Termination Dialog Overlay */}
          {showEndDialog && (
            <div className="absolute inset-0 z-10 bg-biotech-blue/90 backdrop-blur-md flex items-center justify-center p-8">
              <div className="max-w-md w-full space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                <div className="text-center">
                  <h3 className="text-xl font-black text-pink-500 uppercase tracking-tighter">Terminate Breeding Session</h3>
                  <p className="text-white/40 text-xs mt-2 uppercase tracking-widest">Select relocation strategy for experiment subjects</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => setEndOption('Home')}
                    className={`p-6 rounded-2xl border transition-all text-left ${endOption === 'Home' ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                  >
                    <div className="font-black text-xs uppercase tracking-widest mb-1">Return to Original Cages</div>
                    <div className="text-[10px] text-white/30">Animals will follow their lineage history and return to their previous units.</div>
                  </button>

                  <div className={`rounded-2xl border transition-all ${endOption === 'New' ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                  <button 
                    onClick={() => setEndOption('New')}
                    className="w-full p-6 text-left"
                  >
                    <div className="font-black text-xs uppercase tracking-widest mb-1">Relocate to New Cage</div>
                    <div className="text-[10px] text-white/30 truncate">Manually specify a new destination for the group members.</div>
                  </button>
                    {endOption === 'New' && (
                      <select
                        value={newCageId}
                        onChange={(e) => setNewCageId(e.target.value)}
                        className="mx-6 mb-6 -mt-2 w-[calc(100%-3rem)] bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-white outline-none focus:border-pink-500 transition-colors"
                      >
                        <option value="" className="bg-slate-900">Select destination cage…</option>
                        {racks.map(r => (
                          <optgroup key={r.id} label={r.name} className="bg-slate-900">
                            {[...r.cages]
                              .filter(c => c.id !== cage.id)
                              .sort((a, b) => (a.row - b.row) || (a.column - b.column))
                              .map(c => {
                                const n = c.animals?.length || 0;
                                return (
                                  <option key={c.id} value={c.id} className="bg-slate-900">
                                    {String.fromCharCode(64 + c.column)}{c.row}{c.cage_number != null ? ` · #${c.cage_number}` : ''} — {n ? `${n} animal${n === 1 ? '' : 's'}` : 'empty'}
                                  </option>
                                );
                              })}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowEndDialog(false)}
                    className="flex-1 px-8 py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleEndBreeding}
                    disabled={endOption === 'New' && !newCageId}
                    className="flex-1 px-8 py-4 disabled:opacity-30 bg-pink-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
                  >
                    Confirm End
                  </button>
                </div>
              </div>
            </div>
          )}
          {cage.animals?.length === 0 ? (
            <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-white/40 font-mono tracking-widest uppercase italic">NO DATA AVAILABLE IN THIS UNIT</p>
            </div>
          ) : (
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-white/30 text-[10px] uppercase tracking-widest font-black">
                  <th className="px-4 py-2">Mark / ID</th>
                  <th className="px-4 py-2">Sex</th>
                  <th className="px-4 py-2">DOB</th>
                  <th className="px-4 py-2">Age</th>
                  <th className="px-4 py-2">Genotype</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cage.animals?.map((animal) => (
                  <tr
                    key={animal.id}
                    className={`bg-white/5 group hover:bg-white/10 transition-colors border-l-4 ${
                      animal.status === 'Vivo' ? 'border-green-500' : 'border-red-500 opacity-60'
                    }`}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-sm tracking-tight">
                      <span className="text-biotech-accent">{animal.mark}</span>
                      <span className="text-white/20 text-[10px] ml-2">#{animal.id}</span>
                      {animal.external_id && <span className="block text-[10px] text-white/40">{animal.external_id}</span>}
                      {(animal.notes || animal.origin_cage) && (
                        <span className="block text-[10px] font-sans font-normal text-white/40 max-w-[16rem] truncate"
                          title={[animal.notes, animal.origin_cage && `Origin cage: ${animal.origin_cage}`].filter(Boolean).join(' · ')}>
                          {[animal.notes, animal.origin_cage && `from ${animal.origin_cage}`].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        animal.sex === 'M' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'
                      }`}>
                        {animal.sex}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-white/60">{animal.dob}</td>
                    <td className="px-4 py-4 font-bold text-biotech-accent">{animal.age_display}</td>
                    <td className="px-4 py-4 italic text-sm text-white/80">{animal.genotype}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
                        animal.status === 'Vivo' 
                          ? 'border-green-500/50 text-green-400 bg-green-500/10' 
                          : 'border-red-500/50 text-red-400 bg-red-500/10'
                      }`}>
                        {animalStatusLabel(animal.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2 text-white">
                      {onShowFamily && (
                        <button
                          onClick={() => onShowFamily(animal.id)}
                          title="Family tree"
                          className="p-2 bg-violet-500/20 hover:bg-violet-500 text-violet-300 hover:text-white rounded-lg transition-all"
                        >
                          <GitBranch size={16} />
                        </button>
                      )}
                      {animal.status === 'Vivo' && canModify && (
                        <>
                          <button 
                            onClick={() => onEditAnimal(animal)}
                            title="Edit Animal"
                            className="p-2 bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white rounded-lg transition-all"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleAction(animal.id, 'Eliminado')}
                            title="Mark Eliminated"
                            className="p-2 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleAction(animal.id, 'Muerto')}
                            title="Mark Dead"
                            className="p-2 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-all"
                          >
                            <Skull size={16} />
                          </button>
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        <div className="p-8 border-t border-white/10 bg-white/5 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs border border-white/20 hover:bg-white/10 transition-all active:scale-95"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
