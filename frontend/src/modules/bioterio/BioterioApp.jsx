import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CageModal from './components/CageModal';
import StatisticsDashboard from './components/StatisticsDashboard';
import AgeRiverView from './components/AgeRiverView';
import { LayoutGrid, Database, Activity, RefreshCw, Plus, History, ChevronLeft, Skull, Trash2, BarChart3, Waves, X, Download, Upload, Home, GitBranch } from 'lucide-react';
import { animalStatusLabel } from '../../utils/labels';
import { useAuth } from '../../auth/AuthContext';
import ColonyImportModal from './components/ColonyImportModal';
import FamilyTreeModal from './components/FamilyTreeModal';
import { exportColonyWorkbook } from '../../utils/colonyFormat';
import { fetchColonyExport, fetchDirectory, fetchRacks, fetchRack, createAnimal, fetchHistory, fetchStatistics, updateAnimal, swapCagePositions } from '../../services/api';

export default function BioterioApp() {
  const navigate = useNavigate();
  const [racks, setRacks] = useState([]);
  const [selectedRackId, setSelectedRackId] = useState(null);
  const [rackData, setRackData] = useState(null);
  const [selectedCage, setSelectedCage] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // V1.1 & V1.2 State
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid', 'history', 'stats', or 'river'
  const [historyData, setHistoryData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newAnimal, setNewAnimal] = useState({
    sex: 'M',
    dob: new Date().toISOString().split('T')[0],
    mark: '',
    genotype: '',
    cage_id: null,
    status: 'Vivo',
    external_id: '',
    origin_cage: '',
    notes: ''
  });
  const [editingAnimalId, setEditingAnimalId] = useState(null);
  const [cageSearch, setCageSearch] = useState('');

  // V1.11 Breeding Wizard State
  const [showBreedingWizard, setShowBreedingWizard] = useState(false);
  const [breedingStep, setBreedingStep] = useState(1);
  const [breedingData, setBreedingData] = useState({
    type: 'Pair',
    animalIds: [],
    targetCageId: null
  });
  const [breedingSearch, setBreedingSearch] = useState('');
  const [breedingRackId, setBreedingRackId] = useState(null);

  // V1.3 Merge Mode State
  const [mergeSource, setMergeSource] = useState(null);
  const [isMergeMode, setIsMergeMode] = useState(false);

  // Drag & drop reposition state
  const [draggedCage, setDraggedCage] = useState(null);
  const [dragOverCage, setDragOverCage] = useState(null);

  // Cage ownership: everyone sees everything; only the responsible user (or an admin) changes a cage
  const { user, isAdmin, canEdit } = useAuth();
  const [directory, setDirectory] = useState([]);
  const [onlyMine, setOnlyMine] = useState(false);
  // Fit the whole rack (10 rows) in the window height; remembered per browser
  const [fitRack, setFitRack] = useState(() => { try { return localStorage.getItem('bioterio.fitRack') !== '0'; } catch { return true; } });
  const [rackWidth, setRackWidth] = useState(null);
  const gridRef = useRef(null);
  useEffect(() => {
    try { localStorage.setItem('bioterio.fitRack', fitRack ? '1' : '0'); } catch { /* private mode */ }
    if (!fitRack) { setRackWidth(null); return undefined; }
    // 7 columns × 10 rows of square cages: the width that makes 10 rows as tall as the window
    // 10 cells + 9 gaps of 6px in the height; 7 cells + 6 gaps in the width
    const update = () => {
      const cell = (window.innerHeight - 24 - 9 * 6) / 10;
      setRackWidth(Math.max(360, Math.floor(7 * cell + 6 * 6)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fitRack]);
  const showWholeRack = () => {
    setFitRack(true);
    setTimeout(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  // Statistics show the signed-in user's cages; admins can switch to the whole colony
  const [statsScope, setStatsScope] = useState('mine');
  useEffect(() => { fetchDirectory().then(setDirectory).catch(() => {}); }, []);
  const isMine = (cage) => cage.owner_id === user?.id;
  const canModifyCage = (cage) => !!cage && canEdit && (isAdmin || isMine(cage) ||
    (!cage.owner_id && !(cage.animals?.length) && !cage.is_breeding_pair));

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchRacks();
      setRacks(data);
      if (data.length > 0 && !selectedRackId) {
        setSelectedRackId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading racks:', err);
    }
    setLoading(false);
  };

  const loadRackDetails = async () => {
    if (!selectedRackId) return;
    try {
      const data = await fetchRack(selectedRackId);
      setRackData(data);
      // Keep every rack's occupancy current for the cage pickers
      setRacks(await fetchRacks());
    } catch (err) {
      console.error('Error loading rack details:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await fetchHistory();
      setHistoryData(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  const loadStatistics = async () => {
    try {
      const data = await fetchStatistics(statsScope);
      setStatsData(data);
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  };

  const handleAddAnimal = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        if (!newAnimal.cage_id) { alert('Select a cage'); return; }
        await updateAnimal(editingAnimalId, {
          sex: newAnimal.sex,
          dob: newAnimal.dob,
          mark: newAnimal.mark,
          genotype: newAnimal.genotype,
          cage_id: newAnimal.cage_id,
          external_id: newAnimal.external_id || null,
          origin_cage: newAnimal.origin_cage || null,
          notes: newAnimal.notes || null
        });
        alert('Animal updated');
      } else {
        if (!newAnimal.cage_id) { alert('Select a cage'); return; }
        await createAnimal({
          sex: newAnimal.sex,
          dob: newAnimal.dob,
          mark: newAnimal.mark,
          genotype: newAnimal.genotype,
          cage_id: newAnimal.cage_id,
          external_id: newAnimal.external_id || null,
          origin_cage: newAnimal.origin_cage || null,
          notes: newAnimal.notes || null
        });
        alert('Animal registered');
      }
      setShowAddModal(false);
      setIsEditing(false);
      setEditingAnimalId(null);
      loadRackDetails();
    } catch (err) {
      console.error(err);
      alert(`${isEditing ? 'Error updating animal' : 'Error registering animal'}: ${err.message}`);
    }
  };

  const handleEditAnimal = (animal) => {
    setNewAnimal({
      sex: animal.sex,
      dob: animal.dob,
      mark: animal.mark,
      genotype: animal.genotype,
      cage_id: animal.cage_id,
      status: animal.status,
      external_id: animal.external_id || '',
      origin_cage: animal.origin_cage || '',
      notes: animal.notes || ''
    });
    setCageSearch('');
    setEditingAnimalId(animal.id);
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleAddAnimalFromCage = (cage) => {
    setNewAnimal({ ...newAnimal, cage_id: cage.id });
    setCageSearch('');
    setSelectedCage(null);
    setShowAddModal(true);
  };

  const handleDrop = async (targetCage) => {
    if (!draggedCage || draggedCage.id === targetCage.id) {
      setDraggedCage(null);
      setDragOverCage(null);
      return;
    }
    try {
      await swapCagePositions(draggedCage.id, targetCage.id);
      await loadRackDetails();
    } catch (err) {
      alert('Error moving cage: ' + err.message);
    } finally {
      setDraggedCage(null);
      setDragOverCage(null);
    }
  };

  // Shared colony workbook (agreed lab format)
  const [showColonyImport, setShowColonyImport] = useState(false);
  const [familyOf, setFamilyOf] = useState(undefined); // animal id, null = search, undefined = closed
  const [exportMenu, setExportMenu] = useState(false);
  const handleExportColony = async (scope) => {
    setExportMenu(false);
    try {
      const animals = await fetchColonyExport(scope);
      if (!animals.length) { alert('There are no animals in your cages to export.'); return; }
      const who = scope === 'all' ? 'Colony' : `${user?.initials || user?.username || 'My'} Colony`;
      exportColonyWorkbook(animals, who);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleMergeStart = (cage) => {
    setMergeSource(cage);
    setIsMergeMode(true);
  };

  const handleMergeConfirm = async (destCage) => {
    if (!mergeSource || !destCage) return;
    if (mergeSource.id === destCage.id) {
      alert("Source and destination cages must be different.");
      return;
    }

    const confirmResult = window.confirm(`Merge all animals from ${mergeSource.display_id} into ${destCage.display_id}?`);
    if (!confirmResult) return;

    try {
      setLoading(true);
      const { mergeCages } = await import('../../services/api');
      await mergeCages(mergeSource.id, destCage.id);
      setIsMergeMode(false);
      setMergeSource(null);
      await loadRackDetails();
      await loadStatistics();
      alert("Cages merged successfully!");
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadRackDetails(); }, [selectedRackId]);
  useEffect(() => {
    if (viewMode === 'history') loadHistory();
    if (viewMode === 'stats' || viewMode === 'river') loadStatistics();
  }, [viewMode, statsScope]);

  return (
    <div className="min-h-screen selection:bg-biotech-accent selection:text-biotech-blue flex flex-col">
      {/* Header */}
      <header className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-screen-2xl mx-auto w-full">
        <div>
          <h1 className="text-4xl font-black tracking-[ -0.05em] flex items-center gap-3">
            <span className="bg-biotech-accent text-biotech-blue px-2 py-0.5 rounded italic">BIOTERIO</span>
            <span className="text-white">MANAGEMENT</span>
            <span className="text-biotech-accent/40 font-mono text-sm align-super">V2.0</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">Experimental Enclave Protocol Alpha</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            <Home size={16} />
          </button>

          <button
            onClick={() => {
              setNewAnimal({ sex: 'M', dob: new Date().toISOString().split('T')[0], mark: '', genotype: '', cage_id: null, status: 'Vivo', external_id: '', origin_cage: '', notes: '' });
              setIsEditing(false); setEditingAnimalId(null); setCageSearch(''); setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all group"
          >
            <Plus size={16} className="group-hover:rotate-90 transition-transform" />
            Add Animal
          </button>
          
          <button 
            onClick={() => setViewMode(viewMode === 'stats' ? 'grid' : 'stats')}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all
              ${viewMode === 'stats' 
                ? 'bg-biotech-accent text-biotech-blue shadow-[0_0_20px_rgba(0,229,255,0.3)]' 
                : 'bg-white/5 text-white/40 hover:text-white border border-transparent'
              }
            `}
          >
            <BarChart3 size={16} />
            Statistics
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'river' ? 'grid' : 'river')}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all
              ${viewMode === 'river'
                ? 'bg-biotech-accent text-biotech-blue shadow-[0_0_20px_rgba(0,229,255,0.3)]'
                : 'bg-white/5 text-white/40 hover:text-white border border-transparent'
              }
            `}
          >
            <Waves size={16} />
            Age River
          </button>

          <button
            onClick={() => setViewMode(viewMode === 'history' ? 'grid' : 'history')}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all
              ${viewMode === 'history' 
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                : 'bg-white/5 text-white/40 hover:text-white border border-transparent'
              }
            `}
          >
            <Skull size={16} />
            History
          </button>
          
          <div className="relative">
            <button
              onClick={() => (isAdmin ? setExportMenu(!exportMenu) : handleExportColony('mine'))}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/40 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-transparent shadow-inner group"
            >
              <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
              Export Excel
            </button>
            {exportMenu && (
              <div className="absolute z-30 mt-2 right-0 w-48 glass rounded-xl border-white/20 py-1">
                <button onClick={() => handleExportColony('mine')} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/10">My cages</button>
                <button onClick={() => handleExportColony('all')} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/10">Whole colony (incl. history)</button>
              </div>
            )}
          </div>

          <button onClick={() => setFamilyOf(null)}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/40 hover:bg-violet-500 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-transparent">
            <GitBranch size={16} />
            Family Tree
          </button>

          {isAdmin && (
          <button onClick={() => setShowColonyImport(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/40 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-transparent shadow-inner group">
            <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform" />
            Import Excel
          </button>
          )}

          <button 
            onClick={() => {
              setBreedingData({ type: 'Pair', animalIds: [], targetCageId: null });
              setBreedingStep(1);
              setBreedingRackId(selectedRackId);
              // Refresh occupancy of every rack so the target-cage picker is current
              fetchRacks().then(setRacks).catch(err => console.error('Error loading racks:', err));
              setShowBreedingWizard(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-pink-500/10 text-pink-400 hover:bg-pink-500 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-pink-500/20 shadow-[0_0_20px_rgba(236,72,153,0.1)] group"
          >
            <Activity size={16} className="group-hover:animate-pulse" />
            Create Breeding
          </button>
        </div>
      </header>

      {/* Merge Mode Banner */}
      {isMergeMode && (
        <div className="mx-8 mb-8 p-6 bg-biotech-accent/20 border border-biotech-accent rounded-3xl flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-biotech-accent flex items-center justify-center text-biotech-blue animate-pulse">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-biotech-accent">Merge Mode Active</h3>
              <p className="text-white/60 text-xs font-mono">Transferring animals from <span className="text-white font-bold">{mergeSource.display_id}</span>. Select a destination unit below.</p>
            </div>
          </div>
          <button 
            onClick={() => { setIsMergeMode(false); setMergeSource(null); }}
            className="px-6 py-2 border border-white/20 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cancel Merge
          </button>
        </div>
      )}

      {/* Main Grid Area */}
      <main className="flex-1 px-4 pb-4 max-w-screen-2xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[60vh] animate-pulse-soft">
            <RefreshCw className="animate-spin text-biotech-accent mb-6" size={48} />
            <span className="font-mono text-xs tracking-[0.5em] text-white/30 uppercase italic">Processing neural link...</span>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="glass rounded-[2rem] p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-biotech-accent/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-biotech-accent shadow-inner">
                  <Database size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black tracking-tighter uppercase italic">{rackData?.name} STATUS MAP</h2>
                    <nav className="flex bg-white/5 p-1 rounded-xl border border-white/10 ml-4">
                      {racks.map(rack => (
                        <button
                          key={rack.id}
                          onClick={() => setSelectedRackId(rack.id)}
                          className={`
                            px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                            ${selectedRackId === rack.id 
                              ? 'bg-biotech-accent text-biotech-blue shadow-[0_0_15px_rgba(0,229,255,0.3)]' 
                              : 'text-white/30 hover:text-white'
                            }
                          `}
                        >
                          {rack.name}
                        </button>
                      ))}
                    </nav>
                  </div>
                  <div className="flex gap-6 text-[10px] font-mono font-bold text-white/30 uppercase tracking-[0.2em] mt-1">
                    <span className="flex items-center gap-2">10 Rows</span>
                    <span className="flex items-center gap-2">7 Columns (A-G)</span>
                    <span className="flex items-center gap-2">{rackData?.cages.length} Units</span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-8 bg-black/40 px-6 py-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Breeding</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Active</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Warning</span>
                </div>
                <div className="flex items-center gap-3 opacity-30">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20 border border-white/20"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Vacant</span>
                </div>
              </div>
            </div>

            {/* Responsible users with cages in this rack */}
            {(() => {
              const counts = {};
              rackData?.cages.forEach(c => { if (c.owner) counts[c.owner.id] = (counts[c.owner.id] || 0) + 1; });
              const owners = directory.filter(u => counts[u.id]);
              return (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/30 mr-1">Responsible</span>
                  {owners.length === 0 && <span className="text-[10px] font-mono text-white/20">no cages assigned in this rack</span>}
                  {owners.map(u => (
                    <span key={u.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 text-[11px] font-bold ${u.id === user?.id ? 'text-white' : 'text-white/60'}`}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: u.color || '#64748b' }} />
                      {u.full_name || u.username} · {counts[u.id]}
                    </span>
                  ))}
                  <button onClick={() => (fitRack ? setFitRack(false) : showWholeRack())}
                    title="Size the rack so all 10 rows fit in the window"
                    className={`ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${fitRack ? 'border-biotech-accent text-biotech-accent bg-biotech-accent/10' : 'border-white/10 text-white/40 hover:text-white'}`}>
                    {fitRack ? 'Fit to screen: on' : 'Fit to screen'}
                  </button>
                  <button onClick={() => setOnlyMine(!onlyMine)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${onlyMine ? 'border-biotech-accent text-biotech-accent bg-biotech-accent/10' : 'border-white/10 text-white/40 hover:text-white'}`}>
                    {onlyMine ? 'Showing only my cages' : 'Show only my cages'}
                  </button>
                  {!user?.color && <span className="w-full text-[10px] text-amber-200/70">Pick your colour in the account menu (bottom right) so your cages are easy to spot.</span>}
                </div>
              );
            })()}

            {/* Grid 10x7 */}
            <div ref={gridRef} className="grid grid-cols-7 gap-1.5 perspective-1000 mx-auto scroll-mt-3"
              style={rackWidth ? { maxWidth: `${rackWidth}px` } : undefined}>
              {rackData?.cages.sort((a,b) => (a.row - b.row) || (a.column - b.column)).map(cage => {
                const hasAnimals = cage.animals?.length > 0;
                const allAlive = cage.animals?.every(a => a.status === 'Vivo');
                const ownerColor = cage.owner ? (cage.owner.color || '#64748b') : null;
                const dimmed = onlyMine && cage.owner && !isMine(cage);

                return (
                  <button
                    key={cage.id}
                    title={cage.owner ? `Responsible: ${cage.owner.full_name || cage.owner.username}` : undefined}
                    style={ownerColor ? { boxShadow: `inset 0 0 0 3px ${ownerColor}` } : undefined}
                    draggable={!isMergeMode}
                    onDragStart={() => setDraggedCage(cage)}
                    onDragEnd={() => { setDraggedCage(null); setDragOverCage(null); }}
                    onDragOver={e => { e.preventDefault(); setDragOverCage(cage.id); }}
                    onDragLeave={() => setDragOverCage(null)}
                    onDrop={e => { e.preventDefault(); handleDrop(cage); }}
                    onClick={() => {
                      if (draggedCage) return;
                      if (isMergeMode) {
                        handleMergeConfirm(cage);
                      } else {
                        setSelectedCage(cage);
                      }
                    }}
                    className={`
                      aspect-square rounded-2xl border transition-all duration-300 group relative flex flex-col items-center justify-center overflow-hidden
                      ${dragOverCage === cage.id && draggedCage?.id !== cage.id
                        ? 'border-biotech-accent bg-biotech-accent/10 scale-105'
                        : draggedCage?.id === cage.id
                          ? 'opacity-40 scale-95'
                          : cage.is_breeding_pair
                            ? 'bg-pink-500/10 border-pink-500/50 hover:border-pink-500 active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.1)]'
                            : hasAnimals
                              ? 'bg-white/5 border-white/20 hover:border-biotech-accent hover:bg-white/10 active:scale-95'
                              : 'bg-black/20 border-white/5 opacity-50 shadow-inner'
                      }
                      ${dimmed ? 'opacity-25' : ''}
                    `}
                  >
                    {cage.owner && (
                      <span className="absolute top-2 left-2.5 text-[9px] font-black" style={{ color: ownerColor }}>
                        {cage.owner.initials || cage.owner.username.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {/* Glow effect on hover */}
                    {(hasAnimals || cage.is_breeding_pair) && (
                      <div className={`absolute inset-0 transition-colors duration-500 ${cage.is_breeding_pair ? 'bg-pink-500/0 group-hover:bg-pink-500/10' : 'bg-biotech-accent/0 group-hover:bg-biotech-accent/5'}`}></div>
                    )}
                    
                    {/* Cage number: only when the cage is in use */}
                    {(hasAnimals || cage.is_breeding_pair) && cage.cage_number != null && (
                      <span className={`text-sm font-mono font-black transition-colors ${cage.is_breeding_pair ? 'text-pink-400/40 group-hover:text-pink-400' : 'text-white/20 group-hover:text-biotech-accent'}`}>
                        #{cage.cage_number}
                      </span>
                    )}

                    {hasAnimals && (
                      <div className={`
                        absolute top-3 right-3 w-3 h-3 rounded-full
                        ${cage.is_breeding_pair ? 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.6)]' : (allAlive ? 'bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.4)]')}
                      `}></div>
                    )}

                    {(hasAnimals || cage.is_breeding_pair) && (
                      <span className={`text-sm font-black group-hover:text-white mt-0.5 ${cage.is_breeding_pair ? 'text-pink-400/60' : 'text-white/40'}`}>
                        {cage.animals?.length || 0} anim.
                      </span>
                    )}

                    {/* Physical position: always visible when the cage is in use */}
                    {(hasAnimals || cage.is_breeding_pair) && (
                      <span className={`text-[11px] font-mono mt-0.5 transition-colors ${cage.is_breeding_pair ? 'text-pink-400/30 group-hover:text-pink-300/60' : 'text-white/15 group-hover:text-white/40'}`}>
                        {String.fromCharCode(64 + cage.column)}{cage.row}
                      </span>
                    )}

                    {/* Cage card, under the position */}
                    {(hasAnimals || cage.is_breeding_pair) && cage.card_id && (
                      <span title={`Cage card: ${cage.card_id}`}
                        className={`max-w-[90%] truncate px-1.5 mt-0.5 rounded text-[10px] font-mono font-bold border ${cage.is_breeding_pair ? 'text-pink-200/80 border-pink-400/30 bg-pink-500/10' : 'text-amber-100/80 border-amber-300/25 bg-amber-400/10'}`}>
                        {cage.card_id}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'river' ? (
          <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs font-mono text-white/40">
              {statsScope === 'all' ? 'Whole colony (all responsible users)' : `Your cages only${user?.full_name ? ` · ${user.full_name}` : ''}`}
            </span>
            {isAdmin && (
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                {[['mine', 'Mine'], ['all', 'Whole colony']].map(([v, t]) => (
                  <button key={v} onClick={() => setStatsScope(v)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${statsScope === v ? 'bg-biotech-accent text-biotech-blue' : 'text-white/40 hover:text-white'}`}>{t}</button>
                ))}
              </div>
            )}
          </div>
          <AgeRiverView data={statsData} />
          </>
        ) : viewMode === 'history' ? (
          /* History View */
          <div className="glass rounded-[3rem] p-12 animate-in slide-in-from-bottom-8 duration-500 min-h-[60vh]">
             <div className="flex items-center gap-4 mb-12">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-inner">
                  <Skull size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tighter uppercase italic text-red-400">DECOMMISSIONED RECORDS</h2>
                  <p className="text-white/30 text-[10px] font-mono font-bold uppercase tracking-[0.2em] mt-1">Historical Traceability Log</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-white/30 text-[10px] uppercase tracking-widest font-black">
                      <th className="px-6 py-4">Mark / ID</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Reason</th>
                      <th className="px-6 py-4">DOB</th>
                      <th className="px-6 py-4">Genotype</th>
                      <th className="px-6 py-4">Age</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.map((animal) => (
                      <tr key={animal.id} className="bg-white/5 border-l-4 border-red-500/50 hover:bg-white/10 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold">
                          <span className="text-white">{animal.mark}</span>
                          <span className="text-white/30 text-[10px] ml-2">#{animal.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border border-red-500/30 text-red-400 bg-red-500/10">
                            {animalStatusLabel(animal.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm italic text-white/80">{animal.elimination_reason || 'N/A'}</td>
                        <td className="px-6 py-4 text-xs font-mono text-white/40">{animal.dob}</td>
                        <td className="px-6 py-4 text-sm text-white/60">{animal.genotype}</td>
                        <td className="px-6 py-4 text-xs font-mono text-biotech-accent font-bold">{animal.age_display}</td>
                        <td className="px-6 py-4 text-xs font-mono text-white/50 whitespace-nowrap">{animal.status_changed_at ? animal.status_changed_at.slice(0, 10) : '—'}</td>
                        <td className="px-6 py-4 text-xs text-white/50 max-w-xs truncate" title={[animal.notes, animal.origin_cage && `Origin: ${animal.origin_cage}`, animal.external_id && `ID: ${animal.external_id}`].filter(Boolean).join(' · ')}>
                          {[animal.external_id, animal.notes].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        ) : (
          /* Statistics View */
          <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs font-mono text-white/40">
              {statsScope === 'all' ? 'Whole colony (all responsible users)' : `Your cages only${user?.full_name ? ` · ${user.full_name}` : ''}`}
            </span>
            {isAdmin && (
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                {[['mine', 'Mine'], ['all', 'Whole colony']].map(([v, t]) => (
                  <button key={v} onClick={() => setStatsScope(v)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${statsScope === v ? 'bg-biotech-accent text-biotech-blue' : 'text-white/40 hover:text-white'}`}>{t}</button>
                ))}
              </div>
            )}
          </div>
          <StatisticsDashboard data={statsData} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="p-8 flex items-center justify-between border-t border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-3 text-[10px] font-mono tracking-[0.2em] font-bold text-white/20 uppercase">
          <Activity size={12} className="text-green-500 animate-pulse" />
          <span>System Status: <span className="text-green-500">Online</span></span>
          <span className="px-2 opacity-50">|</span>
          <span>Connected to PostgreSQL</span>
          <span className="px-2 opacity-50">|</span>
          <span>FastAPI Backend Ready</span>
        </div>
        <div className="text-[10px] font-mono tracking-[0.2em] font-bold text-white/10 uppercase italic">
          Bioterio MVP System &copy; 2026 | Protocol Encl-A
        </div>
      </footer>

      {/* Add New Animal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="glass w-full max-w-xl rounded-[2.5rem] overflow-hidden border-white/20 animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tighter text-biotech-accent italic">
                {isEditing ? 'EDIT ANIMAL' : 'REGISTER ANIMAL'}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setIsEditing(false); setEditingAnimalId(null); setCageSearch(''); }}
                className="p-2 hover:bg-white/10 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddAnimal} className="p-8 grid grid-cols-2 gap-6">
              {/* Cage selector */}
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                  Cage <span className="text-biotech-accent">*</span>
                </label>
                {(() => {
                  // Only cages this user may put animals into (theirs, or empty and unassigned)
                  // Cages need no cage number: most only have a card (e.g. "CM: 060(C)") or just a position
                  const allCages = racks.flatMap(r => r.cages).filter(c => canModifyCage(c) || c.id === newAnimal.cage_id);
                  const selectedCageObj = allCages.find(c => c.id === newAnimal.cage_id);
                  const rackOf = (c) => racks.find(r => r.cages.some(rc => rc.id === c.id));
                  const pos = (c) => `${String.fromCharCode(64 + c.column)}${c.row}`;
                  const rackNo = (c) => (rackOf(c)?.name || '').replace(/\D/g, '');
                  const squash = (v) => String(v ?? '').toLowerCase().replace(/[\s:()-]/g, '');
                  const cageName = (c) => c.card_id || (c.cage_number != null ? `#${c.cage_number}` : pos(c));
                  const filtered = allCages.filter(c => {
                    const s = squash(cageSearch);
                    // "060c", "cm060", "b7", "b7r4", "rack 4", "29"
                    return !s || squash(c.card_id).includes(s) || String(c.cage_number ?? '') === s ||
                      squash(pos(c)).startsWith(s) || `${squash(pos(c))}r${rackNo(c)}`.startsWith(s) ||
                      squash(rackOf(c)?.name).includes(s);
                  }).slice(0, 60);
                  return (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={selectedCageObj
                          ? `${cageName(selectedCageObj)} — ${pos(selectedCageObj)} (${rackOf(selectedCageObj)?.name ?? ''})`
                          : 'Search by cage card, number or position (e.g. CM060, B7-R4)...'}
                        value={cageSearch}
                        onChange={e => { setCageSearch(e.target.value); setNewAnimal({...newAnimal, cage_id: null}); }}
                        className={`w-full bg-white/5 border rounded-xl px-4 py-3 outline-none transition-colors font-mono text-sm ${newAnimal.cage_id ? 'border-biotech-accent text-biotech-accent' : 'border-white/10 text-white'} focus:border-biotech-accent`}
                      />
                      {cageSearch && !newAnimal.cage_id && (
                        <div className="absolute z-10 top-full mt-1 w-full bg-[#0a0f1a] border border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-2xl">
                          {filtered.length === 0 && (
                            <div className="px-4 py-3 text-xs text-white/20 font-mono">No results</div>
                          )}
                          {filtered.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setNewAnimal({...newAnimal, cage_id: c.id}); setCageSearch(''); }}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-biotech-accent/10 transition-colors text-left"
                            >
                              <span className="text-sm font-black text-biotech-accent">{cageName(c)}</span>
                              <span className="text-xs font-mono text-white/40">
                                {pos(c)} — {rackOf(c)?.name ?? ''}
                              </span>
                              <span className="text-[10px] text-white/20">{c.animals?.length ?? 0} anim.</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Sex</label>
                <select value={newAnimal.sex} onChange={e => setNewAnimal({...newAnimal, sex: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono appearance-none">
                  <option value="M">MALE (M)</option>
                  <option value="F">FEMALE (F)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Date of Birth</label>
                <input required type="date" value={newAnimal.dob} onChange={e => setNewAnimal({...newAnimal, dob: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Ear Mark <span className="text-biotech-accent">*</span></label>
                <input required placeholder="e.g. R-EAR, L-EAR, LR-EAR" value={newAnimal.mark} onChange={e => setNewAnimal({...newAnimal, mark: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Genotype</label>
                <input required placeholder="WT / Cre-ERT2" value={newAnimal.genotype} onChange={e => setNewAnimal({...newAnimal, genotype: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Individual ID</label>
                <input placeholder="e.g. HF134" value={newAnimal.external_id} onChange={e => setNewAnimal({...newAnimal, external_id: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Origin cage</label>
                <input placeholder="Cage it came from" value={newAnimal.origin_cage} onChange={e => setNewAnimal({...newAnimal, origin_cage: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Notes / experiments</label>
                <textarea rows={2} placeholder="Samples, projects, observations" value={newAnimal.notes} onChange={e => setNewAnimal({...newAnimal, notes: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              
              <div className="col-span-2 mt-4 flex gap-4">
                 <button type="submit" className="flex-1 bg-biotech-accent text-biotech-blue font-black uppercase tracking-[0.2em] py-4 rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all">
                    {isEditing ? 'Update Records' : 'Register Subject'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal */}
      <CageModal 
        cage={selectedCage} 
        canModify={canModifyCage(selectedCage)}
        directory={directory}
        racks={racks}
        onClose={() => setSelectedCage(null)} 
        onUpdate={() => { loadRackDetails(); setSelectedCage(null); }}
        onAddAnimal={() => handleAddAnimalFromCage(selectedCage)}
        onEditAnimal={handleEditAnimal}
        onMergeStart={handleMergeStart}
        onShowFamily={setFamilyOf}
      />
      {familyOf !== undefined && <FamilyTreeModal animalId={familyOf} onClose={() => setFamilyOf(undefined)} />}
      {showColonyImport && (
        <ColonyImportModal directory={directory} onClose={() => setShowColonyImport(false)}
          onImported={() => { loadRackDetails(); loadStatistics(); }} />
      )}
      {/* Breeding Wizard Modal */}
      {showBreedingWizard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="glass w-full max-w-2xl rounded-3xl overflow-hidden border-pink-500/30 animate-in fade-in zoom-in duration-300">
            <div className="p-8 border-b border-white/10 bg-pink-500/5 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-pink-500 uppercase flex items-center gap-3">
                  <Activity size={24} />
                  Breeding Wizard: Step {breedingStep} of 3
                </h2>
                <p className="text-white/40 text-xs font-mono tracking-widest mt-1">ESTABLISHING GENETIC LINEAGE</p>
              </div>
              <button onClick={() => setShowBreedingWizard(false)} className="p-2 hover:bg-white/10 rounded-full text-white/40">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 max-h-[60vh] overflow-y-auto">
              {breedingStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-white/80">Select Breeding Type</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {['Pair', 'Trio'].map(type => (
                      <button
                        key={type}
                        onClick={() => setBreedingData({...breedingData, type})}
                        className={`p-8 rounded-2xl border-2 transition-all text-center group ${breedingData.type === type ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                      >
                        <div className={`text-3xl mb-2 ${breedingData.type === type ? 'text-pink-500' : 'text-white/20'}`}>
                          {type === 'Pair' ? '👫' : '👪'}
                        </div>
                        <div className={`font-black uppercase tracking-widest ${breedingData.type === type ? 'text-white' : 'text-white/40'}`}>
                          {type}
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 font-mono">
                          {type === 'Pair' ? '1 MALE + 1 FEMALE' : '1 MALE + 2 FEMALES'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {breedingStep === 2 && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-white/80">Select Animals ({breedingData.animalIds.length} selected)</h3>
                      {!isAdmin && <p className="text-[10px] font-mono text-white/30 mt-1">Only animals in your cages are listed. To use someone else's animal, ask them to hand the cage over.</p>}
                    </div>
                    <p className="text-[10px] font-mono text-pink-500/60 uppercase tracking-widest">
                      Required: {breedingData.type === 'Pair' ? '2' : '3'}
                    </p>
                  </div>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="SEARCH BY ID, MARK, GENOTYPE OR CAGE NUMBER (#12)..."
                      value={breedingSearch}
                      onChange={(e) => setBreedingSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-pink-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                    {(() => {
                      const q = breedingSearch.trim().toLowerCase();
                      // "#12", "cage 12" or "c12" search only by cage; a bare term also matches the cage exactly
                      const cageQuery = q.replace(/^(#|cage\s*|jaula\s*|c|j)(?=\s*\d)/, '').trim();
                      const cageOnly = cageQuery !== q;
                      const cageMatches = (c) => cageQuery !== '' && String(c.display_id).toLowerCase() === cageQuery;
                      const rows = racks.flatMap(r => r.cages).flatMap(c => (c.animals || []).map(a => ({ a, c })))
                        .filter(({ a }) => a.status === 'Vivo')
                        // Crosses only with your own animals (admins may use any)
                        .filter(({ c }) => isAdmin || isMine(c))
                        .filter(({ a, c }) => {
                          if (!q) return true;
                          if (cageOnly) return cageMatches(c);
                          return cageMatches(c) ||
                            String(a.id).includes(q) ||
                            (a.mark || '').toLowerCase().includes(q) ||
                            a.genotype.toLowerCase().includes(q);
                        })
                        // Animals living in the searched cage go first
                        .sort((x, y) => Number(cageMatches(y.c)) - Number(cageMatches(x.c)));
                      return rows;
                    })()
                      .map(({ a: animal, c: cage }) => {
                        const isSelected = breedingData.animalIds.includes(animal.id);
                        return (
                          <button
                            key={animal.id}
                            onClick={() => {
                              const newIds = isSelected 
                                ? breedingData.animalIds.filter(id => id !== animal.id)
                                : [...breedingData.animalIds, animal.id];
                              if (!isSelected && newIds.length > (breedingData.type === 'Pair' ? 2 : 3)) return;
                              setBreedingData({...breedingData, animalIds: newIds});
                            }}
                            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isSelected ? 'border-pink-500 bg-pink-500/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                          >
                            <div className="flex items-center gap-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${animal.sex === 'M' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>
                                {animal.sex}
                              </span>
                              <span className="font-mono text-sm text-white/80">#{animal.id} — {animal.mark}</span>
                              <span className="text-[10px] text-white/20 font-mono uppercase tracking-tighter">{animal.genotype}</span>
                              <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono font-black text-white/60">
                                Cage {cage.cage_number != null ? `#${cage.cage_number}` : cage.display_id}
                              </span>
                            </div>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,1)]"></div>}
                          </button>
                        );
                      })
                    }
                  </div>
                </div>
              )}

              {breedingStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-white/80">Select Target Cage</h3>
                  {(() => {
                    const rack = racks.find(r => r.id === breedingRackId) || racks[0];
                    const cages = [...(rack?.cages || [])].sort((a, b) => (a.row - b.row) || (a.column - b.column));
                    const nCols = Math.max(1, ...cages.map(c => c.column));
                    const target = racks.flatMap(r => r.cages.map(c => ({ c, r }))).find(({ c }) => c.id === breedingData.targetCageId);
                    return (
                      <>
                        {/* 1. Rack */}
                        <div className="flex flex-wrap gap-2">
                          {racks.map(r => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setBreedingRackId(r.id)}
                              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${r.id === rack?.id ? 'border-pink-500 bg-pink-500/20 text-pink-300' : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'}`}
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                        {/* 2. Position in the rack */}
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }}>
                          {cages.map(cage => {
                            const occupied = cage.animals?.length > 0 || !canModifyCage(cage);
                            const selected = breedingData.targetCageId === cage.id;
                            return (
                              <button
                                key={cage.id}
                                type="button"
                                onClick={() => setBreedingData({...breedingData, targetCageId: cage.id})}
                                title={occupied ? `${cage.animals.length} animals` : 'Empty'}
                                className={`h-11 rounded-lg border flex flex-col items-center justify-center transition-all ${selected ? 'border-pink-500 bg-pink-500/20' : occupied ? 'opacity-20 cursor-not-allowed border-white/5' : 'border-white/10 bg-white/5 hover:border-pink-400/60'}`}
                                disabled={occupied && !selected}
                              >
                                <span className="text-[9px] font-mono font-black text-white/60">{String.fromCharCode(64 + cage.column)}{cage.row}</span>
                                {cage.cage_number != null && <span className="text-[8px] font-mono text-white/30">#{cage.cage_number}</span>}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs font-mono text-white/40">
                          {target
                            ? <>Target: <span className="text-pink-300 font-black">{target.r.name} · {String.fromCharCode(64 + target.c.column)}{target.c.row}{target.c.cage_number != null ? ` (#${target.c.cage_number})` : ''}</span></>
                            : 'Choose a rack, then an empty position.'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="p-8 border-t border-white/10 bg-white/5 flex justify-between">
              <button
                onClick={() => setBreedingStep(s => s - 1)}
                disabled={breedingStep === 1}
                className="px-6 py-3 rounded-xl border border-white/10 text-white/40 font-black uppercase tracking-widest text-xs hover:bg-white/5 disabled:opacity-0 transition-all"
              >
                Back
              </button>
              
              {breedingStep < 3 ? (
                <button
                  onClick={() => setBreedingStep(s => s + 1)}
                  disabled={
                    (breedingStep === 2 && breedingData.animalIds.length < (breedingData.type === 'Pair' ? 2 : 3))
                  }
                  className="px-8 py-3 bg-biotech-accent text-biotech-blue rounded-xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const { createBreedingGroup } = await import('../../services/api');
                      await createBreedingGroup({
                        animal_ids: breedingData.animalIds,
                        target_cage_id: breedingData.targetCageId,
                        type: breedingData.type
                      });
                      alert('Breeding group established!');
                      setShowBreedingWizard(false);
                      loadRackDetails();
                      loadStatistics();
                    } catch (err) {
                      alert(err.message);
                    }
                  }}
                  disabled={!breedingData.targetCageId}
                  className="px-8 py-3 bg-pink-500 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(236,72,153,0.4)] disabled:opacity-30"
                >
                  Confirm Breeding
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
