/* eslint-disable react-refresh/only-export-components */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { getFirebaseAuth } from '../lib/firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  async function signIn(email: string, password: string) {
    setError(null)
    const auth = getFirebaseAuth()

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (currentError) {
      setError('Nao foi possivel entrar. Verifique email, senha e o Firebase Auth.')
      throw currentError
    }
  }

  async function signOut() {
    const auth = getFirebaseAuth()
    await firebaseSignOut(auth)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      error,
      signIn,
      signOut,
      clearError: () => setError(null),
    }),
    [error, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }

  return context
}
