import React, { useState, useEffect } from 'react';
import { X, MapPin, RefreshCw } from 'lucide-react';
import { fetchRacks } from '../../../services/api';

export default function BioterioAnimalPanel({ animalId, onClose }) {
  const [racks, setRacks] = useState([]);
  const [animalCage, setAnimalCage] = useState(null);
  const [targetRack, setTargetRack] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchRacks();
        setRacks(data);
        for (const rack of data) {
          for (const cage of rack.cages) {
            if (cage.animals?.some(a => a.id === animalId)) {
              setAnimalCage(cage);
              setTargetRack(rack);
              break;
            }
          }
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, [animalId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-[#0a0a0f] border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-cyan-400" />
            <div>
              <h3 className="font-black text-white uppercase tracking-widest text-sm">Ver en Bioterio</h3>
              <p className="text-white/30 text-[10px] font-mono">{animalId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="animate-spin text-cyan-400" size={28} />
            </div>
          ) : !animalCage ? (
            <div className="flex items-center justify-center h-48 text-white/30 text-xs font-mono">
              Animal no encontrado en bioterio (puede estar muerto o eliminado)
            </div>
          ) : (
            <div className="space-y-6">
              {/* Location info */}
              <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-black text-cyan-400">{targetRack?.name}</div>
                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">Rack</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">{animalCage.display_id}</div>
                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">Jaula</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white/60">{animalCage.animals?.length || 0}</div>
                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mt-1">Compañeros</div>
                  </div>
                </div>
              </div>

              {/* Rack grid — highlight the target cage */}
              {targetRack && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">
                    {targetRack.name} — Mapa de jaulas
                  </h4>
                  <div className="grid grid-cols-7 gap-2">
                    {targetRack.cages
                      .sort((a, b) => (a.row - b.row) || (a.column - b.column))
                      .map(cage => {
                        const isTarget = cage.id === animalCage.id;
                        const hasAnimals = cage.animals?.length > 0;
                        return (
                          <div
                            key={cage.id}
                            className={`
                              aspect-square rounded-xl border flex flex-col items-center justify-center relative
                              ${isTarget
                                ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.3)]'
                                : cage.is_breeding_pair
                                  ? 'bg-pink-500/10 border-pink-500/30'
                                  : hasAnimals
                                    ? 'bg-white/5 border-white/15'
                                    : 'bg-black/20 border-white/5 opacity-40'
                              }
                            `}
                          >
                            <span className={`text-[8px] font-mono font-black ${isTarget ? 'text-cyan-400' : 'text-white/20'}`}>
                              {cage.display_id}
                            </span>
                            {isTarget && (
                              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.8)] animate-pulse" />
                            )}
                          </div>
                        );
                    })}
                  </div>
                </div>
              )}

              {/* Cage mates */}
              {animalCage.animals && animalCage.animals.length > 1 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Animales en la jaula</h4>
                  <div className="space-y-2">
                    {animalCage.animals.map(a => (
                      <div
                        key={a.id}
                        className={`flex items-center gap-3 p-3 rounded-xl ${a.id === animalId ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-white/[0.03] border border-white/5'}`}
                      >
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${a.sex === 'M' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{a.sex}</span>
                        <span className={`font-mono text-sm flex-1 ${a.id === animalId ? 'text-cyan-400 font-black' : 'text-white/70'}`}>{a.id}</span>
                        <span className="text-xs font-mono text-white/40">{a.genotype}</span>
                        <span className="text-xs font-mono text-white/20">{a.age_display}</span>
                        {a.id === animalId && <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">← este</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
