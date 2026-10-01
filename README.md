<div align="center">

# OcultaKey

**Gerenciador de credenciais self-hosted com criptografia no navegador.**

Organize acessos de clientes, empresas, projetos e ambientes sem manter os segredos em texto aberto no servidor.

[![Version](https://img.shields.io/badge/version-0.3.4-2563eb?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/self--hosted-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](Dockerfile)
[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](backend/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=111827)](frontend/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](frontend/)

</div>

> O OcultaKey ainda está em desenvolvimento e não passou por auditoria criptográfica externa. Consulte [`SECURITY.md`](SECURITY.md) antes de usar em produção ou expor uma instalação à internet.

## Sobre o projeto

O OcultaKey nasceu para centralizar credenciais de diferentes operações sem transformar o banco de dados em um repositório de senhas legíveis. Metadados e segredos são protegidos no navegador antes de seguirem para a API, e a busca utiliza blind indexes para permitir localização de registros sem armazenar os termos pesquisáveis em plaintext no PostgreSQL.

A interface foi pensada para quem administra vários clientes, ambientes e integrações no dia a dia. Cada perfil pode reunir logins, API keys, tokens, bancos de dados, acessos SSH, OAuth, webhooks, notas seguras e campos personalizados, mantendo Produção e Homologação organizados no mesmo lugar.

O projeto é open source, self-hosted e pode ser executado com Docker em infraestrutura própria.

## Interface

### Login

![Tela de login do OcultaKey](docs/screenshots/login.png)

### Cofre de credenciais

![Tela principal do OcultaKey](docs/screenshots/vault.png)

### Nova credencial

![Modal para criação de nova credencial](docs/screenshots/new-credential.png)

## O que já está disponível

- Perfis com nome, tags e descrição.
- Credenciais de login, API key, token, banco de dados, SSH, OAuth, webhook, nota segura e campos personalizados.
- Nota segura criptografada com editor próprio.
- Ambientes padronizados para Produção e Homologação.
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

## Como a segurança funciona

No login normal, o frontend chama `/auth/prelogin`, recebe salt e parâmetros públicos do Argon2id, deriva o material necessário no navegador e envia uma prova de autenticação ao backend em vez da senha original.

Para revelar ou copiar um segredo, o usuário confirma a senha e a chave de leitura permanece disponível apenas pelo período configurado em `SECRET_UNLOCK_MINUTES`.

Principais mecanismos usados pelo projeto:

- Argon2id para derivação de chave;
- AES-256-GCM para metadados e segredos;
- HMAC-SHA256 para blind indexes;
- access token curto e refresh token rotacionável.

Os dados pesquisáveis continuam criptografados. O navegador normaliza o texto, gera prefixos e trigramas e transforma cada termo em HMAC com a Search Key. O PostgreSQL encontra candidatos pelos hashes e o navegador confirma os resultados localmente depois de descriptografar os registros retornados.

O modelo completo, suas limitações e decisões de segurança estão documentados em [`SECURITY.md`](SECURITY.md).

## Stack

### Frontend

- React 18
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

## Backup e exportação

`.oky` é o formato oficial de backup do OcultaKey e usa o magic header `OKY1`. CSV é uma exportação manual em texto legível e deve ser tratado como segredo.

## Rodando localmente

```bash
cp .env.example .env
docker compose up --build
```

Depois do build, acesse:

```text
http://localhost:8000
```

## Deploy no EasyPanel

Crie um PostgreSQL e um serviço apontando para o `Dockerfile` da raiz.

Exemplo mínimo:

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

Consulte [`.env.example`](.env.example) para a lista completa de variáveis.

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

## Projeto e contribuição

- [`CHANGELOG.md`](CHANGELOG.md) - histórico das versões.
- [`ROADMAP.md`](ROADMAP.md) - próximos passos planejados.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - orientações para contribuir.
- [`SECURITY.md`](SECURITY.md) - modelo de segurança e limitações conhecidas.

Branches principais:

- `main` - versão estável.
- `develop` - desenvolvimento e homologação antes de chegar à `main`.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
