# OcultaKey

OcultaKey é um gerenciador de credenciais self-hosted para organizar acessos de vários perfis, empresas, projetos ou operações sem deixar os segredos em texto aberto no servidor.

A aplicação protege metadados e segredos no navegador antes do envio para a API. A busca usa blind indexes para evitar armazenar termos pesquisáveis em plaintext no PostgreSQL.

> O projeto ainda está em desenvolvimento e não passou por auditoria criptográfica externa. Leia `SECURITY.md` antes de usar em produção ou expor a instalação à internet.

## Recursos

- Perfis com nome, tags e descrição.
- Credenciais de login, API key, token, banco de dados, SSH, OAuth, webhook, nota segura e campos personalizados.
- Nota segura criptografada com editor próprio.
- Produção e Homologação como ambientes padronizados.
- Busca incremental por blind index.
- Auditoria com busca, filtros, paginação e timeline por perfil.
- Lixeira e restauração.
- Gerador de senhas.
- Exportação `.oky` e CSV manual.
- Backup local e integração opcional com Google Drive.
- Tema claro e escuro na área autenticada.
- Português, inglês e espanhol.
- Interface responsiva para desktop e mobile.
- Deploy por Docker e EasyPanel.

## Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Web Crypto API
- Argon2id via WebAssembly

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic
- PostgreSQL

## Segurança

No login normal, o frontend chama `/auth/prelogin`, recebe salt e parâmetros públicos do Argon2id, deriva o material necessário no navegador e envia uma prova de autenticação ao backend, não a senha original.

Para revelar ou copiar um segredo, o usuário confirma a senha e a chave de leitura permanece disponível apenas pelo período configurado em `SECRET_UNLOCK_MINUTES`.

A aplicação usa:

- Argon2id para derivação de chave;
- AES-256-GCM para metadados e segredos;
- HMAC-SHA256 para blind indexes;
- access token curto e refresh token rotacionável.

Leia `SECURITY.md` para limitações e detalhes do modelo.

## Busca criptografada

Os dados pesquisáveis permanecem criptografados. O navegador normaliza o texto, gera prefixos/trigramas e transforma cada termo em HMAC com a Search Key. O PostgreSQL encontra candidatos pelos hashes e o navegador confirma os resultados localmente após descriptografar os registros retornados.

## Backup

`.oky` é o formato oficial de backup do OcultaKey e usa o magic header `OKY1`. CSV é uma exportação manual em texto legível e deve ser tratado como segredo.

## Deploy no EasyPanel

Crie um PostgreSQL e um serviço apontando para o `Dockerfile` da raiz.

Exemplo:

```env
APP_ENV=production
APP_SECRET=gere-uma-chave-aleatoria-forte
PUBLIC_URL=https://senhas.seudominio.com
PORT=8000

DATABASE_URL=postgresql+psycopg://USUARIO:SENHA@HOST:5432/DATABASE
DATABASE_SCHEMA=ocultakey

BOOTSTRAP_EMAIL=seu@email.com
BOOTSTRAP_PASSWORD=sua-senha-inicial

CORS_ORIGINS=https://senhas.seudominio.com
ACCESS_TOKEN_EXPIRE_MINUTES=10
REFRESH_TOKEN_EXPIRE_DAYS=30
SECRET_UNLOCK_MINUTES=1
VAULT_AUTO_LOCK_MINUTES=10
```

No primeiro boot, o container cria o schema configurado, executa as migrations e cria o usuário inicial quando necessário. Depois de confirmar o primeiro login, remova `BOOTSTRAP_PASSWORD` do ambiente e faça um novo deploy.

Consulte `.env.example` para a lista completa de variáveis.

## Desenvolvimento local

```bash
cp .env.example .env
docker compose up --build
```

Acesse `http://localhost:8000`.

## Estrutura

```text
backend/
  alembic/
  app/
frontend/
  src/
docker/
  start.sh
Dockerfile
docker-compose.yml
```

## Branches

- `main` - versão estável.
- `develop` - desenvolvimento e homologação antes de chegar à `main`.

## Licença

MIT. Consulte `LICENSE`.
