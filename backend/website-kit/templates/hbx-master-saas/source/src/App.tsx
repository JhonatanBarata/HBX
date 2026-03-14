import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { TenantProvider } from './contexts/TenantContext'
import { AppRouter } from './routes/AppRouter'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <AppRouter />
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
