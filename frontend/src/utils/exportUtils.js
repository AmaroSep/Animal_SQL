import * as XLSX from 'xlsx';

export const exportStatisticsToExcel = (data) => {
  if (!data || !data.live_animals || !data.genotypes) return;

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([]);

  const genotypes = Object.keys(data.genotypes).sort();
  const ageRanges = ["0-3m", "3-6m", "6-9m", ">9m"];

  let currentRow = 0;

  // 1. Main Population Stats Table (Genotype vs Age/Sex) - Animal Counts Only
  XLSX.utils.sheet_add_aoa(worksheet, [['POPULATION ANALYTICS (ANIMAL COUNTS)']], { origin: { r: currentRow, c: 0 } });
  currentRow++;

  // Multi-row header for MALE/FEMALE
  XLSX.utils.sheet_add_aoa(worksheet, [['Genotype', 'MALE (M)', '', '', '', '', 'FEMALE (F)', '', '', '', '', 'TOTAL']], { origin: { r: currentRow, c: 0 } });
  currentRow++;
  XLSX.utils.sheet_add_aoa(worksheet, [['', '0-3m', '3-6m', '6-9m', '>9m', 'TOT', '0-3m', '3-6m', '6-9m', '>9m', 'TOT', '']], { origin: { r: currentRow, c: 0 } });
  currentRow++;

  genotypes.forEach(gen => {
    const gData = data.genotypes[gen];
    const row = [
      gen,
      gData.M["0-3m"], gData.M["3-6m"], gData.M["6-9m"], gData.M[">9m"], gData.M.total,
      gData.F["0-3m"], gData.F["3-6m"], gData.F["6-9m"], gData.F[">9m"], gData.F.total,
      gData.total_genotype
    ];
    XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: { r: currentRow, c: 0 } });
    currentRow++;
  });

  currentRow += 3; // Gap between stats and details
  const detailsStartRow = currentRow;

  // 2. Horizontal Rack Grouping (Detailed Animals)
  
  // Helper to extract Rack name from Cage display ID (e.g. "A1-R3" -> "RACK 3")
  const getRackFromCage = (cageDisplay) => {
    if (!cageDisplay || !cageDisplay.includes('-R')) return 'UNASSIGNED';
    const parts = cageDisplay.split('-R');
    return `RACK ${parts[1]}`;
  };

  // Group animals by Rack
  const animalsByRack = data.live_animals.reduce((acc, a) => {
    const rack = getRackFromCage(a.cage);
    if (!acc[rack]) acc[rack] = [];
    acc[rack].push(a);
    return acc;
  }, {});

  const sortedRacks = Object.keys(animalsByRack).sort();
  let colOffset = 0;

  sortedRacks.forEach((rackName) => {
    let rowOffset = detailsStartRow;

    // Rack section header
    XLSX.utils.sheet_add_aoa(worksheet, [[rackName]], { origin: { r: rowOffset, c: colOffset } });
    rowOffset++;

    // Table Header
    XLSX.utils.sheet_add_aoa(worksheet, [['Cage', 'ID', 'Mark', 'Sex', 'Age', 'DOB', 'Genotype', 'Phenotype']], { origin: { r: rowOffset, c: colOffset } });
    rowOffset++;

    // Sort animals in this Rack by Cage
    const rackAnimalsSorted = animalsByRack[rackName].sort((a, b) => 
      (a.cage || '').localeCompare(b.cage || '')
    );

    let lastCage = null;
    rackAnimalsSorted.forEach(a => {
      const isNewCage = a.cage !== lastCage;
      const row = [
        isNewCage ? (a.cage || 'N/A') : '',
        a.id,
        a.mark,
        a.sex,
        a.age_display || `${a.months}m`,
        a.dob || 'N/A',
        a.genotype,
        '' // Phenotype (Empty for manual entry)
      ];
      XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: { r: rowOffset, c: colOffset } });
      rowOffset++;
      lastCage = a.cage;
    });

    colOffset += 9; // Space: 8 columns for data + 1 column gap
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, "Statistics");
  XLSX.writeFile(workbook, `Statistics_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};
