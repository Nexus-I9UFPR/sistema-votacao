const os=require('os'),path=require('path');
process.env.DB_FILE=path.join(os.tmpdir(),'t'+Date.now()+'.db');
Object.assign(process.env,{AVALIADORES_PASSWORD:'AvaliadoresI9',ADMIN_SECRET:'adm'});
const {test,before,after}=require('node:test'),assert=require('node:assert');
const server=require('../src/server');let base,crit,id={};
before(()=>new Promise(r=>server.listen(0,()=>{base='http://localhost:'+server.address().port;r()})));after(()=>server.close());
const A={'x-admin-secret':'adm'};
const post=(u,b,ck='',x={})=>fetch(base+u,{method:'POST',headers:{'Content-Type':'application/json',cookie:ck,...x},body:JSON.stringify(b)});
const get=(u,ck='',x={})=>fetch(base+u,{headers:{cookie:ck,...x}});
const cks=r=>r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const login=async t=>cks(await post('/api/avaliadores/login',{t,senha:'AvaliadoresI9'}));
const ap=(u,b)=>post(u,b,'',A);
const painel=async t=>(await get('/api/admin/painel?t='+t,'',A)).json();
const nt=v=>Object.fromEntries(crit.map(c=>[c.id,v]));
const aval=(ck,t,sid,notas)=>post('/api/avaliacoes',{t,startup_id:sid,notas},ck);

test('login dos avaliadores',async()=>{
assert.equal((await post('/api/avaliadores/login',{t:'startups',senha:'x'})).status,401);
assert.equal((await get('/api/startups?t=startups')).status,403);
assert.ok(await login('startups'));crit=await(await get('/api/criterios')).json();
assert.equal(crit.reduce((a,c)=>a+c.peso,0),100)});
test('admin cria startups com numeração sequencial',async()=>{
for(const [c,q] of [['I',3],['A',2],['I',2]])assert.equal((await ap('/api/admin/startups',{t:'startups',categoria:c,quantidade:q})).status,200);
const p=await painel('startups');for(const s of p.startups)id[s.codigo]=s.id;
assert.deepEqual(Object.keys(id).sort(),['A-1','A-2','I-1','I-2','I-3','I-4','I-5']);
assert.equal((await painel('hackaton')).startups.length,0)});
test('avaliação: validação, duplicidade, peso e média',async()=>{
const ck=await login('startups'),ck2=await login('startups');
assert.equal((await aval(ck,'startups',id['I-1'],nt(11))).status,400);
assert.equal((await aval(ck,'startups',9999,nt(5))).status,400);
assert.equal((await aval('','startups',id['I-1'],nt(5))).status,403);
assert.equal((await aval(ck,'startups',id['I-1'],nt(10))).status,200);
assert.equal((await aval(ck,'startups',id['I-1'],nt(10))).status,409);
assert.equal((await aval(ck2,'startups',id['I-1'],nt(5))).status,200);
const n=nt(1);n[crit.find(c=>c.nome==='Solução').id]=10;assert.equal((await aval(ck,'startups',id['I-2'],n)).status,200);
assert.equal((await aval(ck,'startups',id['A-1'],nt(6))).status,200);
const p=await painel('startups'),nota=c=>p.startups.find(s=>s.codigo===c).nota;
assert.equal(nota('I-1'),75);assert.equal(nota('I-2'),28);assert.equal(nota('A-1'),60);assert.equal(nota('A-2'),null)});
test('votação popular só entre as duas melhores',async()=>{
assert.equal((await ap('/api/admin/config',{t:'startups',chave:'publico_aberto',valor:1})).status,409);
assert.equal((await ap('/api/admin/config',{t:'startups',chave:'avaliacoes_abertas',valor:0})).status,200);
assert.equal((await ap('/api/admin/config',{t:'startups',chave:'publico_aberto',valor:1})).status,200);
const ck=await login('startups');assert.equal((await aval(ck,'startups',id['I-3'],nt(5))).status,423);
const pub=cks(await get('/publico')),f=await(await get('/api/finalistas?t=startups',pub)).json();
assert.deepEqual(f.startups.map(s=>s.codigo),['I-1','A-1']);
assert.equal((await post('/api/votos/publico',{t:'startups',startup_id:id['I-2']},pub)).status,400);
assert.equal((await post('/api/votos/publico',{t:'startups',startup_id:id['I-1']},pub)).status,200);
assert.equal((await post('/api/votos/publico',{t:'startups',startup_id:id['A-1']},pub)).status,409);
assert.equal((await post('/api/votos/publico',{t:'startups',startup_id:id['A-1']},ck)).status,200); // avaliador também pode votar como público
assert.equal((await post('/api/votos/publico',{t:'startups',startup_id:id['A-1']})).status,403)});
test('resultados bloqueados até liberar; admin vê antes',async()=>{
assert.equal((await get('/api/resultados?t=startups')).status,403);
const a=await(await get('/api/resultados?t=startups','',A)).json();assert.equal(a.popular.geral.total,2);
await ap('/api/admin/config',{t:'startups',chave:'resultados_liberados',valor:1});
const r=await(await get('/api/resultados?t=startups')).json();assert.equal(r.ranking[0].codigo,'I-1');assert.equal(r.ranking[0].posicao,1)});
test('limpar votos afeta só a trilha informada',async()=>{
await ap('/api/admin/startups',{t:'hackaton',categoria:'A',quantidade:1});
const h=(await painel('hackaton')).startups[0],ck=await login('hackaton');
assert.equal((await aval(ck,'hackaton',h.id,nt(10))).status,200);
assert.equal((await aval(ck,'hackaton',id['I-1'],nt(10))).status,400);
assert.equal((await ap('/api/admin/limpar',{t:'startups',confirmacao:'x'})).status,400);
assert.equal((await ap('/api/admin/limpar',{t:'startups',confirmacao:'LIMPAR'})).status,200);
const p=await painel('startups');assert.equal(p.startups.length,7);assert.ok(p.startups.every(s=>s.nota==null));assert.equal(p.popular.geral.total,0);
assert.equal((await painel('hackaton')).startups[0].nota,100);
assert.equal((await ap('/api/admin/remover',{t:'startups',startup_id:id['I-5']})).status,200);
assert.equal((await painel('startups')).startups.length,6)});
