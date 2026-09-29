const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Helpers ────────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    let detail = 'Request failed';
    try { detail = (await res.json()).detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ── Bioterio: Racks & Cages ────────────────────────────────────────────────

export const fetchRacks = () => request('/racks');
export const fetchRack = (id) => request(`/racks/${id}`);
export const updateCageBreedingStatus = (cageId, isBreedingPair) =>
  request(`/cages/${cageId}/breeding_status`, json('PATCH', { is_breeding_pair: isBreedingPair }));
export const mergeCages = (sourceId, destId) =>
  request('/cages/merge', json('POST', { source_cage_id: sourceId, destination_cage_id: destId }));

// ── Bioterio: Animals ──────────────────────────────────────────────────────

export const createAnimal = (data) => request('/animals', json('POST', data));
export const updateAnimal = (id, data) => request(`/animals/${id}`, json('PUT', data));
export const updateAnimalStatus = (id, status, reason = null) =>
  request(`/animals/${id}/status`, json('PATCH', { status, reason }));
export const fetchHistory = () => request('/animals/history');
export const fetchStatistics = () => request('/statistics');

export const importAnimals = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return request('/import/animals/csv', { method: 'POST', body: formData });
};

// ── Bioterio: Breeding ─────────────────────────────────────────────────────

export const createBreedingGroup = (data) => request('/breeding/create', json('POST', data));
export const endBreedingSession = (cageId, data) =>
  request(`/breeding/end/${cageId}`, json('POST', data));

// ── Colony Responsibles ────────────────────────────────────────────────────

export const fetchResponsibles = () => request('/responsibles');
export const createResponsible = (data) => request('/responsibles', json('POST', data));
export const updateResponsible = (id, data) => request(`/responsibles/${id}`, json('PUT', data));
export const assignRackResponsible = (rackId, responsibleId) =>
  request(`/responsibles/racks/${rackId}/responsible`, json('PATCH', { responsible_id: responsibleId }));

// ── Experiments ────────────────────────────────────────────────────────────

export const fetchExperiments = () => request('/experiments');
export const fetchExperiment = (id) => request(`/experiments/${id}`);
export const createExperiment = (data) => request('/experiments', json('POST', data));
export const updateExperiment = (id, data) => request(`/experiments/${id}`, json('PUT', data));
export const deleteExperiment = (id) => request(`/experiments/${id}`, { method: 'DELETE' });

export const calculateN = (data) => request('/experiments/calculate-n', json('POST', data));

// Groups
export const createGroup = (expId, data) => request(`/experiments/${expId}/groups`, json('POST', data));
export const updateGroup = (expId, groupId, data) =>
  request(`/experiments/${expId}/groups/${groupId}`, json('PUT', data));
export const deleteGroup = (expId, groupId) =>
  request(`/experiments/${expId}/groups/${groupId}`, { method: 'DELETE' });

// Animal assignments
export const fetchExperimentAnimals = (expId) => request(`/experiments/${expId}/animals`);
export const assignAnimal = (expId, data) => request(`/experiments/${expId}/animals`, json('POST', data));
export const updateAnimalAssignment = (expId, assignId, data) =>
  request(`/experiments/${expId}/animals/${assignId}`, json('PATCH', data));
export const removeAnimalFromExperiment = (expId, assignId) =>
  request(`/experiments/${expId}/animals/${assignId}`, { method: 'DELETE' });

// ── Gels ───────────────────────────────────────────────────────────────────

export const fetchGels = (experimentId = null) => {
  const q = experimentId != null ? `?experiment_id=${experimentId}` : '';
  return request(`/gels${q}`);
};
export const fetchGel = (id) => request(`/gels/${id}`);
export const uploadGel = (file, { experimentId, notes, validatedBy, laneCount = 12 }) => {
  const formData = new FormData();
  formData.append('file', file);
  if (experimentId != null) formData.append('experiment_id', experimentId);
  if (notes) formData.append('notes', notes);
  if (validatedBy) formData.append('validated_by', validatedBy);
  formData.append('lane_count', laneCount);
  return request('/gels', { method: 'POST', body: formData });
};
export const updateGel = (id, data) => request(`/gels/${id}`, json('PUT', data));
export const updateLane = (gelId, laneId, data) =>
  request(`/gels/${gelId}/lanes/${laneId}`, json('PATCH', data));
export const deleteGel = (id) => request(`/gels/${id}`, { method: 'DELETE' });

export const gelImageUrl = (imagePath) => `${API_URL}/${imagePath}`;

// ── Extractions ────────────────────────────────────────────────────────────

export const fetchExtractions = ({ animalId, experimentId } = {}) => {
  const params = new URLSearchParams();
  if (animalId) params.append('animal_id', animalId);
  if (experimentId != null) params.append('experiment_id', experimentId);
  const q = params.toString() ? `?${params}` : '';
  return request(`/extractions${q}`);
};
export const createExtraction = (data) => request('/extractions', json('POST', data));
export const updateExtraction = (id, data) => request(`/extractions/${id}`, json('PUT', data));
export const deleteExtraction = (id) => request(`/extractions/${id}`, { method: 'DELETE' });

// ── EM Grids ───────────────────────────────────────────────────────────────

export const fetchEMBoxes = () => request('/em/boxes');
export const fetchEMBox = (id) => request(`/em/boxes/${id}`);
export const createEMBox = (data) => request('/em/boxes', json('POST', data));
export const updateEMBox = (id, data) => request(`/em/boxes/${id}`, json('PUT', data));
export const deleteEMBox = (id) => request(`/em/boxes/${id}`, { method: 'DELETE' });

export const fetchEMGrids = ({ q, status } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/em/grids${qs ? `?${qs}` : ''}`);
};
export const createEMGrid = (data) => request('/em/grids', json('POST', data));
export const updateEMGrid = (id, data) => request(`/em/grids/${id}`, json('PUT', data));
export const deleteEMGrid = (id) => request(`/em/grids/${id}`, { method: 'DELETE' });
