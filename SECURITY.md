# Segurança da V1

OcultaKey lida com dados de alto impacto. A V1 foi desenhada para não armazenar credenciais em plaintext no PostgreSQL, mas ainda deve ser tratada como software não auditado.

## O que o backend recebe

Depois do bootstrap, o login usa uma prova derivada no navegador. A senha original não é enviada ao FastAPI nos logins normais. O servidor recebe ciphertext, nonces, índices cegos, UUIDs, timestamps e material público/encapsulado necessário ao cofre.

Durante o primeiro boot, `BOOTSTRAP_PASSWORD` existe no ambiente do container. Remova a variável depois que o primeiro login funcionar.

## Separação de chaves

- `Metadata Key` - nomes, descrições, URLs, usuários, tags, tipos e ambiente.
- `Search Key` - HMAC dos tokens de pesquisa.
- `Secret Key` - senhas, API keys, tokens, private keys e campos secretos.

As três chaves são aleatórias e ficam encapsuladas com AES-256-GCM usando uma KEK derivada com Argon2id.

O frontend mantém `Metadata Key` e `Search Key` apenas em memória. `Secret Key` é aberta sob demanda e descartada depois de `SECRET_UNLOCK_MINUTES`.

## Banco roubado

Um dump isolado do PostgreSQL não deve conter nomes e valores do cofre em plaintext. Ainda assim, o dump revela quantidade aproximada de registros, UUIDs e relações, timestamps, tamanho dos ciphertexts, igualdade/frequência de tokens do índice cego e parâmetros públicos do KDF.

A V1 não tenta esconder padrão de acesso, tamanho ou frequência de pesquisa.

## XSS

XSS é uma ameaça crítica porque as chaves abertas vivem na memória do navegador. Por isso a V1 evita scripts CDN, `dangerouslySetInnerHTML` e armazenamento das chaves do cofre em localStorage ou IndexedDB, além de definir CSP.

Antes de uso sensível em produção, faça auditoria das dependências e configure monitoramento de vulnerabilidades.

## Sessões

- access token curto;
- refresh token aleatório, HttpOnly, Secure em produção e SameSite=Strict;
- o banco guarda somente SHA-256 do refresh token;
- refresh rotaciona o token;
- sessões podem ser revogadas;
- auto-lock por inatividade encerra a sessão do frontend.

## Operações críticas

Restauração de backup exige reautenticação e ticket de uso único ligado à sessão e ao propósito da operação.

Criações devem usar `Idempotency-Key` para evitar duplicidade causada por retry de rede ou clique repetido.

## Logs

Nunca registre Authorization, refresh token, prova de autenticação, senha de bootstrap, ciphertext completo sem necessidade, conteúdo de CSV exportado ou OAuth refresh token.

## Deploy

- HTTPS é obrigatório em produção.
- Use um domínio exclusivo para o OcultaKey.
- Configure `CORS_ORIGINS` apenas com esse domínio.
- Gere `APP_SECRET` aleatório e não o comite.
- Mantenha PostgreSQL sem porta pública.
- Faça backup e teste restauração.
- Atualize imagens base e dependências com frequência.

## Sessão autenticada e criação de dados

Criar ou editar perfis e criar credenciais não exige reautenticação por senha, mas os endpoints continuam protegidos por access token, sessão ativa, escopo do usuário e validação do backend.

A sessão mantém uma `CryptoKey` não extraível com uso `encrypt` para novos blocos secretos. A capacidade de descriptografar segredos só é aberta após reautenticação e expira conforme `SECRET_UNLOCK_MINUTES`.

## Antes de considerar o projeto pronto para terceiros

A prioridade é uma revisão externa do protocolo criptográfico, fluxo de autenticação, CSP/XSS, restore `.oky`, OAuth do Drive e regras de rotação de chave.
