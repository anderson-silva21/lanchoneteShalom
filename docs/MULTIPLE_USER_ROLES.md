# Perfis múltiplos

Em Sistema → Usuários e permissões, selecione um ou mais perfis ao criar um usuário. Use **Editar perfis** para alterar os acessos de uma conta existente. Caixa + Livraria permite operar os dois módulos na mesma sessão; não há perfil ativo ou seletor de contexto.

## Contrato e segurança

- Criação: `POST /api/users` com `name`, `username` e `roles: ['cashier', 'library']`. O antigo `role` continua aceito sozinho.
- Edição: `PATCH /api/users/:id/roles` com `roles`. A resposta contém `{ user }`.
- Login, `/api/auth/me`, listagem, criação e reset de senha retornam `roles` e uma projeção legada `role`.
- Apenas Admin pode gerenciar usuários. A edição rejeita perfis vazios, inválidos ou duplicados e a remoção do último Admin ativo.
- O JWT identifica o usuário. Cada requisição consulta os perfis atuais; campos de perfil em tokens antigos não autorizam acessos.
- A mudança e sua auditoria são transacionais: uma falha ao gravar o evento cancela a edição. O evento registra autor, usuário afetado, perfis anteriores e novos.
- A interface sincroniza `/auth/me` a cada 30 segundos, ao recuperar foco e após salvar perfis na própria sessão. A revogação no backend vale na requisição seguinte, independentemente desse intervalo.

## SQLite e implantação

A inicialização cria `user_roles` e copia os perfis existentes em uma transação. A chave composta impede duplicatas, o CHECK limita os cinco perfis e a foreign key preserva a relação com `users`. Essa migração não reconstrói `users` e não altera credenciais nem referências históricas. Reiniciar não repete a importação de `users.role`.

O campo legado é uma projeção determinística atualizada por triggers, na ordem admin, manager, cashier, finance, library. Inserts de seeds e CLI continuam inicializando uma atribuição; alterações diretas conflitantes de `users.role` são rejeitadas. Para mudar acessos, use a API. As migrações históricas de versões anteriores, incluindo a expansão antiga do CHECK de perfis, permanecem no fluxo existente.

Ao implantar, mantenha `BACKUP_BEFORE_MIGRATIONS=true`, conserve uma cópia completa do SQLite e publique backend e frontend da mesma versão. Os backups existentes incluem a tabela e os triggers novos. Um rollback só do código para uma versão de perfil único não representa todos os acessos; planeje a restauração do backup considerando também dados operacionais gravados depois dele. Nenhum deploy ou acesso ao banco de produção foi realizado nesta implementação.

## Verificação

Os testes cobrem as APIs de usuários, autenticação com JWT antigo, união de permissões, revogação, último administrador, auditoria com rollback e migração com reabertura em outro processo. Os testes de navegador verificam criação, edição, menus, redirecionamento e sincronização de perfis em 390 e 1440 pixels.

O projeto usa JavaScript e não possui comando de typecheck. A validação usa as suítes Node, ESLint, build Vite e testes Playwright existentes. Uma fixture de parcelamento foi atualizada para uma data futura porque a data fixa antiga já havia vencido.

Resultados finais: backend 94/94, frontend unitário 15/15, navegador 21/21; ESLint, build Vite e `git diff --check` aprovados. A [revisão final](../.scratch/multiple-user-roles/review.md) registra os dois eixos e as sugestões corrigidas.
