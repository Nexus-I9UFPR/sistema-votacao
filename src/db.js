const fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');
try{for(const l of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2]}}catch{}
const file=process.env.DB_FILE||path.join(root,'data','votacao.db');
fs.mkdirSync(path.dirname(file),{recursive:true});
const db=new DatabaseSync(file);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
create table if not exists startups(id integer primary key,nome text not null,descricao text default '',logo text,ativa integer not null default 1);
create table if not exists criterios(id integer primary key,nome text not null,descricao text default '',nota_min integer not null default 1,nota_max integer not null default 5,ativo integer not null default 1,check(nota_min<nota_max));
create table if not exists config(chave text primary key,valor text not null);
create table if not exists avaliacoes(id integer primary key,startup_id integer not null references startups(id),device_id text not null,comentario text,criada_em text not null default current_timestamp,unique(startup_id,device_id));
create table if not exists notas(avaliacao_id integer not null references avaliacoes(id),criterio_id integer not null references criterios(id),nota integer not null,primary key(avaliacao_id,criterio_id));
create table if not exists votos_juizes(id integer primary key,startup_id integer not null references startups(id),device_id text not null unique,criada_em text not null default current_timestamp);
create table if not exists votos_publico(id integer primary key,startup_id integer not null references startups(id),device_id text not null unique,criada_em text not null default current_timestamp);
insert or ignore into config values('juizes_abertos','1'),('publico_aberto','1'),('resultados_liberados','0');`);
const tx=f=>{db.exec('BEGIN IMMEDIATE');try{const r=f();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
function seed(reset){const d=JSON.parse(fs.readFileSync(path.join(root,'dados.json'),'utf8'));
tx(()=>{if(reset)for(const t of['notas','avaliacoes','votos_juizes','votos_publico','criterios','startups'])db.exec('delete from '+t);
const a=db.prepare('insert into startups(nome,descricao,logo) values(?,?,?)');for(const s of d.startups)a.run(s.nome,s.descricao||'',s.logo||null);
const b=db.prepare('insert into criterios(nome,descricao,nota_min,nota_max) values(?,?,?,?)');for(const c of d.criterios)b.run(c.nome,c.descricao||'',c.nota_min||1,c.nota_max||5)})}
if(!db.prepare('select 1 from startups').get()&&!db.prepare('select 1 from criterios').get())seed(false);
module.exports={db,tx,seed};
