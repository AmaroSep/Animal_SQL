// Breeding cages: pups are weaned at 21 days, counted from the litter's birth date
export const WEAN_AGE_DAYS = 21;

const DAY = 86400000;
const parse = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const daysSince = (iso) => (iso ? Math.round((today() - parse(iso)) / DAY) : null);

// { due: Date, daysLeft } for a cage with a litter, otherwise null
export function weanInfo(cage) {
  if (!cage?.is_breeding_pair || !cage.litter_dob) return null;
  const due = new Date(parse(cage.litter_dob).getTime() + WEAN_AGE_DAYS * DAY);
  return { due, daysLeft: Math.round((due - today()) / DAY) };
}

// Short label and urgency for the rack badge: 'ok' | 'soon' (3 days or less) | 'due' (today or late)
export function weanBadge(cage) {
  const w = weanInfo(cage);
  if (!w) return null;
  const { daysLeft } = w;
  if (daysLeft > 0) return { text: `Wean ${daysLeft}d`, level: daysLeft <= 3 ? 'soon' : 'ok', ...w };
  return { text: daysLeft === 0 ? 'Wean today' : `Wean +${-daysLeft}d`, level: 'due', ...w };
}

export const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
