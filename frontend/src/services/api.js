const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const fetchRacks = async () => {
  const res = await fetch(`${API_URL}/racks`);
  if (!res.ok) throw new Error('Failed to fetch racks');
  return res.json();
};

export const fetchRack = async (id) => {
  const res = await fetch(`${API_URL}/racks/${id}`);
  if (!res.ok) throw new Error('Failed to fetch rack details');
  return res.json();
};

export const updateAnimalStatus = async (animalId, status, reason = null) => {
  const res = await fetch(`${API_URL}/animals/${animalId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) throw new Error('Failed to update animal status');
  return res.json();
};

export const createAnimal = async (animalData) => {
  const res = await fetch(`${API_URL}/animals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(animalData),
  });
  if (!res.ok) throw new Error('Failed to create animal');
  return res.json();
};

export const fetchHistory = async () => {
  const res = await fetch(`${API_URL}/animals/history`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
};

export const fetchStatistics = async () => {
  const res = await fetch(`${API_URL}/statistics`);
  if (!res.ok) throw new Error('Failed to fetch statistics');
  return res.json();
};
export const updateAnimal = async (animalId, animalData) => {
  const res = await fetch(`${API_URL}/animals/${animalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(animalData),
  });
  if (!res.ok) throw new Error('Failed to update animal data');
  return res.json();
};

export const updateCageBreedingStatus = async (cageId, isBreedingPair) => {
  const res = await fetch(`${API_URL}/cages/${cageId}/breeding_status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_breeding_pair: isBreedingPair }),
  });
  if (!res.ok) throw new Error('Failed to update breeding status');
  return res.json();
};

export const importAnimals = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch(`${API_URL}/import/animals/csv`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to import CSV');
  return res.json();
};

export const createBreedingGroup = async (breedingData) => {
  const res = await fetch(`${API_URL}/breeding/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(breedingData),
  });
  if (!res.ok) throw new Error('Failed to create breeding group');
  return res.json();
};

export const endBreedingSession = async (cageId, endData) => {
  const res = await fetch(`${API_URL}/breeding/end/${cageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(endData),
  });
  if (!res.ok) throw new Error('Failed to end breeding session');
  return res.json();
};

export const mergeCages = async (sourceId, destId) => {
  const res = await fetch(`${API_URL}/cages/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_cage_id: sourceId, destination_cage_id: destId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to merge cages');
  }
  return res.json();
};
