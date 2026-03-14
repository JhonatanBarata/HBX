import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingScreen } from '../components/LoadingScreen'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { DashboardPage } from '../pages/DashboardPage'
import { MasterPage } from '../pages/MasterPage'
import { ModulesPage } from '../pages/ModulesPage'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRouter() {
  const { loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/master" element={<MasterPage />} />
        <Route path="/modulos" element={<ModulesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
