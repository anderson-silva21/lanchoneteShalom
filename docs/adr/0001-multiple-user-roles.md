# Perfis múltiplos com projeção de compatibilidade

`user_roles(user_id, role)` é a fonte de verdade das atribuições, com chave composta, validação dos cinco perfis e referência a `users` com exclusão em cascata. A nova migração copia os perfis antigos uma única vez, em transação, sem reconstruir `users`, preservando as rotinas históricas de migração e backup.

Mantemos `users.role` e o campo `role` nas respostas como projeções de compatibilidade, escolhendo o primeiro perfil na ordem admin, manager, cashier, finance, library. Triggers atualizam essa projeção; escritas diretas conflitantes em `users.role` são rejeitadas. Inserts legados (CLI e seeds) inicializam uma atribuição. Alterações posteriores usam exclusivamente `user_roles`, evitando duas representações independentes e a reintrodução de acessos removidos no reinício.

A API aceita `roles` ou o antigo `role` na criação, rejeitando o envio simultâneo. A edição usa apenas `roles`. O JWT identifica o usuário; a autenticação resolve os perfis atuais no banco em cada requisição. A autorização considera a união, inclusive para acesso operacional da Livraria quando Financeiro e Livraria coexistem.
