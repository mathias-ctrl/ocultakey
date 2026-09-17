# Changelog

## v0.3.4

- Tema light/dark passa a ser aplicado no nível do documento para modais, drawers, toasts e outros componentes renderizados via portal.

## v0.3.3

- Simplificação da tela de login com remoção do cabeçalho redundante.

## v0.3.2

- Tratamento central de sessão expirada.
- Modo de privacidade visual ativado por padrão em login/refresh.
- Melhorias nos editores de texto seguro e descrições.
- Ajustes em limites de campos e experiência de criação/edição.

## v0.3.1

- Remoção do fluxo de favoritos da interface.
- Exclusão de perfil simplificada.
- Preview do login aproximado do dashboard real.
- Melhorias de scrollbar e visualização de campos de senha antes de salvar.

## v0.3.0

- Tema dark na área autenticada.
- Português, inglês e espanhol.
- Nota segura com editor próprio.
- Auditoria com busca, filtros e paginação.
- Perfis ordenados pela alteração mais recente.
- Produção/Homologação como ambientes padronizados.

## v0.2.0

- Redesign do shell autenticado.
- Sidebar persistente no desktop e drawer no mobile.
- Timeline por perfil.
- Criação de perfil e credencial sem nova solicitação de senha.
- Separação entre chave de escrita e leitura de segredos.

## v0.1.4

- CSP ajustada para permitir o WebAssembly necessário ao Argon2id sem liberar `unsafe-eval` geral.

## v0.1.3

- `CORS_ORIGINS` passa a aceitar URL simples ou múltiplas origens separadas por vírgula.

## v0.1.2

- Correção do build TypeScript/Vite no Docker.

## v0.1.1

- Suporte a schema PostgreSQL dedicado via `DATABASE_SCHEMA`.

## v0.1.0

- Primeira versão funcional do OcultaKey.
- FastAPI, React, PostgreSQL, criptografia no cliente, busca por blind index e deploy por Docker/EasyPanel.
