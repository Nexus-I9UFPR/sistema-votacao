const $=s=>document.querySelector(s),root=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tt;const toast=(t,ok=true)=>{const e=$('#toast');e.textContent=t;e.className=ok?'ok':'er';clearTimeout(tt);tt=setTimeout(()=>e.className='',4500)};

// ===== LOGOS: coloque as imagens na pasta public/ com estes nomes, ou troque os caminhos abaixo =====
const LOGOS={startups:'/static/logo-startups.png',hackaton:'/static/logo-hackaton.png'};
// ===================================================================================================
const TR={startups:{nome:'Trilha Startups',item:'Startup'},hackaton:{nome:'Trilha Hackaton',item:'Equipe'}};
const MODO={ideacao:'Duas melhores de Ideação',avancado:'Duas melhores do Avançado',geral:'Duas melhores no geral'};
const CAT={I:'Ideação',A:'Avançado'};
const path=location.pathname.toLowerCase(),qs=new URLSearchParams(location.search);
let T=path.includes('hackaton')||qs.get('t')==='hackaton'?'hackaton':'startups';
const logo=$('#logo');logo.onerror=()=>logo.style.display='none';logo.onload=()=>logo.style.display='';
function tema(t){T=t;document.body.dataset.t=t;$('#trilha').textContent=TR[t].nome;if(logo.getAttribute('src')!==LOGOS[t])logo.src=LOGOS[t]}
async function api(url,body){const a=sessionStorage.getItem('adm');
const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(a?{'x-admin-secret':a}:{})},body:body&&JSON.stringify(body)});
const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.erro||'Erro inesperado. Tente novamente.');e.status=r.status;throw e}return d}
const guard=async(btn,f)=>{btn.disabled=true;try{await f()}catch(e){toast(e.message,false);btn.disabled=false}};
const tags=s=>(s.feminina?'♀ ':'')+(s.ensino_medio?'🎓':'');
const tabRank=(rows,full)=>`<div class="tb"><table><tr><th>Pos.</th><th>Código</th><th>Categoria</th><th>Nota (0–100)</th><th>Avaliações</th>${full?'<th>Tags</th>':''}</tr>${rows.map(s=>`<tr><td>${s.posicao??'—'}</td><td><b>${esc(s.codigo)}</b></td><td>${CAT[s.categoria]}</td><td>${s.nota==null?'—':s.nota.toFixed(2)}</td><td>${s.avaliacoes}</td>${full?`<td>${tags(s)}</td>`:''}</tr>`).join('')}</table></div>`;
const blocoPop=(m,p,ativo)=>`<div class="row"><b>${MODO[m]}</b>${ativo?' <span class="ok">(ativa)</span>':''}${p.empate?'<p class="aviso">⚠ Empate de nota entre a 2ª e a 3ª colocada. Defina o desempate.</p>':''}
${p.startups.length?`<table><tr><th>Código</th><th>Votos</th><th>%</th><th></th></tr>${p.startups.map(s=>`<tr><td><b>${esc(s.codigo)}</b></td><td>${s.votos}</td><td>${s.percentual}%</td><td style="width:40%"><div class="fill" style="width:${s.percentual}%"></div></td></tr>`).join('')}</table>`:'<p>Ainda sem finalistas (nenhuma avaliação).</p>'}<p><small>Total de votos: ${p.total}</small></p></div>`;

/* ---------- AVALIADORES ---------- */
const fmtCpf=v=>String(v).replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
function login(){root.innerHTML='<h1>Identificação do avaliador</h1><div class="row"><p>Digite seu CPF para começar. Ele será registrado junto às suas avaliações.</p><input id="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off"> <button id="in">Entrar</button></div>';
const go=()=>guard($('#in'),async()=>{await api('/api/avaliadores/login',{t:T,cpf:$('#cpf').value});await avaliadores()});
root.onclick=e=>{if(e.target.id==='in')go()};root.oninput=e=>{if(e.target.id==='cpf')e.target.value=fmtCpf(e.target.value)};$('#cpf').onkeydown=e=>{if(e.key==='Enter')go()};$('#cpf').focus()}

async function avaliadores(){
tema(T);const S=await api(`/api/status?t=${T}`);if(!S.avaliador)return login();
const [st,cr]=await Promise.all([api(`/api/startups?t=${T}`),api('/api/criterios')]);
const feitas=new Set(S.avaliadas);let cat=null,num='',cur=null,n={},com='';const item=TR[T].item;
const grade=()=>{const v=st.filter(s=>(!cat||s.categoria===cat)&&(!num||s.numero===+num));
$('#grade').innerHTML=!st.length?`<p>Nenhuma ${item.toLowerCase()} cadastrada ainda.</p>`:v.length?`<div class="chips">${v.map(s=>`<button class="cod ${feitas.has(s.id)?'feita':''}" data-av="${s.id}" ${feitas.has(s.id)||!S.avaliacoes_abertas?'disabled':''}>${esc(s.codigo)}${feitas.has(s.id)?' ✓':''}</button>`).join('')}</div>`:'<p>Nenhum resultado para esse filtro.</p>'};
const lista=()=>{const max=Math.max(0,...st.filter(s=>!cat||s.categoria===cat).map(s=>s.numero));
root.innerHTML=`<h1>Avaliação — ${item}s</h1><p><small>CPF ${fmtCpf(S.cpf)} · <button class="sec" id="sair" style="min-height:32px;padding:.2rem .6rem">Sair</button></small></p>${S.avaliacoes_abertas?'':'<p class="aviso">As avaliações estão encerradas.</p>'}
<div class="row"><b>Categoria</b><div class="nota"><button data-cat="I" class="${cat==='I'?'on':''}">Ideação</button><button data-cat="A" class="${cat==='A'?'on':''}">Avançado</button></div>
<p><b>Número</b> ${max?`<small>(1 a ${max})</small>`:''}<br><input id="num" type="number" min="1" ${max?`max="${max}"`:''} inputmode="numeric" value="${esc(num)}" placeholder="Todos" style="width:8rem"></p></div><div id="grade"></div>`;grade()};
const form=()=>{const s=st.find(x=>x.id===cur);root.innerHTML=`<h1>${esc(s.codigo)}</h1>${cr.map(c=>`<div class="row"><b>${esc(c.nome)}</b> <small>(${c.peso}%)</small><div class="nota">${Array.from({length:c.nota_max-c.nota_min+1},(_,i)=>c.nota_min+i).map(v=>`<button type="button" data-c="${c.id}" data-v="${v}" class="${n[c.id]===v?'on':''}">${v}</button>`).join('')}</div></div>`).join('')}
<div class="row"><b>Comentário (opcional)</b><textarea id="com" maxlength="500">${esc(com)}</textarea></div><button id="rev">Revisar</button> <button class="sec" id="vol">Voltar</button>`};
const rev=()=>{const s=st.find(x=>x.id===cur),tot=cr.reduce((a,c)=>a+c.peso,0),f=cr.reduce((a,c)=>a+n[c.id]/c.nota_max*c.peso,0)/tot*100;
root.innerHTML=`<h1>Revisar: ${esc(s.codigo)}</h1><div class="row">${cr.map(c=>`<p>${esc(c.nome)} (${c.peso}%): <b>${n[c.id]}</b></p>`).join('')}<p><b>Nota final: ${f.toFixed(1)} / 100</b></p><p>Comentário: ${esc(com)||'—'}</p></div><p>Após o envio, não é possível alterar.</p><button id="send">Confirmar envio</button> <button class="sec" id="edit">Editar</button>`};
lista();
root.oninput=e=>{if(e.target.id==='num'){num=e.target.value;grade()}};
root.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
if(b.id==='sair')return guard(b,async()=>{await api('/api/avaliadores/logout',{t:T});await avaliadores()});
if(d.cat){cat=cat===d.cat?null:d.cat;lista()}
if(d.av){cur=+d.av;n={};com='';form()}
if(d.c){com=$('#com').value;n[d.c]=+d.v;form()}
if(b.id==='vol'){lista()}if(b.id==='edit'){form()}
if(b.id==='rev'){com=$('#com').value;if(cr.some(c=>!n[c.id]))return toast('Dê uma nota para todos os critérios.',false);rev()}
if(b.id==='send')guard(b,async()=>{await api('/api/avaliacoes',{t:T,startup_id:cur,notas:n,comentario:com});feitas.add(cur);toast('Avaliação enviada!');lista()})}}

/* ---------- PÚBLICO ---------- */
async function publico(){
tema(T);const [F,S]=await Promise.all([api(`/api/finalistas?t=${T}`),api(`/api/status?t=${T}`)]);let sel=null,feito=S.jaVotou;const pode=F.aberto&&F.startups.length>=2;
const draw=()=>{root.innerHTML=`<h1>Votação popular</h1><p><b>${MODO[F.modo]}</b> — escolha a sua favorita</p>${feito?'<p class="ok">✔ Seu voto já foi registrado. Obrigado!</p>':!F.aberto?'<p class="aviso">A votação popular ainda não está aberta.</p>':F.startups.length<2?'<p class="aviso">Finalistas ainda não definidos.</p>':''}
<div class="grid">${F.startups.map(s=>`<div class="card ${sel===s.id?'sel':''}"><h3 class="big">${esc(s.codigo)}</h3><p>${CAT[s.categoria]}</p><button data-s="${s.id}" ${pode&&!feito?'':'disabled'}>${sel===s.id?'Selecionada ✓':'Selecionar'}</button></div>`).join('')}</div>
${sel&&!feito?`<div class="bar"><span>Seu voto: <b>${esc(F.startups.find(s=>s.id===sel).codigo)}</b></span><button id="ok">Confirmar voto</button><button class="sec" id="no">Cancelar</button></div>`:''}`};
draw();root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.s){sel=+b.dataset.s;draw()}
if(b.id==='no'){sel=null;draw()}if(b.id==='ok')guard(b,async()=>{await api('/api/votos/publico',{t:T,startup_id:sel});feito=true;toast('Voto registrado!');draw()})}}

/* ---------- RESULTADOS (público, após liberar) ---------- */
async function resultadosPg(){tema(T);
try{const r=await api(`/api/resultados?t=${T}`);
root.innerHTML=`<h1>Resultados</h1><h2>Ranking das avaliações</h2>${tabRank(r.ranking,false)}<h2>Votação popular</h2>${Object.keys(MODO).map(m=>blocoPop(m,r.popular[m])).join('')}`}
catch(e){root.innerHTML=`<h1>Resultados</h1><p class="aviso">${esc(e.message)}</p>`}}

/* ---------- QR CODE (nova guia) ---------- */
async function qr(){tema(T);const av=qs.get('p')==='avaliadores',nome=av?'Avaliadores':'Votação do Público';document.title='QR Code - '+nome;
const url=`${location.origin}/${av?'avaliadores':'publico'}${T==='hackaton'?'hackaton':''}`;
try{await new Promise((ok,er)=>{const x=document.createElement('script');x.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';x.onload=ok;x.onerror=()=>er(new Error('Não foi possível carregar o gerador de QR Code. Verifique a internet.'));document.head.appendChild(x)});
root.innerHTML=`<div style="text-align:center"><h1 style="font-size:2.2rem;color:var(--p)">${av?'⚖️':'🗳️'} ${nome}</h1><h2>${TR[T].nome}</h2><div id="qr" style="display:inline-block;background:#fff;padding:20px;border-radius:12px"></div><p style="font-size:1.3rem">Aponte a câmera do celular para acessar</p></div>`;
new QRCode($('#qr'),{text:url,width:340,height:340,correctLevel:QRCode.CorrectLevel.M})}
catch(e){root.innerHTML=`<h1>${nome}</h1><p class="aviso">${esc(e.message)}</p>`}}

/* ---------- ADMIN ---------- */
function loginAdm(){$('#trilha').textContent='Administração';$('#acoes').innerHTML='';root.innerHTML='<h1>Administração</h1><div class="row"><input id="pw" type="password" placeholder="Senha de administrador"> <button id="in">Entrar</button></div>';
const go=()=>{sessionStorage.setItem('adm',$('#pw').value);admin()};root.onclick=e=>{if(e.target.id==='in')go()};$('#pw').onkeydown=e=>{if(e.key==='Enter')go()}}
function escolher(){$('#trilha').textContent='Administração';$('#acoes').innerHTML='';delete document.body.dataset.t;logo.style.display='none';
root.innerHTML='<h1>Escolha a trilha</h1><div class="grid"><button class="big-btn" style="background:#7a1cff" data-tr="startups">Trilha Startups</button><button class="big-btn" style="background:#0a5cff" data-tr="hackaton">Trilha Hackaton</button></div>';
root.onclick=e=>{const b=e.target.closest('button');if(b?.dataset.tr){sessionStorage.setItem('trilha',b.dataset.tr);admin()}}}

async function admin(){
root.oninput=null;root.onchange=null;
if(!sessionStorage.getItem('adm'))return loginAdm();
const tr=sessionStorage.getItem('trilha');if(!tr)return escolher();
tema(tr);$('#acoes').innerHTML='<button id="troca">Trocar trilha</button>';$('#acoes').onclick=()=>{sessionStorage.removeItem('trilha');admin()};
let tab='ctrl',D;const item=TR[T].item,o=location.origin,sfx=T==='hackaton'?'hackaton':'';
const ld=async()=>{D=await api(`/api/admin/painel?t=${T}`)};
try{await ld()}catch(e){if(e.status===401){sessionStorage.removeItem('adm');toast(e.message,false);return admin()}throw e}
const act=(b,f)=>guard(b,async()=>{await f();await ld();render()});
const abas={
ctrl:()=>{const c=D.config,L=[['avaliacoes_abertas','Avaliações dos avaliadores'],['publico_aberto','Votação popular (público)'],['resultados_liberados','Divulgação dos resultados']];
const link=(k,n,p,qrOk)=>`<p><b>${n}</b><br><code>${esc(o+p)}</code><br>${qrOk?`<button data-qr="${k}">Abrir QR Code em nova guia</button> `:''}<button class="sec" data-cp="${esc(o+p)}">Copiar link</button></p>`;
return`<h2>${TR[T].nome}</h2>${L.map(([k,t])=>`<div class="row"><b>${t}:</b> ${c[k]?'<span class="ok">ABERTA/LIBERADA</span>':'FECHADA'} <button data-k="${k}" data-v="${c[k]?0:1}">${c[k]?'Fechar':'Abrir'}</button></div>`).join('')}
<p><small>Ordem sugerida: avaliações abertas → fechar avaliações → abrir a votação popular → liberar resultados.</small></p>
<div class="row"><b>Qual votação popular está ativa?</b><br><select id="modo">${Object.entries(MODO).map(([k,n])=>`<option value="${k}" ${c.modo_publico===k?'selected':''}>${n}</option>`).join('')}</select></div>
<div class="row"><b>Links</b>${link('avaliadores','Avaliadores','/avaliadores'+sfx,1)}${link('publico','Público (votação popular)','/publico'+sfx,1)}${link('resultados','Resultados (quando liberados)','/resultados'+sfx,0)}</div>
<div class="row perigo"><b>Limpar votos da ${TR[T].nome}</b><p>Apaga todas as avaliações e votos populares desta trilha. Os cadastros de ${item.toLowerCase()}s e a outra trilha não são afetados.</p><button data-limpar>Limpar votos…</button></div>`},
st:()=>{const L=[...D.startups].sort((a,b)=>a.categoria.localeCompare(b.categoria)||a.numero-b.numero),nI=L.filter(s=>s.categoria==='I').length;
return`<h2>${item}s cadastradas: ${L.length} <small>(Ideação: ${nI} · Avançado: ${L.length-nI})</small></h2>
<div class="row"><b>Criar novas</b><br><select id="ncat"><option value="I">Ideação</option><option value="A">Avançado</option></select> <input id="nqt" type="number" min="1" max="200" value="5" style="width:6rem"> <button data-criar>Criar</button><p><small>A numeração continua de onde parou (se já existem I-10, as novas serão I-11, I-12…).</small></p></div>
<p><small>♀ = ${item} Feminina · 🎓 = ${item} de Ensino Médio (clique para marcar/desmarcar)</small></p>
<div class="tb"><table><tr><th>Código</th><th>Categoria</th><th>Tags</th><th>Avaliações</th><th></th></tr>${L.map(s=>`<tr><td><b>${esc(s.codigo)}</b></td><td>${CAT[s.categoria]}</td><td><button class="ic ${s.feminina?'on':''}" data-tag="feminina" data-id="${s.id}" data-v="${s.feminina?0:1}" title="${item} Feminina">♀</button> <button class="ic ${s.ensino_medio?'on':''}" data-tag="ensino_medio" data-id="${s.id}" data-v="${s.ensino_medio?0:1}" title="${item} de Ensino Médio">🎓</button></td><td>${s.avaliacoes}</td><td><button class="sec" data-del="${s.id}" data-cod="${esc(s.codigo)}">Excluir</button></td></tr>`).join('')}</table></div>`},
rk:()=>{const fin=new Set(D.popular.geral.startups.map(s=>s.id));
const prem=(k,nome)=>{const l=D.startups.filter(s=>s[k]&&s.nota!=null).slice(0,3);return`<div class="row"><b>${nome}</b>${l.length?l.map(s=>`<p>${s.posicao}º — <b>${esc(s.codigo)}</b> (${s.nota.toFixed(2)})${fin.has(s.id)?' ★ finalista geral':''}</p>`).join(''):'<p>Nenhuma avaliada com essa tag.</p>'}</div>`};
return`<h2>Ranking — ${TR[T].nome}</h2>${tabRank(D.startups,true)}<p><small>★ = uma das duas melhores no geral (vão à votação popular). Os prêmios por tag consideram as notas; decida pela regra do evento se as finalistas gerais ficam de fora.</small></p><h2>Prêmios por tag</h2>${prem('feminina',item+' Feminina')}${prem('ensino_medio',item+' de Ensino Médio')}<h2>Avaliadores (${D.avaliadores.length})</h2><div class="row">${D.avaliadores.length?`<table><tr><th>CPF</th><th>Avaliações enviadas</th></tr>${D.avaliadores.map(a=>`<tr><td>${fmtCpf(a.cpf)}</td><td>${a.avaliacoes}</td></tr>`).join('')}</table>`:'<p>Nenhuma avaliação enviada ainda.</p>'}</div>`},
pop:()=>`<h2>Votação popular — ${TR[T].nome}</h2><p><small>O público só vota nas duas melhores em nota, conforme a votação ativa em "Controles".</small></p>${Object.keys(MODO).map(m=>blocoPop(m,D.popular[m],D.config.modo_publico===m)).join('')}`};
const render=()=>{root.innerHTML=`<div class="tabs">${[['ctrl','Controles'],['st',item+'s'],['rk','Ranking'],['pop','Votação popular']].map(([k,n])=>`<button class="tab ${tab===k?'on':''}" data-tab="${k}">${n}</button>`).join('')}</div>`+abas[tab]()};
render();
root.onchange=e=>{if(e.target.id==='modo')act(e.target,()=>api('/api/admin/modo',{t:T,modo:e.target.value}))};
root.onclick=async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
if(d.tab){tab=d.tab;render()}
if(d.k)act(b,()=>api('/api/admin/config',{t:T,chave:d.k,valor:+d.v}));
if(d.qr)window.open(`/qr?p=${d.qr}&t=${T}`,'_blank');
if(d.cp)navigator.clipboard.writeText(d.cp).then(()=>toast('Link copiado!'),()=>toast('Não foi possível copiar.',false));
if(d.criar!==undefined)act(b,()=>api('/api/admin/startups',{t:T,categoria:$('#ncat').value,quantidade:+$('#nqt').value}));
if(d.tag)act(b,()=>api('/api/admin/tag',{t:T,startup_id:+d.id,tag:d.tag,valor:+d.v}));
if(d.del&&confirm(`Excluir ${d.cod}? As avaliações e votos dela serão apagados.`))act(b,()=>api('/api/admin/remover',{t:T,startup_id:+d.del}));
if(d.limpar!==undefined){const n=TR[T].nome;
if(!confirm(`1/3 — Apagar TODAS as avaliações e votos da ${n}?`))return;
if(!confirm(`2/3 — Isso não pode ser desfeito. A outra trilha NÃO será afetada. Continuar?`))return;
if(prompt(`3/3 — Digite LIMPAR para confirmar a limpeza da ${n}:`)!=='LIMPAR')return toast('Confirmação incorreta. Nada foi apagado.',false);
act(b,async()=>{await api('/api/admin/limpar',{t:T,confirmacao:'LIMPAR'});toast('Votos da trilha apagados.')})}}}

const rota=path==='/qr'?qr:path.startsWith('/avaliadores')?avaliadores:path.startsWith('/publico')?publico:path.startsWith('/resultados')?resultadosPg:admin;
rota().catch(e=>root.innerHTML=`<p class="aviso">${esc(e.message)}</p>`);
