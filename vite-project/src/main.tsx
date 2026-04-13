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
import PropertyMint from './pages/PropertyMint'
import PropertyDetail from './pages/PropertyDetail'
import Properties from './pages/Properties'
import Portfolio from './pages/Portfolio'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<Layout><Dashboard /></Layout>} />
      <Route path="/app/streams" element={<Layout><Streams /></Layout>} />
      <Route path="/app/agent" element={<Layout><AgentConsolePage /></Layout>} />
      <Route path="/app/property-mint" element={<Layout><PropertyMint /></Layout>} />
      <Route path="/app/property/:id" element={<Layout><PropertyDetail /></Layout>} />
      <Route path="/app/properties" element={<Layout><Properties /></Layout>} />
      <Route path="/app/portfolio" element={<Layout><Portfolio /></Layout>} />
      <Route path="/app/docs" element={<Layout><Docs /></Layout>} />
      <Route path="/app/docs/:section" element={<Layout><Docs /></Layout>} />
      {/* Redirect old routes to new equivalents */}
      <Route path="/app/rwa" element={<Navigate to="/app/property-mint" replace />} />
      <Route path="/app/marketplace" element={<Navigate to="/app/properties" replace />} />
      <Route path="/app/verify" element={<Navigate to="/app/properties" replace />} />
      <Route path="/app/rent" element={<Navigate to="/app/properties" replace />} />
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
