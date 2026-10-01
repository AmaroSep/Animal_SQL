import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, LogOut, KeyRound, Users, Eye, X, Palette } from 'lucide-react';
import { useAuth } from './AuthContext';
import { changePassword, fetchPalette, fetchDirectory, setMyColor } from '../services/api';

const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-400 focus:outline-none';

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.repeat) return setMsg({ error: 'New passwords do not match' });
    try {
      await changePassword(form.current, form.next);
      setMsg({ ok: 'Password changed' });
      setForm({ current: '', next: '', repeat: '' });
    } catch (err) {
      setMsg({ error: err.message });
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Change password</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-white/10"><X size={18} /></button>
        </div>
        {[['current', 'Current password', 'current-password'], ['next', 'New password (min. 10 characters)', 'new-password'], ['repeat', 'Repeat new password', 'new-password']].map(([k, label, ac]) => (
          <label key={k} className="block">
            <span className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{label}</span>
            <input type="password" required autoComplete={ac} className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
        {msg?.error && <p className="text-red-400 text-sm font-mono">{msg.error}</p>}
        {msg?.ok && <p className="text-emerald-300 text-sm font-mono">{msg.ok}</p>}
        <button type="submit" className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-cyan-500 text-slate-900 hover:bg-cyan-400">Save</button>
      </form>
    </div>
  );
}

// Colour that marks this user's cages in the Bioterio
function ColorPicker({ user, onPicked }) {
  const [palette, setPalette] = useState([]);
  const [taken, setTaken] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    fetchPalette().then(setPalette).catch(() => {});
    fetchDirectory().then((us) => setTaken(Object.fromEntries(us.filter((u) => u.color && u.id !== user.id).map((u) => [u.color, u.full_name || u.username])))).catch(() => {});
  }, [user.id]);
  const pick = async (c) => {
    try { setError(null); onPicked(await setMyColor(c)); } catch (err) { setError(err.message); }
  };
  return (
    <div className="px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 mb-2"><Palette size={12} /> My colour</div>
      <div className="grid grid-cols-6 gap-1.5">
        {palette.map((c) => (
          <button key={c} onClick={() => pick(c)} disabled={!!taken[c]} title={taken[c] ? `Used by ${taken[c]}` : c}
            className={`w-6 h-6 rounded-full border-2 disabled:opacity-20 disabled:cursor-not-allowed ${user.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
            style={{ background: c }} />
        ))}
      </div>
      {error && <p className="text-red-400 text-[10px] font-mono mt-1">{error}</p>}
    </div>
  );
}

// Signed-in user chip, fixed in the bottom-right corner on every page
export default function UserMenu() {
  const { user, logout, isAdmin, setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  if (!user) return null;
  const item = 'w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs font-bold hover:bg-white/10';

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[70]">
        {open && (
          <div className="absolute bottom-14 right-0 w-56 glass rounded-2xl overflow-hidden border-white/20 py-1">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="text-sm font-black">{user.full_name || user.username}</div>
              <div className="text-[10px] font-mono text-white/40">{user.username} · {user.role}</div>
            </div>
            <ColorPicker user={user} onPicked={setUser} />
            <button className={item} onClick={() => { setOpen(false); setChanging(true); }}><KeyRound size={14} /> Change password</button>
            {isAdmin && <button className={item} onClick={() => { setOpen(false); navigate('/users'); }}><Users size={14} /> Users & activity</button>}
            <button className={`${item} text-red-300`} onClick={logout}><LogOut size={14} /> Sign out</button>
          </div>
        )}
        <button onClick={() => setOpen(!open)} title="Account"
          className="flex items-center gap-2 pl-2 pr-4 py-2 rounded-full glass border-white/20 hover:bg-white/10 text-xs font-bold shadow-xl">
          <UserCircle size={20} style={{ color: user.color || '#67e8f9' }} />
          {user.initials || user.username}
          {user.role === 'viewer' && <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-amber-200"><Eye size={11} /> read-only</span>}
        </button>
      </div>
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </>
  );
}
