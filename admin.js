// D'POYO — admin.js v3.0 FINAL
import { db, auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, updateDoc, query, orderBy, limit, where, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================
//  ROLES
// =============================================
const ROLES = {
  'adminestado@dpoyo.cl':    { nombre:'Admin Estado',    suc:'Estado',    nivel:'admin' },
  'adminhuerfanos@dpoyo.cl': { nombre:'Admin Huérfanos', suc:'Huérfanos', nivel:'admin' },
  'administrador@dpoyo.cl':  { nombre:'Superadmin',      suc:'Ambas',     nivel:'super' },
};

const DIAS_PREMIO = 7;
let currentAdmin  = null;
let allClients    = [];
let bdayDays      = 2;
let scanStream    = null;
let scanActive    = false;
let scanCanvas, scanCtx;

const PROX_MSGS = [
  "🍗 Oye, D'Poyo está a pasos. ¿Vas a pasar de largo? Te faltan {V} compras para el próximo premio.",
  "☀️ Hora de almorzar y estás justo cerca de D'Poyo. Coincidencia... o destino 👀",
  "🎯 {V} compras más y el siguiente premio es tuyo. D'Poyo te espera a la vuelta.",
  "🐔 El pollo te está llamando. Literalmente estás a metros del local.",
  "⚡ ¡Casi! {V} compra{S} más y ganas tu próximo premio. ¡Hoy puede ser el día!",
  "🍦 Tu próximo premio está cada vez más cerca. Tú también.",
];

// =============================================
//  AUTH
// =============================================
onAuthStateChanged(auth, user => {
  if (user && ROLES[user.email]) {
    currentAdmin = { email:user.email, ...ROLES[user.email] };
    showAdminApp();
  } else showLoginScreen();
});

window.doLogin = async function() {
  const email=document.getElementById('loginEmail').value.trim();
  const pass =document.getElementById('loginPass').value;
  document.getElementById('loginErr').style.display='none';
  try { await signInWithEmailAndPassword(auth,email,pass); }
  catch(e) { document.getElementById('loginErr').style.display='block'; }
};

window.doLogout = async function() { await signOut(auth); };

function showLoginScreen() {
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('adminApp').style.display='none';
}

function showAdminApp() {
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('adminApp').style.display='block';
  document.getElementById('navSuc').textContent  = currentAdmin.suc;
  document.getElementById('navRole').textContent = currentAdmin.nivel==='super'?'⭐ Superadmin':'Admin';
  if (currentAdmin.nivel==='super') {
    document.querySelectorAll('.super-only').forEach(el=>el.style.display='block');
    renderProxMsgs();
  }
  loadClients(); renderStats();
}

// =============================================
//  TABS
// =============================================
window.swTab = function(tab,el) {
  document.querySelectorAll('.apanel').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('on'));
  document.getElementById('ap-'+tab).classList.add('on');
  el.classList.add('on');
  if (tab!=='scan') stopCamera();
  if (tab==='clientes') renderClients('');
  if (tab==='stats') renderStats();
};

// =============================================
//  CAMERA
// =============================================
window.toggleCamera = async function() {
  if (scanActive){stopCamera();return;}
  try {
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:640}}});
    const video=document.getElementById('scanVideo');
    video.srcObject=scanStream; await video.play();
    document.getElementById('videoWrap').style.display='block';
    document.getElementById('btnCam').textContent='✕ Cerrar cámara';
    scanCanvas=document.createElement('canvas'); scanCtx=scanCanvas.getContext('2d');
    scanActive=true; requestAnimationFrame(scanLoop);
  } catch(e){alert('No se pudo acceder a la cámara. Usa el ingreso manual.');}
};

function stopCamera() {
  scanActive=false;
  if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}
  document.getElementById('videoWrap').style.display='none';
  document.getElementById('btnCam').textContent='📷 ESCANEAR CON CÁMARA';
}

function scanLoop() {
  if (!scanActive) return;
  const video=document.getElementById('scanVideo');
  if (video.readyState===video.HAVE_ENOUGH_DATA&&window.jsQR) {
    scanCanvas.width=video.videoWidth; scanCanvas.height=video.videoHeight;
    scanCtx.drawImage(video,0,0);
    const img=scanCtx.getImageData(0,0,scanCanvas.width,scanCanvas.height);
    const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});
    if (code?.data) {
      stopCamera();
      document.getElementById('scanInp').value=code.data.trim().toUpperCase();
      doScan(); return;
    }
  }
  requestAnimationFrame(scanLoop);
}

// =============================================
//  SCAN ROUTING
// =============================================
window.doScan = async function() {
  const val=document.getElementById('scanInp').value.trim().toUpperCase();
  if (!val) return;
  document.getElementById('scanInp').value='';
  if (val.startsWith('BDAY-'))  { await processCanje(val,'bday');     return; }
  if (val.startsWith('CANJE-')) { await processCanje(val,'canje');    return; }
  if (val.startsWith('DESC-'))  { await processCanje(val,'descuento');return; }
  await processVisita(val);
};

// =============================================
//  PROCESS VISITA — LÓGICA ESCALONADA
// =============================================
async function processVisita(clientId) {
  let cl;
  try {
    const snap=await getDoc(doc(db,'clientes',clientId));
    if (!snap.exists()){showResult('err','QR no reconocido','Verifica el código e intenta de nuevo.');return;}
    cl={id:snap.id,...snap.data()};
  } catch(e){showResult('err','Error de conexión','Revisa tu internet e intenta de nuevo.');return;}

  const nuevasVisitas = (cl.visitas||0)+1;
  const nuevoCiclo    = (cl.ciclo_actual||0)+1;
  const descUsados    = cl.descuentos_usados||0;
  const updates       = {visitas:nuevasVisitas, suc_frecuente:currentAdmin.suc};
  const vence         = new Date(); vence.setDate(vence.getDate()+DIAS_PREMIO);
  const initials      = cl.nombre.slice(0,3).toUpperCase();

  await addDoc(collection(db,'visitas'),{
    cliente_id:clientId, nombre:cl.nombre,
    sucursal:currentAdmin.suc, admin:currentAdmin.email,
    fecha:serverTimestamp(),
  });

  let premioPara=null, resultType='ok', resultTitle='', resultSub='';

  if (nuevoCiclo===3) {
    // COMPRA 3 → siempre 20%
    const id=`DESC-${Math.floor(1000+Math.random()*9000)}-20P`;
    premioPara={id,vence:vence.toISOString(),usado:false,tipo:'20%'};
    updates.ciclo_actual=nuevoCiclo;
    resultType='prize';
    resultTitle=`🎫 20% DE DESCUENTO — ${cl.nombre}`;
    resultSub=`Compra 3 ✓ · QR generado: ${id} · Válido ${DIAS_PREMIO} días`;

  } else if (nuevoCiclo===5) {
    // COMPRA 5 → 40% si NO usó dcto compra 3 / 20% si SÍ usó
    if (descUsados===0) {
      // No usó el 20% → dar 40% y eliminar el 20% pendiente
      const id=`DESC-${Math.floor(1000+Math.random()*9000)}-40P`;
      if (cl.premio_activo&&cl.premio_activo.tipo==='20%'&&!cl.premio_activo.usado) {
        const hist=cl.premios_historial||[];
        hist.push({tipo:'20%',id:cl.premio_activo.id,fecha:'Reemplazado por 40%',reemplazado:true});
        updates.premios_historial=hist;
      }
      premioPara={id,vence:vence.toISOString(),usado:false,tipo:'40%'};
      resultType='prize';
      resultTitle=`🎫 40% DE DESCUENTO — ${cl.nombre}`;
      resultSub=`Compra 5 ✓ · No usó dcto compra 3 · QR: ${id} · Válido ${DIAS_PREMIO} días`;
    } else {
      // Usó el 20% → dar otro 20%
      const id=`DESC-${Math.floor(1000+Math.random()*9000)}-20P`;
      premioPara={id,vence:vence.toISOString(),usado:false,tipo:'20%'};
      resultType='prize';
      resultTitle=`🎫 20% DE DESCUENTO — ${cl.nombre}`;
      resultSub=`Compra 5 ✓ · Usó dcto compra 3 · QR: ${id} · Válido ${DIAS_PREMIO} días`;
    }
    updates.ciclo_actual=nuevoCiclo;

  } else if (nuevoCiclo>=7) {
    // COMPRA 7
    updates.ciclo_actual=0;
    if (descUsados===0) {
      // No usó ningún dcto → Súper Cono
      const id=`CANJE-${Math.floor(1000+Math.random()*9000)}-${initials}`;
      premioPara={id,vence:vence.toISOString(),usado:false,tipo:'cono'};
      updates.conos_ganados=(cl.conos_ganados||0)+1;
      resultType='prize';
      resultTitle=`🏆 ¡SÚPER CONO GRATIS! — ${cl.nombre}`;
      resultSub=`Compra 7 ✓ · Sin descuentos usados · QR: ${id} · Válido ${DIAS_PREMIO} días`;
    } else {
      // Verificar si usó el dcto de compra 5
      const hist=cl.premios_historial||[];
      const usoComp5=hist.some(p=>!p.reemplazado&&(p.tipo==='40%'||(p.tipo==='20%'&&p.id?.includes('20P'))));
      const premioActUsado=cl.premio_activo?.usado;
      // Si el premio activo actual (compra 5) no fue usado → 40%
      if (cl.premio_activo&&!cl.premio_activo.usado&&(cl.premio_activo.tipo==='40%'||cl.premio_activo.tipo==='20%')) {
        // Tiene premio de compra 5 sin usar → dar 40%
        const id=`DESC-${Math.floor(1000+Math.random()*9000)}-40F`;
        // Eliminar el premio pendiente de compra 5
        const histUp=cl.premios_historial||[];
        histUp.push({tipo:cl.premio_activo.tipo,id:cl.premio_activo.id,fecha:'Reemplazado en compra 7',reemplazado:true});
        updates.premios_historial=histUp;
        premioPara={id,vence:vence.toISOString(),usado:false,tipo:'40%'};
        resultType='prize';
        resultTitle=`🎫 40% DE DESCUENTO — ${cl.nombre}`;
        resultSub=`Compra 7 ✓ · No usó dcto compra 5 · QR: ${id} · Válido ${DIAS_PREMIO} días`;
      } else {
        // Usó dcto compra 5 → 20%
        const id=`DESC-${Math.floor(1000+Math.random()*9000)}-20F`;
        premioPara={id,vence:vence.toISOString(),usado:false,tipo:'20%'};
        resultType='prize';
        resultTitle=`🎫 20% DESCUENTO FINAL — ${cl.nombre}`;
        resultSub=`Compra 7 ✓ · Usó descuentos anteriores · QR: ${id} · Válido ${DIAS_PREMIO} días`;
      }
    }

  } else {
    // Compra normal sin premio
    updates.ciclo_actual=nuevoCiclo;
    let prox='';
    if (nuevoCiclo<3)      prox=`Próximo premio en compra 3 (${3-nuevoCiclo} más)`;
    else if (nuevoCiclo<5) prox=`Próximo premio en compra 5 (${5-nuevoCiclo} más)`;
    else if (nuevoCiclo<7) prox=`Premio final en compra 7 (${7-nuevoCiclo} más)`;
    resultTitle=`✓ Compra registrada — ${cl.nombre}`;
    resultSub=`Compra #${nuevasVisitas} · ${prox}`;
  }

  if (premioPara) updates.premio_activo=premioPara;
  await updateDoc(doc(db,'clientes',clientId),updates);
  showResult(resultType,resultTitle,resultSub);
  loadClients(); renderStats();
}

// =============================================
//  PROCESS CANJE (DESC-, CANJE-, BDAY-)
// =============================================
async function processCanje(canjeId,tipo) {
  let cl,clRef;
  try {
    const q=query(collection(db,'clientes'),where('premio_activo.id','==',canjeId));
    const snap=await getDocs(q);
    if (snap.empty){showResult('err','Canje no encontrado','Verifica el código.');return;}
    cl={id:snap.docs[0].id,...snap.docs[0].data()};
    clRef=doc(db,'clientes',cl.id);
  } catch(e){showResult('err','Error de conexión','Revisa tu internet.');return;}

  const premio=cl.premio_activo;
  if (!premio||premio.usado){showResult('expired','✕ YA CANJEADO','Este premio ya fue entregado anteriormente.');return;}
  const dias=Math.ceil((new Date(premio.vence)-new Date())/86400000);
  if (dias<0){showResult('expired','✕ PREMIO VENCIDO',`Venció hace ${Math.abs(dias)} día${Math.abs(dias)===1?'':'s'}. Queda a tu criterio si igual lo entregas.`);return;}

  const hist=cl.premios_historial||[];
  const fechaHoy=new Date().toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'});
  hist.push({tipo:premio.tipo,id:canjeId,fecha:fechaHoy,usado:true});

  const updateData={'premio_activo.usado':true,premios_historial:hist};
  if (premio.tipo!=='cono') updateData.descuentos_usados=(cl.descuentos_usados||0)+1;

  await updateDoc(clRef,updateData);
  await addDoc(collection(db,'canjes'),{
    cliente_id:cl.id,nombre:cl.nombre,tipo:premio.tipo,
    sucursal:currentAdmin.suc,admin:currentAdmin.email,fecha:serverTimestamp(),
  });

  let resTitle='',resSub=`Premio entregado ✓ · Válido por ${dias} día${dias===1?'':'s'} más.`;
  if (tipo==='bday')         resTitle=`🎂 CANJE CUMPLEAÑOS — ${cl.nombre}`;
  else if (premio.tipo==='cono') { resTitle=`🏆 SÚPER CONO CANJEADO — ${cl.nombre}`; resSub+=' Nuevo ciclo iniciado.'; }
  else                       resTitle=`🎫 ${premio.tipo} DESCUENTO CANJEADO — ${cl.nombre}`;

  showResult('canje',resTitle,resSub);
  loadClients();
}

function showResult(type,title,sub) {
  const r=document.getElementById('scanResult');
  const rt=document.getElementById('resTitle');
  const rs=document.getElementById('resSub');
  rt.className='rt '+type; rt.textContent=title; rs.textContent=sub;
  r.className='result '+type; r.style.display='block';
  setTimeout(()=>r.style.display='none',6000);
}

// =============================================
//  CLIENTS LIST
// =============================================
async function loadClients() {
  try {
    let q;
    if (currentAdmin.nivel==='super') {
      q=query(collection(db,'clientes'),orderBy('visitas','desc'),limit(100));
    } else {
      q=query(collection(db,'clientes'),where('suc_frecuente','==',currentAdmin.suc),orderBy('visitas','desc'),limit(100));
    }
    const snap=await getDocs(q);
    allClients=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderClients(''); renderStats();
  } catch(e){console.warn('Could not load clients',e);}
}

window.renderClients=function(q=''){
  const list=document.getElementById('clientList');
  if (!list) return;
  const filtered=allClients.filter(c=>
    c.nombre?.toLowerCase().includes(q.toLowerCase())||
    c.id?.toLowerCase().includes(q.toLowerCase())
  );
  if (!filtered.length){list.innerHTML='<div class="empty-state">No se encontraron clientes</div>';return;}
  const hoy=new Date();
  list.innerHTML=filtered.map(c=>{
    const cycle=c.ciclo_actual||0;
    const dots=Array.from({length:7},(_,i)=>{
      const filled=i<cycle;
      const colors=['#4CAF50','#4CAF50','#4CAF50','#2196F3','#2196F3','#FFD307','#FFD307'];
      const c=colors[i]||'#FFD307';
      return '<div style="width:12px;height:12px;border-radius:50%;background:'+(filled?c:'transparent')+';border:1.5px '+(filled?'solid '+c:'dashed #333')+'"></div>';
    }).join('');
    const prizeBadge=c.premio_activo&&!c.premio_activo.usado?`<span class="prize-badge">🎫 Premio</span>`:'';
    const bdayBadge=c.cumpleanos&&isBirthday(c.cumpleanos,hoy)?`<span class="bday-badge">🎂 Hoy</span>`:'';
    return `<div class="cl-row" onclick="showClient('${c.id}')">
      <div class="cl-av">${(c.nombre||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
      <div class="cl-info">
        <div class="cl-name">${c.nombre||'—'}${prizeBadge}${bdayBadge}</div>
        <div class="cl-meta">${c.visitas||0} compras · ${c.conos_ganados||0} conos · ${c.suc_frecuente||'—'}</div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:#FFD307">${cycle}/7</div>
    </div>`;
  }).join('');
};

window.showClient=function(id){
  const c=allClients.find(cl=>cl.id===id);
  if (!c) return;
  document.getElementById('modalTitle').textContent=c.nombre;
  document.getElementById('modalBody').innerHTML=`
    <div style="font-size:12px;color:#aaa;margin-bottom:10px">
      ${c.correo||''} · ${c.whatsapp||''}<br>
      ${c.cumpleanos?'🎂 '+c.cumpleanos:''} · <span style="color:#FFD307;font-family:monospace">${c.id}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:#2a2a2a;border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:#FFD307">${c.visitas||0}</div>
        <div style="font-size:10px;color:#888">Compras</div>
      </div>
      <div style="background:#2a2a2a;border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:#FFD307">${c.ciclo_actual||0}/7</div>
        <div style="font-size:10px;color:#888">Ciclo</div>
      </div>
      <div style="background:#2a2a2a;border-radius:8px;padding:10px;text-align:center">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:#FFD307">${c.conos_ganados||0}</div>
        <div style="font-size:10px;color:#888">Conos</div>
      </div>
    </div>
    ${c.premio_activo&&!c.premio_activo.usado?`
    <div style="background:#1a1200;border:1px solid #FFD307;border-radius:8px;padding:10px;font-size:12px;color:#FFD307">
      🎫 Premio activo: ${c.premio_activo.tipo==='cono'?'Súper Cono':c.premio_activo.tipo+' dcto'}<br>
      <span style="color:#aaa">ID: ${c.premio_activo.id} · Vence: ${new Date(c.premio_activo.vence).toLocaleDateString('es-CL')}</span>
    </div>`:''}`;
  document.getElementById('clientModal').classList.add('open');
};

window.closeModal=function(){document.getElementById('clientModal').classList.remove('open');};

// =============================================
//  STATS
// =============================================
async function renderStats() {
  const total=allClients.length;
  const visitas=allClients.reduce((a,c)=>a+(c.visitas||0),0);
  const conos=allClients.reduce((a,c)=>a+(c.conos_ganados||0),0);
  document.getElementById('stClientes').textContent=total;
  document.getElementById('stVisitas').textContent=visitas;
  document.getElementById('stConos').textContent=conos;
  document.getElementById('stHoy').textContent='—';
  const near=allClients.filter(c=>(c.ciclo_actual||0)>=4).sort((a,b)=>(b.ciclo_actual||0)-(a.ciclo_actual||0));
  const nl=document.getElementById('nearList');
  if (!nl) return;
  nl.innerHTML=near.length?near.map(c=>`
    <div class="cl-row" onclick="showClient('${c.id}')">
      <div class="cl-av">${(c.nombre||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
      <div class="cl-info">
        <div class="cl-name">${c.nombre}</div>
        <div class="cl-meta">${7-(c.ciclo_actual||0)} compra${7-(c.ciclo_actual||0)===1?'':'s'} para el próximo premio</div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:#FFD307">${c.ciclo_actual||0}/7</div>
    </div>`).join('')
    :'<div class="empty-state">Nadie cerca del próximo premio aún</div>';
}

// =============================================
//  CAMPAIGN (superadmin)
// =============================================
window.sendCampaign=function(){
  const msg=document.getElementById('campMsg').value.trim();
  if (!msg){alert('Escribe un mensaje primero');return;}
  const n=allClients.length;
  if (confirm(`¿Enviar este mensaje a ${n} cliente${n===1?'':'s'}?\n\n"${msg}"`)){
    alert(`✓ Mensaje enviado a ${n} clientes`);
    document.getElementById('campMsg').value='';
    document.getElementById('campCount').textContent='0 / 160';
  }
};

window.saveBdayMsg=function(){alert('✓ Mensaje de cumpleaños guardado');};

function renderProxMsgs() {
  const c=document.getElementById('proxList');
  if (!c) return;
  c.innerHTML=PROX_MSGS.map((m,i)=>`
    <div class="prox-msg">
      <span>${m}</span>
      <button class="edit-btn" onclick="editProx(${i})">Editar</button>
    </div>`).join('');
}
window.editProx=function(i){
  const msg=prompt('Editar mensaje:',PROX_MSGS[i]);
  if (msg){PROX_MSGS[i]=msg;renderProxMsgs();}
};

// =============================================
//  BDAY CONFIG
// =============================================
window.toggleBday=function(){
  const on=document.getElementById('bdayToggle').checked;
  document.getElementById('bdayStatusLbl').textContent=on?'Activo':'Desactivado';
  document.getElementById('bdayConfigFields').style.opacity=on?'1':'0.4';
  document.getElementById('bdayConfigFields').style.pointerEvents=on?'auto':'none';
};
window.selBdayDays=function(n,el){
  document.querySelectorAll('.day-opt').forEach(d=>d.classList.remove('on'));
  el.classList.add('on'); bdayDays=n;
};
window.saveBdayConfig=function(){
  const btn=document.querySelector('.save-config-btn');
  btn.textContent='✓ GUARDADO'; btn.style.background='#22c55e';
  setTimeout(()=>{btn.textContent='GUARDAR CONFIGURACIÓN';btn.style.background='';},2000);
};

// =============================================
//  UTILS
// =============================================
function isBirthday(bdayStr,hoy){
  if (!bdayStr) return false;
  const b=new Date(bdayStr);
  return b.getMonth()===hoy.getMonth()&&b.getDate()===hoy.getDate();
}

// Load libs
const s=document.createElement('script');
s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
document.head.appendChild(s);
const s2=document.createElement('script');
s2.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
document.head.appendChild(s2);
