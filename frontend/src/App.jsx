import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import BioterioApp from './modules/bioterio/BioterioApp';
import ExperimentsApp from './modules/experiments/ExperimentsApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bioterio" element={<BioterioApp />} />
        <Route path="/experiments/*" element={<ExperimentsApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
