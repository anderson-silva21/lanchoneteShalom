# Controle de Estoque por Lote e FEFO

## Visao geral

O estoque passa a ser controlado por lote na tabela `stock_batches`.
Cada lote pertence a um produto, possui quantidade propria e pode ter uma data de validade.

`products.stock_quantity` continua existindo por compatibilidade com telas, relatorios e PDV, mas agora e um espelho calculado pela soma dos lotes do produto.
`products.expiration_date` passa a representar a proxima validade ativa do produto.

## Estruturas

- `stock_batches`: lotes de estoque por produto.
- `inventory_movements.batch_id`: vincula cada movimentacao ao lote afetado quando aplicavel.
- `v_stock_batches_sheet`: visao para planilha, relatorios e Power BI.

Ao iniciar o backend, bancos antigos sao migrados automaticamente:

- Produtos com `stock_quantity > 0` e sem lotes recebem um lote legado.
- A validade antiga do produto e usada como validade desse lote legado quando existir.

## Entradas e ajustes

- Compra sempre cria um lote novo.
- Ajuste de entrada pode somar em um lote existente ou criar um lote novo.
- Ajuste de saida e desperdicio exigem a escolha de um lote.
- Inventario pos-evento ajusta o total usando FEFO para reducoes e cria lote de ajuste para acrescimos sem lote informado.

## Vendas FEFO

Vendas usam FEFO automaticamente:

1. Busca lotes do produto com saldo positivo.
2. Ordena por menor validade.
3. Lotes sem validade ficam depois dos lotes com validade.
4. Consome lote por lote ate atender a quantidade vendida.
5. Registra uma movimentacao para cada lote consumido.
6. Atualiza o total espelhado em `products.stock_quantity`.

## APIs

- `GET /api/inventory/batches`: lista lotes.
- `GET /api/inventory/batches?product_id=1&include_empty=1`: lista lotes de um produto, incluindo esgotados.
- `GET /api/inventory/products/:id/stock`: retorna produto, estoque total e lotes.
- `POST /api/inventory/movements`: cria compra, ajuste ou desperdicio com informacoes de lote.

Formato resumido da consulta de estoque:

```json
{
  "productId": 1,
  "totalQuantity": 3,
  "batches": []
}
```

## Interface

Em Produtos:

- A tabela principal mostra o estoque total.
- A coluna de validade mostra a proxima validade ativa.
- A secao "Lotes de estoque" mostra lote, validade, quantidade, dias para vencer e alerta.
- O formulario de movimentacao permite escolher lote em ajustes de saida e desperdicio.
