// D'POYO — admin.js
import { db, auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, orderBy, limit, where, serverTimestamp, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
//  ROLES
// =============================================
const ROLES = {
  'admin.estado@dpoyo.cl':    { nombre: 'Admin Estado',    suc: 'Estado',    nivel: 'admin' },
  'admin.huerfanos@dpoyo.cl': { nombre: 'Admin Huérfanos', suc: 'Huérfanos', nivel: 'admin' },
  'super@dpoyo.cl':           { nombre: 'Superadmin',      suc: 'Ambas',     nivel: 'super' },
};

const DIAS_PREMIO  = 7;
const DIAS_BDAY    = 2;
const COMPRAS_META = 7;

let currentAdmin = null;
let bdayDays     = 2;
let scanStream   = null;
let scanActive   = false;
let scanCanvas, scanCtx;
let allClients   = [];

const PROX_MSGS_DEFAULT = [
  "🍗 Oye, D'Poyo está a pasos. ¿Vas a pasar de largo? Te faltan {V} compras para el cono gratis.",
  "☀️ Hora de almorzar y estás justo cerca de D'Poyo. Coincidencia... o destino 👀",
  "🎯 {V} compras más y el Súper Cono es tuyo. D'Poyo te espera a la vuelta.",
  "🐔 El pollo te está llamando. Literalmente estás a metros del local.",
  "⚡ ¡Casi! {V} compra{S} más y ganas tu Súper Cono gratis. ¡Hoy puede ser el día!",
  "🍦 Tu Súper Cono gratis está cada vez más cerca. Tú también.",
];
let proxMsgs = [...PROX_MSGS_DEFAULT];

// =============================================
//  AUTH
// =============================================
onAuthStateChanged(auth, user => {
  if (user && ROLES[user.email]) {
    currentAdmin = { email: user.email, ...ROLES[user.email] };
    showAdminApp();
  } else {
    showLoginScreen();
  }
});

window.doLogin = async function() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const err   = document.getElementById('loginErr');
  err.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    err.style.display = 'block';
  }
};

window.doLogout = async function() {
  await signOut(auth);
};

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').style.display    = 'none';
}

function showAdminApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display    = 'block';

  document.getElementById('navSuc').textContent  = currentAdmin.suc;
  document.getElementById('navRole').textContent = currentAdmin.nivel === 'super' ? '⭐ Superadmin' : 'Admin';

  // Mostrar tabs de superadmin
  if (currentAdmin.nivel === 'super') {
    document.querySelectorAll('.super-only').forEach(el => el.style.display = 'block');
    renderProxMsgs();
  }

  loadClients();
  renderStats();
}

// =============================================
//  TABS
// =============================================
window.swTab = function(tab, el) {
  document.querySelectorAll('.apanel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('on'));
  document.getElementById('ap-' + tab).classList.add('on');
  el.classList.add('on');
  if (tab !== 'scan') stopCamera();
  if (tab === 'clientes') renderClients('');
  if (tab === 'stats') renderStats();
};

// =============================================
//  CAMERA SCAN
// =============================================
window.toggleCamera = async function() {
  if (scanActive) { stopCamera(); return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 } }
    });
    const video = document.getElementById('scanVideo');
    video.srcObject = scanStream;
    await video.play();
    document.getElementById('videoWrap').style.display = 'block';
    document.getElementById('btnCam').textContent = '✕ Cerrar cámara';
    scanCanvas = document.createElement('canvas');
    scanCtx    = scanCanvas.getContext('2d');
    scanActive = true;
    requestAnimationFrame(scanLoop);
  } catch(e) {
    alert('No se pudo acceder a la cámara. Usa el ingreso manual.');
  }
};

function stopCamera() {
  scanActive = false;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  document.getElementById('videoWrap').style.display = 'none';
  document.getElementById('btnCam').textContent = '📷 ESCANEAR CON CÁMARA';
}

function scanLoop() {
  if (!scanActive) return;
  const video = document.getElementById('scanVideo');
  if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
    scanCanvas.width  = video.videoWidth;
    scanCanvas.height = video.videoHeight;
    scanCtx.drawImage(video, 0, 0);
    const img  = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) {
      stopCamera();
      document.getElementById('scanInp').value = code.data.trim().toUpperCase();
      doScan();
      return;
    }
  }
  requestAnimationFrame(scanLoop);
}

// =============================================
//  SCAN / PROCESS
// =============================================
window.doScan = async function() {
  const val = document.getElementById('scanInp').value.trim().toUpperCase();
  if (!val) return;
  document.getElementById('scanInp').value = '';

  // CANJE CUMPLEAÑOS
  if (val.startsWith('BDAY-')) {
    await processCanje(val, 'bday');
    return;
  }
  // CANJE PREMIO
  if (val.startsWith('CANJE-')) {
    await processCanje(val, 'premio');
    return;
  }
  // VISITA NORMAL
  await processVisita(val);
};

async function processVisita(clientId) {
  let cl;
  try {
    const snap = await getDoc(doc(db, 'clientes', clientId));
    if (!snap.exists()) { showResult('err', 'QR no reconocido', 'Verifica el código e intenta de nuevo.'); return; }
    cl = { id: snap.id, ...snap.data() };
  } catch(e) { showResult('err', 'Error de conexión', 'Revisa tu internet e intenta de nuevo.'); return; }

  const nuevasVisitas  = (cl.visitas || 0) + 1;
  const nuevoCiclo     = (cl.ciclo_actual || 0) + 1;
  const updates        = { visitas: nuevasVisitas, suc_frecuente: currentAdmin.suc };

  // Registrar visita en historial
  await addDoc(collection(db, 'visitas'), {
    cliente_id: clientId, nombre: cl.nombre,
    sucursal: currentAdmin.suc, admin: currentAdmin.email,
    fecha: serverTimestamp(),
  });

  if (nuevoCiclo >= COMPRAS_META) {
    // Generar premio
    const canjeId  = `CANJE-${Math.floor(1000+Math.random()*9000)}-${cl.nombre.slice(0,3).toUpperCase()}`;
    const vence    = new Date(); vence.setDate(vence.getDate() + DIAS_PREMIO);
    updates.ciclo_actual   = 0;
    updates.conos_ganados  = (cl.conos_ganados || 0) + 1;
    updates.premio_activo  = { id: canjeId, vence: vence.toISOString(), usado: false, tipo: 'premio' };
    await updateDoc(doc(db, 'clientes', clientId), updates);
    showResult('prize', `🏆 ¡SÚPER CONO GENERADO! — ${cl.nombre}`,
      `Completó 7 compras. QR de canje: ${canjeId} · Válido 7 días.`);
  } else {
    updates.ciclo_actual = nuevoCiclo;
    await updateDoc(doc(db, 'clientes', clientId), updates);
    const left = COMPRAS_META - nuevoCiclo;
    showResult('ok', `✓ Compra registrada — ${cl.nombre}`,
      `Compra #${nuevasVisitas} · ${left} compra${left===1?'':'s'} para el Súper Cono.`);
  }
  loadClients();
  renderStats();
}

async function processCanje(canjeId, tipo) {
  // Buscar cliente con este canje
  let cl, clRef;
  try {
    const q    = query(collection(db, 'clientes'), where('premio_activo.id', '==', canjeId));
    const snap = await getDocs(q);
    if (snap.empty) { showResult('err', 'Canje no encontrado', 'Verifica el código.'); return; }
    cl    = { id: snap.docs[0].id, ...snap.docs[0].data() };
    clRef = doc(db, 'clientes', cl.id);
  } catch(e) { showResult('err', 'Error de conexión', 'Revisa tu internet.'); return; }

  const premio = cl.premio_activo;
  if (!premio || premio.usado) {
    showResult('expired', '✕ YA CANJEADO', 'Este premio ya fue entregado anteriormente.'); return;
  }
  const dias = Math.ceil((new Date(premio.vence) - new Date()) / 86400000);
  if (dias < 0) {
    showResult('expired', '✕ PREMIO VENCIDO', `Venció hace ${Math.abs(dias)} día${Math.abs(dias)===1?'':'s'}. Queda a tu criterio si igual lo entregas.`); return;
  }

  // Marcar como usado
  await updateDoc(clRef, { 'premio_activo.usado': true });
  await addDoc(collection(db, 'canjes'), {
    cliente_id: cl.id, nombre: cl.nombre, tipo,
    sucursal: currentAdmin.suc, admin: currentAdmin.email,
    fecha: serverTimestamp(),
  });

  const esBday = tipo === 'bday';
  showResult('canje',
    esBday ? `🎂 CANJE CUMPLEAÑOS — ${cl.nombre}` : `🏆 SÚPER CONO CANJEADO — ${cl.nombre}`,
    `Premio entregado ✓ · Válido por ${dias} día${dias===1?'':'s'} más. Nuevo ciclo iniciado.`
  );
  loadClients();
}

function showResult(type, title, sub) {
  const r  = document.getElementById('scanResult');
  const rt = document.getElementById('resTitle');
  const rs = document.getElementById('resSub');
  rt.className = 'rt ' + type;
  rt.textContent = title;
  rs.textContent = sub;
  r.className    = 'result ' + type;
  r.style.display = 'block';
  setTimeout(() => r.style.display = 'none', 6000);
}

// =============================================
//  CLIENTS
// =============================================
async function loadClients() {
  try {
    let q;
    if (currentAdmin.nivel === 'super') {
      q = query(collection(db, 'clientes'), orderBy('visitas', 'desc'), limit(100));
    } else {
      q = query(collection(db, 'clientes'),
        where('suc_frecuente', '==', currentAdmin.suc),
        orderBy('visitas', 'desc'), limit(100));
    }
    const snap = await getDocs(q);
    allClients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClients('');
    renderStats();
  } catch(e) { console.warn('Could not load clients', e); }
}

window.renderClients = function(q = '') {
  const list = document.getElementById('clientList');
  if (!list) return;
  const filtered = allClients.filter(c =>
    c.nombre?.toLowerCase().includes(q.toLowerCase()) ||
    c.id?.toLowerCase().includes(q.toLowerCase())
  );
  if (!filtered.length) { list.innerHTML = '<div class="empty-state">No se encontraron clientes</div>'; return; }

  const hoy = new Date();
  list.innerHTML = filtered.map(c => {
    const cycle = c.ciclo_actual || 0;
    const dots  = Array.from({length:8},(_,i) => {
      if(i===7) return '<div class="cd pr"></div>';
      if(i<cycle) return '<div class="cd on"></div>';
      return '<div class="cd"></div>';
    }).join('');
    const prizeBadge = c.premio_activo && !c.premio_activo.usado
      ? '<span class="prize-badge">🏆 Premio</span>' : '';
    const bdayBadge = c.cumpleanos && isBirthday(c.cumpleanos, hoy)
      ? '<span class="bday-badge">🎂 Hoy</span>' : '';
    return `<div class="cl-row" onclick="showClient('${c.id}')">
      <div class="cl-av">${(c.nombre||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
      <div class="cl-info">
        <div class="cl-name">${c.nombre||'—'}${prizeBadge}${bdayBadge}</div>
        <div class="cl-meta">${c.visitas||0} compras · ${c.conos_ganados||0} conos · ${c.suc_frecuente||'—'}</div>
      </div>
      <div class="cl-dots">${dots}</div>
    </div>`;
  }).join('');
};

window.showClient = function(id) {
  const c = allClients.find(cl => cl.id === id);
  if (!c) return;
  document.getElementById('modalTitle').textContent = c.nombre;
  document.getElementById('modalBody').innerHTML = `
    <div style="font-size:12px;color:#aaa;margin-bottom:10px">
      ${c.correo || ''} · ${c.whatsapp || ''}<br>
      ${c.cumpleanos ? '🎂 ' + c.cumpleanos : ''} · ID: <span style="color:var(--y);font-family:monospace">${c.id}</span>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div style="flex:1;background:var(--b3);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--y)">${c.visitas||0}</div>
        <div style="font-size:10px;color:#888">Compras</div>
      </div>
      <div style="flex:1;background:var(--b3);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--y)">${c.ciclo_actual||0}/7</div>
        <div style="font-size:10px;color:#888">Ciclo</div>
      </div>
      <div style="flex:1;background:var(--b3);border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--y)">${c.conos_ganados||0}</div>
        <div style="font-size:10px;color:#888">Conos</div>
      </div>
    </div>
    ${c.premio_activo && !c.premio_activo.usado ? `
    <div style="background:#1a1200;border:1px solid var(--y);border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;color:var(--y)">
      🏆 Premio activo: ${c.premio_activo.id}<br>
      <span style="color:#aaa">Vence: ${new Date(c.premio_activo.vence).toLocaleDateString('es-CL')}</span>
    </div>` : ''}
  `;
  document.getElementById('clientModal').classList.add('open');
};

window.closeModal = function() {
  document.getElementById('clientModal').classList.remove('open');
};

// =============================================
//  STATS
// =============================================
async function renderStats() {
  const total  = allClients.length;
  const visitas = allClients.reduce((a,c) => a+(c.visitas||0), 0);
  const conos   = allClients.reduce((a,c) => a+(c.conos_ganados||0), 0);

  document.getElementById('stClientes').textContent = total;
  document.getElementById('stVisitas').textContent  = visitas;
  document.getElementById('stConos').textContent    = conos;
  document.getElementById('stHoy').textContent      = '—';

  const near = allClients.filter(c => (c.ciclo_actual||0) >= 5)
    .sort((a,b) => (b.ciclo_actual||0)-(a.ciclo_actual||0));
  const nl = document.getElementById('nearList');
  if (!nl) return;
  nl.innerHTML = near.length ? near.map(c => `
    <div class="cl-row" onclick="showClient('${c.id}')">
      <div class="cl-av">${(c.nombre||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
      <div class="cl-info">
        <div class="cl-name">${c.nombre}</div>
        <div class="cl-meta">${7-(c.ciclo_actual||0)} compra${7-(c.ciclo_actual||0)===1?'':'s'} para el Súper Cono</div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--y)">${c.ciclo_actual||0}/7</div>
    </div>`).join('')
    : '<div class="empty-state">Nadie cerca del premio aún</div>';
}

// =============================================
//  CAMPAIGN (superadmin only)
// =============================================
window.sendCampaign = function() {
  const msg = document.getElementById('campMsg').value.trim();
  if (!msg) { alert('Escribe un mensaje primero'); return; }
  const n = allClients.length;
  if (confirm(`¿Enviar este mensaje a ${n} cliente${n===1?'':'s'}?\n\n"${msg}"`)) {
    alert(`✓ Mensaje enviado a ${n} clientes`);
    document.getElementById('campMsg').value = '';
    document.getElementById('campCount').textContent = '0 / 160';
  }
};

window.saveBdayMsg = function() {
  alert('✓ Mensaje de cumpleaños guardado');
};

// =============================================
//  PROX MSGS
// =============================================
function renderProxMsgs() {
  const c = document.getElementById('proxList');
  if (!c) return;
  c.innerHTML = proxMsgs.map((m,i) => `
    <div class="prox-msg">
      <span>${m}</span>
      <button class="edit-btn" onclick="editProx(${i})">Editar</button>
    </div>`).join('');
}
window.editProx = function(i) {
  const msg = prompt('Editar mensaje:', proxMsgs[i]);
  if (msg) { proxMsgs[i] = msg; renderProxMsgs(); }
};

// =============================================
//  BDAY CONFIG
// =============================================
window.toggleBday = function() {
  const on = document.getElementById('bdayToggle').checked;
  document.getElementById('bdayStatusLbl').textContent = on ? 'Activo' : 'Desactivado';
  document.getElementById('bdayConfigFields').style.opacity = on ? '1' : '0.4';
  document.getElementById('bdayConfigFields').style.pointerEvents = on ? 'auto' : 'none';
};
window.selBdayDays = function(n, el) {
  document.querySelectorAll('.day-opt').forEach(d => d.classList.remove('on'));
  el.classList.add('on');
  bdayDays = n;
};
window.saveBdayConfig = function() {
  const btn = document.querySelector('.save-config-btn');
  btn.textContent = '✓ GUARDADO';
  btn.style.background = '#22c55e';
  setTimeout(() => { btn.textContent = 'GUARDAR CONFIGURACIÓN'; btn.style.background = ''; }, 2000);
};

// =============================================
//  UTILS
// =============================================
function isBirthday(bdayStr, hoy) {
  if (!bdayStr) return false;
  const b = new Date(bdayStr);
  return b.getMonth() === hoy.getMonth() && b.getDate() === hoy.getDate();
}

// Load jsQR for camera
const s = document.createElement('script');
s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
document.head.appendChild(s);
const s2 = document.createElement('script');
s2.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
document.head.appendChild(s2);
