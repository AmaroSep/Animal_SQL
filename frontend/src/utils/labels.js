// Status values are stored in Spanish (database, API and CSV format).
// These maps give the English labels shown in the UI.

export const ANIMAL_STATUS_LABELS = {
  Vivo: 'Alive',
  Muerto: 'Dead',
  Eliminado: 'Eliminated',
};

export const GRID_STATUS_LABELS = {
  Almacenada: 'Stored',
  Imageada: 'Imaged',
  Usada: 'Used',
  Descartada: 'Discarded',
};

export const animalStatusLabel = (status) => ANIMAL_STATUS_LABELS[status] ?? status;
export const gridStatusLabel = (status) => GRID_STATUS_LABELS[status] ?? status;
