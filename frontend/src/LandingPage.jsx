import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, Grid3x3, Snowflake, Refrigerator } from 'lucide-react';

const modules = [
  {
    path: '/bioterio',
    icon: Activity,
    label: 'Bioterio Manager',
    sublabel: 'Animal colony management',
    description: 'Manage racks, cages, animals, breeding and colony statistics.',
    accent: 'cyan',
    glowClass: 'shadow-[0_0_60px_rgba(0,229,255,0.15)]',
    borderClass: 'border-cyan-500/30 hover:border-cyan-400',
    iconBg: 'bg-cyan-500/10 text-cyan-400',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    path: '/em-grids',
    icon: Grid3x3,
    label: 'EM Grids',
    sublabel: 'Grid inventory',
    description: 'Grid boxes, positions, samples, staining and preparation conditions.',
    accent: 'violet',
    glowClass: 'shadow-[0_0_60px_rgba(139,92,246,0.15)]',
    borderClass: 'border-violet-500/30 hover:border-violet-400',
    iconBg: 'bg-violet-500/10 text-violet-400',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  {
    path: '/ln2',
    icon: Snowflake,
    label: 'LN2 Tank',
    sublabel: 'Frozen cell stocks',
    description: 'Racks, boxes and vials in the liquid nitrogen tank: freeze, thaw and find your stocks.',
    accent: 'sky',
    glowClass: 'shadow-[0_0_60px_rgba(56,189,248,0.15)]',
    borderClass: 'border-sky-500/30 hover:border-sky-400',
    iconBg: 'bg-sky-500/10 text-sky-400',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  {
    path: '/m80',
    icon: Refrigerator,
    label: '-80 °C Freezers',
    sublabel: 'Sample storage',
    description: 'Freezers, compartments, racks and boxes: store, use and find your samples.',
    accent: 'indigo',
    glowClass: 'shadow-[0_0_60px_rgba(99,102,241,0.15)]',
    borderClass: 'border-indigo-500/30 hover:border-indigo-400',
    iconBg: 'bg-indigo-500/10 text-indigo-400',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 selection:bg-cyan-400/30">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-16">
        {/* Title */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-[10px] font-mono font-bold tracking-[0.4em] uppercase text-white/20">
              Animal Colony System
            </span>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/20">
              v2.0
            </span>
          </div>
          <h1 className="text-6xl font-black tracking-[-0.04em] leading-none">
            <span className="text-white">SELECT</span>
            <br />
            <span className="text-white/20">MODULE</span>
          </h1>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.path}
                onClick={() => navigate(mod.path)}
                className={`
                  group relative flex flex-col items-start gap-6 p-10 rounded-[2rem]
                  bg-white/[0.03] border transition-all duration-300 text-left
                  ${mod.borderClass} ${mod.glowClass}
                  hover:bg-white/[0.06] hover:scale-[1.02] active:scale-[0.99]
                `}
              >
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${mod.iconBg} border ${mod.borderClass.split(' ')[0]}`}>
                  <Icon size={28} />
                </div>

                {/* Text */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black tracking-tight text-white">{mod.label}</h2>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${mod.badgeClass}`}>
                      {mod.sublabel}
                    </span>
                  </div>
                  <p className="text-white/40 text-sm font-mono leading-relaxed">{mod.description}</p>
                </div>

                {/* Arrow */}
                <ChevronRight
                  size={20}
                  className="absolute top-10 right-10 text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all"
                />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-white/10">
          Bioterio Management System &copy; 2026
        </p>
      </div>
    </div>
  );
}
