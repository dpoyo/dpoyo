const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore }       = require('firebase-admin/firestore');
const { getMessaging }       = require('firebase-admin/messaging');

initializeApp();

const ICON = 'https://dpoyo.vercel.app/icons/icon-192.png';
const LINK = 'https://dpoyo.vercel.app';

// Enviar campaña push a todos los clientes con fcmToken
exports.sendCampaign = onCall({ region: 'us-central1' }, async (request) => {
  const { title, body } = request.data;
  if (!title || !body) throw new HttpsError('invalid-argument', 'title y body requeridos');

  const db = getFirestore();
  const snap = await db.collection('clientes')
    .where('notif_activa', '==', true)
    .get();

  const tokens = snap.docs.map(d => d.data().fcmToken).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const result = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { notification: { icon: ICON }, fcmOptions: { link: LINK } },
  });

  return { sent: result.successCount, failed: result.failureCount };
});

// Enviar notificación a un cliente específico
exports.sendToClient = onCall({ region: 'us-central1' }, async (request) => {
  const { clientId, title, body } = request.data;
  if (!clientId || !title || !body) throw new HttpsError('invalid-argument', 'clientId, title y body requeridos');

  const db = getFirestore();
  const docSnap = await db.collection('clientes').doc(clientId).get();
  if (!docSnap.exists) throw new HttpsError('not-found', 'Cliente no encontrado');

  const token = docSnap.data().fcmToken;
  if (!token) throw new HttpsError('failed-precondition', 'Cliente sin FCM token');

  await getMessaging().send({
    token,
    notification: { title, body },
    webpush: { notification: { icon: ICON }, fcmOptions: { link: LINK } },
  });

  return { ok: true };
});

// Lógica compartida: enviar push a clientes con cumpleaños hoy
async function _sendBirthdaysLogic() {
  const db = getFirestore();

  // Leer config del mensaje
  const cfgSnap = await db.collection('config').doc('bday').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (cfg.active === false) return { sent: 0, failed: 0, skipped: 'desactivado' };

  const title  = cfg.title  || "🎂 ¡Feliz cumpleaños!";
  const body   = cfg.message || "En D'Poyo lo celebramos contigo — hoy tienes una sorpresa esperándote. ¡Ven a verla! 🏆";

  // Día de hoy en MM-DD (zona Chile UTC-3 o UTC-4 según horario)
  const now  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const hoyMD = `${mm}-${dd}`;

  // Traer todos los clientes con token activo (colección pequeña, ok cargar todo)
  const snap = await db.collection('clientes')
    .where('notif_activa', '==', true)
    .get();

  const cumpleaneros = snap.docs.filter(d => {
    const bday = d.data().cumpleanos; // formato "YYYY-MM-DD"
    if (!bday) return false;
    return bday.slice(5) === hoyMD; // compara "MM-DD"
  });

  if (cumpleaneros.length === 0) return { sent: 0, failed: 0 };

  const tokens = cumpleaneros.map(d => d.data().fcmToken).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const result = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { notification: { icon: ICON }, fcmOptions: { link: LINK } },
  });

  return { sent: result.successCount, failed: result.failureCount };
}

// Automático: corre todos los días a las 10:00am hora Chile
exports.sendBirthdays = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => { await _sendBirthdaysLogic(); }
);

// Manual: callable desde el panel admin (para probar o disparar fuera de hora)
exports.sendBirthdaysNow = onCall({ region: 'us-central1' }, async () => {
  return await _sendBirthdaysLogic();
});
