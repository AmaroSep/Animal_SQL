import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Plus, X, Users, History } from 'lucide-react';
import { fetchUsers, createUser, updateUser, fetchAudit } from '../services/api';
import { useAuth } from './AuthContext';

const ROLES = [
  ['admin', 'Admin — everything, including users'],
  ['editor', 'Editor — create and modify records'],
  ['viewer', 'Viewer — read-only'],
];
const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-cyan-400 focus:outline-none';
const label = 'block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2';

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    username: user?.username || '', full_name: user?.full_name || '', initials: user?.initials || '',
    role: user?.role || 'editor', active: user?.active ?? true, password: '',
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (user) {
        const data = { full_name: form.full_name, initials: form.initials, role: form.role, active: form.active };
        if (form.password) data.password = form.password;
        await updateUser(user.id, data);
      } else {
        await createUser(form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <form onSubmit={submit} className="glass w-full max-w-lg rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">{user ? `Edit ${user.username}` : 'New user'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className={label}>Username *</span>
            <input required disabled={!!user} className={`${input} disabled:opacity-50`} value={form.username} onChange={set('username')} autoComplete="off" /></label>
          <label className="block"><span className={label}>Initials</span>
            <input className={input} maxLength={6} value={form.initials} onChange={set('initials')} /></label>
          <label className="block col-span-2"><span className={label}>Full name</span>
            <input className={input} value={form.full_name} onChange={set('full_name')} /></label>
          <label className="block col-span-2"><span className={label}>Role</span>
            <select className={input} value={form.role} onChange={set('role')}>
              {ROLES.map(([v, t]) => <option key={v} value={v} className="bg-slate-900">{t}</option>)}
            </select></label>
          <label className="block col-span-2"><span className={label}>{user ? 'New password (leave empty to keep)' : 'Password * (min. 10 characters)'}</span>
            <input type="password" required={!user} autoComplete="new-password" className={input} value={form.password} onChange={set('password')} /></label>
          {user && (
            <label className="col-span-2 flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={form.active} onChange={set('active')} className="accent-cyan-400" /> Active (can sign in)
            </label>
          )}
        </div>
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10">Cancel</button>
          <button type="submit" className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-cyan-500 text-slate-900 hover:bg-cyan-400">Save</button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [modal, setModal] = useState(null); // 'new' | user
  const [tab, setTab] = useState('users');
  const load = () => {
    fetchUsers().then(setUsers).catch(() => {});
    fetchAudit(300).then(setAudit).catch(() => {});
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return <div className="p-12 text-center text-white/40">Only administrators can manage users.</div>;
  const tabCls = (on) => `flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${on ? 'bg-cyan-500 text-slate-900' : 'bg-white/5 text-white/40 hover:bg-white/10'}`;

  return (
    <div className="min-h-screen max-w-screen-xl mx-auto p-4 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-black tracking-[-0.05em]">USERS</h1>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/')} className={tabCls(false)}><Home size={16} /> Home</button>
          <button onClick={() => setTab('users')} className={tabCls(tab === 'users')}><Users size={16} /> Users</button>
          <button onClick={() => setTab('audit')} className={tabCls(tab === 'audit')}><History size={16} /> Activity</button>
          {tab === 'users' && <button onClick={() => setModal('new')} className={tabCls(false)}><Plus size={16} /> New user</button>}
        </div>
      </header>
      {tab === 'users' ? (
        <section className="glass rounded-3xl p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10">
              {['', 'Username', 'Name', 'Initials', 'Role', 'Status', 'Last sign-in'].map((h) => <th key={h} className="py-3 pr-4">{h}</th>)}
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} onClick={() => setModal(u)} className="border-b border-white/5 hover:bg-white/5 cursor-pointer">
                  <td className="py-3 pr-2"><span className="inline-block w-3 h-3 rounded-full border border-white/20" style={{ background: u.color || 'transparent' }} /></td>
                  <td className="py-3 pr-4 font-mono font-bold">{u.username}</td>
                  <td className="py-3 pr-4">{u.full_name || '—'}</td>
                  <td className="py-3 pr-4 font-mono">{u.initials || '—'}</td>
                  <td className="py-3 pr-4 uppercase text-xs font-black">{u.role}</td>
                  <td className="py-3 pr-4">{u.active ? <span className="text-emerald-300">Active</span> : <span className="text-white/30">Disabled</span>}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-white/50">{u.last_login ? u.last_login.replace('T', ' ').slice(0, 16) + ' UTC' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="glass rounded-3xl p-6 overflow-x-auto">
          <p className="text-xs font-mono text-white/40 mb-3">Last {audit.length} changes (most recent first)</p>
          <table className="w-full text-xs font-mono">
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-white/5">
                  <td className="py-2 pr-4 text-white/40 whitespace-nowrap">{a.created_at.replace('T', ' ').slice(0, 19)} UTC</td>
                  <td className="py-2 pr-4 font-bold">{a.username || '—'}</td>
                  <td className="py-2 pr-4">{a.method}</td>
                  <td className="py-2 pr-4 text-white/70">{a.path}</td>
                  <td className={`py-2 pr-4 ${a.status_code >= 400 ? 'text-red-300' : 'text-emerald-300'}`}>{a.status_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {modal && <UserModal user={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}
