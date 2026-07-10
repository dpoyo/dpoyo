// =============================================
//  D'POYO — Configuración Firebase
//  ✅ Credenciales reales del proyecto dpoyo-e0a5a
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA471HhqxfeT2Evrt9tzYasm04X6Fzd_-k",
  authDomain:        "dpoyo-e0a5a.firebaseapp.com",
  projectId:         "dpoyo-e0a5a",
  storageBucket:     "dpoyo-e0a5a.firebasestorage.app",
  messagingSenderId: "746211541880",
  appId:             "1:746211541880:web:4720a4527b7e0beb387e8d",
  measurementId:     "G-QWSPPTRWKN"
};

const app       = initializeApp(firebaseConfig);
const db        = getFirestore(app);
const auth      = getAuth(app);
const messaging = getMessaging(app);

export { app, db, auth, messaging, firebaseConfig };
