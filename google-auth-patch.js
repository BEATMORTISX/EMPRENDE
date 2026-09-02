/* EMPRENDE — Google Authentication + Gmail integration */
(function(){
'use strict';
const CLIENT_ID = (window.GOOGLE_CONFIG && window.GOOGLE_CONFIG.clientId) || '1025197818371-vu58khjdhv183r4dv57l3icir2nfr8t3.apps.googleusercontent.com';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
const state = { credential:null, profile:null, token:null, expiresAt:0 };

function crm(){ return window.crmSystem || null; }
function norm(v){ return String(v||'').trim().toLowerCase(); }
function alertUser(msg,type){ const c=crm(); if(c && typeof c.showAlert==='function') c.showAlert(msg,type||'info'); else console.log('[EMPRENDE]',msg); }
function payload(jwt){
  const p=String(jwt).split('.')[1];
  const b64=p.replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(decodeURIComponent(atob(b64).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
}
function findUser(email){
 const c=crm(); if(!c || !c.data) return null;
 return (c.data.users||[]).find(u=>u.activo===true && (norm(u.email)===norm(email)||norm(u.username)===norm(email)||norm(u.google_email)===norm(email)))||null;
}
function persist(){ const c=crm(); if(c && typeof c.saveData==='function') c.saveData(); }
function enter(user){
 const c=crm(); if(!c) return;
 c.currentUser=user; c.currentRole=user.role || 'participante';
 try{localStorage.setItem('emprende_current_user',JSON.stringify(user));}catch(e){}
 const w=document.getElementById('welcome-page'), m=document.getElementById('main-interface');
 if(w) w.style.display='none'; if(m) m.classList.remove('hidden');
 if(typeof c.updateNavigation==='function') c.updateNavigation();
 if(typeof c.updateUserInfo==='function') c.updateUserInfo();
 if(typeof c.applyTheme==='function') c.applyTheme();
 if(typeof c.loadDashboard==='function') c.loadDashboard();
}
function handleCredential(response){
 try{
  if(!response || !response.credential) throw new Error('Google no devolvió una credencial válida.');
  const p=payload(response.credential);
  if(p.aud && p.aud!==CLIENT_ID) throw new Error('La credencial de Google no pertenece a este cliente.');
  if(p.email_verified!==true) throw new Error('La cuenta Google debe tener el correo verificado.');
  const user=findUser(p.email);
  if(!user){ alertUser('Esta cuenta Google no está vinculada a un usuario de EMPRENDE. El administrador debe registrar primero ese correo.','warning'); return; }
  user.google_email=p.email; user.google_sub=p.sub||''; user.google_name=p.name||''; user.google_picture=p.picture||''; user.auth_provider='google'; user.google_linked_at=new Date().toISOString();
  state.credential=response.credential; state.profile=p; persist(); enter(user);
  alertUser('Bienvenido a EMPRENDE. Google fue vinculado automáticamente a tu usuario.','success');
 }catch(e){ console.error(e); alertUser(e.message||'No se pudo iniciar sesión con Google.','danger'); }
}
function initGoogle(){
 if(!window.google || !google.accounts || !google.accounts.id){ console.warn('Google Identity Services aún no está disponible.'); return; }
 if(!CLIENT_ID || CLIENT_ID==='1025197818371-vu58khjdhv183r4dv57l3icir2nfr8t3.apps.googleusercontent.com') return;
 google.accounts.id.initialize({client_id:CLIENT_ID,callback:handleCredential,auto_select:false,cancel_on_tap_outside:true});
}
function addLoginButton(){
 const form=document.getElementById('welcome-login-form'); if(!form || document.getElementById('emprende-google-login')) return;
 const wrap=document.createElement('div'); wrap.id='emprende-google-login';
 wrap.innerHTML='<div style="display:flex;align-items:center;gap:10px;color:#7b8794;font-size:.85rem;margin:14px 0"><span style="flex:1;height:1px;background:#e5e7eb"></span>o<span style="flex:1;height:1px;background:#e5e7eb"></span></div><button type="button" class="emprende-google-btn"><i class="fab fa-google"></i> Continuar con Google</button>';
 wrap.querySelector('button').addEventListener('click',function(){
   initGoogle();
   if(window.google && google.accounts && google.accounts.id) google.accounts.id.prompt();
   else alertUser('Google todavía está cargando. Intenta nuevamente en unos segundos.','warning');
 });
 form.appendChild(wrap);
}
function patchLogin(){
 const c=crm(); if(!c || !c.constructor) return;
 c.authenticateUser=function(username,password){
  const u=norm(username);
  return (this.data.users||[]).find(x=>x.activo===true && (norm(x.username)===u||norm(x.email)===u||String(x.cedula||'')===String(username||'')) && x.password===password) || null;
 };
 c.handleWelcomeLogin=function(){
  const username=document.getElementById('welcome-username')?.value||'';
  const password=document.getElementById('welcome-password')?.value||'';
  const user=this.authenticateUser(username,password);
  if(!user){ this.showAlert('Usuario, correo/cédula o contraseña incorrectos.','danger'); return; }
  this.currentUser=user; this.currentRole=user.role||'participante';
  const w=document.getElementById('welcome-page'),m=document.getElementById('main-interface');
  if(w) w.style.display='none'; if(m) m.classList.remove('hidden');
  this.updateNavigation(); this.updateUserInfo(); this.applyTheme(); this.loadDashboard();
 };
 // Keep every existing section/action. Only remove manual role selection from the login UI.
 const role=document.getElementById('welcome-role'); if(role){role.removeAttribute('required'); role.style.display='none';}
 document.querySelectorAll('label[for="welcome-role"]').forEach(x=>x.style.display='none');
 addLoginButton();
}
async function authorizeGmail(){
 if(!window.google || !google.accounts || !google.accounts.oauth2) throw new Error('Google Identity Services no está disponible.');
 return new Promise((resolve,reject)=>{
  const client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:GMAIL_SCOPES,callback:r=>{
   if(r.error){reject(new Error(r.error_description||r.error));return;}
   state.token=r.access_token; state.expiresAt=Date.now()+(Number(r.expires_in||3600)*1000); resolve(r.access_token);
  }});
  client.requestAccessToken({prompt:''});
 });
}
async function gmailFetch(path,opts){
 if(!state.token || Date.now()>state.expiresAt-30000) await authorizeGmail();
 const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,Object.assign({},opts||{},{headers:Object.assign({'Authorization':'Bearer '+state.token,'Content-Type':'application/json'},(opts&&opts.headers)||{})}));
 if(!r.ok) throw new Error('Gmail API '+r.status+': '+await r.text()); return r.json();
}
async function inbox(max=10){
 const d=await gmailFetch('messages?maxResults='+encodeURIComponent(max)); const arr=d.messages||[];
 return Promise.all(arr.map(async x=>{const m=await gmailFetch('messages/'+encodeURIComponent(x.id)+'?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date'); const h=m.payload?.headers||[]; const get=n=>(h.find(a=>norm(a.name)===norm(n))||{}).value||''; return {id:m.id,threadId:m.threadId,from:get('From'),to:get('To'),subject:get('Subject'),date:get('Date'),snippet:m.snippet||''};}));
}
function b64url(s){return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function send(to,subject,body){
 const raw='To: '+to+'\r\nSubject: '+subject+'\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n'+body;
 const r=await gmailFetch('messages/send',{method:'POST',body:JSON.stringify({raw:b64url(raw)})}); alertUser('Correo enviado correctamente desde Gmail.','success'); return r;
}
function addGmailButton(){
 const hr=document.querySelector('.header-right'); if(!hr||document.getElementById('emprende-gmail-btn')) return;
 const b=document.createElement('button'); b.id='emprende-gmail-btn'; b.className='btn btn-secondary emprende-gmail-btn'; b.innerHTML='<i class="fas fa-envelope"></i> Gmail';
 b.addEventListener('click',openGmail); hr.insertBefore(b,hr.querySelector('#logout-btn')||null);
}
function openGmail(){
 const c=crm(); if(!c) return;
 const modal=document.getElementById('generic-modal'), body=document.getElementById('modal-body'), title=document.getElementById('modal-title');
 if(!modal||!body||!title) return;
 title.textContent='Gmail';
 body.innerHTML='<div class="form-actions" style="margin-bottom:15px"><button id="gmail-connect" class="btn btn-primary"><i class="fas fa-plug"></i> Conectar Gmail</button><button id="gmail-inbox" class="btn btn-secondary" style="margin-left:8px"><i class="fas fa-inbox"></i> Cargar Bandeja</button></div><div id="gmail-list"></div><hr><h4>Enviar correo</h4><form id="gmail-send-form"><input id="gmail-to" class="form-control" placeholder="Destinatario" required><input id="gmail-subject" class="form-control" placeholder="Asunto" required style="margin-top:8px"><textarea id="gmail-body" class="form-control" rows="6" placeholder="Mensaje" required style="margin-top:8px"></textarea><button class="btn btn-success" style="margin-top:8px"><i class="fas fa-paper-plane"></i> Enviar</button></form>';
 modal.classList.add('active');
 document.getElementById('gmail-connect').onclick=async()=>{try{await authorizeGmail();alertUser('Gmail conectado.','success');}catch(e){alertUser(e.message,'danger');}};
 document.getElementById('gmail-inbox').onclick=async()=>{try{const items=await inbox(10);document.getElementById('gmail-list').innerHTML=items.length?items.map(x=>'<div style="padding:10px;border-bottom:1px solid #eee"><strong>'+escapeHtml(x.subject||'(sin asunto)')+'</strong><br><small>'+escapeHtml(x.from)+' · '+escapeHtml(x.date)+'</small><br>'+escapeHtml(x.snippet)+'</div>').join(''):'<p>No hay mensajes.</p>';}catch(e){alertUser(e.message,'danger');}};
 document.getElementById('gmail-send-form').onsubmit=async e=>{e.preventDefault();try{await send(document.getElementById('gmail-to').value,document.getElementById('gmail-subject').value,document.getElementById('gmail-body').value);e.target.reset();}catch(err){alertUser(err.message,'danger');}};
}
function escapeHtml(s){return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function boot(){
 patchLogin(); addGmailButton();
 if(window.crmSystem){ const c=crm(); c.loginWithGoogle=()=>{initGoogle();google.accounts.id.prompt();}; c.connectGmail=authorizeGmail; c.loadGmailInbox=inbox; c.sendGmail=send; c.logoutGoogle=()=>{if(state.token&&google.accounts?.oauth2)google.accounts.oauth2.revoke(state.token,()=>{});state.token=null;}; }
 initGoogle();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,50)); else setTimeout(boot,50);
})();
