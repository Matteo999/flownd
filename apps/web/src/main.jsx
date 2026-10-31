import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import BankConnect from './pages/BankConnect.jsx'
import BankDebug from './pages/BankDebug.jsx'
import Callback from './pages/Callback.jsx'
import Dashboard from './pages/Dashboard.jsx'
import HomePage from './pages/HomePage.jsx'
import LegalPage from './pages/LegalPage.jsx'
import WaitlistConfirmPage from './pages/WaitlistConfirmPage.jsx'
import './index.css'

// Landing, conferma lista d'attesa e pagine legali sono pubbliche. Le schermate di
// lavoro restano raggiungibili in locale; nei deployment pubblici vanno abilitate
// esplicitamente solo per un ambiente privato/protetto.
const internalRoutesEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_INTERNAL_ROUTES === 'true'
const bankDebugRouteEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_BANK_DEBUG_ROUTE === 'true'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {bankDebugRouteEnabled ? <Route path="/bank-debug" element={<BankDebug />} /> : null}
        <Route path="/" element={<HomePage />} />
        <Route path="/lista-attesa/conferma" element={<WaitlistConfirmPage />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        {internalRoutesEnabled ? (
          <>
            <Route path="/connect" element={<BankConnect />} />
            <Route path="/callback" element={<Callback />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
