# Contribuindo com o OcultaKey

Obrigado por considerar contribuir.

## Branches

- `main` - versão estável e pronta para deploy.
- `develop` - integração e testes antes de chegar à `main`.

Para mudanças maiores, crie uma branch a partir de `develop` e abra um pull request de volta para `develop`.

## Ambiente local

1. Copie `.env.example` para `.env`.
2. Ajuste as variáveis locais.
3. Rode `docker compose up --build`.
4. Acesse `http://localhost:8000`.

Nunca envie `.env`, backups `.oky`, CSVs exportados, tokens, chaves ou credenciais reais para o repositório.

## Commits

Prefira mensagens curtas e objetivas, por exemplo:

```text
feat: add secure note editor
fix: propagate theme to portal components
refactor: simplify profile deletion flow
```

## Segurança

Se encontrar uma falha de segurança, não abra uma issue pública com detalhes exploráveis. Siga as orientações de `SECURITY.md`.
