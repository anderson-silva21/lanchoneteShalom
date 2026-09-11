# SH82

Aplicacao web para controle de estoque, vendas e operacao do setor de producao Shalom. A plataforma atende a Lanchonete e tambem a Livraria/Shalom Store, mantendo estoques e dados de negocio separados.

## Stack

- Frontend: React, Vite, TailwindCSS, Recharts, Lucide
- Backend: Node.js, Express, SQLite
- Banco: `database/lanchonete.sqlite`
- Exportacao: CSV, XLSX e PDF
- PWA: manifest e service worker

## Estrutura

```text
frontend/          Interface React
backend/           API, regras de venda, relatorios e autenticacao
database/          Schema SQL, seed vazio de referencia e arquivo SQLite
services/          Notas de integracao e automacoes
components/        Catalogo resumido de componentes do produto
docs/              Deploy e operacao
```

## Como rodar

```bash
npm run install:all
npm install
npm run dev
```

URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Healthcheck: `http://localhost:4000/health`

Login inicial:

- Admin: `admin` / `admin123`
- Caixa: `caixa` / `caixa123`

## Ambiente de desenvolvimento com dados ficticios

Para testar telas, dashboards, alertas, vendas, pagamentos pendentes e combos sem tocar no banco principal, use o banco dedicado `database/lanchonete.dev.sqlite`.

Crie ou atualize a base demo:

```bash
npm run seed:dev
```

Se quiser apagar os dados ficticios existentes e recriar tudo do zero:

```bash
npm run seed:dev -- --reset
```

Suba a aplicacao usando esse banco demo:

```bash
npm run dev:demo
```

Usuarios extras criados apenas no banco demo:

- Gerente: `gerente` / `gerente123`
- Financeiro: `financeiro` / `financeiro123`

Travas de seguranca do seed demo:

- Nao roda com `NODE_ENV=production`.
- Nao roda no banco principal `database/lanchonete.sqlite`.
- Se o banco demo ja tiver dados operacionais, exige `--reset` para evitar mistura acidental.

## Funcionalidades

- Base inicia sem produtos, vendas, combos, eventos ou estoque ficticio.
- Modulo Livraria/Shalom Store com catalogo publico, produtos, categorias, imagens, publicacao, estoque separado, vendas assistidas e indicadores financeiros.
- Vitrine publica em `/livraria`, sem login, exibindo somente produtos ativos e publicados da Livraria.
- CTA "Tenho interesse" abre WhatsApp com mensagem contextual; a compra nao e concluida automaticamente no site publico.
- Menu Carga inicial desabilitado por padrao; o admin pode habilitar em Sistema para cadastrar os itens reais do inventario e seus lotes.
- Dashboard com faturamento do dia, vendas, lucro estimado, estoque baixo, produtos mais vendidos, produtos parados, horarios de pico e sugestoes de compra.
- PDV com botoes grandes para venda simples, venda multipla e combos.
- Baixa automatica de estoque com historico de movimentacoes.
- Cadastro de produtos com custo, preco, quantidade, estoque minimo, fornecedor, codigo, unidade e marcacao de doacao sem custo.
- Planilha central com abas de produtos, vendas, itens vendidos, movimentacoes e indicadores.
- Relatorios exportaveis em CSV, Excel e PDF.
- Login com niveis `admin`, `manager`, `finance`, `cashier` e `library`.
- Login protegido com rate limit, bloqueio temporario apos falhas repetidas e auditoria de tentativas invalidas.
- Administrador cria usuarios ativos, gera senha inicial aleatoria, reseta senhas e exclui acessos ativos.
- Primeiro acesso com senha temporaria exige troca de senha antes de abrir o sistema.
- Backup manual, backup automatico, backup pre-migracao e restauracao controlada do banco SQLite.
- Auditoria de acoes criticas: usuarios, produtos, estoque, vendas, pagamentos, fechamentos, Telegram e reset de dados.
- Saude do sistema em `Sistema`: versao, integridade do banco, tamanho dos arquivos, ultimo backup e status do Telegram.
- Historico por produto com movimentacoes, vendas e auditoria.
- Fechamento de caixa/evento com registro formal do resumo.
- Alertas via Telegram para estoque baixo, validades, lotes sem validade e pagamentos pendentes.
- Configuracao dos alertas Telegram pela tela `Sistema`, mantendo o token do bot no `.env`.
- Horarios operacionais gravados e exibidos em UTC-3, horario de Brasilia/Sao Paulo.
- Limpeza administrativa de dados operacionais em Sistema.
- Modo escuro e PWA instalavel.

## Primeira carga real

1. Entre com o usuario `admin`.
2. Em `Sistema`, habilite `Carga inicial`.
3. Abra `Carga inicial`.
4. Cadastre cada produto selecionando a categoria padrao, unidade, custo, preco, estoque minimo, quantidade real e validade quando existir. Se o item foi doado, marque a opcao de doacao para registrar custo zero.
5. Se preferir, importe um CSV na propria tela de `Carga inicial`. Cabecalho recomendado:

```csv
produto;categoria;unidade;quantidade;custo;doacao;venda;minimo;fornecedor;validade
Agua 500ml;Bebidas;garrafa;24;1,20;nao;3,00;6;Distribuidor;2026-12-31
Guardanapo;Descartaveis;pacote;10;0;sim;0;2;;
```

6. Use `Sistema > Base de dados > Zerar dados` se precisar apagar produtos, lotes, vendas, combos, eventos, movimentos e inventarios mantendo os usuarios. Antes da limpeza o backend cria um backup de seguranca automaticamente.

Tambem e possivel limpar a base pelo terminal:

```bash
npm run db:reset -- --yes
```

## Variaveis de ambiente

Crie `backend/.env` se quiser customizar:

```env
PORT=4000
CORS_ORIGINS=http://100.82.234.51:4173,http://intranet.lanchoneteshalom.local,http://localhost:5173,http://127.0.0.1:5173
CORS_ALLOW_PRIVATE_NETWORK_ORIGINS=true
JWT_SECRET=troque-este-segredo-com-valor-forte-em-producao
TRUST_PROXY=false
DB_PATH=../database/lanchonete.sqlite
LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_MAX_PER_IP=30
LOGIN_RATE_LIMIT_MAX_PER_USER=10
LOGIN_LOCK_FAILED_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_INTERVAL_HOURS=24
AUTO_BACKUP_RETENTION=14
BACKUP_BEFORE_MIGRATIONS=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_GROUP_URL=
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_ALERT_INTERVAL_MINUTES=360
TELEGRAM_ALERT_MAX_ITEMS=8
TELEGRAM_IGNORE_MISSING_EXPIRATION_CATEGORIES=Descartaveis
LIBRARY_WHATSAPP_PHONE=5581999999999
PUBLIC_STOREFRONT_URL=https://seudominio.example
```

Em producao, inclua em `CORS_ORIGINS` a origem exata exibida no navegador antes de `/`, por exemplo `http://100.82.234.51:4173`. Apos alterar `backend/.env` em deploy com PM2, reinicie com `pm2 restart lanchonete-backend --update-env`.
Por padrao, `CORS_ALLOW_PRIVATE_NETWORK_ORIGINS=true` tambem libera frontends em IPs privados/Tailscale nas portas `4173`, `5173` e `5174`; use `false` se quiser aceitar somente a lista exata de `CORS_ORIGINS`.

Para ativar o robo do Telegram, crie um bot com o BotFather, envie uma mensagem para o bot ou adicione-o ao grupo desejado, preencha `TELEGRAM_BOT_TOKEN`, reinicie o backend e configure os demais campos em `Sistema > Alertas Telegram`.
O `TELEGRAM_ALERT_MAX_ITEMS` controla quantos itens entram em cada mensagem de detalhe; quando houver mais itens, o sistema envia mensagens adicionais em vez de cortar o alerta. A lista `TELEGRAM_IGNORE_MISSING_EXPIRATION_CATEGORIES` evita alertas de validade para categorias sem vencimento real, como descartaveis.
Se o grupo do Telegram virar supergrupo, o `TELEGRAM_CHAT_ID` muda e normalmente passa a comecar com `-100`. Em deploy com PM2, apos alterar `backend/.env`, reinicie com `pm2 restart lanchonete-backend --update-env` e confira em `Sistema > Alertas Telegram` se o chat id carregado termina com os mesmos digitos do valor novo.

### Livraria / Shalom Store

- `LIBRARY_WHATSAPP_PHONE`: telefone da Livraria no formato internacional somente com numeros. Exemplo: `5581999999999`.
- `PUBLIC_STOREFRONT_URL`: URL publica usada para montar links de produto nas mensagens do WhatsApp. Se nao for definida, o backend usa o host da requisicao.
- A vitrine publica fica em `/livraria` e o detalhe em `/livraria/produto/:id`.
- Produtos aparecem publicamente apenas quando `active=true`, `published=true` e possuem estoque disponivel, a menos que a API publica seja chamada com `include_unavailable=true`.
- O fluxo publico nao possui carrinho, checkout, pagamento nem baixa automatica de estoque. A venda e registrada manualmente por `admin` ou `library` na area autenticada.

## Permissoes principais

- `admin`: acesso total a Lanchonete, Livraria, usuarios, configuracao e relatorios.
- `finance`: visao financeira e operacional de Lanchonete e Livraria, sem criacao de usuarios e sem mutacoes operacionais da Livraria.
- `library`: operacao da Livraria, incluindo catalogo, publicacao, estoque e vendas assistidas; sem acesso automatico a Lanchonete.
- `manager` e `cashier`: comportamento preservado para a Lanchonete.

## Operacao segura

- Antes de migracoes destrutivas, o backend cria `database/backups/lanchonete-pre-migration-*.sqlite`.
- Backups manuais e restauracao ficam em `Relatorios > Backups` para administradores.
- A restauracao cria um backup `pre-restore`, substitui o SQLite e encerra o processo para o PM2/subprocesso iniciar novamente com o banco restaurado.
- A auditoria recente fica em `Sistema`; registros completos podem ser consultados pela API `/api/system/audit-logs`.
- O fechamento de caixa/evento fica em `Pagamentos > Fechamento`, com data, evento opcional e observacoes.

No frontend, crie `frontend/.env` apenas se quiser forcar outro endereco de API:

```env
VITE_API_URL=http://localhost:4000/api
```

## Deploy rapido

1. Rode `npm run build --prefix frontend`.
2. Sirva `frontend/dist` em Nginx, Vercel, Netlify ou outro host estatico.
3. Rode `npm start --prefix backend` em um servidor Node.
4. Configure `CORS_ORIGINS` com todos os dominios do frontend e use um `JWT_SECRET` forte.
5. Persista a pasta `database/` em volume permanente.

Veja [docs/DEPLOY.md](docs/DEPLOY.md) para detalhes.
