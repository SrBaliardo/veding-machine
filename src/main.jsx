import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MedalHive } from './medalhive/MedalHive';
import './medalhive/theme.css';
createRoot(document.getElementById('root')).render(
  <StrictMode><HashRouter><MedalHive /></HashRouter></StrictMode>,
);
