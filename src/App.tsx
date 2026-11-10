import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppBootstrap } from './components/AppBootstrap'
import { Layout } from './components/Layout'
import { ModelProvider } from './context/ModelContext'
import { SettingsProvider } from './context/SettingsContext'
import { isOnboardingDone } from './lib/onboarding'
import { Home } from './pages/Home'
import { KanaPractice } from './pages/KanaPractice'
import { Onboarding } from './pages/Onboarding'
import { PhrasePractice } from './pages/PhrasePractice'
import { ReadingPractice } from './pages/ReadingPractice'
import { ReviewPractice } from './pages/ReviewPractice'
import { Settings } from './pages/Settings'
import { VocabPractice } from './pages/VocabPractice'

function RootRedirect() {
  if (!isOnboardingDone()) return <Navigate to="/welcome" replace />
  return <Home />
}

export default function App() {
  return (
    <SettingsProvider>
      <ModelProvider>
        <HashRouter>
          <AppBootstrap>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<RootRedirect />} />
                <Route path="welcome" element={<Onboarding />} />
                <Route path="kana" element={<KanaPractice />} />
                <Route path="vocab" element={<VocabPractice />} />
                <Route path="phrase" element={<PhrasePractice />} />
                <Route path="reading" element={<ReadingPractice />} />
                <Route path="review" element={<ReviewPractice />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AppBootstrap>
        </HashRouter>
      </ModelProvider>
    </SettingsProvider>
  )
}
