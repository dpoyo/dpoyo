// D'POYO — Cloud Functions v1.0
// Notificaciones push automáticas via Firebase Cloud Messaging

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

admin.initializeApp();
const db        = admin.firestore();
const messaging = admin.messaging();

// =============================================
//  MENSAJES DE PROXIMIDAD (6 en rotación)
// =============================================
const MENSAJES_PROX = [
  "🍗 Oye, D'Poyo está a pasos. ¿Vas a pasar de largo? Te faltan {V} compras para el próximo premio.",
  "☀️ Hora de almorzar y estás justo cerca de D'Poyo. Coincidencia... o destino 👀",
  "🎯 {V} compras más y el siguiente premio es tuyo. D'Poyo te espera a la vuelta.",
  "🐔 El pollo te está llamando. Literalmente estás a metros del local.",
  "⚡ ¡Casi! {V} compra{S} más y ganas tu próximo premio. ¡Hoy puede ser el día!",
  "🍦 Tu próximo premio está cada vez más cerca. Tú también.",
];

// =============================================
//  1. NOTIFICACIÓN AL GANAR UN PREMIO
//     Se dispara cuando el admin escanea y
//     se actualiza premio_activo en Firestore
// =============================================
exports.notificarPremio = functions.firestore
  .document("clientes/{clienteId}")
  .onUpdate(async (change, context) => {
    const antes  = change.before.data();
    const despues = change.after.data();

    // Solo actuar si premio_activo cambió a uno nuevo
    const premioAntes  = antes.premio_activo;
    const premioDespues = despues.premio_activo;

    if (!premioDespues || premioDespues.usado) return null;
    if (premioAntes && premioAntes.id === premioDespues.id) return null;
    if (!despues.fcm_token) return null;

    const isCono = premioDespues.tipo === "cono";
    const title  = isCono ? "🏆 ¡Súper Cono Gratis!" : `🎫 ¡${premioDespues.tipo} de Descuento!`;
    const body   = isCono
      ? "¡Lo lograste! Muestra tu QR en caja para cobrarlo. Válido 7 días."
      : `¡Ganaste un ${premioDespues.tipo} de descuento! Ábrelo en la app para verlo.`;

    try {
      await messaging.send({
        token: despues.fcm_token,
        notification: { title, body },
        webpush: {
          notification: {
            title, body,
            icon: "https://dpoyo.vercel.app/icons/icon-192.png",
            badge: "https://dpoyo.vercel.app/icons/icon-192.png",
            requireInteraction: true,
          },
          fcmOptions: { link: "https://dpoyo.vercel.app" },
        },
      });
      console.log(`Premio notificado a ${despues.nombre}`);
    } catch (e) {
      console.error("Error notificando premio:", e.message);
    }
    return null;
  });

// =============================================
//  2. NOTIFICACIÓN DE CUMPLEAÑOS
//     Se ejecuta todos los días a las 10am
//     hora de Santiago (UTC-3 = 13:00 UTC)
// =============================================
exports.notificarCumpleanos = functions.pubsub
  .schedule("0 13 * * *")
  .timeZone("America/Santiago")
  .onRun(async () => {
    const hoy   = new Date();
    const mes   = hoy.getMonth() + 1; // 1-12
    const dia   = hoy.getDate();

    // Buscar clientes que cumplen años hoy y tienen token
    const snap = await db.collection("clientes")
      .where("notif_activa", "==", true)
      .get();

    const promesas = [];
    snap.forEach(doc => {
      const c = doc.data();
      if (!c.cumpleanos || !c.fcm_token) return;
      const bday = new Date(c.cumpleanos);
      if (bday.getMonth() + 1 !== mes || bday.getDate() !== dia) return;

      // Verificar config de cumpleaños
      // (si superadmin desactivó, no enviar)
      const bdayActivo = c.bday_config_activo !== false;
      if (!bdayActivo) return;

      const title = "🎂 ¡Feliz Cumpleaños!";
      const body  = "En D'Poyo lo celebramos contigo — hoy tienes una sorpresa esperándote. ¡Ven a verla! 🏆";

      promesas.push(
        messaging.send({
          token: c.fcm_token,
          notification: { title, body },
          webpush: {
            notification: {
              title, body,
              icon: "https://dpoyo.vercel.app/icons/icon-192.png",
              requireInteraction: true,
            },
            fcmOptions: { link: "https://dpoyo.vercel.app" },
          },
        }).then(() => {
          // Generar QR de cumpleaños en Firestore
          const canjeId = `BDAY-${Math.floor(1000+Math.random()*9000)}-${doc.id.slice(-3)}`;
          const vence   = new Date();
          vence.setDate(vence.getDate() + 2);
          return doc.ref.update({
            premio_activo: {
              id: canjeId,
              vence: vence.toISOString(),
              usado: false,
              tipo: "bday",
            },
          });
        }).catch(e => console.error(`Error cumpleaños ${c.nombre}:`, e.message))
      );
    });

    await Promise.all(promesas);
    console.log(`Cumpleaños procesados: ${promesas.length}`);
    return null;
  });

// =============================================
//  3. CAMPAÑA MANUAL — HTTP endpoint
//     El superadmin llama a esta función
//     desde el panel admin para enviar a todos
// =============================================
exports.enviarCampana = functions.https.onCall(async (data, context) => {
  // Verificar que sea el superadmin
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "No autenticado");
  const adminSnap = await db.collection("admins").doc(context.auth.uid).get();
  // Solo superadmin puede enviar campañas
  const email = context.auth.token.email;
  if (email !== "administrador@dpoyo.cl") {
    throw new functions.https.HttpsError("permission-denied", "Solo el superadmin puede enviar campañas");
  }

  const { titulo, mensaje } = data;
  if (!titulo || !mensaje) throw new functions.https.HttpsError("invalid-argument", "Faltan título y mensaje");

  // Obtener todos los tokens de clientes con notificaciones activas
  const snap = await db.collection("clientes")
    .where("notif_activa", "==", true)
    .get();

  const tokens = [];
  snap.forEach(doc => { if (doc.data().fcm_token) tokens.push(doc.data().fcm_token); });

  if (tokens.length === 0) return { enviados: 0 };

  // Enviar en lotes de 500 (límite de FCM)
  const lotes = [];
  for (let i = 0; i < tokens.length; i += 500) {
    lotes.push(tokens.slice(i, i + 500));
  }

  let enviados = 0;
  for (const lote of lotes) {
    const res = await messaging.sendEachForMulticast({
      tokens: lote,
      notification: { title: titulo, body: mensaje },
      webpush: {
        notification: {
          title: titulo, body: mensaje,
          icon: "https://dpoyo.vercel.app/icons/icon-192.png",
        },
        fcmOptions: { link: "https://dpoyo.vercel.app" },
      },
    });
    enviados += res.successCount;
  }

  console.log(`Campaña enviada: ${enviados}/${tokens.length}`);
  return { enviados, total: tokens.length };
});

// =============================================
//  4. LIMPIAR PREMIOS VENCIDOS
//     Corre todos los días a las 00:01
//     Marca como vencidos los premios expirados
// =============================================
exports.limpiarPremiosVencidos = functions.pubsub
  .schedule("1 0 * * *")
  .timeZone("America/Santiago")
  .onRun(async () => {
    const ahora = new Date().toISOString();
    const snap  = await db.collection("clientes")
      .where("premio_activo.usado", "==", false)
      .get();

    const promesas = [];
    snap.forEach(doc => {
      const c = doc.data();
      if (!c.premio_activo || !c.premio_activo.vence) return;
      if (c.premio_activo.vence < ahora) {
        // Premio vencido — moverlo al historial
        const hist = c.premios_historial || [];
        hist.push({
          ...c.premio_activo,
          fecha: "Vencido",
          vencido: true,
        });
        promesas.push(
          doc.ref.update({
            premio_activo: null,
            premios_historial: hist,
          })
        );
      }
    });

    await Promise.all(promesas);
    console.log(`Premios vencidos limpiados: ${promesas.length}`);
    return null;
  });
