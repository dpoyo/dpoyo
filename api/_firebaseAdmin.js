// D'POYO — inicialización compartida de Firebase Admin (Node, CommonJS)
// Se usa desde api/send-push.js y api/send-birthday.js
//
// Necesitas UNA variable de entorno en Vercel:
//   FIREBASE_SERVICE_ACCOUNT  → el JSON completo de la service account, en una sola línea
//
// Cómo conseguir ese JSON:
// Firebase Console → dpoyo-e0a5a → ⚙️ Configuración del proyecto → Cuentas de servicio
// → "Generar nueva clave privada" → descarga el .json → pega TODO su contenido
// como valor de FIREBASE_SERVICE_ACCOUNT en Vercel (Project Settings → Environment Variables).

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

let app;
function getAdminApp() {
  if (app) return app;
  const existing = getApps();
  if (existing.length) {
    app = existing[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT en Vercel.');
  }
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({
    credential: cert(serviceAccount),
  });
  return app;
}

function db() {
  getAdminApp();
  return getFirestore();
}

function messaging() {
  getAdminApp();
  return getMessaging();
}

module.exports = { getAdminApp, db, messaging };
