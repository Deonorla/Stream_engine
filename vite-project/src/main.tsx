import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { ToastProvider } from './components/ui'
import { WalletProvider } from './context/WalletContext'
import { AppModeProvider } from './context/AppModeContext'
import { AgentLoopProvider } from './context/AgentLoopContext'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import Streams from './pages/Streams'
import AgentConsolePage from './pages/AgentConsolePage'
import Docs from './pages/Docs'
import RWA from './pages/RWA'
import Marketplace from './pages/Marketplace'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<Layout><Dashboard /></Layout>} />
      <Route path="/app/streams" element={<Layout><Streams /></Layout>} />
      <Route path="/app/rwa" element={<Layout><RWA /></Layout>} />
      <Route path="/app/agent" element={<Layout><AgentConsolePage /></Layout>} />
      <Route path="/app/verify" element={<Navigate to="/app/rwa" replace />} />
      <Route path="/app/rent" element={<Navigate to="/app/marketplace" replace />} />
      <Route path="/app/marketplace" element={<Layout><Marketplace /></Layout>} />
      <Route path="/app/docs" element={<Layout><Docs /></Layout>} />
      <Route path="/app/docs/:section" element={<Layout><Docs /></Layout>} />
      <Route path="/streams" element={<Navigate to="/app/streams" replace />} />
      <Route path="/agent" element={<Navigate to="/app/agent" replace />} />
      <Route path="/docs" element={<Navigate to="/app/docs" replace />} />
      <Route path="/docs/:section" element={<Navigate to="/app/docs" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppModeProvider>
      <BrowserRouter>
        <ToastProvider>
          <WalletProvider>
            <AgentLoopProvider>
              <AppRoutes />
            </AgentLoopProvider>
          </WalletProvider>
        </ToastProvider>
      </BrowserRouter>
    </AppModeProvider>
  </StrictMode>,
)
