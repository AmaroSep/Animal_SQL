import * as XLSX from 'xlsx';
import { today, compressWells } from '../storage/shared';

// Excel inventory of one or all -80 freezers, meant for sharing:
//  - Inventory: one row per tube in the freezer, with its full location
//  - Summary: tubes per sample and where they are
//  - one sheet per box with the physical grid (sample name in each position)
//  - History: used / discarded tubes
//  - one sheet per sample type in that type's own columns (the same layout the
//    import reads back: fields, Name on Tube, Aliquot #, ..., Location in Box)

const locKey = (l) => [l.freezer, l.compartment, l.rack, l.level, l.slot];
const cmpLoc = (a, b) => {
  const ka = locKey(a.location);
  const kb = locKey(b.location);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return a.well - b.well;
};
export const shortLocation = (l) => `${l.freezer} · C${l.compartment} · R${l.rack} · L${l.level} · P${l.slot}`;

const tubeRow = (t) => ({
  Freezer: t.location.freezer,
  Room: t.location.room ?? '',
  Compartment: t.location.compartment_name ? `${t.location.compartment} (${t.location.compartment_name})` : t.location.compartment,
  Rack: t.location.rack,
  Level: t.location.level,
  'Position (1 = front)': t.location.slot,
  Box: t.box_label ?? '',
  Well: t.well,
  Sample: t.sample_name,
  Type: t.sample_type ?? '',
  'Aliquot #': t.aliquot_number ?? '',
  Source: t.source ?? '',
  Concentration: t.concentration ?? '',
  Volume: t.volume ?? '',
  'Frozen date': t.frozen_date ?? '',
  'Frozen by': t.frozen_by ?? '',
  Reserved: t.reserved ? 'Yes' : '',
  Comment: t.comment ?? '',
});

const sheetName = (name, used) => {
  let base = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  let n = 2;
  while (used.has(base)) base = `${name.slice(0, 27)} (${n++})`;
  used.add(base);
  return base;
};

// "50 µL" -> 50 (the lab's "Aliquot size (ul)" column); anything else as written
const microlitres = (v) => {
  const m = String(v ?? '').match(/^\s*([\d.]+)\s*(µl|ul|μl)?\s*$/i);
  return m ? Number(m[1]) : v ?? '';
};

const typeRow = (t, fields, boxesById) => {
  const row = {};
  fields.forEach((f) => { row[f.label] = t.data?.[f.key] ?? ''; });
  const b = boxesById[t.box_id];
  const l = t.location;
  return {
    ...row,
    Type: t.sample_type ?? '',
    'Name on Tube': t.sample_name,
    'Aliquot #': t.aliquot_number ?? '',
    'Aliquot size (ul)': microlitres(t.volume),
    'Date received': t.frozen_date ?? '',
    'Frozen by': t.frozen_by ?? '',
    Freezer: l.freezer,
    Compartment: l.compartment_name ? `${l.compartment} (${l.compartment_name})` : l.compartment,
    Rack: l.rack,
    Level: l.level,
    Depth: l.slot === 1 ? '1 (Front)' : l.slot,
    'Box Name': t.box_label ?? '',
    'Location in Box': b ? `${Math.floor((t.well - 1) / b.columns) + 1}-${((t.well - 1) % b.columns) + 1}` : t.well,
    Status: t.status,
    Notes: t.comment ?? '',
  };
};

export function exportM80Inventory(freezers, tubes, freezerId = null, types = [], canSee = true) {
  const scope = freezerId ? freezers.filter((f) => f.id === freezerId) : freezers;
  const names = new Set(scope.map((f) => f.name));
  const mine = tubes.filter((t) => names.has(t.location.freezer));
  const inFreezer = mine.filter((t) => t.status === 'In freezer').sort(cmpLoc);
  const removed = mine.filter((t) => t.status !== 'In freezer').sort(cmpLoc);

  const book = XLSX.utils.book_new();
  const used = new Set();
  const addSheet = (name, sheet) => XLSX.utils.book_append_sheet(book, sheet, sheetName(name, used));

  const inv = XLSX.utils.json_to_sheet(inFreezer.length ? inFreezer.map(tubeRow) : [{ Freezer: 'No tubes stored' }]);
  inv['!cols'] = [14, 10, 12, 6, 6, 10, 14, 6, 30, 16, 16, 12, 10, 12, 9, 9, 40].map((wch) => ({ wch }));
  addSheet('Inventory', inv);

  const bySample = {};
  inFreezer.forEach((t) => {
    const g = (bySample[t.sample_name] ??= { types: new Set(), count: 0, boxes: {} });
    if (t.sample_type) g.types.add(t.sample_type);
    g.count += 1;
    (g.boxes[shortLocation(t.location)] ??= []).push(t.well);
  });
  const summary = Object.entries(bySample).sort(([a], [b]) => a.localeCompare(b)).map(([name, g]) => ({
    Sample: name,
    Type: [...g.types].join(', '),
    Tubes: g.count,
    Locations: Object.entries(g.boxes).map(([loc, wells]) => `${loc}: ${compressWells(wells)}`).join(' | '),
  }));
  const sum = XLSX.utils.json_to_sheet(summary.length ? summary : [{ Sample: 'No tubes stored' }]);
  sum['!cols'] = [34, 18, 7, 90].map((wch) => ({ wch }));
  addSheet('Summary', sum);

  // Box maps, in physical order
  const tubesByBox = {};
  inFreezer.forEach((t) => { (tubesByBox[t.box_id] ??= {})[t.well] = t; });
  scope.forEach((f) => f.compartments.forEach((c) => c.racks.forEach((r) => r.boxes.forEach((b) => {
    const loc = `${f.name} C${c.number} R${r.number} L${b.level} P${b.slot}`;
    const title = `${f.name}${f.room ? ` (${f.room})` : ''} · Compartment ${c.number}${c.name ? ` ${c.name}` : ''} · Rack ${r.number} · Level ${b.level} · Position ${b.slot}${b.label ? ` · ${b.label}` : ''}`;
    const aoa = [[title], [], ['', ...Array.from({ length: b.columns }, (_, i) => i + 1)]];
    for (let row = 0; row < b.rows; row++) {
      const line = [String.fromCharCode(65 + row)];
      for (let col = 1; col <= b.columns; col++) {
        const well = row * b.columns + col;
        const t = tubesByBox[b.id]?.[well];
        line.push(t ? `${well}: ${t.sample_name}` : well);
      }
      aoa.push(line);
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = [{ wch: 3 }, ...Array.from({ length: b.columns }, () => ({ wch: 16 }))];
    addSheet(loc, sheet);
  }))));

  // One sheet per sample type, in the import layout (restricted fields only for users who may see them)
  const boxesById = {};
  scope.forEach((f) => f.compartments.forEach((c) => c.racks.forEach((r) => r.boxes.forEach((b) => { boxesById[b.id] = b; }))));
  types.forEach((type) => {
    // Used / discarded aliquots too, so the sheet can be imported back as it is
    const ofType = [...inFreezer, ...removed].filter((t) => t.sample_type_id === type.id).sort(cmpLoc);
    if (!ofType.length) return;
    const fields = type.fields.filter((f) => canSee || !f.restricted);
    const sheet = XLSX.utils.json_to_sheet(ofType.map((t) => typeRow(t, fields, boxesById)));
    addSheet(`${type.name} samples`, sheet);
  });

  if (removed.length) {
    const hist = XLSX.utils.json_to_sheet(removed.map((t) => ({
      ...tubeRow(t), Status: t.status, 'Removed on': t.removed_date ?? '', 'Removed by': t.removed_by ?? '', Note: t.removed_note ?? '',
    })));
    addSheet('History', hist);
  }

  const label = freezerId ? scope[0]?.name ?? 'freezer' : 'all';
  XLSX.writeFile(book, `-80_inventory_${label.replace(/\s+/g, '_')}_${today()}.xlsx`);
}
