// Firebase configuration loader
(function () {
  const fallbackConfig = {
    apiKey: "AIzaSyCv12W_WPMdAGDWDJ6TPD5eoJSWTsqE6Eg",
    authDomain: "guinchorioclarosp.firebaseapp.com",
    projectId: "guinchorioclarosp",
    storageBucket: "guinchorioclarosp.firebasestorage.app",
    messagingSenderId: "959050454992",
    appId: "1:959050454992:web:f727b32975f0fa29300bd5"
  };

  const localConfig = window.__FIREBASE_CONFIG__;
  const hasValidLocalConfig =
    localConfig &&
    localConfig.apiKey &&
    localConfig.apiKey !== "YOUR_FIREBASE_WEB_API_KEY" &&
    localConfig.projectId &&
    localConfig.projectId !== "your-project-id";

  const firebaseConfig = hasValidLocalConfig ? localConfig : fallbackConfig;

  if (!window.firebase || typeof firebase.initializeApp !== "function") {
    console.error("Firebase SDK is missing. Load the Firebase scripts before firebase-config.js.");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.firebaseAuth = firebase.auth();
  window.firebaseDB = firebase.firestore();
  window.firebaseStorage = firebase.storage();
})();
