# Gestao de Irmaos

O modulo reune cadastro pessoal, vinculos historicos com grupos de oracao e servicos, e registros de acompanhamento protegidos. O cadastro pode ser desativado sem apagar o historico; grupos, servicos e vinculos tambem sao inativados ou encerrados, sem exclusao dos registros historicos.

## Permissoes

As permissoes sao atribuicoes individuais, administradas em **Sistema → Usuarios e permissoes**. O perfil Admin nao recebe automaticamente acesso ao modulo nem aos acompanhamentos.

| Permissao | Acesso |
| --- | --- |
| `brothers:read` | Pesquisar, consultar perfis, vinculos e historico comunitario |
| `brothers:create` | Criar cadastro |
| `brothers:update` | Atualizar cadastro e iniciar/encerrar vinculos |
| `brothers:groups:manage` | Criar e atualizar grupos de oracao e consultar nomes necessarios para atribuir responsaveis |
| `brothers:ministries:manage` | Criar e atualizar servicos e ministerios e consultar nomes necessarios para atribuir responsaveis |
| `brothers:followups:read` | Consultar acompanhamentos, com auditoria de leitura |
| `brothers:followups:create` | Registrar acompanhamento |
| `brothers:followups:update` | Editar acompanhamento |

As permissoes de acompanhamento sao independentes das permissoes de cadastro. A listagem nao retorna telefone, e-mail, endereco, data de nascimento, situacao comunitaria, grupo ou servico. Os acompanhamentos nao sao incluidos no perfil geral, em relatorios ou em exportacoes. Requisicoes do modulo nao gravam busca ou corpo pessoal nos logs da aplicacao.

## Entidades e rotas

As tabelas `brothers`, `prayer_groups`, `ministries`, tabelas de vinculo, `brother_followups`, `brother_history` e `brother_permissions` sao criadas incrementalmente pelo fluxo de migracoes SQLite. Nenhuma tabela da Lanchonete ou Livraria e reconstruida.

- `GET/POST /api/brothers`, `GET/PATCH /api/brothers/:id`
- `GET/POST/PATCH /api/brothers/groups`, `/api/brothers/ministries`
- `POST /api/brothers/:id/groups` e `.../ministries`; `PATCH .../:membershipId/end` preserva o periodo anterior
- `GET/POST /api/brothers/:id/followups`, `PATCH /api/brothers/:id/followups/:followupId`
- `PATCH /api/users/:id/brother-permissions` para administracao das concessoes individuais

## Limites e decisao pendente

Foto nao faz parte desta entrega: o armazenamento de imagem atual foi criado para produtos, e nao foi estendido para fotografias pessoais. `community_status` e a categoria do acompanhamento aceitam texto controlado pelos usuarios porque a especificacao nao define vocabularios comunitarios aprovados. Antes de uso com dados reais, a comunidade deve definir finalidade, base legal, prazo de retencao, fluxo de correcao/exclusao e responsaveis pelo tratamento desses dados sensiveis.
