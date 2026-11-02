const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {db,tx}=require('./db');
const E=process.env,PUB=path.join(__dirname,'..','public');
let SECRET=db.prepare("select valor from config where chave='cookie_secret'").get()?.valor;
if(!SECRET){SECRET=crypto.randomBytes(32).toString('hex');db.prepare("insert into config values('cookie_secret',?)").run(SECRET)}
const sig=v=>crypto.createHmac('sha256',SECRET).update(v).digest('hex').slice(0,32);
const sign=v=>v+'.'+sig(v);
const unsign=s=>{if(!s)return null;const i=s.lastIndexOf('.'),v=s.slice(0,i);return i>0&&s.slice(i+1)===sig(v)?v:null};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split(/=(.*)/s).slice(0,2)).filter(a=>a[0]));
const sess=req=>{const c=cookies(req);return{papel:unsign(c.papel),did:unsign(c.did)}};
const setc=(k,v,sec)=>`${k}=${sign(v)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${sec?'; Secure':''}`;
class Erro extends Error{constructor(c,m){super(m);this.c=c}}
const json=(res,c,o,ck)=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(ck?{'Set-Cookie':ck}:{})});res.end(JSON.stringify(o))};
const texto=(res,c,t)=>{res.writeHead(c,{'Content-Type':'text/html; charset=utf-8'});res.end(`<meta charset=utf-8><meta name=viewport content="width=device-width"><body style="font:18px system-ui;max-width:32rem;margin:15vh auto;padding:1rem"><h2>Acesso negado</h2><p>${t}</p>`)};
const igual=(a,b)=>{if(!b)return false;const x=Buffer.from(String(a||'')),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const falhas=new Map();
const ip=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
const limite=req=>{const n=Date.now(),a=(falhas.get(ip(req))||[]).filter(t=>n-t<60000);falhas.set(ip(req),a);if(a.length>=10)throw new Erro(429,'Muitas tentativas incorretas. Aguarde 1 minuto.')};
const falha=req=>falhas.get(ip(req)).push(Date.now());
const isAdmin=req=>{const h=req.headers['x-admin-secret'];if(!E.ADMIN_SECRET||!h)return false;limite(req);const ok=igual(h,E.ADMIN_SECRET);if(!ok)falha(req);return ok};
const cfg=k=>db.prepare('select valor from config where chave=?').get(k)?.valor==='1';
const exigir=(req,papel)=>{const s=sess(req);if(s.papel!==papel||!s.did)throw new Erro(403,'Este navegador não tem permissão para esta ação.');return s};
const logado=req=>{const s=sess(req);if(!s.papel&&!isAdmin(req))throw new Erro(403,'Acesse pelo link oficial.');return s};
const startup=id=>{if(!Number.isInteger(id)||!db.prepare('select 1 from startups where id=? and ativa=1').get(id))throw new Erro(400,'Startup inválida.')};
const unico=f=>{try{return f()}catch(e){if(/UNIQUE/.test(e.message))throw new Erro(409,'Registro já enviado por este navegador.');throw e}};

function resultados(){
const pub=db.prepare(`select s.id,s.nome,count(v.id) votos from startups s left join votos_publico v on v.startup_id=s.id where s.ativa=1 group by s.id order by votos desc,s.nome`).all().map(r=>({...r}));
const total=pub.reduce((a,s)=>a+s.votos,0);pub.forEach(s=>s.percentual=total?Math.round(s.votos*1000/total)/10:0);
const criterios=db.prepare('select id,nome from criterios where ativo=1 order by id').all().map(r=>({...r}));
const med={};for(const r of db.prepare('select a.startup_id s,n.criterio_id c,avg(n.nota) m from notas n join avaliacoes a on a.id=n.avaliacao_id group by 1,2').all())(med[r.s]??={})[r.c]=Math.round(r.m*100)/100;
const nav=Object.fromEntries(db.prepare('select startup_id s,count(*) n from avaliacoes group by 1').all().map(r=>[r.s,r.n]));
const pref=Object.fromEntries(db.prepare('select startup_id s,count(*) n from votos_juizes group by 1').all().map(r=>[r.s,r.n]));
const juizes=db.prepare('select id,nome from startups where ativa=1').all().map(s=>{const m=med[s.id]||{},v=criterios.map(c=>m[c.id]).filter(x=>x!=null);
return{id:s.id,nome:s.nome,medias:m,avaliacoes:nav[s.id]||0,media_geral:v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null,votos_preferencia:pref[s.id]||0}})
.sort((a,b)=>(b.media_geral??-1)-(a.media_geral??-1)||a.nome.localeCompare(b.nome));
return{publico:{total,startups:pub},juizes:{criterios,startups:juizes}}}

const api={
'POST /api/juizes/login':(req,b)=>{const s=sess(req);if(s.papel==='publico')throw new Erro(403,'Este navegador já foi usado como público.');
if(!E.JUIZES_PASSWORD)throw new Erro(500,'Senha dos juízes não configurada no servidor.');limite(req);
if(!igual(b.senha,E.JUIZES_PASSWORD)){falha(req);throw new Erro(401,'Senha incorreta.')}
const sec=req.headers['x-forwarded-proto']==='https';return{ok:true,__ck:[setc('papel','juiz',sec),...(s.did?[]:[setc('did',crypto.randomUUID(),sec)])]}},
'GET /api/status':req=>{const s=logado(req),o={juizes_abertos:cfg('juizes_abertos'),publico_aberto:cfg('publico_aberto'),resultados_liberados:cfg('resultados_liberados'),papel:s.papel};
if(s.papel==='juiz'){o.avaliadas=db.prepare('select startup_id from avaliacoes where device_id=?').all(s.did).map(r=>r.startup_id);o.favorita=db.prepare('select startup_id from votos_juizes where device_id=?').get(s.did)?.startup_id??null}
if(s.papel==='publico')o.jaVotou=!!db.prepare('select 1 from votos_publico where device_id=?').get(s.did);return o},
'GET /api/startups':req=>(logado(req),db.prepare('select id,nome,descricao,logo from startups where ativa=1 order by nome').all()),
'GET /api/criterios':req=>(logado(req),db.prepare('select id,nome,descricao,nota_min,nota_max from criterios where ativo=1 order by id').all()),
'POST /api/avaliacoes':(req,b)=>{const s=exigir(req,'juiz');if(!cfg('juizes_abertos'))throw new Erro(423,'Avaliações encerradas.');startup(b.startup_id);
const cs=db.prepare('select id,nota_min,nota_max from criterios where ativo=1').all(),n=b.notas||{};
for(const c of cs)if(!Number.isInteger(n[c.id])||n[c.id]<c.nota_min||n[c.id]>c.nota_max)throw new Erro(400,`Nota inválida em um dos critérios (${c.nota_min} a ${c.nota_max}).`);
const com=typeof b.comentario==='string'?b.comentario.trim().slice(0,500):'';
unico(()=>tx(()=>{const id=db.prepare('insert into avaliacoes(startup_id,device_id,comentario) values(?,?,?)').run(b.startup_id,s.did,com).lastInsertRowid;
const i=db.prepare('insert into notas values(?,?,?)');for(const c of cs)i.run(id,c.id,n[c.id])}));return{ok:true}},
'POST /api/votos/juizes':(req,b)=>{const s=exigir(req,'juiz');if(!cfg('juizes_abertos'))throw new Erro(423,'Votação dos juízes encerrada.');startup(b.startup_id);
unico(()=>db.prepare('insert into votos_juizes(startup_id,device_id) values(?,?)').run(b.startup_id,s.did));return{ok:true}},
'POST /api/votos/publico':(req,b)=>{const s=exigir(req,'publico');if(!cfg('publico_aberto'))throw new Erro(423,'Votação do público encerrada.');startup(b.startup_id);
unico(()=>db.prepare('insert into votos_publico(startup_id,device_id) values(?,?)').run(b.startup_id,s.did));return{ok:true}},
'GET /api/resultados':req=>{logado(req);if(!cfg('resultados_liberados')&&!isAdmin(req))throw new Erro(403,'Os resultados ainda não foram liberados.');return resultados()},
'GET /api/admin/config':req=>{if(!isAdmin(req))throw new Erro(401,'Senha de administrador incorreta.');
return{juizes_abertos:cfg('juizes_abertos'),publico_aberto:cfg('publico_aberto'),resultados_liberados:cfg('resultados_liberados'),publico_code:E.PUBLICO_CODE||''}},
'POST /api/admin/config':(req,b)=>{if(!isAdmin(req))throw new Erro(401,'Senha de administrador incorreta.');
if(!['juizes_abertos','publico_aberto','resultados_liberados'].includes(b.chave))throw new Erro(400,'Chave inválida.');
db.prepare('insert or replace into config values(?,?)').run(b.chave,b.valor?'1':'0');return{ok:true}}};

function entrada(req,res,papel,code){
const u=new URL(req.url,'http://x'),s=sess(req),h={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'};
if(s.papel&&s.papel!==papel)return texto(res,403,`Este navegador já foi usado como ${s.papel==='juiz'?'juiz':'público'}. Não é permitido votar nos dois perfis no mesmo navegador.`);
if(papel==='publico'&&!s.papel){if(code&&u.searchParams.get('c')!==code)return texto(res,403,'Link inválido. Use o link oficial enviado pela organização.');
const sec=req.headers['x-forwarded-proto']==='https';h['Set-Cookie']=[setc('papel',papel,sec),...(s.did?[]:[setc('did',crypto.randomUUID(),sec)])]}
if(u.searchParams.has('c')&&papel==='publico'){h.Location=u.pathname;res.writeHead(302,h);return res.end()}
res.writeHead(200,h);res.end(fs.readFileSync(path.join(PUB,'index.html')))}

const STATIC={'/static/app.js':'text/javascript','/static/style.css':'text/css'};
const server=http.createServer((req,res)=>{try{
const u=new URL(req.url,'http://x'),p=u.pathname;
if(p==='/healthz'){res.writeHead(200);return res.end('ok')}
if(p==='/'){res.writeHead(302,{Location:'/resultados'});return res.end()}
if(p==='/juizes')return entrada(req,res,'juiz');
if(p==='/publico')return entrada(req,res,'publico',E.PUBLICO_CODE);
if(p==='/resultados'||p==='/admin'||p==='/qr'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(PUB,'index.html')))}
if(STATIC[p]){res.writeHead(200,{'Content-Type':STATIC[p]+'; charset=utf-8'});return res.end(fs.readFileSync(path.join(PUB,p.slice(8))))}
const f=api[req.method+' '+p];if(!f)throw new Erro(404,'Não encontrado.');
let body='';req.on('data',d=>{body+=d;if(body.length>10000)req.destroy()});
req.on('end',()=>{try{let b={};if(req.method==='POST'){try{b=JSON.parse(body||'{}')}catch{throw new Erro(400,'JSON inválido.')}}
const o=f(req,b),ck=o&&o.__ck;if(ck)delete o.__ck;json(res,200,o,ck)}catch(e){fail(res,e)}})}catch(e){fail(res,e)}});
function fail(res,e){if(e instanceof Erro)return json(res,e.c,{erro:e.message});console.error(e);json(res,500,{erro:'Erro interno. Tente novamente.'})}
if(require.main===module)server.listen(E.PORT||3000,()=>console.log(`Rodando em http://localhost:${E.PORT||3000}`));
module.exports=server;
