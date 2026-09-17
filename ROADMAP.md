# Possíveis melhorias

A V1 fica intencionalmente sem Redis, SSE e cache de aplicação. As melhorias abaixo não são pré-requisito para o primeiro deploy.

## Segurança

- auditoria criptográfica externa;
- passkeys/WebAuthn;
- rotação de chaves e migração de `crypto_version`;
- política configurável de reautenticação;
- rate limit distribuído com Redis;
- idempotência em todos os endpoints mutáveis;
- chaves de recuperação com fluxo completo de rotação;
- assinatura/autenticação do envelope `.oky` completo;
- proteção adicional contra enumeração e análise de frequência do blind index;
- Content Security Policy sem `unsafe-inline`;
- integração opcional com HSM/KMS para segredos do servidor.

## Cofre

- TOTP;
- certificados;
- anexos criptografados;
- múltiplos cofres;
- histórico de versões de uma credencial;
- expiração e lembrete de rotação;
- importadores Bitwarden, Passbolt, 1Password e KeePass;
- templates customizáveis pelo usuário;
- filtros combinados por tipo, ambiente, tag e expiração.

## Equipe

- workspaces;
- múltiplos usuários;
- grupos;
- permissões Read/Update/Owner;
- compartilhamento com envelope key por destinatário;
- trilha de auditoria administrativa.

## Apps

- extensão de navegador;
- autofill;
- PWA offline com armazenamento local criptografado;
- app desktop;
- app mobile.

## Backup

- S3;
- OneDrive;
- WebDAV;
- Box;
- política de retenção independente por provider;
- teste automático de integridade dos backups;
- restore assistido em instalação vazia;
- versionamento formal do schema `.oky` e migradores entre versões.

## Infra

- Redis para rate limit, locks e idempotência distribuída;
- métricas técnicas sem dados sensíveis;
- health/readiness separados;
- workers separados para tarefas agendadas em instalações com múltiplas réplicas;
- CI com testes, lint, SCA, container scan e SBOM;
- imagens versionadas e releases assinadas.

## Depois da v0.3

- Migrar nomenclatura interna de `client` para `profile` em uma major version, mantendo compatibilidade de importação `.oky`.
- Reindexação explícita dos blind indexes quando o algoritmo de busca ganhar uma nova versão.
- Tradução integral de mensagens técnicas retornadas pelo backend.
