import React from 'react';
import { BarChart3, TrendingUp, Users, ChevronRight, FileSpreadsheet } from 'lucide-react';
import AnimalDetailModal from './AnimalDetailModal';
import { exportStatisticsToExcel } from '../../../utils/exportUtils';

export default function StatisticsDashboard({ data }) {
  const [selectedDetailGroup, setSelectedDetailGroup] = React.useState(null);

  if (!data || !data.genotypes) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-white/20 uppercase font-mono tracking-widest italic">
        <BarChart3 size={48} className="mb-4 opacity-20" />
        No statistical data available
      </div>
    );
  }

  const genotypes = Object.keys(data.genotypes);
  const ageRanges = ["0-3m", "3-6m", "6-9m", ">9m"];

  return (
    <div className="glass rounded-[3rem] p-12 animate-in slide-in-from-bottom-8 duration-500 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-biotech-accent/5 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none"></div>
      
      <div className="flex items-center gap-4 mb-12">
        <div className="w-12 h-12 rounded-2xl bg-biotech-accent/10 border border-biotech-accent/20 flex items-center justify-center text-biotech-accent shadow-inner">
          <BarChart3 size={24} />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-black tracking-tighter uppercase italic">LIVE POPULATION ANALYTICS</h2>
          <p className="text-white/30 text-[10px] font-mono font-bold uppercase tracking-[0.2em] mt-1">Real-time Inventory segmentated by Genotype & Age</p>
        </div>
        <button 
          onClick={() => exportStatisticsToExcel(data)}
          className="flex items-center gap-2 px-6 py-3 bg-biotech-accent/10 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-biotech-accent/20 shadow-inner group"
        >
          <FileSpreadsheet size={16} className="group-hover:scale-110 transition-transform" />
          Export Detailed Report
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-y-2">
          <thead>
            <tr className="text-white/30 text-[9px] uppercase tracking-widest font-black">
              <th rowSpan={2} className="px-6 py-4 border-b border-white/5">GENOTYPE</th>
              <th colSpan={5} className="px-6 py-2 text-center border-b border-blue-500/20 bg-blue-500/5 rounded-t-xl">MALE (M)</th>
              <th colSpan={5} className="px-6 py-2 text-center border-b border-pink-500/20 bg-pink-500/5 rounded-t-xl">FEMALE (F)</th>
              <th rowSpan={2} className="px-6 py-4 text-right border-b border-white/5">TOTAL</th>
            </tr>
            <tr className="text-white/20 text-[8px] uppercase tracking-tighter font-bold">
              {ageRanges.map(range => <th key={`m-${range}`} className="px-2 py-2 text-center border-b border-blue-500/10">{range}</th>)}
              <th className="px-4 py-2 text-center bg-blue-500/10 text-blue-400 border-b border-blue-500/10">TOT</th>
              {ageRanges.map(range => <th key={`f-${range}`} className="px-2 py-2 text-center border-b border-pink-500/10">{range}</th>)}
              <th className="px-4 py-2 text-center bg-pink-500/10 text-pink-400 border-b border-pink-500/10">TOT</th>
            </tr>
          </thead>
          <tbody>
            {genotypes.map((gen) => {
              const gData = data.genotypes[gen];
              return (
                <tr key={gen} className="bg-white/5 border-l-4 border-biotech-accent/50 hover:bg-white/10 transition-colors group">
                  <td className="px-6 py-5 font-black text-biotech-accent tracking-tight">{gen}</td>
                  
                  {/* Male ranges */}
                  {ageRanges.map(range => {
                    const count = gData.M[range];
                    const hasData = count > 0;
                    return (
                      <td 
                        key={`m-${range}`} 
                        onClick={() => {
                          if (!hasData) return;
                          const filtered = data.live_animals.filter(a => {
                            const isSex = a.sex === 'M';
                            const isGen = a.genotype === gen;
                            let inRange = false;
                            if (range === "0-3m") inRange = a.months < 3;
                            else if (range === "3-6m") inRange = a.months >= 3 && a.months < 6;
                            else if (range === "6-9m") inRange = a.months >= 6 && a.months < 9;
                            else if (range === ">9m") inRange = a.months >= 9;
                            return isSex && isGen && inRange;
                          });
                          setSelectedDetailGroup({ animals: filtered, name: `${gen} | MALE | ${range}` });
                        }}
                        className={`px-2 py-5 text-center font-mono text-xs cursor-pointer hover:bg-white/5 transition-colors ${hasData ? 'text-white' : 'text-white/10'}`}
                      >
                        {count}
                      </td>
                    );
                  })}
                  <td className="px-4 py-5 text-center font-black bg-blue-500/5 text-blue-400/80 group-hover:bg-blue-500/10">
                    {gData.M.total}
                  </td>

                  {/* Female ranges */}
                  {ageRanges.map(range => {
                    const count = gData.F[range];
                    const hasData = count > 0;
                    return (
                      <td 
                        key={`f-${range}`} 
                        onClick={() => {
                          if (!hasData) return;
                          const filtered = data.live_animals.filter(a => {
                            const isSex = a.sex === 'F';
                            const isGen = a.genotype === gen;
                            let inRange = false;
                            if (range === "0-3m") inRange = a.months < 3;
                            else if (range === "3-6m") inRange = a.months >= 3 && a.months < 6;
                            else if (range === "6-9m") inRange = a.months >= 6 && a.months < 9;
                            else if (range === ">9m") inRange = a.months >= 9;
                            return isSex && isGen && inRange;
                          });
                          setSelectedDetailGroup({ animals: filtered, name: `${gen} | FEMALE | ${range}` });
                        }}
                        className={`px-2 py-5 text-center font-mono text-xs cursor-pointer hover:bg-white/5 transition-colors ${hasData ? 'text-white' : 'text-white/10'}`}
                      >
                        {count}
                      </td>
                    );
                  })}
                  <td className="px-4 py-5 text-center font-black bg-pink-500/5 text-pink-400/80 group-hover:bg-pink-500/10">
                    {gData.F.total}
                  </td>

                  <td className="px-6 py-5 text-right font-black text-lg tracking-tighter text-white">
                    {gData.total_genotype}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-12 flex gap-8">
        <div className="flex-1 glass bg-white/5 p-6 rounded-2xl flex items-center gap-4">
           <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Users size={20} />
           </div>
           <div>
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Total Males</div>
              <div className="text-2xl font-black text-blue-400">
                {genotypes.reduce((acc, gen) => acc + data.genotypes[gen].M.total, 0)}
              </div>
           </div>
        </div>
        <div className="flex-1 glass bg-white/5 p-6 rounded-2xl flex items-center gap-4">
           <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-400">
              <Users size={20} />
           </div>
           <div>
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Total Females</div>
              <div className="text-2xl font-black text-pink-400">
                {genotypes.reduce((acc, gen) => acc + data.genotypes[gen].F.total, 0)}
              </div>
           </div>
        </div>
        <div className="flex-1 glass bg-biotech-accent text-biotech-blue p-6 rounded-2xl flex items-center gap-4 shadow-[0_0_30px_rgba(0,229,255,0.2)]">
           <div className="w-10 h-10 rounded-xl bg-biotech-blue/20 flex items-center justify-center">
              <TrendingUp size={20} />
           </div>
           <div>
              <div className="text-[10px] font-bold text-biotech-blue/60 uppercase tracking-widest">Global Inventory</div>
              <div className="text-2xl font-black">
                {genotypes.reduce((acc, gen) => acc + data.genotypes[gen].total_genotype, 0)}
              </div>
           </div>
        </div>
      </div>


      {selectedDetailGroup && (
        <AnimalDetailModal 
          animals={selectedDetailGroup.animals}
          groupName={selectedDetailGroup.name}
          onClose={() => setSelectedDetailGroup(null)}
        />
      )}
    </div>
  );
}
