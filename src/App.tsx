import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LibraryPage } from '@/pages/LibraryPage';
import { AdminPage } from '@/pages/AdminPage';
import { ViewerPage } from '@/pages/ViewerPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/read/:id" element={<ViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
