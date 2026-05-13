# Servicos e automacoes

- `backend/src/services/salesService.js`: registra vendas, calcula lucro e reduz estoque em transacao unica.
- `backend/src/services/analyticsService.js`: monta KPIs, previsao simples de falta, sugestoes de compra e dataset Power BI.
- `backend/src/services/exportService.js`: gera CSV, XLSX e PDF.
- `backend/src/routes/backup.js`: cria copias do SQLite em `database/backups/`.

Automacoes prontas para evoluir:

- Agendar `POST /api/backup` diariamente.
- Enviar `POST /api/powerbi/push` a cada periodo.
- Criar alerta por email/WhatsApp quando `critical_stock_count` for maior que zero.
