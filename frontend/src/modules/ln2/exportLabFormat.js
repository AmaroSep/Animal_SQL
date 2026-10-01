import * as XLSX from 'xlsx';

// Rebuilds "Rack N_CLR lab_LN2 tank.xlsx": one sheet per box, 81 wells, the same
// columns the lab has always used. Only vials still in the tank are listed.

const HEADER = ['Well ', 'Row', 'Cells', 'Protein expression', 'Culture method', 'Date of frozen', 'Comment (passage #)', 'Additional comment'];
const MASTER_NOTE = "Please don't thaw, save as master stock";

const usDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

const freezeText = (v) => {
  if (!v.freeze_date) return v.freeze_note || '';
  return [usDate(v.freeze_date), v.frozen_by].filter(Boolean).join(' ');
};

const commentText = (v) => {
  const parts = [v.comment];
  // Cells per vial has no column in the sheet: add it to the comment unless already there
  if (v.cells_per_vial && !(v.comment || '').includes(v.cells_per_vial)) parts.push(`${v.cells_per_vial} cells/vial`);
  return parts.filter(Boolean).join(', ');
};

const additionalText = (v) => {
  const parts = [v.additional_comment];
  if (v.master_stock && !/master stock|don.t thaw|do not thaw/i.test(v.additional_comment || '')) parts.push(MASTER_NOTE);
  return parts.filter(Boolean).join('; ');
};

export function exportRackToExcel(rack, boxesWithVials) {
  const book = XLSX.utils.book_new();
  boxesWithVials.forEach((box) => {
    const byWell = {};
    box.vials.filter((v) => v.status === 'In tank').forEach((v) => { byWell[v.well] = v; });

    const aoa = [
      [box.restriction || ''],
      [''],
      [''],
      HEADER,
    ];
    for (let well = 1; well <= box.rows * box.columns; well++) {
      const v = byWell[well];
      const row = Math.ceil(well / box.columns);
      aoa.push(v
        ? [well, row, v.cell_line, v.protein_expression || '', v.culture_method || '', freezeText(v), commentText(v), additionalText(v)]
        : [well, row]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = [6, 5, 32, 22, 28, 16, 36, 40].map((wch) => ({ wch }));
    // Sheet names are limited to 31 characters: fall back to "2-3, <label>" for long labels
    const prefix = `${rack.number}-${box.number}, `;
    let name = `${prefix}rack ${rack.number} box ${box.number}${box.label ? ` (${box.label})` : ''}`;
    if (name.length > 31) name = `${prefix}${box.label}`;
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  });
  XLSX.writeFile(book, `Rack ${rack.number}_CLR lab_LN2 tank.xlsx`);
}
