import * as XLSX from 'xlsx';

// The lab's shared colony workbook ("BCM Colony" layout):
//   Breeders  — Wean Date | BCM Cage | Animal Code | ID | DOB | Sex | Genotype | Age (W) | Age (M) | Parents | Parents | Responsible | Elimination Reason
//   Colony    — Cage Position | BCM Cage | Animal Code | ID | DOB | Sex | Genotype | Age | Status | Parents | Parents2 | Responsible | Elimination Reason
// A cage's position and card are written on its first animal's row only.

const COLONY_HEADER = ['Cage Position', 'BCM Cage', 'Animal Code', 'ID', 'DOB', 'Sex', 'Genotype', 'Age', 'Status', 'Parents', 'Parents2', 'Responsible', 'Elimination Reason'];
const BREEDERS_HEADER = ['Wean Date', 'BCM Cage', 'Animal Code', 'ID', 'DOB', 'Sex', 'Genotype', 'Age (W)', 'Age (M)', 'Parents', 'Parents', 'Responsible', 'Elimination Reason'];

const norm = (v) => String(v ?? '').trim().toLowerCase();
const clean = (v) => {
  const s = String(v ?? '').trim();
  return s && !s.startsWith('#') ? s : null; // "#REF!" and friends are broken formulas
};

const toISO = (v) => {
  if (v instanceof Date && !isNaN(v)) {
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  if (typeof v === 'number') { // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // US month/day/year
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
};

// "Rack 5: D4", "Rack 5, D3", "Rack5 4D" -> { rack: 5, column: 'D', row: 4 }
export const parsePosition = (text) => {
  const m = String(text ?? '').match(/rack\s*(\d+)\s*[:,]?\s*(?:([A-Ga-g])\s*(\d{1,2})|(\d{1,2})\s*([A-Ga-g]))\b/i);
  if (!m) return null;
  return { rack: Number(m[1]), column: (m[2] || m[5]).toUpperCase(), row: Number(m[3] || m[4]) };
};

// Read the workbook into import rows. Returns { rows, warnings }.
export function parseColonyWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const rows = [];
  const warnings = [];
  const breeders = new Map(); // animal code -> { wean_date }

  wb.SheetNames.forEach((name) => {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    let section = null;
    let cols = null;
    let cage = { pos: null, card: null };
    grid.forEach((line, i) => {
      const cells = line.map(norm);
      if (cells.includes('animal code') && (cells.includes('cage position') || cells.includes('wean date'))) {
        section = cells.includes('cage position') ? 'colony' : 'breeders';
        cols = {};
        cells.forEach((c, j) => {
          const key = c === 'parents' && cols.parents !== undefined ? 'parents2' : c;
          if (c && cols[key] === undefined) cols[key] = j;
        });
        cage = { pos: null, card: null };
        return;
      }
      if (!section || !cols) return;
      const get = (k) => (cols[k] !== undefined ? line[cols[k]] : null);
      const code = clean(get('animal code'));
      const mark = clean(get('id'));
      if (!code && !mark && !clean(get('dob'))) return; // blank or title row
      if (section === 'breeders') {
        if (code) breeders.set(code, { wean_date: toISO(get('wean date')) });
        return;
      }
      if (clean(get('cage position'))) {
        cage = { pos: parsePosition(get('cage position')), card: clean(get('bcm cage')) };
        if (!cage.pos) warnings.push(`${name} row ${i + 1}: cannot read cage position "${get('cage position')}"`);
      } else if (clean(get('bcm cage'))) {
        cage = { ...cage, card: clean(get('bcm cage')) };
      }
      rows.push({
        line: i + 1,
        rack: cage.pos?.rack ?? null, row: cage.pos?.row ?? null, column: cage.pos?.column ?? null,
        cage_card: cage.card,
        animal_code: code, mark, dob: toISO(get('dob')), sex: clean(get('sex')),
        genotype: clean(get('genotype')), status: clean(get('status')),
        parent_1: clean(get('parents')), parent_2: clean(get('parents2')),
        responsible: clean(get('responsible')), elimination_reason: clean(get('elimination reason')),
      });
    });
  });
  // Breeders section only flags breeding cages and adds the wean date
  rows.forEach((r) => {
    const b = r.animal_code && breeders.get(r.animal_code);
    if (b) { r.breeder = true; r.wean_date = b.wean_date; }
  });
  return { rows, warnings };
}

// "2m 4d" -> "2m,4d" (age in months and days, as the lab writes it)
const ageText = (a) => (a.age_display ? a.age_display.replace(' ', ',') : '');

// Write animals (from GET /animals/export) in the same layout.
export function exportColonyWorkbook(animals, title = 'Colony') {
  const byPos = (a, b) => (a.rack ?? 99) - (b.rack ?? 99) || (a.row ?? 99) - (b.row ?? 99)
    || String(a.column).localeCompare(String(b.column)) || String(a.animal_code ?? a.id).localeCompare(String(b.animal_code ?? b.id), undefined, { numeric: true });
  const alive = animals.filter((a) => a.status === 'Alive').sort(byPos);
  const removed = animals.filter((a) => a.status !== 'Alive').sort((a, b) => String(b.status_date).localeCompare(String(a.status_date)));
  const date = (v) => (v ? new Date(`${v}T00:00:00`) : '');

  const aoa = [[`${title} — exported ${new Date().toLocaleDateString()}`], [], ['Breeders'], BREEDERS_HEADER];
  alive.filter((a) => a.breeding).forEach((a) => aoa.push([
    date(a.wean_date), a.cage_card || '', a.animal_code || '', a.mark || '', date(a.dob), a.sex || '', a.genotype || '',
    a.age_weeks ?? '', a.age_months ?? '', a.parent_1 || '', a.parent_2 || '', a.responsible || '', a.elimination_reason || '',
  ]));
  aoa.push([], ['Colony'], COLONY_HEADER);
  let lastCage = null;
  alive.forEach((a) => {
    const key = `${a.rack}-${a.row}-${a.column}`;
    const first = key !== lastCage;
    lastCage = key;
    aoa.push([first ? a.position || '' : '', first ? a.cage_card || '' : '', a.animal_code || '', a.mark || '', date(a.dob),
      a.sex || '', a.genotype || '', ageText(a), a.status, a.parent_1 || '', a.parent_2 || '',
      first ? a.responsible || '' : '', '']);
  });
  if (removed.length) {
    aoa.push([]);
    removed.forEach((a) => aoa.push(['', a.cage_card || '', a.animal_code || '', a.mark || '', date(a.dob), a.sex || '', a.genotype || '',
      ageText(a), a.status, a.parent_1 || '', a.parent_2 || '', a.responsible || '',
      [a.elimination_reason, a.status_date].filter(Boolean).join(' · ')]));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd' });
  sheet['!cols'] = [14, 16, 14, 8, 12, 6, 22, 8, 12, 14, 14, 18, 40].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
  XLSX.writeFile(book, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
