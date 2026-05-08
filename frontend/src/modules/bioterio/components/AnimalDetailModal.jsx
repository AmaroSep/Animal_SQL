import React from 'react';
import { X, Users, MapPin } from 'lucide-react';

export default function AnimalDetailModal({ animals, groupName, onClose }) {
  if (!animals) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass w-full max-w-2xl rounded-3xl overflow-hidden border-white/20 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-biotech-accent uppercase italic">
              ANIMAL DETAIL: {groupName}
            </h2>
            <p className="text-white/40 text-[10px] font-mono tracking-[0.3em] mt-1 uppercase">Population segment breakdown</p>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-all group"
          >
            <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
        
        <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {animals.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-white/20 font-mono tracking-widest uppercase italic text-xs">No subjects match this criteria</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {animals.map((animal) => (
                <div 
                  key={animal.id} 
                  className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-biotech-accent/10 flex items-center justify-center text-biotech-accent border border-biotech-accent/20">
                      <span className="text-xs font-black">{animal.id.slice(-2)}</span>
                    </div>
                    <div>
                      <div className="text-sm font-black text-white tracking-tight">{animal.id}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                          animal.sex === 'M' ? 'bg-blue-500/10 text-blue-400' : 'bg-pink-500/10 text-pink-400'
                        }`}>
                          {animal.sex === 'M' ? 'MALE' : 'FEMALE'}
                        </span>
                        <span className="text-[9px] font-mono text-white/30 uppercase">{animal.genotype}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end text-biotech-accent/60">
                      <MapPin size={12} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{animal.cage}</span>
                    </div>
                    {animal.dob && (
                      <div className="text-[9px] font-mono text-white/40 mt-1 uppercase">
                        DOB: {new Date(animal.dob).toLocaleDateString()}
                      </div>
                    )}
                    <div className="text-[8px] font-mono text-white/20 uppercase mt-0.5">Location & Birth</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-8 border-t border-white/10 bg-white/5 flex justify-between items-center">
          <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
            Total Subjects: <span className="text-white font-black">{animals.length}</span>
          </div>
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs border border-white/20 hover:bg-white/10 transition-all active:scale-95"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
