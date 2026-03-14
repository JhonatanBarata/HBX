;(function syncLegacyFirebaseConfig() {
  if (window.__HBX_FIREBASE_CONFIG__ && !window.__FIREBASE_CONFIG__) {
    window.__FIREBASE_CONFIG__ = window.__HBX_FIREBASE_CONFIG__
  }
})()
