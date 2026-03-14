import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'

interface FirebaseRuntimeConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

const fallbackConfig: FirebaseRuntimeConfig = {
  apiKey: 'AIzaSyDioaRFhHQgdqXTgkQzWfFX2f-x4GVI9h0',
  authDomain: 'hbxautomacoes.firebaseapp.com',
  projectId: 'hbxautomacoes',
  storageBucket: 'hbxautomacoes.firebasestorage.app',
  messagingSenderId: '768681610756',
  appId: '1:768681610756:web:396e14f359d567eb10ef51',
}

function loadFirebaseConfig(): FirebaseRuntimeConfig {
  return window.__HBX_FIREBASE_CONFIG__ ?? fallbackConfig
}

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

export function getFirebaseApp() {
  if (!firebaseApp) {
    firebaseApp = getApps()[0] ?? initializeApp(loadFirebaseConfig())
  }

  return firebaseApp
}

export function getFirebaseAuth() {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseApp())
    void setPersistence(firebaseAuth, browserLocalPersistence)
  }

  return firebaseAuth
}
