import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, AUTH_EXPIRED_EVENT } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    fetchMe().then(setUser).catch(() => setUser(null)).finally(() => setChecking(false));
    // Any API call answered with 401 (session expired or revoked) sends the user back to the login
    const onExpired = () => { setUser(null); setExpired(true); };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = async (username, password) => {
    const u = await apiLogin(username, password);
    setExpired(false);
    setUser(u);
  };
  const logout = async () => {
    try { await apiLogout(); } catch (_) { /* already signed out */ }
    setUser(null);
  };

  const value = {
    user, checking, expired, login, logout, setUser,
    isAdmin: user?.role === 'admin',
    canEdit: user?.role === 'admin' || user?.role === 'editor',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
