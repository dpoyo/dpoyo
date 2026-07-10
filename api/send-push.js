// D'POYO — endpoint para enviar notificaciones desde el panel admin (Vercel)
// POST /api/send-push
//
// Body JSON:
//   {
//     "mode": "single" | "broadcast",
//     "userId": "DPOYO-1234-ABC",   // solo si mode = "single"
//     "title": "D'Poyo",
//     "body": "¡Hoy 2x1 en conos! Pásate por cualquiera de nuestras sucursales 🍦"
//   }
//
// Header requerido (protege el endpoint — cualquiera con este secreto puede
// mandar notificaciones a todos tus clientes, trátalo como una contraseña):
//   Authorization: Bearer <ADMIN_API_SECRET>
//
// Variables de entorno necesarias en Vercel:
//   FIREBASE_SERVICE_ACCOUNT  → ver api/_firebaseAdmin.js
//   ADMIN_API_SECRET          → cualquier string largo random que tú elijas

const { db, messaging } = require('./_firebaseAdmin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.ADMIN_API_SECRET || ''}`;
  if (!process.env.ADMIN_API_SECRET || auth !== expected) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const { mode, userId, title, body } = req.body || {};
  if (!body || !title) {
    res.status(400).json({ error: 'Falta title o body' });
    return;
  }
  if (mode !== 'single' && mode !== 'broadcast') {
    res.status(400).json({ error: 'mode debe ser "single" o "broadcast"' });
    return;
  }

  try {
    const firestore = db();
    const msg = messaging();

    if (mode === 'single') {
      if (!userId) {
        res.status(400).json({ error: 'Falta userId para mode=single' });
        return;
      }
      const snap = await firestore.collection('clientes').doc(userId).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      const token = snap.data().fcmToken;
      if (!token) {
        res.status(422).json({ error: 'Ese cliente no tiene notificaciones activadas' });
        return;
      }
      await msg.send({
        token,
        notification: { title, body },
        webpush: { fcmOptions: { link: '/' } },
      });
      res.status(200).json({ sent: 1 });
      return;
    }

    // mode === 'broadcast' — a todos los clientes con token guardado
    const snap = await firestore.collection('clientes').where('fcmToken', '!=', null).get();
    const tokens = snap.docs.map(d => d.data().fcmToken).filter(Boolean);

    if (tokens.length === 0) {
      res.status(200).json({ sent: 0, note: 'Ningún cliente tiene notificaciones activadas todavía' });
      return;
    }

    // sendEachForMulticast acepta máximo 500 tokens por llamada
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const result = await msg.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        webpush: { fcmOptions: { link: '/' } },
      });
      sent += result.successCount;
      failed += result.failureCount;
    }

    res.status(200).json({ sent, failed, total: tokens.length });
  } catch (err) {
    console.error('send-push error:', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
