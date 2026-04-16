import React, { useState, useEffect } from 'react';
import CageModal from './components/CageModal';
import StatisticsDashboard from './components/StatisticsDashboard';
import { LayoutGrid, Database, Activity, RefreshCw, Plus, History, ChevronLeft, Skull, Trash2, BarChart3, X, Download, Upload } from 'lucide-react';
import { fetchRacks, fetchRack, createAnimal, fetchHistory, fetchStatistics, updateAnimal, importAnimals } from './services/api';

export default function App() {
  const [racks, setRacks] = useState([]);
  const [selectedRackId, setSelectedRackId] = useState(null);
  const [rackData, setRackData] = useState(null);
  const [selectedCage, setSelectedCage] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // V1.1 & V1.2 State
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid', 'history', or 'stats'
  const [historyData, setHistoryData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newAnimal, setNewAnimal] = useState({
    id: '', 
    sex: 'M', 
    dob: new Date().toISOString().split('T')[0], 
    mark: '', 
    genotype: '', 
    rack_id: '3', 
    cage_num: '1',
    status: 'Vivo'
  });
  const [originalId, setOriginalId] = useState(null);

  // V1.11 Breeding Wizard State
  const [showBreedingWizard, setShowBreedingWizard] = useState(false);
  const [breedingStep, setBreedingStep] = useState(1);
  const [breedingData, setBreedingData] = useState({
    type: 'Pair',
    animalIds: [],
    targetCageId: null
  });
  const [breedingSearch, setBreedingSearch] = useState('');

  // V1.3 Merge Mode State
  const [mergeSource, setMergeSource] = useState(null);
  const [isMergeMode, setIsMergeMode] = useState(false);

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
      const data = await fetchStatistics();
      setStatsData(data);
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  };

  const handleAddAnimal = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await updateAnimal(originalId, {
          id: newAnimal.id,
          sex: newAnimal.sex,
          dob: newAnimal.dob,
          mark: newAnimal.mark,
          genotype: newAnimal.genotype
        });
        alert('Animal updated successfully');
      } else {
        const cageId = (parseInt(newAnimal.rack_id) - 3) * 70 + parseInt(newAnimal.cage_num);
        await createAnimal({
          id: newAnimal.id,
          sex: newAnimal.sex,
          dob: newAnimal.dob,
          mark: newAnimal.mark,
          genotype: newAnimal.genotype,
          cage_id: cageId
        });
        alert('Animal added successfully');
      }
      setShowAddModal(false);
      setIsEditing(false);
      setOriginalId(null);
      loadRackDetails();
    } catch (err) {
      console.error(err);
      alert(isEditing ? 'Error updating animal' : 'Error adding animal');
    }
  };

  const handleEditAnimal = (animal) => {
    // Determine physical rack_id and cage_num from DB data
    // DB cage_id is used to calculate these if not already in animal object
    // But calculate_age_display logic in backend already sends expanded info usually?
    // Let's assume onEditAnimal(animal) passes the animal object from the cage list
    
    // Physical rack_id = 3, 4, or 5
    // We need to find which rack this animal belongs to
    // Rack info is in rackData since the modal is open
    const physicalRackId = rackData.id + 2;
    
    setNewAnimal({
      id: animal.id,
      sex: animal.sex,
      dob: animal.dob,
      mark: animal.mark,
      genotype: animal.genotype,
      rack_id: physicalRackId.toString(),
      cage_num: ((selectedCage.row - 1) * 7 + selectedCage.column).toString(),
      status: animal.status
    });
    setOriginalId(animal.id);
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleAddAnimalFromCage = (cage) => {
    // rack_id in newAnimal should be physical (3, 4, 5)
    // DB rack_id is 1, 2, 3 for Racks 3, 4, 5 respectively
    const rackNum = cage.rack_id + 2; 
    // cage_num is (row-1)*7 + col
    const cageNum = (cage.row - 1) * 7 + cage.column;
    
    setNewAnimal({
      ...newAnimal,
      rack_id: rackNum.toString(),
      cage_num: cageNum.toString(),
      id: '' // Clear ID for new entry
    });
    setSelectedCage(null); // Close cage modal first
    setShowAddModal(true);
  };

  const handleExportCSV = () => {
    // Open the backend CSV export link in a new tab for download
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    window.open(`${apiUrl}/export/animals/csv`, '_blank');
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      setLoading(true);
      const result = await importAnimals(file);
      alert(`Import Successful!\nUpdated: ${result.updated}\nCreated: ${result.created}`);
      loadRackDetails();
      loadStatistics();
    } catch (err) {
      console.error(err);
      alert('Error importing CSV: ' + err.message);
    } finally {
      setLoading(false);
      // Reset input
      e.target.value = '';
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
      const { mergeCages } = await import('./services/api');
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
    if (viewMode === 'stats') loadStatistics();
  }, [viewMode]);

  return (
    <div className="min-h-screen selection:bg-biotech-accent selection:text-biotech-blue flex flex-col">
      {/* Header */}
      <header className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8 max-w-screen-2xl mx-auto w-full">
        <div>
          <h1 className="text-4xl font-black tracking-[ -0.05em] flex items-center gap-3">
            <span className="bg-biotech-accent text-biotech-blue px-2 py-0.5 rounded italic">BIOTERIO</span>
            <span className="text-white">MANAGEMENT</span>
            <span className="text-biotech-accent/40 font-mono text-sm align-super">V1.3</span>
          </h1>
          <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase mt-2">Experimental Enclave Protocol Alpha</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => setShowAddModal(true)}
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
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/40 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-transparent shadow-inner group"
          >
            <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
            Export CSV
          </button>

          <label className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/40 hover:bg-biotech-accent hover:text-biotech-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-transparent shadow-inner group cursor-pointer">
            <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform" />
            Import CSV
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleImportCSV} 
            />
          </label>

          <button 
            onClick={() => {
              setBreedingData({ type: 'Pair', animalIds: [], targetCageId: null });
              setBreedingStep(1);
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
      <main className="flex-1 px-8 pb-8 max-w-screen-2xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[60vh] animate-pulse-soft">
            <RefreshCw className="animate-spin text-biotech-accent mb-6" size={48} />
            <span className="font-mono text-xs tracking-[0.5em] text-white/30 uppercase italic">Processing neural link...</span>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="glass rounded-[3rem] p-12 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-biotech-accent/5 blur-[120px] rounded-full -mr-64 -mt-64 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8">
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

            {/* Grid 10x7 */}
            <div className="grid grid-cols-7 gap-4 perspective-1000">
              {rackData?.cages.sort((a,b) => (a.row - b.row) || (a.column - b.column)).map(cage => {
                const hasAnimals = cage.animals?.length > 0;
                const allAlive = cage.animals?.every(a => a.status === 'Vivo');
                
                return (
                  <button
                    key={cage.id}
                    onClick={() => {
                      if (isMergeMode) {
                        handleMergeConfirm(cage);
                      } else {
                        setSelectedCage(cage);
                      }
                    }}
                    className={`
                      aspect-square rounded-2xl border transition-all duration-300 group relative flex flex-col items-center justify-center overflow-hidden
                      ${cage.is_breeding_pair 
                        ? 'bg-pink-500/10 border-pink-500/50 hover:border-pink-500 active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.1)]'
                        : hasAnimals 
                          ? 'bg-white/5 border-white/20 hover:border-biotech-accent hover:bg-white/10 active:scale-95' 
                          : 'bg-black/20 border-white/5 opacity-50 cursor-default shadow-inner'
                      }
                    `}
                  >
                    {/* Glow effect on hover */}
                    {(hasAnimals || cage.is_breeding_pair) && (
                      <div className={`absolute inset-0 transition-colors duration-500 ${cage.is_breeding_pair ? 'bg-pink-500/0 group-hover:bg-pink-500/10' : 'bg-biotech-accent/0 group-hover:bg-biotech-accent/5'}`}></div>
                    )}
                    
                    <span className={`text-[10px] font-mono font-black transition-colors ${cage.is_breeding_pair ? 'text-pink-400/40 group-hover:text-pink-400' : 'text-white/20 group-hover:text-biotech-accent'}`}>
                      {cage.display_id}
                    </span>
                    
                    {hasAnimals && (
                      <div className={`
                        absolute top-3 right-3 w-3 h-3 rounded-full
                        ${cage.is_breeding_pair ? 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.6)]' : (allAlive ? 'bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.4)]')}
                      `}></div>
                    )}

                    {(hasAnimals || cage.is_breeding_pair) && (
                      <span className={`text-xs font-black group-hover:text-white mt-1 ${cage.is_breeding_pair ? 'text-pink-400/60' : 'text-white/40'}`}>
                        {cage.animals?.length || 0}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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
                      <th className="px-6 py-4">ANIMAL ID</th>
                      <th className="px-6 py-4">STATUS</th>
                      <th className="px-6 py-4">REASON</th>
                      <th className="px-6 py-4">DOB</th>
                      <th className="px-6 py-4">MARK</th>
                      <th className="px-6 py-4">GENOTYPE</th>
                      <th className="px-6 py-4">AGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.map((animal) => (
                      <tr key={animal.id} className="bg-white/5 border-l-4 border-red-500/50 hover:bg-white/10 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold">{animal.id}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border border-red-500/30 text-red-400 bg-red-500/10">
                            {animal.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm italic text-white/80">{animal.elimination_reason || 'N/A'}</td>
                        <td className="px-6 py-4 text-xs font-mono text-white/40">{animal.dob}</td>
                        <td className="px-6 py-4 text-xs font-mono text-white/40">{animal.mark}</td>
                        <td className="px-6 py-4 text-sm text-white/60">{animal.genotype}</td>
                        <td className="px-6 py-4 text-xs font-mono text-biotech-accent font-bold">{animal.age_display}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        ) : (
          /* Statistics View */
          <StatisticsDashboard data={statsData} />
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
                {isEditing ? 'MODIFY EXPERIMENT SUBJECT' : 'ADD NEW EXPERIMENT SUBJECT'}
              </h2>
              <button 
                onClick={() => { setShowAddModal(false); setIsEditing(false); setOriginalId(null); }} 
                className="p-2 hover:bg-white/10 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddAnimal} className="p-8 grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Rack Number (3-5)</label>
                <input required type="number" min="3" max="5" value={newAnimal.rack_id} onChange={e => setNewAnimal({...newAnimal, rack_id: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Cage ID (1-70)</label>
                <input required type="number" min="1" max="70" value={newAnimal.cage_num} onChange={e => setNewAnimal({...newAnimal, cage_num: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Animal ID</label>
                <input required placeholder="MOUSE-XXX" value={newAnimal.id} onChange={e => setNewAnimal({...newAnimal, id: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
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
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Mark</label>
                <input placeholder="R-EAR" value={newAnimal.mark} onChange={e => setNewAnimal({...newAnimal, mark: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Genotype</label>
                <input required placeholder="WT / Cre-ERT2" value={newAnimal.genotype} onChange={e => setNewAnimal({...newAnimal, genotype: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-biotech-accent transition-colors font-mono" />
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
        onClose={() => setSelectedCage(null)} 
        onUpdate={() => { loadRackDetails(); setSelectedCage(null); }}
        onAddAnimal={() => handleAddAnimalFromCage(selectedCage)}
        onEditAnimal={handleEditAnimal}
        onMergeStart={handleMergeStart}
      />
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
                    <h3 className="text-lg font-bold text-white/80">Select Animals ({breedingData.animalIds.length} selected)</h3>
                    <p className="text-[10px] font-mono text-pink-500/60 uppercase tracking-widest">
                      Required: {breedingData.type === 'Pair' ? '2' : '3'}
                    </p>
                  </div>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="SEARCH BY ANIMAL ID OR GENOTYPE..."
                      value={breedingSearch}
                      onChange={(e) => setBreedingSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-pink-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                    {racks.flatMap(r => r.cages).flatMap(c => c.animals)
                      .filter(a => a.status === 'Vivo')
                      .filter(a => 
                        a.id.toLowerCase().includes(breedingSearch.toLowerCase()) || 
                        a.genotype.toLowerCase().includes(breedingSearch.toLowerCase())
                      )
                      .map(animal => {
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
                              <span className="font-mono text-sm text-white/80">{animal.id}</span>
                              <span className="text-[10px] text-white/20 font-mono uppercase tracking-tighter">
                                {animal.genotype} • {racks.find(r => r.cages.some(c => c.id === animal.cage_id))?.cages.find(c => c.id === animal.cage_id)?.display_id}
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
                  <div className="grid grid-cols-7 gap-2">
                    {rackData?.cages.map(cage => (
                      <button
                        key={cage.id}
                        onClick={() => setBreedingData({...breedingData, targetCageId: cage.id})}
                        className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-all ${breedingData.targetCageId === cage.id ? 'border-pink-500 bg-pink-500/20' : cage.animals?.length > 0 ? 'opacity-20 cursor-not-allowed' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                        disabled={cage.animals?.length > 0 && breedingData.targetCageId !== cage.id}
                      >
                        <span className="text-[8px] font-mono font-black text-white/30">{cage.display_id}</span>
                      </button>
                    ))}
                  </div>
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
                      const { createBreedingGroup } = await import('./services/api');
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
