// D'POYO — app.js (Cliente)
import { db, auth } from './firebase-config.js';
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
//  CONFIGURACIÓN D'POYO
// =============================================
const SUCURSALES = [
  { nombre: "Sucursal Estado",    lat: -33.44287311394171, lng: -70.64896774857381, radio: 200 },
  { nombre: "Sucursal Huérfanos", lat: -33.439314138759556, lng: -70.6489129977881,  radio: 200 },
];
const COMPRAS_PARA_PREMIO = 7;
const DIAS_VALIDEZ_PREMIO  = 7;
const DIAS_VALIDEZ_BDAY    = 2;
const INTERVALO_NOTIF_HORAS = 48;

const MENSAJES_PROX = [
  "🍗 Oye, D'Poyo está a pasos. ¿Vas a pasar de largo? Te faltan {V} compras para el cono gratis.",
  "☀️ Hora de almorzar y estás justo cerca de D'Poyo. Coincidencia... o destino 👀",
  "🎯 {V} compras más y el Súper Cono es tuyo. D'Poyo te espera a la vuelta.",
  "🐔 El pollo te está llamando. Literalmente estás a metros del local.",
  "⚡ ¡Casi! {V} compra{S} más y ganas tu Súper Cono gratis. ¡Hoy puede ser el día!",
  "🍦 Tu Súper Cono gratis está cada vez más cerca. Tú también.",
];

let currentUser  = null;
let deferredPrompt = null;
let geoInterval  = null;
let qrVisitaDone = false;
let qrCanjeDone  = false;

// =============================================
//  INIT
// =============================================
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBar();
  });
  setTimeout(() => {
    document.getElementById('splash').classList.add('hide');
    setTimeout(initApp, 500);
  }, 1600);
});

async function initApp() {
  currentUser = loadLocalUser();
  if (currentUser) {
    // Sync from Firestore
    try {
      const snap = await getDoc(doc(db, 'clientes', currentUser.id));
      if (snap.exists()) currentUser = { ...currentUser, ...snap.data() };
    } catch(e) { console.warn('Offline mode'); }
    showScreen('card');
    renderCard();
    startGeo();
  } else {
    showScreen('register');
  }
}

// =============================================
//  SCREENS
// =============================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-' + name).classList.remove('hidden');
}

// =============================================
//  REGISTRO
// =============================================
window.doRegister = async function() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-correo').value.trim();
  const wsp    = document.getElementById('reg-wsp').value.trim();
  const pais   = document.getElementById('reg-pais').value;
  const bday   = document.getElementById('reg-bday').value;
  const terms  = document.getElementById('reg-terms').checked;

  let ok = true;
  const show = (id, show) => document.getElementById(id).classList.toggle('show', show);

  if (!nombre || nombre.length < 2) { show('err-nombre', true); ok = false; } else show('err-nombre', false);
  if (!correo || !correo.includes('@')) { show('err-correo', true); ok = false; } else show('err-correo', false);
  if (!wsp || wsp.length < 8) { show('err-wsp', true); ok = false; } else show('err-wsp', false);
  if (!terms) { alert('Debes aceptar los términos para continuar'); return; }
  if (!ok) return;

  const id   = generateId(nombre);
  const user = {
    id, nombre, correo,
    whatsapp:       pais + wsp,
    cumpleanos:     bday || null,
    visitas:        0,
    conos_ganados:  0,
    ciclo_actual:   0,
    premio_activo:  null,
    notif_activa:   false,
    ultima_notif:   null,
    suc_frecuente:  null,
    fecha_registro: new Date().toISOString(),
  };

  // Guardar en Firestore
  try {
    await setDoc(doc(db, 'clientes', id), { ...user, createdAt: serverTimestamp() });
  } catch(e) { console.warn('Saved locally only'); }

  saveLocalUser(user);
  currentUser = user;
  showScreen('card');
  renderCard();
  startGeo();
};

function generateId(nombre) {
  const initials = nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 3);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `DPOYO-${num}-${initials}`;
}

// =============================================
//  RENDER CARD
// =============================================
function renderCard() {
  if (!currentUser) return;
  const u     = currentUser;
  const cycle = u.ciclo_actual || 0;

  document.getElementById('userAv').textContent    = u.nombre.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('userName').textContent  = u.nombre.split(' ')[0];
  document.getElementById('userSince').textContent = 'Cliente desde ' + formatMonthYear(u.fecha_registro);
  document.getElementById('userConos').textContent = u.conos_ganados || 0;
  document.getElementById('stampsBadge').textContent = cycle + ' / ' + COMPRAS_PARA_PREMIO;
  document.getElementById('stCompras').textContent = u.visitas || 0;
  document.getElementById('stCiclo').textContent   = cycle + '/' + COMPRAS_PARA_PREMIO;
  document.getElementById('stConos').textContent   = u.conos_ganados || 0;

  renderStamps(cycle);
  renderQRVisita();

  // Premio activo
  if (u.premio_activo && !u.premio_activo.usado) {
    const dias = diffDays(new Date(u.premio_activo.vence));
    if (dias >= 0) {
      document.getElementById('premioWrap').classList.remove('hidden');
      document.getElementById('expFecha').textContent = formatDate(new Date(u.premio_activo.vence));
      document.getElementById('expDias').textContent  = dias;
      renderQRCanje(u.premio_activo.id);
    }
  } else {
    document.getElementById('premioWrap').classList.add('hidden');
  }

  // iOS hint
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  if (isIOS && !isStandalone) {
    document.getElementById('iosHint').classList.remove('hidden');
  }
}

function renderStamps(cycle) {
  const grid = document.getElementById('stampsGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    if (i === 7) {
      d.className = 'stamp prize';
      d.innerHTML = '<span style="font-size:15px">🏆</span>';
    } else if (i < cycle) {
      d.className = 'stamp on';
      d.innerHTML = '<span style="font-size:14px">🍗</span>';
    } else {
      d.className = 'stamp empty';
      d.innerHTML = `<span>${i + 1}</span>`;
    }
    grid.appendChild(d);
  }
  const left = COMPRAS_PARA_PREMIO - cycle;
  const msg  = document.getElementById('stampsMsg');
  if (cycle === 6)      msg.innerHTML = '🔥 <strong>¡Próxima compra tu Súper Cono es GRATIS!</strong>';
  else if (cycle === 0 && currentUser.visitas > 0) msg.innerHTML = '¡Nuevo ciclo! Acumula <strong>7 compras</strong>';
  else msg.innerHTML = `Te ${left===1?'falta':'faltan'} <strong>${left} compra${left===1?'':'s'}</strong> para tu 🏆 Súper Cono gratis`;
}

function renderQRVisita() {
  if (qrVisitaDone) return;
  const u = currentUser;
  document.getElementById('visitaId').textContent = u.id;
  document.getElementById('sucLabel').textContent = u.suc_frecuente || 'D\'Poyo';
  new QRCode(document.getElementById('visitaQRDiv'), {
    text: u.id, width: 140, height: 140,
    colorDark: '#1e1e1e', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
  qrVisitaDone = true;
}

function renderQRCanje(canjeId) {
  if (qrCanjeDone) return;
  document.getElementById('canjeId').textContent = canjeId;
  new QRCode(document.getElementById('canjeQRDiv'), {
    text: canjeId, width: 120, height: 120,
    colorDark: '#1e1e1e', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
  qrCanjeDone = true;
}

// =============================================
//  GEOLOCALIZACIÓN
// =============================================
function startGeo() {
  if (!navigator.geolocation) return;
  checkProximity();
  geoInterval = setInterval(checkProximity, 60000);
}

function checkProximity() {
  navigator.geolocation.getCurrentPosition(pos => {
    const cercana = SUCURSALES.find(s =>
      haversine(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng) <= s.radio
    );
    const card = document.getElementById('geoNotif');
    const txt  = document.getElementById('geoTxt');
    if (cercana) {
      document.getElementById('sucLabel').textContent = cercana.nombre;
      if (currentUser) currentUser.suc_frecuente = cercana.nombre;
      const cycle = currentUser?.ciclo_actual || 0;
      const left  = COMPRAS_PARA_PREMIO - cycle;
      let msg = '';
      if (cycle === 6) {
        msg = `¡Estás cerca de <strong>${cercana.nombre}</strong>! 🔥 <strong>La próxima es tu Súper Cono GRATIS</strong>`;
      } else {
        msg = `¡Estás cerca de <strong>${cercana.nombre}</strong>! Te ${left===1?'falta':'faltan'} <strong>${left} compra${left===1?'':'s'}</strong> para tu 🏆 Súper Cono`;
      }
      txt.innerHTML = msg;
      card.classList.remove('hidden');
      tryPushNotif(cycle, left, cercana.nombre);
    } else {
      card.classList.add('hidden');
    }
  }, () => {}, { enableHighAccuracy: false, timeout: 10000 });
}

function tryPushNotif(cycle, left, sucNombre) {
  if (Notification.permission !== 'granted') return;
  const ultima = currentUser?.ultima_notif ? new Date(currentUser.ultima_notif) : null;
  const horasPasadas = ultima ? (Date.now() - ultima.getTime()) / 3600000 : 999;
  if (horasPasadas < INTERVALO_NOTIF_HORAS) return;

  // Elegir mensaje al azar distinto al último
  let idx;
  do { idx = Math.floor(Math.random() * MENSAJES_PROX.length); }
  while (idx === (currentUser.ultimo_msg_idx ?? -1));

  let body = MENSAJES_PROX[idx]
    .replace('{V}', left)
    .replace('{S}', left === 1 ? '' : 's');

  navigator.serviceWorker.ready.then(sw => {
    sw.showNotification("D'Poyo", {
      body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: 'dpoyo-geo', renotify: false, data: { url: '/' },
    });
  });

  currentUser.ultima_notif  = new Date().toISOString();
  currentUser.ultimo_msg_idx = idx;
  saveLocalUser(currentUser);
}

// =============================================
//  NOTIFICACIONES
// =============================================
window.requestNotif = async function() {
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    currentUser.notif_activa = true;
    saveLocalUser(currentUser);
    const btn = document.getElementById('btnNotif');
    btn.textContent = '✓ Notificaciones activas';
    btn.classList.add('active');
    checkProximity();
  }
};

// =============================================
//  INSTALL
// =============================================
function showInstallBar() {
  document.getElementById('installBar')?.classList.remove('hidden');
}
window.doInstall = function() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
    document.getElementById('installBar')?.classList.add('hidden');
  }
};

// =============================================
//  STORAGE LOCAL
// =============================================
function saveLocalUser(u) { localStorage.setItem('dpoyo_user', JSON.stringify(u)); }
function loadLocalUser()  { try { return JSON.parse(localStorage.getItem('dpoyo_user')); } catch { return null; } }

// =============================================
//  UTILS
// =============================================
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function diffDays(d) { return Math.ceil((d - new Date()) / 86400000); }
function formatDate(d) { return d.toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' }); }
function formatMonthYear(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { month:'short', year:'numeric' });
}

// QRCode lib
const qrScript = document.createElement('script');
qrScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
document.head.appendChild(qrScript);
