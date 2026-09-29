import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import BioterioApp from './modules/bioterio/BioterioApp';
import ExperimentsApp from './modules/experiments/ExperimentsApp';
import EMGridsApp from './modules/emgrids/EMGridsApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bioterio" element={<BioterioApp />} />
        <Route path="/experiments/*" element={<ExperimentsApp />} />
        <Route path="/em-grids" element={<EMGridsApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
