import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import BioterioApp from './modules/bioterio/BioterioApp';
import EMGridsApp from './modules/emgrids/EMGridsApp';
import LN2App from './modules/ln2/LN2App';
import M80App from './modules/m80/M80App';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './auth/LoginPage';
import UserMenu from './auth/UserMenu';
import UsersPage from './auth/UsersPage';

function Shell() {
  const { user, checking } = useAuth();
  if (checking) return <div className="min-h-screen" />;
  if (!user) return <LoginPage />;
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bioterio" element={<BioterioApp />} />
        <Route path="/em-grids" element={<EMGridsApp />} />
        <Route path="/ln2" element={<LN2App />} />
        <Route path="/m80" element={<M80App />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UserMenu />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
