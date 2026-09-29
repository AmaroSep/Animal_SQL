// Physical layouts of the grid boxes (must match backend routers/em_grids.py).
//
// Both commercial boxes have two halves separated by a central letter strip.
// The left half is printed rotated 180°, so its rows run bottom→top and its
// columns right→left. Each half is described as the box is seen from above:
// `rows` top→bottom, `cols` left→right, and `hasSlot(row, col)`.

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const QUANTIFOIL_ODD_ROWS = 'ACEGILNPRT';
// Staggered (diamond) slots: every row holds only odd or only even columns.
const quantifoilSlot = (row, col) => (col % 2 === 1) === QUANTIFOIL_ODD_ROWS.includes(row);

const LAYOUTS = {
  Quantifoil: {
    halves: [
      { rows: [...'TSRQPONMLK'], cols: range(1, 10).reverse(), hasSlot: quantifoilSlot },
      { rows: [...'ABCDEFGHIJ'], cols: range(1, 10), hasSlot: quantifoilSlot },
    ],
  },
  EMS: {
    halves: [
      { rows: [...'EDCBA'], cols: range(6, 10).reverse(), hasSlot: () => true },
      { rows: [...'ABCDE'], cols: range(1, 5), hasSlot: () => true },
    ],
  },
};

export const FIXED_LAYOUT_TYPES = Object.keys(LAYOUTS);

export function getLayout(box) {
  if (LAYOUTS[box.box_type]) return LAYOUTS[box.box_type];
  const rows = box.row_labels.split(',').map((r) => r.trim()).filter(Boolean);
  return { halves: [{ rows, cols: range(1, parseInt(box.columns, 10) || 0), hasSlot: () => true }] };
}

// Valid positions in reading order (A1, A2, … then B…), for selects.
export function getPositions(box) {
  const set = new Set();
  getLayout(box).halves.forEach((h) =>
    h.rows.forEach((r) => h.cols.forEach((c) => h.hasSlot(r, c) && set.add(`${r}${c}`)))
  );
  const split = (p) => [p.match(/^\D+/)[0], parseInt(p.match(/\d+$/)[0], 10)];
  return [...set].sort((a, b) => {
    const [ra, ca] = split(a);
    const [rb, cb] = split(b);
    return ra === rb ? ca - cb : ra.localeCompare(rb);
  });
}
