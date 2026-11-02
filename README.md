# Votação de Startups

Site único com 3 páginas de uso + 1 de administração, um back-end e um banco SQLite.
Node.js (>= 22.13), **sem dependências** (não precisa de `npm install`).

| Página | Quem usa | Acesso |
|---|---|---|
| `/juizes` | Juízes | Senha (`JUIZES_PASSWORD`, ex.: `JuizesI9`) |
| `/publico` | Público | Link aberto (ou `?c=CODIGO` se `PUBLICO_CODE` estiver definido) |
| `/resultados` | Todos que já entraram por um link de votação (e o admin) | Só após o admin liberar |
| `/admin` | Organização | Senha (`ADMIN_SECRET`, ex.: `I9ADM!`) |

## Variáveis de ambiente
| Variável | Obrigatória | Descrição |
|---|---|---|
| `JUIZES_PASSWORD` | Sim | Senha dos juízes |
| `ADMIN_SECRET` | Sim | Senha do administrador |
| `PUBLICO_CODE` | Não | Se preenchida, o link do público exige `?c=VALOR` |
| `DB_FILE` | Em produção | Caminho do banco. No Docker já é `/data/votacao.db` |
| `PORT` | Não | A hospedagem define sozinha |

**Nunca coloque as senhas reais em arquivos versionados no GitHub.** Em produção, digite-as no painel da hospedagem. O `.env` está no `.gitignore`.

## Resumo para a equipe de deploy (qualquer hospedagem)
- Comando de start: `node src/server.js` (ou o `Dockerfile`). Node >= 22.13. Não há `npm install`.
- Escuta na porta de `PORT` (padrão 3000) e responde `GET /healthz` com `ok`.
- Variáveis: `JUIZES_PASSWORD`, `ADMIN_SECRET` (obrigatórias), `DB_FILE` (caminho de um **disco persistente**), `PUBLICO_CODE` (opcional).
- **Uma única instância** e **volume persistente** para o arquivo do banco. HTTPS no proxy, enviando `X-Forwarded-Proto: https`.
- Backup: copie o arquivo `DB_FILE` (e `-wal`/`-shm`, se existirem) com o app parado.

## Exemplo de deploy (Render, com Docker)
Requisitos: **disco persistente** montado em `/data` e **uma única instância** (SQLite grava em arquivo; sem disco, os votos somem a cada reinício).

1. Suba o projeto a um repositório GitHub (`git init`, `git add .`, `git commit`, `git push`).
2. No Render: **New → Blueprint** e selecione o repositório. Ele lê o `render.yaml` (Docker, plano starter, disco de 1 GB em `/data`, health check `/healthz`).
3. Preencha `JUIZES_PASSWORD` e `ADMIN_SECRET` quando solicitado.
4. Aguarde o deploy. No primeiro início o banco é criado com as startups e critérios de `dados.json`.
5. **Domínio próprio:** no serviço, **Settings → Custom Domains → Add**, informe o domínio e crie no DNS o registro indicado pelo Render (normalmente `CNAME` para `NOME.onrender.com`; para domínio raiz, o `A`/`ALIAS` que ele mostrar). O HTTPS é emitido automaticamente. Os links e QR Codes do `/admin` usam o endereço pelo qual você abriu o painel, então abra o `/admin` **pelo domínio**.

Outras hospedagens (Railway, Fly.io, VPS): use o `Dockerfile`, monte um volume em `/data` e defina as mesmas variáveis. O app precisa de HTTPS na frente (proxy) enviando `X-Forwarded-Proto: https`.

## Antes do evento
1. Edite `dados.json` (startups: `nome`, `descricao`, `logo` com URL de imagem opcional; critérios: `nome`, `descricao`, `nota_min`, `nota_max`).
2. Aplique com `npm run seed` no ambiente do servidor (no Render: serviço → **Shell**). **Isso apaga todos os votos e avaliações.** Faça após os testes e antes de abrir ao público. Alternativa sem shell: apagar o disco/serviço e recriar, o banco será recriado do `dados.json` do repositório.
3. Teste com um celular de cada perfil (veja "Limitações") e depois rode o seed para limpar os votos de teste.

## Durante o evento (`/admin`)
- Entre com `ADMIN_SECRET`.
- Cada votação tem um botão **Abrir/Fechar** (juízes, público) e há o botão de **divulgação dos resultados** (começa fechado).
- Cada link tem **Abrir QR Code em nova guia** (página grande com a legenda "Avaliação dos Juízes" ou "Votação do Público", para projetar ou imprimir) e **Copiar link**. O QR dos juízes leva à tela de senha. O QR é gerado no navegador por uma biblioteca do cdnjs, então o computador que abrir a guia precisa de internet.
- Para ver os resultados antes de liberar: no `/admin`, clique em **Ver resultados** (o admin sempre vê).
- Para liberar a todos: **Abrir** em "Divulgação dos resultados".

## Regras de negócio
- Nota por critério de `nota_min` a `nota_max` (padrão 1 a 5), todas obrigatórias; comentário opcional (até 500 caracteres), nunca exibido nos resultados.
- Cada navegador: 1 avaliação por startup, 1 startup favorita (juiz) e 1 voto (público). Envios são definitivos.
- Média geral do juiz = média simples das médias por critério (mesmo peso). A favorita dos juízes é contada à parte e não entra na média. Público e juízes nunca são combinados.
- Votação fechada, resultados não liberados e perfil errado são bloqueados **no servidor**.

## Limitações (sem login individual)
- Juiz e público são separados por cookie assinado no navegador: o mesmo navegador não vota nos dois perfis. Porém, quem usar outro navegador/aparelho ou apagar cookies pode votar de novo ou trocar de perfil.
- Quem souber a senha dos juízes pode votar como juiz. Compartilhe-a apenas com eles e troque `JUIZES_PASSWORD` se vazar (reinicie o serviço).
- Há limite de 10 tentativas de senha incorretas por minuto por IP.
- Senhas curtas e previsíveis são fáceis de adivinhar. Considere senhas mais fortes.

## API (JSON)
`GET /api/status`, `/api/startups`, `/api/criterios`, `/api/resultados` · `POST /api/juizes/login {senha}` · `POST /api/avaliacoes {startup_id, notas:{criterioId:nota}, comentario}` · `POST /api/votos/juizes {startup_id}` · `POST /api/votos/publico {startup_id}` · `GET/POST /api/admin/config` (header `x-admin-secret`; POST `{chave, valor}` com chave `juizes_abertos`, `publico_aberto` ou `resultados_liberados`) · `GET /healthz`.

## Rodar localmente e testar
Copie `.env.example` para `.env`, rode `npm start` (http://localhost:3000) e `npm test` (5 testes das regras críticas).
