const fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
try{for(const l of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2]}}catch{}
const file=process.env.DB_FILE||path.join(root,'data','votacao.db');
fs.mkdirSync(path.dirname(file),{recursive:true});
const db=new DatabaseSync(file);

// Critérios de avaliação e pesos (soma = 100). Para mudar: edite aqui E apague o banco (ou os critérios serão mantidos como estão).
const CRITERIOS=[['Problema','',10],['Solução','',20],['Diferenciais','',10],['Tamanho do mercado','',10],['Modelo de negócio','',10],['Equipe','',10],['Domínio de tecnologia','',10],['Qualidade do pitch','',20]];

db.exec('PRAGMA foreign_keys=OFF');
// Banco da versão antiga (sem "categoria"): descarta as tabelas antigas.
const cols=db.prepare('pragma table_info(startups)').all().map(c=>c.name);
if(cols.length&&!cols.includes('categoria'))for(const t of['notas','avaliacoes','votos_juizes','votos_publico','criterios','startups'])db.exec('drop table if exists '+t);
const ac=db.prepare('pragma table_info(avaliacoes)').all().map(c=>c.name);
if(ac.length&&!ac.includes('cpf'))for(const t of['notas','avaliacoes'])db.exec('drop table if exists '+t); // versão anterior (sem CPF)
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
create table if not exists startups(id integer primary key,trilha text not null check(trilha in('startups','hackaton')),categoria text not null check(categoria in('I','A')),numero integer not null,tag_fem integer not null default 0,tag_em integer not null default 0,unique(trilha,categoria,numero));
create table if not exists criterios(id integer primary key,nome text not null,descricao text default '',peso integer not null,nota_min integer not null default 1,nota_max integer not null default 10,ativo integer not null default 1,check(nota_min<nota_max));
create table if not exists config(chave text primary key,valor text not null);
create table if not exists avaliacoes(id integer primary key,startup_id integer not null references startups(id) on delete cascade,cpf text not null,comentario text,criada_em text not null default current_timestamp,unique(startup_id,cpf));
create table if not exists notas(avaliacao_id integer not null references avaliacoes(id) on delete cascade,criterio_id integer not null references criterios(id),nota integer not null,primary key(avaliacao_id,criterio_id));
create table if not exists votos_publico(id integer primary key,trilha text not null,modo text not null,startup_id integer not null references startups(id) on delete cascade,device_id text not null,criada_em text not null default current_timestamp,unique(trilha,modo,device_id));`);
const ins=db.prepare('insert or ignore into config values(?,?)');
for(const t of['startups','hackaton'])for(const [k,v] of [['avaliacoes_abertas','1'],['publico_aberto','0'],['resultados_liberados','0'],['modo_publico','geral']])ins.run(t+':'+k,v);
if(!db.prepare('select 1 from criterios').get()){const i=db.prepare('insert into criterios(nome,descricao,peso) values(?,?,?)');for(const c of CRITERIOS)i.run(...c)}
const tx=f=>{db.exec('BEGIN IMMEDIATE');try{const r=f();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
module.exports={db,tx};
