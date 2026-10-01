const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Helpers ────────────────────────────────────────────────────────────────

export const AUTH_EXPIRED_EVENT = 'auth:expired';

async function request(path, options = {}) {
  // credentials: send the session cookie (the API may be on another port in development)
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
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

// ── Auth & users ───────────────────────────────────────────────────────────

export const fetchMe = () => request('/auth/me');
export const login = (username, password) => request('/auth/login', json('POST', { username, password }));
export const logout = () => request('/auth/logout', { method: 'POST' });
export const changePassword = (current_password, new_password) =>
  request('/auth/change-password', json('POST', { current_password, new_password }));
export const fetchUsers = () => request('/auth/users');
export const createUser = (data) => request('/auth/users', json('POST', data));
export const updateUser = (id, data) => request(`/auth/users/${id}`, json('PUT', data));
export const fetchAudit = (limit = 200) => request(`/auth/audit?limit=${limit}`);
export const apiUrl = (path) => `${API_URL}${path}`;
export const fetchDirectory = () => request('/auth/directory');
export const fetchPalette = () => request('/auth/palette');
export const setMyColor = (color) => request('/auth/me/color', json('PUT', { color }));
export const setCageOwner = (cageIds, ownerId) =>
  request('/cages/owner', json('PATCH', { cage_ids: cageIds, owner_id: ownerId }));

// ── Bioterio: Racks & Cages ────────────────────────────────────────────────

export const fetchRacks = () => request('/racks');
export const fetchRack = (id) => request(`/racks/${id}`);
export const updateCageBreedingStatus = (cageId, isBreedingPair) =>
  request(`/cages/${cageId}/breeding_status`, json('PATCH', { is_breeding_pair: isBreedingPair }));
export const updateCageCard = (cageId, cardId) =>
  request(`/cages/${cageId}/card`, json('PATCH', { card_id: cardId }));
export const updateCageNumber = (cageId, cageNumber) =>
  request(`/cages/${cageId}/number`, json('PATCH', { cage_number: cageNumber }));
export const swapCagePositions = (cageAId, cageBId) =>
  request('/cages/swap-positions', json('POST', { cage_a_id: cageAId, cage_b_id: cageBId }));
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

// ── LN2 tank ───────────────────────────────────────────────────────────────

export const fetchLNTank = () => request('/ln2/tank');
export const fetchLNBox = (id) => request(`/ln2/boxes/${id}`);
export const updateLNBox = (id, data) => request(`/ln2/boxes/${id}`, json('PUT', data));
export const fetchLNVials = ({ q, status } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/ln2/vials${qs ? `?${qs}` : ''}`);
};
export const createLNVials = (data) => request('/ln2/vials/batch', json('POST', data));
export const updateLNVial = (id, data) => request(`/ln2/vials/${id}`, json('PUT', data));
export const removeLNVial = (id, data) => request(`/ln2/vials/${id}/remove`, json('POST', data));
export const restoreLNVial = (id) => request(`/ln2/vials/${id}/restore`, { method: 'POST' });
export const deleteLNVial = (id) => request(`/ln2/vials/${id}`, { method: 'DELETE' });

// ── -80 freezers ───────────────────────────────────────────────────────────

export const fetchM80Freezers = () => request('/m80/freezers');
export const createM80Freezer = (data) => request('/m80/freezers', json('POST', data));
export const updateM80Freezer = (id, data) => request(`/m80/freezers/${id}`, json('PUT', data));
export const deleteM80Freezer = (id) => request(`/m80/freezers/${id}`, { method: 'DELETE' });
export const createM80Compartment = (data) => request('/m80/compartments', json('POST', data));
export const updateM80Compartment = (id, data) => request(`/m80/compartments/${id}`, json('PUT', data));
export const deleteM80Compartment = (id) => request(`/m80/compartments/${id}`, { method: 'DELETE' });
export const createM80Rack = (data) => request('/m80/racks', json('POST', data));
export const updateM80Rack = (id, data) => request(`/m80/racks/${id}`, json('PUT', data));
export const deleteM80Rack = (id) => request(`/m80/racks/${id}`, { method: 'DELETE' });
export const fetchM80Box = (id) => request(`/m80/boxes/${id}`);
export const createM80Box = (data) => request('/m80/boxes', json('POST', data));
export const updateM80Box = (id, data) => request(`/m80/boxes/${id}`, json('PUT', data));
export const deleteM80Box = (id) => request(`/m80/boxes/${id}`, { method: 'DELETE' });
export const fetchM80Tubes = ({ q, status } = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/m80/tubes${qs ? `?${qs}` : ''}`);
};
export const createM80Tubes = (data) => request('/m80/tubes/batch', json('POST', data));
export const updateM80Tube = (id, data) => request(`/m80/tubes/${id}`, json('PUT', data));
export const removeM80Tube = (id, data) => request(`/m80/tubes/${id}/remove`, json('POST', data));
export const restoreM80Tube = (id) => request(`/m80/tubes/${id}/restore`, { method: 'POST' });
export const deleteM80Tube = (id) => request(`/m80/tubes/${id}`, { method: 'DELETE' });
