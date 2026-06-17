# SH82

Aplicacao web para controle de estoque e vendas de uma pequena lanchonete, com operacao de PDV rapida e uma base central tratada como planilha inteligente.

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

## Funcionalidades

- Base inicia sem produtos, vendas, combos, eventos ou estoque ficticio.
- Menu Carga inicial desabilitado por padrao; o admin pode habilitar em Sistema para cadastrar os itens reais do inventario e seus lotes.
- Dashboard com faturamento do dia, vendas, lucro estimado, estoque baixo, produtos mais vendidos, produtos parados, horarios de pico e sugestoes de compra.
- PDV com botoes grandes para venda simples, venda multipla e combos.
- Baixa automatica de estoque com historico de movimentacoes.
- Cadastro de produtos com custo, preco, quantidade, estoque minimo, fornecedor, codigo, unidade e marcacao de doacao sem custo.
- Planilha central com abas de produtos, vendas, itens vendidos, movimentacoes e indicadores.
- Relatorios exportaveis em CSV, Excel e PDF.
- Login com niveis `admin`, `manager` e `cashier`.
- Administrador cria usuarios ativos, gera senha inicial aleatoria, reseta senhas e exclui acessos ativos.
- Primeiro acesso com senha temporaria exige troca de senha antes de abrir o sistema.
- Backup manual do banco SQLite.
- Limpeza administrativa de dados operacionais em Sistema.
- Modo escuro e PWA instalavel.

## Primeira carga real

1. Entre com o usuario `admin`.
2. Em `Sistema`, habilite `Carga inicial`.
3. Abra `Carga inicial`.
4. Cadastre cada produto selecionando a categoria padrao, unidade, custo, preco, estoque minimo, quantidade real e validade quando existir. Se o item foi doado, marque a opcao de doacao para registrar custo zero.
5. Use `Sistema > Base de dados > Zerar dados` se precisar apagar produtos, lotes, vendas, combos, eventos, movimentos e inventarios mantendo os usuarios.

Tambem e possivel limpar a base pelo terminal:

```bash
npm run db:reset -- --yes
```

## Variaveis de ambiente

Crie `backend/.env` se quiser customizar:

```env
PORT=4000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=troque-este-segredo
DB_PATH=../database/lanchonete.sqlite
```

No frontend, crie `frontend/.env` apenas se quiser forcar outro endereco de API:

```env
VITE_API_URL=http://localhost:4000/api
```

## Deploy rapido

1. Rode `npm run build --prefix frontend`.
2. Sirva `frontend/dist` em Nginx, Vercel, Netlify ou outro host estatico.
3. Rode `npm start --prefix backend` em um servidor Node.
4. Configure `CORS_ORIGIN` com o dominio do frontend.
5. Persista a pasta `database/` em volume permanente.

Veja [docs/DEPLOY.md](/home/user/Documents/anderson/personalProjects/docs/DEPLOY.md) para detalhes.
