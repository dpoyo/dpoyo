// D'POYO — app.js v2.0
import { db } from './firebase-config.js';
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const SUCURSALES = [
  { nombre:"Sucursal Estado",    lat:-33.44287311394171, lng:-70.64896774857381, radio:200 },
  { nombre:"Sucursal Huérfanos", lat:-33.439314138759556, lng:-70.6489129977881,  radio:200 },
];
const DIAS_PREMIO       = 7;
const INTERVALO_NOTIF_H = 48;
const VAPID_KEY         = 'BFIvFqfHVKX94eFettJrUvKIoYIcfvX6-m_ZvRgfHV3CUw8Uf9dPGZWnpgr_LoGMjP_b-vOcwClUKzkNYwf4UIw';

const MENSAJES_PROX = [
  "🍗 Oye, D'Poyo está a pasos. ¿Vas a pasar de largo? Te faltan {V} compras para el cono gratis.",
  "☀️ Hora de almorzar y estás justo cerca de D'Poyo. Coincidencia... o destino 👀",
  "🎯 {V} compras más y el Súper Cono es tuyo. D'Poyo te espera a la vuelta.",
  "🐔 El pollo te está llamando. Literalmente estás a metros del local.",
  "⚡ ¡Casi! {V} compra{S} más y ganas tu Súper Cono gratis. ¡Hoy puede ser el día!",
  "🍦 Tu Súper Cono gratis está cada vez más cerca. Tú también.",
];

let currentUser    = null;
let deferredPrompt = null;
let qrVisitaDone   = false;
let premiosQRDone  = {};

// ---- INIT ----
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    document.getElementById('installBar')?.classList.remove('hidden');
  });
  setTimeout(() => {
    document.getElementById('splash').classList.add('hide');
    setTimeout(initApp, 500);
  }, 1600);
});

async function initApp() {
  currentUser = loadLocalUser();
  if (currentUser) {
    try {
      const snap = await getDoc(doc(db, 'clientes', currentUser.id));
      if (snap.exists()) { currentUser = { ...currentUser, ...snap.data() }; saveLocalUser(currentUser); }
    } catch(e) {}
    showScreen('card'); renderCard(); startGeo();
    startRealtimeSync();
  } else { showScreen('register'); }
}

// Listener en tiempo real — actualiza la tarjeta cuando el admin escanea
function startRealtimeSync() {
  if (!currentUser?.id) return;
  try {
    onSnapshot(doc(db, 'clientes', currentUser.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const premioAntes = currentUser.premio_activo;
      currentUser = { ...currentUser, ...data };
      saveLocalUser(currentUser);
      renderCard();
      // Si acaba de llegar un premio nuevo, cambiar a pestaña Mis Premios
      if (data.premio_activo && !data.premio_activo.usado &&
          (!premioAntes || premioAntes.id !== data.premio_activo.id)) {
        premiosQRDone = {};
        switchTab('premios');
        showPremioAlert(data.premio_activo);
      }
    });
  } catch(e) { console.warn('Realtime sync not available'); }
}

function showPremioAlert(premio) {
  const isCono = premio.tipo === 'cono';
  const msg = isCono
    ? '🏆 ¡Felicidades! Ganaste un Súper Cono gratis. Muestra el QR en caja.'
    : `🎫 ¡Ganaste un ${premio.tipo} de descuento! Muéstralo al pagar.`;
  // Banner temporal
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#FFD307;color:#1e1e1e;padding:14px 16px;text-align:center;font-weight:600;font-size:14px;z-index:999;animation:slideDown .4s ease';
  banner.textContent = msg;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-' + name).classList.remove('hidden');
}

// ---- REGISTRO ----
// También iniciar sync después de registro
window.doRegister = async function() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const correo = document.getElementById('reg-correo').value.trim();
  const wsp    = document.getElementById('reg-wsp').value.trim();
  const pais   = document.getElementById('reg-pais').value;
  const bday   = document.getElementById('reg-bday').value;
  const terms  = document.getElementById('reg-terms').checked;
  const show   = (id,v) => document.getElementById(id).classList.toggle('show',v);
  let ok = true;
  if (!nombre||nombre.length<2){show('err-nombre',true);ok=false;}else show('err-nombre',false);
  if (!correo||!correo.includes('@')){show('err-correo',true);ok=false;}else show('err-correo',false);
  if (!wsp||wsp.length<8){show('err-wsp',true);ok=false;}else show('err-wsp',false);
  if (!terms){alert('Debes aceptar los términos');return;}
  if (!ok) return;

  const id   = `DPOYO-${Math.floor(1000+Math.random()*9000)}-${nombre.split(' ').map(p=>p[0]).join('').toUpperCase().slice(0,3)}`;
  const user = {
    id, nombre, correo, whatsapp:pais+wsp, cumpleanos:bday||null,
    visitas:0, ciclo_actual:0, conos_ganados:0,
    descuentos_usados:0, premio_activo:null,
    premios_historial:[], notif_activa:false,
    ultima_notif:null, ultimo_msg_idx:-1,
    suc_frecuente:null, fecha_registro:new Date().toISOString(),
  };
  try { await setDoc(doc(db,'clientes',id),{...user,createdAt:serverTimestamp()}); } catch(e) {}
  saveLocalUser(user); currentUser=user;
  showScreen('card'); renderCard(); startGeo();
  startRealtimeSync();
};

// ---- TABS Mi QR / Mis Premios ----
window.switchTab = function(tab) {
  document.querySelectorAll('.card-tab-btn').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.card-tab-panel').forEach(p=>p.classList.remove('on'));
  document.getElementById('ctab-'+tab).classList.add('on');
  document.getElementById('cpanel-'+tab).classList.add('on');
  if (tab==='premios') renderPremios();
};

// ---- RENDER CARD ----
function renderCard() {
  if (!currentUser) return;
  const u = currentUser, cycle = u.ciclo_actual||0;
  document.getElementById('userAv').textContent    = u.nombre.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('userName').textContent  = u.nombre.split(' ')[0];
  document.getElementById('userSince').textContent = 'Cliente desde '+new Date(u.fecha_registro).toLocaleDateString('es-CL',{month:'short',year:'numeric'});
  document.getElementById('userConos').textContent = u.conos_ganados||0;
  document.getElementById('stampsBadge').textContent = cycle+' / 7';
  document.getElementById('stCompras').textContent = u.visitas||0;
  document.getElementById('stCiclo').textContent   = cycle+'/7';
  document.getElementById('stConos').textContent   = u.conos_ganados||0;
  renderStamps(cycle); renderQRVisita(); renderPremios(); updatePremiosBadge();
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.navigator.standalone)
    document.getElementById('iosHint')?.classList.remove('hidden');
}

// ---- STAMPS 1-7 con puntos de milestone ----
function renderStamps(cycle) {
  const grid = document.getElementById('stampsGrid');
  grid.innerHTML = '';
  const mc = {3:'#4CAF50',5:'#2196F3',7:'#FFD307'};
  for (let i=1;i<=7;i++) {
    const d=document.createElement('div'), filled=i<=cycle;
    d.className='stamp'+(filled?' on':' empty');
    d.style.position='relative';
    d.innerHTML=filled?'<span style="font-size:13px">🍗</span>':`<span style="color:#444;font-size:9px">${i}</span>`;
    if (mc[i]) {
      const dot=document.createElement('div');
      dot.style.cssText=`position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:${mc[i]};border:1.5px solid #181818`;
      d.appendChild(dot);
    }
    grid.appendChild(d);
  }
  const left=7-cycle, msg=document.getElementById('stampsMsg');
  if (cycle>=7)      msg.innerHTML='🏆 <strong>¡Premio generado!</strong> Revísalo en "Mis Premios"';
  else if (cycle===6) msg.innerHTML='🔥 <strong>¡Próxima compra es tu premio final!</strong>';
  else if (cycle===5) msg.innerHTML='🎫 <strong>¡Premio generado!</strong> Revísalo en "Mis Premios"';
  else if (cycle===3) msg.innerHTML='🎫 <strong>¡Ganaste un 20% de descuento!</strong> Revísalo en "Mis Premios"';
  else msg.innerHTML=`Te ${left===1?'falta':'faltan'} <strong>${left} compra${left===1?'':'s'}</strong> para el próximo premio`;
}

// ---- QR VISITA ----
function renderQRVisita() {
  if (qrVisitaDone) return;
  document.getElementById('visitaId').textContent  = currentUser.id;
  document.getElementById('sucLabel').textContent  = currentUser.suc_frecuente||"D'Poyo";
  waitForQRLib(()=>{ new QRCode(document.getElementById('visitaQRDiv'),{
    text:currentUser.id, width:150, height:150,
    colorDark:'#1e1e1e', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.H,
  }); qrVisitaDone=true; });
}

// ---- PREMIOS ----
function renderPremios() {
  const u=currentUser, cont=document.getElementById('premiosContent');
  if (!cont) return;
  const premio=u.premio_activo, hist=u.premios_historial||[];

  if (!premio&&hist.length===0) {
    cont.innerHTML=`<div style="text-align:center;padding:28px 16px;color:#888">
      <div style="font-size:40px;margin-bottom:10px">🎫</div>
      <div style="font-size:14px;font-weight:500;margin-bottom:4px">Aún no tienes premios</div>
      <div style="font-size:12px">En la compra 3 ganas tu primer 20% de descuento</div>
    </div>`;
    return;
  }

  let html='';

  if (premio&&!premio.usado) {
    const dias=Math.ceil((new Date(premio.vence)-new Date())/86400000);
    const isCono=premio.tipo==='cono';
    const color=isCono?'#FFD307':(premio.tipo==='40%'?'#2196F3':'#4CAF50');
    const textColor=isCono?'#1e1e1e':'#fff';
    const title=isCono?'🏆 SÚPER CONO GRATIS':`🎫 ${premio.tipo} DE DESCUENTO`;
    const h=isCono?'¡Lo lograste!':`¡${premio.tipo} de descuento en tu próxima compra!`;
    const sub=isCono?'Muestra este QR en caja para cobrarlo':'Muestra este QR al cajero al momento de pagar';
    const qrId='pqr_'+premio.id.replace(/[^a-zA-Z0-9]/g,'_');

    html+=`<div style="background:#252525;border-radius:14px;overflow:hidden;border:2px solid ${color};margin-bottom:12px">
      <div style="background:${color};padding:11px 14px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:${textColor};letter-spacing:1px">${title}</div>
        <div style="background:#1e1e1e;color:${color};font-size:10px;font-weight:600;padding:2px 9px;border-radius:20px">ACTIVO</div>
      </div>
      <div style="padding:14px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${color};margin-bottom:3px">${h}</div>
        <div style="font-size:12px;color:#aaa;margin-bottom:12px">${sub}</div>
        <div style="background:#fff;border-radius:9px;padding:11px;display:inline-flex;flex-direction:column;align-items:center;gap:5px;margin-bottom:10px">
          <div id="${qrId}" style="min-width:120px;min-height:120px"></div>
          <div style="font-family:monospace;font-size:10px;color:#555">${premio.id}</div>
        </div>
        ${dias>=0
          ?`<div style="display:flex;align-items:center;gap:6px;background:#1a1000;border:1px solid #4a3000;border-radius:8px;padding:9px 11px;font-size:12px;color:#f0a060">
              ⏰ &nbsp;Válido <strong style="color:#FFD307">${dias} día${dias===1?'':'s'}</strong> más · vence el <strong style="color:#FFD307">${new Date(premio.vence).toLocaleDateString('es-CL',{day:'numeric',month:'long'})}</strong>
            </div>`
          :`<div style="display:flex;align-items:center;gap:6px;background:#2a0a0a;border:1px solid #8a2a2a;border-radius:8px;padding:9px 11px;font-size:12px;color:#f08080">
              ✕ &nbsp;Este premio venció — habla con el cajero si tienes dudas
            </div>`}
      </div>
    </div>`;
    // Guardar info del QR para generarlo DESPUÉS del innerHTML
    cont._pendingQR = { id: qrId, text: premio.id };
  }

  if (hist.length>0) {
    html+=`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#666;margin:12px 0 8px">Ya utilizados</div>`;
    hist.forEach(p=>{
      if (p.reemplazado) return; // no mostrar los reemplazados
      html+=`<div style="background:#252525;border-radius:12px;border:1px solid #2a2a2a;padding:12px 14px;margin-bottom:8px;opacity:.6;display:flex;align-items:center;gap:10px">
        <div style="font-size:20px">${p.tipo==='cono'?'🏆':'🎫'}</div>
        <div>
          <div style="font-size:13px;font-weight:500;color:#888">${p.tipo==='cono'?'Súper Cono Gratis':p.tipo+' de descuento'}</div>
          <div style="font-size:11px;color:#555">Canjeado · ${p.fecha||''}</div>
        </div>
        <div style="margin-left:auto;background:#1a2a1a;border:1px solid #2a5a2a;color:#6dd06d;font-size:10px;padding:2px 8px;border-radius:10px">✓ Usado</div>
      </div>`;
    });
  }

  // Primero escribir el HTML, LUEGO generar el QR
  cont.innerHTML=html;

  // Ahora el elemento existe en el DOM — generar QR
  if (cont._pendingQR) {
    const {id: qrId, text: qrText} = cont._pendingQR;
    cont._pendingQR = null;
    waitForQRLib(()=>{
      const el=document.getElementById(qrId);
      if (!el) return;
      el.innerHTML=''; // limpiar por si acaso
      try {
        new QRCode(el,{text:qrText,width:120,height:120,colorDark:'#1e1e1e',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.H});
      } catch(e){ console.warn('QR error',e); }
    });
  }
}

function updatePremiosBadge() {
  const badge=document.getElementById('premiosBadge');
  if (!badge) return;
  badge.style.display=(currentUser?.premio_activo&&!currentUser.premio_activo.usado)?'block':'none';
}

// ---- GEO ----
function startGeo() {
  if (!navigator.geolocation) return;
  checkProximity(); setInterval(checkProximity,60000);
}
function checkProximity() {
  navigator.geolocation.getCurrentPosition(pos=>{
    const cercana=SUCURSALES.find(s=>haversine(pos.coords.latitude,pos.coords.longitude,s.lat,s.lng)<=s.radio);
    const card=document.getElementById('geoNotif'), txt=document.getElementById('geoTxt');
    if (cercana) {
      document.getElementById('sucLabel').textContent=cercana.nombre;
      if (currentUser){currentUser.suc_frecuente=cercana.nombre;saveLocalUser(currentUser);}
      const cycle=currentUser?.ciclo_actual||0, left=7-cycle;
      txt.innerHTML=cycle>=6
        ?`¡Estás cerca de <strong>${cercana.nombre}</strong>! 🔥 <strong>La próxima es tu premio final</strong>`
        :`¡Estás cerca de <strong>${cercana.nombre}</strong>! Te ${left===1?'falta':'faltan'} <strong>${left} compra${left===1?'':'s'}</strong>`;
      card.classList.remove('hidden');
      tryPushNotif(cycle,left,cercana.nombre);
    } else card.classList.add('hidden');
  },()=>{},{enableHighAccuracy:false,timeout:10000});
}
function tryPushNotif(cycle,left,suc) {
  if (Notification.permission!=='granted') return;
  const ultima=currentUser?.ultima_notif?new Date(currentUser.ultima_notif):null;
  if (ultima&&(Date.now()-ultima.getTime())/3600000<INTERVALO_NOTIF_H) return;
  let idx; do{idx=Math.floor(Math.random()*MENSAJES_PROX.length);}while(idx===(currentUser.ultimo_msg_idx??-1));
  const body=MENSAJES_PROX[idx].replace('{V}',left).replace('{S}',left===1?'':'s');
  navigator.serviceWorker.ready.then(sw=>sw.showNotification("D'Poyo",{
    body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'dpoyo-geo',renotify:false,data:{url:'/'},
  }));
  currentUser.ultima_notif=new Date().toISOString(); currentUser.ultimo_msg_idx=idx; saveLocalUser(currentUser);
}

// ---- NOTIF ----
window.requestNotif=async function(){
  const perm=await Notification.requestPermission();
  if (perm==='granted'){
    currentUser.notif_activa=true; saveLocalUser(currentUser);
    const btn=document.getElementById('btnNotif');
    if(btn){btn.textContent='✓ Notificaciones activas';btn.classList.add('active');}
    checkProximity();
  }
};

// ---- INSTALL ----
window.doInstall=function(){
  if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(()=>{deferredPrompt=null;});document.getElementById('installBar')?.classList.add('hidden');}
};

// ---- STORAGE ----
function saveLocalUser(u){localStorage.setItem('dpoyo_user',JSON.stringify(u));}
function loadLocalUser(){try{return JSON.parse(localStorage.getItem('dpoyo_user'));}catch{return null;}}

// ---- UTILS ----
function haversine(la1,lo1,la2,lo2){
  const R=6371000,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
  return R*2*Math.atan2(Math.sqrt(Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2),Math.sqrt(1-Math.sin(dLa/2)**2-Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2));
}


// ---- WAIT FOR QR LIB ----
function waitForQRLib(cb, attempts=0) {
  if (window.QRCode) { cb(); return; }
  if (attempts > 20) return;
  setTimeout(() => waitForQRLib(cb, attempts+1), 200);
}

const s=document.createElement('script');
s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
document.head.appendChild(s);
