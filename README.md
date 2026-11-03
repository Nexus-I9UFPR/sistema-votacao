# Votação de Startups e Hackaton

Site único com duas trilhas independentes (**Trilha Startups** e **Trilha Hackaton**), cada uma com seus próprios cadastros, avaliações e votos.
Node.js (>= 22.13), SQLite embutido, **sem dependências** (não precisa de `npm install`).

## Páginas
| Trilha Startups | Trilha Hackaton | Quem usa |
|---|---|---|
| `/avaliadores` | `/avaliadoreshackaton` | Avaliadores (senha) |
| `/publico` | `/publicohackaton` | Público (votação popular, sem login) |
| `/resultados` | `/resultadoshackaton` | Todos, só depois de liberado |
| `/admin` (única) | | Organização (senha); escolhe a trilha ao entrar |
Os endereços não diferenciam maiúsculas de minúsculas. Os links e QR Codes do `/admin` usam o endereço pelo qual o painel foi aberto: abra-o pelo domínio oficial.

## Variáveis de ambiente
| Variável | Obrigatória | Descrição |
|---|---|---|
| `AVALIADORES_PASSWORD` | Sim | Senha dos avaliadores (ex.: `AvaliadoresI9`), vale para as duas trilhas |
| `ADMIN_SECRET` | Sim | Senha do administrador (ex.: `I9ADM!`) |
| `DB_FILE` | Em produção | Caminho do banco SQLite. No Docker já é `/data/votacao.db` |
| `PORT` | Não | Definida pela hospedagem (padrão 3000) |
Não versione senhas reais; em produção configure-as no painel da hospedagem.

## Regras
- **Startups/equipes sem nome:** são identificadas por código `I-1, I-2…` (Ideação) e `A-1, A-2…` (Avançado). Não há cadastro pré-definido: o admin cria quantas quiser (a numeração continua de onde parou).
- **Avaliação:** o avaliador filtra por categoria (Ideação/Avançado) e/ou número (ex.: 3 mostra I-3 e A-3), escolhe o código e dá notas de 1 a 10 nos critérios abaixo. Envio definitivo; 1 avaliação por startup por navegador; comentário opcional (nunca exibido).
- **Nota (0–100):** `soma(nota/10 × peso) ÷ soma(pesos) × 100`; a nota da startup é a média das avaliações recebidas.
  Pesos: Problema 10 · Solução 20 · Diferenciais 10 · Tamanho do mercado 10 · Modelo de negócio 10 · Equipe 10 · Domínio de tecnologia 10 · Qualidade do pitch 20. Para alterar, edite `CRITERIOS` em `src/db.js` e recrie o banco (ver "Reiniciar do zero").
- **Votação popular:** só entre as **duas melhores em nota** da opção ativa: *Duas melhores de Ideação*, *do Avançado* ou *no geral* (escolha em Controles). Um voto por navegador por opção. Só abre com as avaliações **fechadas** e com 2+ startups avaliadas; as avaliações só reabrem com a votação popular fechada (para o ranking não mudar durante a votação). Empate de nota entre a 2ª e a 3ª é sinalizado no admin (a ordem de desempate automática é: mais avaliações, depois código).
- **Tags:** no admin, ♀ (Feminina) e 🎓 (Ensino Médio) por startup, para os prêmios específicos. A aba Ranking lista as melhores de cada tag e marca (★) as finalistas gerais.
- Avaliadores também podem votar como público (não há mais separação de perfis).

## Painel `/admin`
Após a senha, escolha **Trilha Startups** (roxo) ou **Trilha Hackaton** (azul). Abas:
1. **Controles:** abrir/fechar avaliações, votação popular e divulgação; escolher a votação popular ativa; links com **QR Code em nova guia** (com legenda) e copiar; **limpar votos** (confirmação tripla; só da trilha atual, mantém os cadastros).
2. **Startups/Equipes:** planilha com contagem, criação em lote, tags ♀/🎓 clicáveis e exclusão (apaga também as avaliações e votos dela).
3. **Ranking:** posição, código, categoria, nota e nº de avaliações, visível mesmo antes de liberar os resultados.
4. **Votação popular:** votos e percentuais das três opções.

## Logos
Coloque as imagens em `public/` com os nomes `logo-startups.png` e `logo-hackaton.png`, **ou** altere os caminhos na constante `LOGOS` no início de `public/app.js`. Aparecem no cabeçalho de todas as páginas da trilha; sem arquivo, o espaço some sem erro.

## Deploy
Resumo para a equipe: comando `node src/server.js` (ou `Dockerfile`), Node >= 22.13, porta em `PORT`, health check `GET /healthz`. **Volume persistente** no caminho de `DB_FILE`, **uma única instância**, HTTPS no proxy com `X-Forwarded-Proto: https`. Backup: copiar o arquivo do banco (e `-wal`/`-shm`, se existirem) com o app parado.
Exemplo Render: GitHub → New → Blueprint (`render.yaml`, disco em `/data`), informar as duas senhas; domínio em Settings → Custom Domains.
Teste pós-deploy: votar, reiniciar o serviço e conferir que os dados continuam.

## Reiniciar do zero (local ou servidor)
Pare o servidor, apague `data/votacao.db*` (ou o arquivo de `DB_FILE`) e inicie de novo. Para limpar só os votos de uma trilha, use o botão do admin. Bancos da versão anterior (com "juízes") são descartados automaticamente na primeira execução.

## Limitações (sem login individual)
- Voto duplicado é limitado por um identificador anônimo do navegador gravado pelo servidor; quem trocar de navegador/aparelho ou apagar cookies consegue votar de novo.
- Quem souber a senha dos avaliadores pode avaliar. Compartilhe só com eles.
- 10 tentativas de senha incorretas por minuto por IP; depois, bloqueio de 1 minuto.
- O QR Code é gerado no navegador por biblioteca do cdnjs (precisa de internet no computador que abre a guia).

## API (JSON; `t` = `startups` ou `hackaton`)
Públicas: `GET /api/status?t`, `/api/criterios`, `/api/finalistas?t`, `/api/resultados?t` (após liberar) · `POST /api/avaliadores/login {t,senha}` · `POST /api/votos/publico {t,startup_id}`.
Avaliadores (cookie): `GET /api/startups?t` · `POST /api/avaliacoes {t,startup_id,notas:{criterioId:nota},comentario}`.
Admin (header `x-admin-secret`): `GET /api/admin/painel?t` · `POST /api/admin/config {t,chave,valor}` · `/modo {t,modo}` · `/startups {t,categoria:'I'|'A',quantidade}` · `/tag {t,startup_id,tag:'feminina'|'ensino_medio',valor}` · `/remover {t,startup_id}` · `/limpar {t,confirmacao:'LIMPAR'}`.
Testes: `npm test` (6 testes das regras críticas).
