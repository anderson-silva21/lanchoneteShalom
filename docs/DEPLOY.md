# Deploy

## Desenvolvimento local

```bash
npm run install:all
npm install
npm run dev
```

O comando sobe frontend e backend juntos. Se preferir separado:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

## Producao simples em VPS

```bash
npm run build --prefix frontend
npm start --prefix backend
```

## Producao com PM2

```bash
npm run install:all
npm run build --prefix frontend
cp backend/.env.example backend/.env
nano backend/.env
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs
```

O frontend em PM2 usa `vite preview` na porta `4173`. O modo `npm run dev` usa a porta `5173` e deve ficar para desenvolvimento.

No `backend/.env`, ajuste ao menos:

- `JWT_SECRET` com um valor forte.
- `CORS_ORIGINS` com todas as URLs do frontend, por exemplo `http://100.82.234.51:4173`.
- `CORS_ALLOW_PRIVATE_NETWORK_ORIGINS=true` para permitir frontends em IPs privados/Tailscale nas portas `4173`, `5173` e `5174`.
- `TRUST_PROXY=true` somente quando o backend estiver atras de um proxy confiavel.
- `AUTO_BACKUP_ENABLED=true` para manter backup diario ativo.

Recomendado em servidor:

- Usar `pm2` ou `systemd` para manter o backend ativo.
- Servir `frontend/dist` com Nginx/Caddy quando possivel, deixando PM2 apenas para o backend.
- Criar volume persistente para `database/`.
- Configurar `JWT_SECRET` forte.
- Manter copia externa dos arquivos em `database/backups/`.

## Backup

Pelo painel em Sistema ou pela API:

```text
POST /api/backup
GET /api/backup
```

Os arquivos ficam em `database/backups/`.

O backend tambem cria backups automaticos quando `AUTO_BACKUP_ENABLED=true`. A frequencia vem de `AUTO_BACKUP_INTERVAL_HOURS` e a retencao de `AUTO_BACKUP_RETENTION`.
