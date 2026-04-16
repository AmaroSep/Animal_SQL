import React, { useState } from 'react';
import { X, Skull, Trash2, Plus, Pencil, HeartOff, RefreshCw } from 'lucide-react';
import { updateAnimalStatus, endBreedingSession } from '../services/api';

export default function CageModal({ cage, onClose, onUpdate, onAddAnimal, onEditAnimal, onMergeStart }) {
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endOption, setEndOption] = useState('Home'); // 'Home' or 'New'
  const [newCageId, setNewCageId] = useState('');

  if (!cage) return null;

  const handleAction = async (animalId, newStatus) => {
    const reason = window.prompt(`Indique la razón para marcar como ${newStatus}:`);
    if (reason === null) return; // Cancelled
    if (!reason.trim()) {
      alert('La razón es obligatoria');
      return;
    }

    try {
      await updateAnimalStatus(animalId, newStatus, reason);
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el estado del animal');
    }
  };

  const toggleBreedingPair = async () => {
    try {
      const { updateCageBreedingStatus } = await import('../services/api');
      await updateCageBreedingStatus(cage.id, !cage.is_breeding_pair);
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Error updating breeding status');
    }
  };

  const handleMergeStart = () => {
    onMergeStart(cage);
    onClose();
  };

  const handleEndBreeding = async () => {
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
              <p className="text-white/40 text-xs font-mono tracking-widest mt-1">BIOTERIO SECURE ACCESS</p>
            </div>
            
            {/* Breeding Pair Toggle */}
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
              <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${cage.is_breeding_pair ? 'text-pink-400' : 'text-white/20'}`}>
                Breeding Pair
              </span>
              <button 
                onClick={toggleBreedingPair}
                className={`w-10 h-5 rounded-full relative transition-all duration-300 ${cage.is_breeding_pair ? 'bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${cage.is_breeding_pair ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {cage.is_breeding_pair && (
              <button 
                onClick={() => setShowEndDialog(true)}
                className="flex items-center gap-2 px-6 py-3 bg-pink-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.3)]"
              >
                <HeartOff size={14} />
                Terminate Breeding
              </button>
            )}

            <button 
              onClick={handleMergeStart}
              disabled={!cage.animals || cage.animals.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-biotech-accent hover:text-biotech-blue border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
              Merge Cage
            </button>

            <button 
              onClick={onAddAnimal}
              className="flex items-center gap-2 px-6 py-3 bg-biotech-accent/10 hover:bg-biotech-accent text-biotech-accent hover:text-biotech-blue border border-biotech-accent/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group"
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
        
        <div className="p-8 max-h-[70vh] overflow-y-auto relative">
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

                  <button 
                    onClick={() => setEndOption('New')}
                    className={`p-6 rounded-2xl border transition-all text-left ${endOption === 'New' ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                  >
                    <div className="font-black text-xs uppercase tracking-widest mb-1">Relocate to New Cage</div>
                    <div className="text-[10px] text-white/30 truncate">Manually specify a new destination for the group members.</div>
                    {endOption === 'New' && (
                      <input 
                        type="number"
                        placeholder="CAGE ID (1-210)"
                        value={newCageId}
                        onChange={(e) => setNewCageId(e.target.value)}
                        className="mt-4 w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-white outline-none focus:border-pink-500 transition-colors"
                      />
                    )}
                  </button>
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
                    className="flex-1 px-8 py-4 bg-pink-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
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
                  <th className="px-4 py-2">ANIMAL ID</th>
                  <th className="px-4 py-2">SEX</th>
                  <th className="px-4 py-2">DOB</th>
                  <th className="px-4 py-2">AGE</th>
                  <th className="px-4 py-2">MARK</th>
                  <th className="px-4 py-2">GENOTYPE</th>
                  <th className="px-4 py-2">STATUS</th>
                  <th className="px-4 py-2 text-right">ACTIONS</th>
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
                    <td className="px-4 py-4 font-mono font-bold text-sm tracking-tight">{animal.id}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        animal.sex === 'M' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'
                      }`}>
                        {animal.sex}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-white/60">{animal.dob}</td>
                    <td className="px-4 py-4 font-bold text-biotech-accent">{animal.age_display}</td>
                    <td className="px-4 py-4 text-xs font-mono text-white/60">{animal.mark}</td>
                    <td className="px-4 py-4 italic text-sm text-white/80">{animal.genotype}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
                        animal.status === 'Vivo' 
                          ? 'border-green-500/50 text-green-400 bg-green-500/10' 
                          : 'border-red-500/50 text-red-400 bg-red-500/10'
                      }`}>
                        {animal.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {animal.status === 'Vivo' && (
                        <div className="flex justify-end gap-2 text-white">
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
                        </div>
                      )}
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
