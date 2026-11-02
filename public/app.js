const $=s=>document.querySelector(s),root=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tt;const toast=(t,ok=true)=>{const e=$('#toast');e.textContent=t;e.className=ok?'ok':'er';clearTimeout(tt);tt=setTimeout(()=>e.className='',4500)};
async function api(url,body){const a=sessionStorage.getItem('adm');
const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(a?{'x-admin-secret':a}:{})},body:body&&JSON.stringify(body)});
const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.erro||'Erro inesperado. Tente novamente.');e.status=r.status;throw e}return d}
const card=(s,extra='',sel)=>`<div class="card ${sel?'sel':''}">${s.logo?`<img src="${esc(s.logo)}" alt="">`:''}<h3>${esc(s.nome)}</h3><p>${esc(s.descricao)}</p>${extra}</div>`;
const guard=async(btn,f)=>{btn.disabled=true;try{await f()}catch(e){toast(e.message,false);btn.disabled=false}};

async function publico(){
const [st,S]=await Promise.all([api('/api/startups'),api('/api/status')]);let sel=null,feito=S.jaVotou;
const draw=()=>{root.innerHTML=`<h1>Vote na sua startup favorita</h1>${feito?'<p class="ok">✔ Seu voto já foi registrado. Obrigado!</p>':!S.publico_aberto?'<p class="aviso">A votação está encerrada.</p>':''}
<div class="grid">${st.map(s=>card(s,`<button data-s="${s.id}" ${feito||!S.publico_aberto?'disabled':''}>${sel===s.id?'Selecionada ✓':'Selecionar'}</button>`,sel===s.id)).join('')}</div>
${sel&&!feito?`<div class="bar"><span>Seu voto: <b>${esc(st.find(s=>s.id===sel).nome)}</b></span><button id="ok">Confirmar voto</button><button class="sec" id="no">Cancelar</button></div>`:''}`};
draw();root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.s){sel=+b.dataset.s;draw()}
if(b.id==='no'){sel=null;draw()}if(b.id==='ok')guard(b,async()=>{await api('/api/votos/publico',{startup_id:sel});feito=true;toast('Voto registrado!');draw()})}}

function login(){root.innerHTML='<h1>Acesso dos juízes</h1><div class="row"><p>Digite a senha fornecida pela organização.</p><input id="pw" type="password" placeholder="Senha" autocomplete="off"> <button id="in">Entrar</button></div>';
const go=()=>guard($('#in'),async()=>{await api('/api/juizes/login',{senha:$('#pw').value});await juizes()});
root.onclick=e=>{if(e.target.id==='in')go()};$('#pw').onkeydown=e=>{if(e.key==='Enter')go()};$('#pw').focus()}

async function juizes(){
let st,cr,S;try{[st,cr,S]=await Promise.all([api('/api/startups'),api('/api/criterios'),api('/api/status')])}catch(e){if(e.status===403)return login();throw e}
const feitas=new Set(S.avaliadas);let fav=S.favorita,cur=null,n={},com='';
const lista=()=>{root.innerHTML=`<h1>Avaliação dos juízes</h1>${S.juizes_abertos?'':'<p class="aviso">Avaliações encerradas.</p>'}
<div class="grid">${st.map(s=>card(s,feitas.has(s.id)?'<span class="ok">Avaliada ✓</span>':`<button data-av="${s.id}" ${S.juizes_abertos?'':'disabled'}>Avaliar</button>`)).join('')}</div>
<h2>Startup favorita (independente das notas)</h2><div class="row">${fav?`<span class="ok">Favorita registrada: ${esc(st.find(s=>s.id===fav)?.nome)}</span>`:`<select id="fav"><option value="">Escolha…</option>${st.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select><p><button id="favok" ${S.juizes_abertos?'':'disabled'}>Registrar favorita</button></p>`}</div>`};
const form=()=>{const s=st.find(x=>x.id===cur);root.innerHTML=`<h1>${esc(s.nome)}</h1>${cr.map(c=>`<div class="row"><b>${esc(c.nome)}</b><br><small>${esc(c.descricao)}</small><div class="nota">${Array.from({length:c.nota_max-c.nota_min+1},(_,i)=>c.nota_min+i).map(v=>`<button type="button" data-c="${c.id}" data-v="${v}" class="${n[c.id]===v?'on':''}">${v}</button>`).join('')}</div></div>`).join('')}
<div class="row"><b>Comentário (opcional)</b><textarea id="com" maxlength="500">${esc(com)}</textarea></div><button id="rev">Revisar</button> <button class="sec" id="vol">Voltar</button>`};
const rev=()=>{const s=st.find(x=>x.id===cur);root.innerHTML=`<h1>Revisar: ${esc(s.nome)}</h1><div class="row">${cr.map(c=>`<p>${esc(c.nome)}: <b>${n[c.id]}</b></p>`).join('')}<p>Comentário: ${esc(com)||'—'}</p></div><p>Após o envio, não é possível alterar.</p><button id="send">Confirmar envio</button> <button class="sec" id="edit">Editar</button>`};
lista();root.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
if(d.av){cur=+d.av;n={};com='';form()}
if(d.c){com=$('#com').value;n[d.c]=+d.v;form()}
if(b.id==='vol'){lista()}if(b.id==='edit'){form()}
if(b.id==='rev'){com=$('#com').value;if(cr.some(c=>!n[c.id]))return toast('Dê uma nota para todos os critérios.',false);rev()}
if(b.id==='send')guard(b,async()=>{await api('/api/avaliacoes',{startup_id:cur,notas:n,comentario:com});feitas.add(cur);toast('Avaliação enviada!');lista()});
if(b.id==='favok'){const v=+$('#fav').value;if(!v)return toast('Escolha uma startup.',false);guard(b,async()=>{await api('/api/votos/juizes',{startup_id:v});fav=v;toast('Favorita registrada!');lista()})}}}

async function resultadosPg(){
try{const r=await api('/api/resultados'),max=Math.max(1,...r.publico.startups.map(s=>s.votos)),cr=r.juizes.criterios;
root.innerHTML=`<h1>Resultados</h1><h2>🗳️ Votação popular <small>(${r.publico.total} votos válidos)</small></h2><div class="tb"><table><tr><th>#</th><th>Startup</th><th>Votos</th><th>%</th><th></th></tr>
${r.publico.startups.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.nome)}</td><td>${s.votos}</td><td>${s.percentual}%</td><td style="width:30%"><div class="fill" style="width:${s.votos/max*100}%"></div></td></tr>`).join('')}</table></div>
<h2>⚖️ Avaliação dos juízes</h2><p><small>Média geral = média simples das médias dos critérios (mesmo peso). Votos de preferência são contados à parte e não entram na média.</small></p><div class="tb"><table><tr><th>#</th><th>Startup</th>${cr.map(c=>`<th>${esc(c.nome)}</th>`).join('')}<th>Média geral</th><th>Avaliações</th><th>Votos favorita</th></tr>
${r.juizes.startups.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.nome)}</td>${cr.map(c=>`<td>${s.medias[c.id]??'—'}</td>`).join('')}<td><b>${s.media_geral??'—'}</b></td><td>${s.avaliacoes}</td><td>${s.votos_preferencia}</td></tr>`).join('')}</table></div>`}
catch(e){root.innerHTML=`<h1>Resultados</h1><p class="aviso">${esc(e.message)}</p>`}}

async function admin(){
const draw=async()=>{if(!sessionStorage.getItem('adm')){root.innerHTML='<h1>Administração</h1><div class="row"><input id="pw" type="password" placeholder="Senha de administrador"> <button id="in">Entrar</button></div>';return}
try{const c=await api('/api/admin/config'),o=location.origin,L=[['juizes_abertos','Avaliações dos juízes'],['publico_aberto','Votação do público'],['resultados_liberados','Divulgação dos resultados']];
root.innerHTML=`<h1>Administração</h1>${L.map(([k,t])=>`<div class="row"><b>${t}:</b> ${c[k]?'<span class="ok">ABERTA/LIBERADA</span>':'FECHADA'} <button data-k="${k}" data-v="${c[k]?0:1}">${c[k]?'Fechar':'Abrir'}</button></div>`).join('')}
<div class="row">${[['juizes','Avaliação dos Juízes',`${o}/juizes`],['publico','Votação do Público',`${o}/publico${c.publico_code?'?c='+c.publico_code:''}`]].map(([t,n,u])=>`<p><b>${n}</b><br><code style="word-break:break-all">${esc(u)}</code><br><button data-qr="${t}">Abrir QR Code em nova guia</button> <button class="sec" data-cp="${esc(u)}">Copiar link</button></p>`).join('')}<p><a href="/resultados">Ver resultados</a> (como administrador, funcionam mesmo antes da liberação)</p></div>`}
catch(e){sessionStorage.removeItem('adm');toast(e.message,false);draw()}};
draw();root.onclick=async e=>{const b=e.target.closest('button');if(!b)return;
if(b.id==='in'){sessionStorage.setItem('adm',$('#pw').value);draw()}
if(b.dataset.qr)window.open('/qr?tipo='+b.dataset.qr,'_blank');
if(b.dataset.cp)navigator.clipboard.writeText(b.dataset.cp).then(()=>toast('Link copiado!'),()=>toast('Não foi possível copiar.',false));
if(b.dataset.k)guard(b,async()=>{await api('/api/admin/config',{chave:b.dataset.k,valor:+b.dataset.v});draw()})}}

async function qr(){
const j=new URLSearchParams(location.search).get('tipo')==='juizes',nome=j?'Avaliação dos Juízes':'Votação do Público';document.title='QR Code - '+nome;
try{const c=await api('/api/admin/config'),o=location.origin,url=j?`${o}/juizes`:`${o}/publico${c.publico_code?'?c='+c.publico_code:''}`;
await new Promise((ok,er)=>{const x=document.createElement('script');x.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';x.onload=ok;x.onerror=()=>er(new Error('Não foi possível carregar o gerador de QR Code. Verifique a internet.'));document.head.appendChild(x)});
root.innerHTML=`<div style="text-align:center"><h1 style="font-size:2.2rem">${j?'⚖️':'🗳️'} ${nome}</h1><div id="qr" style="display:inline-block;background:#fff;padding:20px;border-radius:12px"></div><p style="font-size:1.3rem">Aponte a câmera do celular para acessar</p></div>`;
new QRCode($('#qr'),{text:url,width:340,height:340,correctLevel:QRCode.CorrectLevel.M})}
catch(e){root.innerHTML=`<h1>${nome}</h1><p class="aviso">${esc(e.message)} Abra esta página pelo botão do painel /admin, já logado.</p>`}}

const rota={'/qr':qr,'/publico':publico,'/juizes':juizes,'/resultados':resultadosPg,'/admin':admin}[location.pathname];
rota().catch(e=>root.innerHTML=`<p class="aviso">${esc(e.message)}</p>`);
