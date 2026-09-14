# QualityGuard — produção no VPS

Domínio de produção: `qualityguard.gfcode.com.br`

A stack usa Docker Compose em host único, PostgreSQL persistente, Redis persistente, API Node.js, Next.js e Caddy para HTTPS automático.

## 1. DNS

Crie um registro:

```text
Tipo: A
Nome: qualityguard
Valor: 2.25.92.154
TTL: 300
```

Antes de subir a stack, confirme que `qualityguard.gfcode.com.br` resolve para o VPS.

## 2. Preparar o VPS

Como o repositório é privado no GitHub, o `raw.githubusercontent.com` direto sem token retorna 404. Escolha uma das opções abaixo:

### Opção A (Recomendada): Executar a partir da sua máquina local via SSH
```bash
ssh root@2.25.92.154 'bash -s' < deploy/bootstrap-vps.sh
```

### Opção B: Baixar no VPS usando Token do GitHub (PAT)
```bash
curl -fsSL -H "Authorization: token SEU_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3.raw" \
  https://api.github.com/repos/GiovaniRodrigo/qualityguard/contents/deploy/bootstrap-vps.sh | bash
```

### Opção C: Criar o script diretamente no VPS
Crie o arquivo `/tmp/bootstrap-vps.sh` no VPS, cole o conteúdo de `deploy/bootstrap-vps.sh` e execute:
```bash
chmod +x /tmp/bootstrap-vps.sh && /tmp/bootstrap-vps.sh
```

O firewall deve expor somente SSH, HTTP e HTTPS. PostgreSQL e Redis ficam exclusivamente na rede Docker privada.

## 3. Variáveis de produção

Crie `/opt/qualityguard/.env.production` usando `.env.production.example` como referência.

Nunca faça commit desse arquivo.

Gere os segredos, por exemplo:

```bash
openssl rand -hex 32
openssl rand -base64 48
```

Obrigatórios:

- `POSTGRES_PASSWORD`
- `QUALITYGUARD_AUTH_SECRET`

Para billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`
- `STRIPE_PRICE_ENTERPRISE`

## 4. Subir a aplicação

```bash
cd /opt/qualityguard
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Verifique:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -f https://qualityguard.gfcode.com.br/api/health
```

A API executa a migration inicial antes de aceitar tráfego. O endpoint `/api/ready` retorna HTTP 200 somente quando PostgreSQL está acessível.

## 5. HTTPS

O Caddy termina TLS no domínio `qualityguard.gfcode.com.br`. Para emissão automática do certificado, DNS deve apontar para o VPS e as portas 80/443 precisam estar acessíveis.

## 6. Stripe

Configure no Stripe:

```text
https://qualityguard.gfcode.com.br/api/webhooks/stripe
```

Eventos principais:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

A API valida `Stripe-Signature` usando o corpo bruto e aplica tolerância temporal de 5 minutos. Eventos já processados são registrados em `stripe_events`, evitando processamento duplicado.

## 7. Deploy automático

O workflow `.github/workflows/deploy-production.yml` está preparado para:

1. conectar via SSH;
2. atualizar `main` no VPS;
3. reconstruir as imagens;
4. recriar a stack;
5. limpar imagens antigas;
6. verificar `/api/health`.

Configure no GitHub Environment `production`:

- `PRODUCTION_HOST=2.25.92.154`
- `PRODUCTION_USER=qualityguard`
- `PRODUCTION_SSH_KEY=<chave privada do deploy>`

O usuário de deploy deve ter acesso Docker sem precisar executar a aplicação como root.

## 8. Backup

Execute diariamente:

```bash
/opt/qualityguard/deploy/backup-postgres.sh
```

Configure um cron como root:

```cron
15 3 * * * /opt/qualityguard/deploy/backup-postgres.sh >> /var/log/qualityguard-backup.log 2>&1
```

O script mantém 14 dias por padrão. Para produção real, copie os backups para armazenamento externo/off-site; backup somente no mesmo VPS não protege contra perda do host.

## 9. Operação

Logs:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api
docker compose --env-file .env.production -f docker-compose.production.yml logs -f caddy
```

Restart da aplicação:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --remove-orphans
```

## 10. Segurança

- não exponha `5432` ou `6379` no host;
- mantenha Docker, Ubuntu e imagens atualizados;
- use chave SSH, não senha;
- mantenha `.env.production` fora do Git;
- rotacione `QUALITYGUARD_AUTH_SECRET` e segredos Stripe em caso de exposição;
- mantenha backups off-site;
- monitore espaço em disco, memória, CPU e expiração do domínio/certificado;
- não rode containers da aplicação como root.

## Estado

Implementado no repositório:

- PostgreSQL real na API;
- migration inicial automática;
- health/readiness checks;
- Stripe webhook público com assinatura e idempotência;
- Stripe customer no cadastro;
- metadata de plano nas subscriptions;
- Compose de produção;
- HTTPS via Caddy;
- imagens Docker para API e web;
- firewall/bootstrap do VPS;
- backup PostgreSQL;
- deploy automático via GitHub Actions.

Ainda depende de configuração externa: DNS, credenciais Stripe, chave SSH do deploy, `.env.production` e instalação inicial no VPS.
