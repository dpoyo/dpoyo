const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Enviar campaña push a todos los clientes con fcmToken
exports.sendCampaign = onCall({ region: 'us-central1' }, async (request) => {
  // Solo superadmin puede enviar
  const { title, body } = request.data;
  if (!title || !body) throw new HttpsError('invalid-argument', 'title y body requeridos');

  const db = getFirestore();
  const snap = await db.collection('clientes')
    .where('notif_activa', '==', true)
    .get();

  const tokens = snap.docs
    .map(d => d.data().fcmToken)
    .filter(Boolean);

  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const messaging = getMessaging();
  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: 'https://dpoyo.vercel.app/icons/icon-192.png' },
      fcmOptions: { link: 'https://dpoyo.vercel.app' },
    },
  });

  return {
    sent: result.successCount,
    failed: result.failureCount,
  };
});

// Enviar notificación a un cliente específico
exports.sendToClient = onCall({ region: 'us-central1' }, async (request) => {
  const { clientId, title, body } = request.data;
  if (!clientId || !title || !body) throw new HttpsError('invalid-argument', 'clientId, title y body requeridos');

  const db = getFirestore();
  const doc = await db.collection('clientes').doc(clientId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Cliente no encontrado');

  const token = doc.data().fcmToken;
  if (!token) throw new HttpsError('failed-precondition', 'Cliente sin FCM token');

  await getMessaging().send({
    token,
    notification: { title, body },
    webpush: {
      notification: { icon: 'https://dpoyo.vercel.app/icons/icon-192.png' },
      fcmOptions: { link: 'https://dpoyo.vercel.app' },
    },
  });

  return { ok: true };
});
