import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './LandingPage';
import BioterioApp from './modules/bioterio/BioterioApp';
import EMGridsApp from './modules/emgrids/EMGridsApp';
import LN2App from './modules/ln2/LN2App';
import M80App from './modules/m80/M80App';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bioterio" element={<BioterioApp />} />
        <Route path="/em-grids" element={<EMGridsApp />} />
        <Route path="/ln2" element={<LN2App />} />
        <Route path="/m80" element={<M80App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
