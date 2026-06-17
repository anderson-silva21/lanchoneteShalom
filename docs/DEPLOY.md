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

Recomendado:

- Usar `pm2` ou `systemd` para manter o backend ativo.
- Servir `frontend/dist` com Nginx.
- Criar volume persistente para `database/`.
- Configurar `JWT_SECRET` forte.
- Configurar backup agendado copiando `database/lanchonete.sqlite`.

## Backup

Pelo painel em Relatorios ou pela API:

```text
POST /api/backup
GET /api/backup
```

Os arquivos ficam em `database/backups/`.
