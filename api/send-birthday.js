// D'POYO — cron diario que manda el saludo de cumpleaños
// Se ejecuta solo, disparado por Vercel Cron (ver vercel.json en esta carpeta).
// GET /api/send-birthday  ← Vercel Cron llama con GET automáticamente
//
// Qué hace:
//  1. Lee config/global → si bday_activo es false, no manda nada.
//  2. Recorre clientes con cumpleanos guardado (formato "YYYY-MM-DD").
//  3. Si el mes+día coincide con hoy (hora de Chile) Y no se le mandó ya
//     este año, envía el mensaje msg_bday (con {nombre} reemplazado) y
//     marca ultimo_bday_enviado = año actual para no duplicar.
//
// Variables de entorno necesarias: las mismas que send-push.js
// (FIREBASE_SERVICE_ACCOUNT). No necesita ADMIN_API_SECRET porque Vercel
// Cron ya restringe quién puede llamarlo (agrega CRON_SECRET si quieres
// una capa extra — ver comentario abajo).

const { db, messaging } = require('./_firebaseAdmin');

function hoyEnChile() {
  // Chile continental: America/Santiago
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { year: get('year'), month: get('month'), day: get('day') };
}

module.exports = async function handler(req, res) {
  // Opcional: si defines CRON_SECRET en Vercel, Vercel Cron lo manda como
  // header Authorization automáticamente — descomenta para exigirlo:
  // if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
  //   res.status(401).json({ error: 'No autorizado' }); return;
  // }

  try {
    const firestore = db();
    const msg = messaging();
    const { year, month, day } = hoyEnChile();

    const configSnap = await firestore.collection('config').doc('global').get();
    const config = configSnap.exists ? configSnap.data() : {};
    if (config.bday_activo === false) {
      res.status(200).json({ sent: 0, note: 'bday_activo está apagado en config/global' });
      return;
    }
    const plantilla = config.msg_bday || '🎂 ¡Feliz cumpleaños, {nombre}! Tienes un regalo especial esperándote en D\'Poyo.';

    const clientesSnap = await firestore.collection('clientes')
      .where('cumpleanos', '!=', null)
      .get();

    let sent = 0, skipped = 0, noToken = 0;
    for (const doc of clientesSnap.docs) {
      const c = doc.data();
      if (!c.cumpleanos) continue;
      const [, cMonth, cDay] = c.cumpleanos.split('-'); // "YYYY-MM-DD"
      if (cMonth !== month || cDay !== day) continue;
      if (String(c.ultimo_bday_enviado) === String(year)) { skipped++; continue; } // ya se le mandó este año
      if (!c.fcmToken) { noToken++; continue; }

      const primerNombre = (c.nombre || '').split(' ')[0] || 'amig@';
      const body = plantilla.replace('{nombre}', primerNombre);

      await msg.send({
        token: c.fcmToken,
        notification: { title: "D'Poyo 🎂", body },
        webpush: { fcmOptions: { link: '/' } },
      });
      await doc.ref.update({ ultimo_bday_enviado: year });
      sent++;
    }

    res.status(200).json({ sent, skipped_ya_enviado: skipped, sin_token: noToken });
  } catch (err) {
    console.error('send-birthday error:', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
