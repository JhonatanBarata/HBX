// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCn4oO87xFk2y-MK46NW8dTooe8xVATfa0",
  authDomain: "madeireira-78732.firebaseapp.com",
  projectId: "madeireira-78732",
  storageBucket: "madeireira-78732.firebasestorage.app",
  messagingSenderId: "653490044267",
  appId: "1:653490044267:web:5cdf7f6440da5cc9ca202e"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Serviços
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Exportar para uso global
window.firebaseAuth = auth;
window.firebaseDB = db;
window.firebaseStorage = storage;