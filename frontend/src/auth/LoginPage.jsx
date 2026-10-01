import React, { useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login, expired } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setPassword('');
    }
    setBusy(false);
  };

  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-cyan-400 focus:outline-none';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px]" />
      </div>
      <form onSubmit={submit} className="relative glass w-full max-w-sm rounded-3xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center justify-center"><Lock size={22} /></div>
          <h1 className="text-2xl font-black tracking-tight">Lab Management</h1>
          <p className="text-xs font-mono text-white/40">Sign in to continue</p>
        </div>
        {expired && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">Your session ended. Please sign in again.</p>}
        <label className="block">
          <span className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Username</span>
          <input autoFocus autoComplete="username" required className={input} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Password</span>
          <input type="password" autoComplete="current-password" required className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-red-400 text-sm font-mono">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-cyan-500 text-slate-900 hover:bg-cyan-400 disabled:opacity-50">
          <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-[10px] text-center text-white/30">No account? Ask a lab administrator.</p>
      </form>
    </div>
  );
}
