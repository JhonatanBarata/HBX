declare global {
  interface Window {
    __HBX_FIREBASE_CONFIG__?: {
      apiKey: string
      authDomain: string
      projectId: string
      storageBucket: string
      messagingSenderId: string
      appId: string
      measurementId?: string
    }
  }
}

export {}
