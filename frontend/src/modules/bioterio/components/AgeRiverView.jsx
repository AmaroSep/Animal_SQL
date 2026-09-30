import React, { useState, useMemo } from 'react';
import { Waves, X } from 'lucide-react';

const WARN_MONTHS = 9; // matches the existing >9m "warning" threshold used in Statistics
const LANE_HEIGHT = 44;
const AXIS_STEPS = 5; // number of tick labels drawn under the axis

function pctFor(months, maxMonths) {
  return Math.min(96, (months / maxMonths) * 100) + 2; // 2%..98%, leaves room for bubble radius
}

// Bubble diameter grows gently with group size so a cluster of 20 doesn't
// dwarf the lane, but a single animal isn't a speck either.
function bubbleSize(count) {
  return Math.min(40, 18 + Math.sqrt(count) * 5);
}

function groupByMonth(animals) {
  const byMonth = {};
  for (const a of animals) {
    (byMonth[a.months] ??= []).push(a);
  }
  return Object.entries(byMonth).map(([months, group]) => ({
    months: Number(months),
    animals: group,
    total: group.length,
    males: group.filter(a => a.sex === 'M').length,
    females: group.filter(a => a.sex === 'F').length,
  }));
}

export default function AgeRiverView({ data }) {
  const [selected, setSelected] = useState(null); // { genotype, group, x, y }

  const lanes = useMemo(() => {
    if (!data?.live_animals) return [];
    const byGenotype = {};
    for (const a of data.live_animals) {
      const key = a.genotype || 'No genotype';
      if (!byGenotype[key]) byGenotype[key] = [];
      byGenotype[key].push(a);
    }
    return Object.entries(byGenotype)
      .map(([genotype, animals]) => ({
        genotype,
        total: animals.length,
        groups: groupByMonth(animals),
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  // Axis scales to the oldest live animal + 3 months, instead of a fixed cap.
  const maxMonths = useMemo(() => {
    const oldest = Math.max(0, ...(data?.live_animals ?? []).map(a => a.months));
    return oldest + 3;
  }, [data]);

  const axisTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= AXIS_STEPS; i++) {
      ticks.push(Math.round((maxMonths / AXIS_STEPS) * i));
    }
    return ticks;
  }, [maxMonths]);

  if (!data) {
    return (
      <div className="glass rounded-[3rem] p-12 min-h-[60vh] flex items-center justify-center">
        <span className="font-mono text-xs tracking-[0.3em] text-white/20 uppercase">Loading...</span>
      </div>
    );
  }

  return (
    <div className="glass rounded-[3rem] p-12 animate-in slide-in-from-bottom-8 duration-500 min-h-[60vh] relative">
      <div className="flex items-center justify-between mb-10 flex-wrap gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-biotech-accent/10 border border-biotech-accent/20 flex items-center justify-center text-biotech-accent shadow-inner">
            <Waves size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tighter uppercase italic">AGE RIVER</h2>
            <p className="text-white/30 text-[10px] font-mono font-bold uppercase tracking-[0.2em] mt-1">
              Live population by genotype &amp; age
            </p>
          </div>
        </div>

        <div className="flex gap-8 bg-black/40 px-6 py-4 rounded-2xl border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{"< 9m"}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{"≥ 9m"}</span>
          </div>
        </div>
      </div>

      {lanes.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
          <p className="text-white/20 font-mono tracking-widest uppercase italic text-xs">No live animals to display</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {lanes.map(({ genotype, total, groups }) => (
            <div key={genotype} className="flex items-center gap-5">
              <div className="w-48 shrink-0 text-right">
                <div className="text-xs font-black text-white/70 uppercase tracking-tight leading-tight truncate" title={genotype}>
                  {genotype}
                </div>
                <div className="text-[10px] font-mono text-white/25 mt-0.5">{total} alive</div>
              </div>

              <div
                className="relative flex-1 bg-white/5 border border-white/10 rounded-xl overflow-visible"
                style={{ height: LANE_HEIGHT }}
              >
                {groups.map((g) => {
                  const warn = g.months >= WARN_MONTHS;
                  const size = bubbleSize(g.total);
                  const isSelected = selected?.genotype === genotype && selected?.months === g.months;
                  return (
                    <button
                      key={g.months}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setSelected(isSelected ? null : {
                          genotype, months: g.months, group: g,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      title={`${g.total} animal${g.total === 1 ? '' : 's'} · ${g.months}m`}
                      style={{
                        left: `${pctFor(g.months, maxMonths)}%`,
                        top: '50%',
                        width: size,
                        height: size,
                        fontSize: size > 28 ? 13 : 11,
                      }}
                      className={`
                        absolute -translate-y-1/2 -translate-x-1/2 rounded-full border-2 flex items-center justify-center
                        transition-transform hover:scale-110 hover:z-10 font-black
                        ${isSelected ? 'ring-2 ring-white/60 scale-110 z-10' : ''}
                        ${warn
                          ? 'bg-yellow-500/90 border-yellow-300/40 shadow-[0_0_10px_rgba(234,179,8,0.5)] text-yellow-950'
                          : 'bg-green-500/90 border-green-300/40 shadow-[0_0_10px_rgba(34,197,94,0.5)] text-green-950'
                        }
                      `}
                    >
                      {g.total}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-between text-[9px] font-mono text-white/20 uppercase tracking-widest pl-[13.5rem] pr-1 mt-1">
            {axisTicks.map((m, i) => (
              <span key={i}>{m}m</span>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelected(null)} />
          <div
            className="fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+14px)] glass rounded-2xl border border-white/20 p-5 min-w-[180px] animate-in fade-in zoom-in-95 duration-150 shadow-2xl"
            style={{ left: selected.x, top: selected.y }}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded-full text-white/40"
            >
              <X size={14} />
            </button>
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-3">
              {selected.genotype} · {selected.months}m
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-black text-blue-400">{selected.group.males}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-0.5">Males</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-pink-400">{selected.group.females}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-0.5">Females</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
