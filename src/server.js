const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {db,tx}=require('./db');
const E=process.env,PUB=path.join(__dirname,'..','public');
let SECRET=db.prepare("select valor from config where chave='cookie_secret'").get()?.valor;
if(!SECRET){SECRET=crypto.randomBytes(32).toString('hex');db.prepare("insert into config values('cookie_secret',?)").run(SECRET)}
const sig=v=>crypto.createHmac('sha256',SECRET).update(v).digest('hex').slice(0,32);
const sign=v=>v+'.'+sig(v);
const unsign=s=>{if(!s)return null;const i=s.lastIndexOf('.'),v=s.slice(0,i);return i>0&&s.slice(i+1)===sig(v)?v:null};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split(/=(.*)/s).slice(0,2)).filter(a=>a[0]));
const setc=(k,v,sec)=>`${k}=${sign(v)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${sec?'; Secure':''}`;
const secure=req=>req.headers['x-forwarded-proto']==='https';
const did=req=>unsign(cookies(req).did);
class Erro extends Error{constructor(c,m){super(m);this.c=c}}
const json=(res,c,o,ck)=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(ck?{'Set-Cookie':ck}:{})});res.end(JSON.stringify(o))};
const igual=(a,b)=>{if(!b)return false;const x=Buffer.from(String(a||'')),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const falhas=new Map();
const ip=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
const limite=req=>{const n=Date.now(),a=(falhas.get(ip(req))||[]).filter(t=>n-t<60000);falhas.set(ip(req),a);if(a.length>=10)throw new Erro(429,'Muitas tentativas incorretas. Aguarde 1 minuto.')};
const falha=req=>falhas.get(ip(req)).push(Date.now());
const isAdmin=req=>{const h=req.headers['x-admin-secret'];if(!E.ADMIN_SECRET||!h)return false;limite(req);const ok=igual(h,E.ADMIN_SECRET);if(!ok)falha(req);return ok};
const adm=req=>{if(!isAdmin(req))throw new Erro(401,'Senha de administrador incorreta.')};

const TRILHAS=['startups','hackaton'],FIL={ideacao:'I',avancado:'A',geral:null};
const trilha=t=>{if(!TRILHAS.includes(t))throw new Erro(400,'Trilha inválida.');return t};
const T=req=>trilha(new URL(req.url,'http://x').searchParams.get('t'));
const cfg=(t,k)=>db.prepare('select valor from config where chave=?').get(t+':'+k)?.valor;
const on=(t,k)=>cfg(t,k)==='1';
const exigirAval=(req,t,estrito)=>{if(unsign(cookies(req)['av_'+t])!=='ok'&&(estrito||!isAdmin(req)))throw new Erro(403,'Acesso restrito aos avaliadores.')};
const unico=f=>{try{return f()}catch(e){if(/UNIQUE/.test(e.message))throw new Erro(409,'Registro já enviado por este navegador.');throw e}};

// Nota de uma avaliação = soma(nota/nota_max * peso) / soma(pesos) * 100. Nota da startup = média das avaliações.
function ranking(t){
const base=db.prepare('select id,categoria,numero,tag_fem,tag_em from startups where trilha=? order by categoria,numero').all(t);
const pts=db.prepare(`select a.startup_id s,sum(1.0*n.nota/c.nota_max*c.peso)*100/sum(c.peso) p from avaliacoes a join notas n on n.avaliacao_id=a.id join criterios c on c.id=n.criterio_id where a.startup_id in (select id from startups where trilha=?) group by a.id`).all(t);
const acc={};for(const r of pts){const o=acc[r.s]??={soma:0,n:0};o.soma+=r.p;o.n++}
const l=base.map(s=>{const o=acc[s.id];return{id:s.id,codigo:s.categoria+'-'+s.numero,categoria:s.categoria,numero:s.numero,feminina:!!s.tag_fem,ensino_medio:!!s.tag_em,avaliacoes:o?o.n:0,nota:o?Math.round(o.soma/o.n*100)/100:null}});
l.sort((a,b)=>(b.nota??-1)-(a.nota??-1)||b.avaliacoes-a.avaliacoes||a.categoria.localeCompare(b.categoria)||a.numero-b.numero);
let pos=0,prev;l.forEach((s,i)=>{if(s.nota==null){s.posicao=null;return}if(s.nota!==prev)pos=i+1;prev=s.nota;s.posicao=pos});
return l}
function finalistas(t,modo,rk=ranking(t)){const f=FIL[modo],l=rk.filter(s=>s.nota!=null&&(!f||s.categoria===f));return{startups:l.slice(0,2),empate:l.length>2&&l[2].nota===l[1].nota}}
function popular(t,rk){const out={};for(const m of Object.keys(FIL)){const f=finalistas(t,m,rk),v=Object.fromEntries(db.prepare('select startup_id s,count(*) n from votos_publico where trilha=? and modo=? group by 1').all(t,m).map(r=>[r.s,r.n]));
const l=f.startups.map(s=>({id:s.id,codigo:s.codigo,categoria:s.categoria,votos:v[s.id]||0})),total=l.reduce((a,s)=>a+s.votos,0);
l.forEach(s=>s.percentual=total?Math.round(s.votos*1000/total)/10:0);out[m]={startups:l,total,empate:f.empate}}return out}

const api={
'GET /api/status':req=>{const t=T(req),c=cookies(req),d=unsign(c.did),m=cfg(t,'modo_publico');
return{avaliacoes_abertas:on(t,'avaliacoes_abertas'),publico_aberto:on(t,'publico_aberto'),resultados_liberados:on(t,'resultados_liberados'),modo_publico:m,avaliador:unsign(c['av_'+t])==='ok',
avaliadas:d?db.prepare('select a.startup_id from avaliacoes a join startups s on s.id=a.startup_id where s.trilha=? and a.device_id=?').all(t,d).map(r=>r.startup_id):[],
jaVotou:!!d&&!!db.prepare('select 1 from votos_publico where trilha=? and modo=? and device_id=?').get(t,m,d)}},
'GET /api/criterios':()=>db.prepare('select id,nome,descricao,peso,nota_min,nota_max from criterios where ativo=1 order by id').all().map(r=>({...r})),
'GET /api/startups':req=>{const t=T(req);exigirAval(req,t);return db.prepare("select id,categoria,numero,categoria||'-'||numero codigo from startups where trilha=? order by categoria,numero").all(t).map(r=>({...r}))},
'POST /api/avaliadores/login':(req,b)=>{const t=trilha(b.t);if(!E.AVALIADORES_PASSWORD)throw new Erro(500,'Senha dos avaliadores não configurada no servidor.');limite(req);
if(!igual(b.senha,E.AVALIADORES_PASSWORD)){falha(req);throw new Erro(401,'Senha incorreta.')}
const sec=secure(req);return{ok:true,__ck:[setc('av_'+t,'ok',sec),...(did(req)?[]:[setc('did',crypto.randomUUID(),sec)])]}},
'POST /api/avaliacoes':(req,b)=>{const t=trilha(b.t);exigirAval(req,t,true);const d=did(req);if(!d)throw new Erro(403,'Recarregue a página e tente novamente.');
if(!on(t,'avaliacoes_abertas'))throw new Erro(423,'Avaliações encerradas.');
const sid=b.startup_id;if(!Number.isInteger(sid)||!db.prepare('select 1 from startups where id=? and trilha=?').get(sid,t))throw new Erro(400,'Startup inválida.');
const cs=db.prepare('select id,nota_min,nota_max from criterios where ativo=1').all(),n=b.notas||{};
for(const c of cs)if(!Number.isInteger(n[c.id])||n[c.id]<c.nota_min||n[c.id]>c.nota_max)throw new Erro(400,`Nota inválida em um dos critérios (${c.nota_min} a ${c.nota_max}).`);
const com=typeof b.comentario==='string'?b.comentario.trim().slice(0,500):'';
unico(()=>tx(()=>{const id=db.prepare('insert into avaliacoes(startup_id,device_id,comentario) values(?,?,?)').run(sid,d,com).lastInsertRowid;
const i=db.prepare('insert into notas values(?,?,?)');for(const c of cs)i.run(id,c.id,n[c.id])}));return{ok:true}},
'GET /api/finalistas':req=>{const t=T(req),modo=cfg(t,'modo_publico');return{modo,aberto:on(t,'publico_aberto'),startups:finalistas(t,modo).startups.map(({id,codigo,categoria})=>({id,codigo,categoria}))}},
'POST /api/votos/publico':(req,b)=>{const t=trilha(b.t),d=did(req);if(!d)throw new Erro(403,'Abra a página de votação pelo link oficial.');
if(!on(t,'publico_aberto'))throw new Erro(423,'A votação popular não está aberta.');const modo=cfg(t,'modo_publico');
if(!finalistas(t,modo).startups.some(s=>s.id===b.startup_id))throw new Erro(400,'Essa opção não está na votação atual.');
unico(()=>db.prepare('insert into votos_publico(trilha,modo,startup_id,device_id) values(?,?,?,?)').run(t,modo,b.startup_id,d));return{ok:true}},
'GET /api/resultados':req=>{const t=T(req);if(!on(t,'resultados_liberados')&&!isAdmin(req))throw new Erro(403,'Os resultados ainda não foram liberados.');
const rk=ranking(t);return{ranking:rk.map(({codigo,categoria,nota,posicao,avaliacoes})=>({codigo,categoria,nota,posicao,avaliacoes})),popular:popular(t,rk)}},
'GET /api/admin/painel':req=>{adm(req);const t=T(req),rk=ranking(t);
return{config:{avaliacoes_abertas:on(t,'avaliacoes_abertas'),publico_aberto:on(t,'publico_aberto'),resultados_liberados:on(t,'resultados_liberados'),modo_publico:cfg(t,'modo_publico')},startups:rk,popular:popular(t,rk)}},
'POST /api/admin/config':(req,b)=>{adm(req);const t=trilha(b.t);
if(!['avaliacoes_abertas','publico_aberto','resultados_liberados'].includes(b.chave))throw new Erro(400,'Chave inválida.');
if(b.valor){if(b.chave==='publico_aberto'){if(on(t,'avaliacoes_abertas'))throw new Erro(409,'Feche as avaliações antes de abrir a votação popular.');
if(finalistas(t,cfg(t,'modo_publico')).startups.length<2)throw new Erro(409,'Ainda não há duas startups avaliadas para a votação escolhida.')}
if(b.chave==='avaliacoes_abertas'&&on(t,'publico_aberto'))throw new Erro(409,'Feche a votação popular antes de reabrir as avaliações.')}
db.prepare('insert or replace into config values(?,?)').run(t+':'+b.chave,b.valor?'1':'0');return{ok:true}},
'POST /api/admin/modo':(req,b)=>{adm(req);const t=trilha(b.t);if(!(b.modo in FIL))throw new Erro(400,'Modo inválido.');
db.prepare('insert or replace into config values(?,?)').run(t+':modo_publico',b.modo);return{ok:true}},
'POST /api/admin/startups':(req,b)=>{adm(req);const t=trilha(b.t),cat=b.categoria,q=b.quantidade;if(!['I','A'].includes(cat))throw new Erro(400,'Categoria inválida.');
if(!Number.isInteger(q)||q<1||q>200)throw new Erro(400,'A quantidade deve ser de 1 a 200.');
tx(()=>{let n=db.prepare('select coalesce(max(numero),0) m from startups where trilha=? and categoria=?').get(t,cat).m;const i=db.prepare('insert into startups(trilha,categoria,numero) values(?,?,?)');for(let k=0;k<q;k++)i.run(t,cat,++n)});return{ok:true}},
'POST /api/admin/tag':(req,b)=>{adm(req);const t=trilha(b.t),col={feminina:'tag_fem',ensino_medio:'tag_em'}[b.tag];if(!col)throw new Erro(400,'Tag inválida.');
db.prepare(`update startups set ${col}=? where id=? and trilha=?`).run(b.valor?1:0,b.startup_id,t);return{ok:true}},
'POST /api/admin/remover':(req,b)=>{adm(req);const t=trilha(b.t);db.prepare('delete from startups where id=? and trilha=?').run(b.startup_id,t);return{ok:true}},
'POST /api/admin/limpar':(req,b)=>{adm(req);const t=trilha(b.t);if(b.confirmacao!=='LIMPAR')throw new Erro(400,'Confirmação incorreta.');
tx(()=>{db.prepare('delete from avaliacoes where startup_id in (select id from startups where trilha=?)').run(t);db.prepare('delete from votos_publico where trilha=?').run(t)});return{ok:true}}};

const PAGINAS=new Set(['/avaliadores','/avaliadoreshackaton','/publico','/publicohackaton','/resultados','/resultadoshackaton','/admin','/qr']);
const TIPOS={'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{
const u=new URL(req.url,'http://x'),p=u.pathname.toLowerCase();
if(p==='/'){res.writeHead(302,{Location:'/publico'});return res.end()}
if(p==='/healthz'){res.writeHead(200);return res.end('ok')}
if(PAGINAS.has(p)){const h={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'};if(!did(req))h['Set-Cookie']=setc('did',crypto.randomUUID(),secure(req));
res.writeHead(200,h);return res.end(fs.readFileSync(path.join(PUB,'index.html')))}
if(p.startsWith('/static/')){const f=path.basename(u.pathname),fp=path.join(PUB,f);if(!TIPOS[path.extname(f).toLowerCase()]||!fs.existsSync(fp))throw new Erro(404,'Não encontrado.');
res.writeHead(200,{'Content-Type':TIPOS[path.extname(f).toLowerCase()]});return res.end(fs.readFileSync(fp))}
const f=api[req.method+' '+p];if(!f)throw new Erro(404,'Não encontrado.');
let body='';req.on('data',d=>{body+=d;if(body.length>10000)req.destroy()});
req.on('end',()=>{try{let b={};if(req.method==='POST'){try{b=JSON.parse(body||'{}')}catch{throw new Erro(400,'JSON inválido.')}}
const o=f(req,b),ck=o&&o.__ck;if(ck)delete o.__ck;json(res,200,o,ck)}catch(e){fail(res,e)}})}catch(e){fail(res,e)}});
function fail(res,e){if(e instanceof Erro)return json(res,e.c,{erro:e.message});console.error(e);json(res,500,{erro:'Erro interno. Tente novamente.'})}
if(require.main===module)server.listen(E.PORT||3000,()=>console.log(`Rodando em http://localhost:${E.PORT||3000}`));
module.exports=server;
