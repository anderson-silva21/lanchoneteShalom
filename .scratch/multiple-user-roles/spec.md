# Feature: Suporte a múltiplas roles por usuário — Lanchonete Shalom

Quero implementar suporte completo a múltiplas roles por usuário no sistema da Lanchonete Shalom (SH82), garantindo segurança, retrocompatibilidade, qualidade arquitetural e uma experiência de usuário consistente.

## Skills obrigatórias

Utilize as skills do Matt Pocock que já estão instaladas em `.agents/skills/`:

- **implement** — skill principal para conduzir a implementação.
- **domain-modeling** — para modelar a relação entre usuários, roles e permissões.
- **tdd** — para implementar os comportamentos críticos com testes.
- **code-review** — para realizar a revisão final.

Leia os respectivos arquivos `SKILL.md` e siga suas instruções aplicáveis. Leia também `AGENTS.md` e a documentação de domínio existente.

## Contexto atual

O projeto utiliza:

- Backend Node.js + Express.
- Banco SQLite.
- Autenticação JWT.
- Frontend React + Vite.
- Controle de acesso baseado em roles.
- Cinco roles: `admin`, `manager`, `cashier`, `finance` e `library`.

Atualmente, cada usuário possui uma única role armazenada em `users.role`.

Essa suposição também está presente em diferentes partes do sistema, incluindo:

- `backend/src/db.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/accessControl.js`
- `backend/src/routes/users.js`
- `backend/src/routes/auth.js`
- `frontend/src/access.js`
- `frontend/src/App.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/SettingsView.jsx`

Investigue também outras referências a `user.role` e verificações de permissões em todo o projeto.

## Objetivo funcional

Permitir que o administrador atribua uma ou várias roles ao mesmo usuário, tanto durante a criação quanto posteriormente, na edição de usuários existentes.

Exemplo:

Um usuário com as roles `cashier` e `library` deve conseguir acessar tanto o PDV da lanchonete quanto a livraria, utilizando uma única conta e uma única sessão.

As permissões efetivas serão a **união das permissões concedidas por todas as roles atribuídas**.

Não quero um sistema em que o usuário precise alternar manualmente entre roles para acessar funcionalidades.

## 1. Modelagem do banco de dados

Analise e implemente a melhor modelagem relacional para suportar múltiplas roles.

Considere uma tabela associativa `user_roles`, com referência a `users.id` e identificação da role, garantindo integridade referencial e impedindo associações duplicadas.

Requisitos:

- Migrar automaticamente os usuários existentes para o novo modelo.
- Preservar IDs, senhas, dados cadastrais e referências de outras tabelas.
- Preservar todas as permissões atuais durante a migração.
- Garantir migração transacional e idempotente.
- Respeitar as rotinas existentes de backup e migração SQLite.
- Evitar reconstruções destrutivas da tabela `users`, especialmente devido às foreign keys existentes.
- Definir uma única fonte de verdade para as roles, sem manter duas representações independentes que possam divergir.
- Planejar a compatibilidade com o campo legado `role` durante a transição.

Nenhum usuário existente poderá perder acesso involuntariamente.

## 2. Backend e autenticação

Atualize a autenticação e o contrato das APIs para trabalhar com uma coleção de roles:

`roles: ['cashier', 'library']`

Atualize os retornos de login, `/api/auth/me`, listagem e cadastro de usuários.

A autenticação deve continuar funcionando com um único JWT por usuário.

As permissões efetivas devem ser verificadas no backend com base nas roles atuais do banco de dados, evitando que um JWT antigo preserve acessos já revogados.

Quando o administrador adicionar ou remover uma role, a mudança deve valer para as próximas requisições autenticadas, sem exigir novo login.

Centralize a lógica de autorização para evitar verificações inconsistentes ou espalhadas pelo código.

Preserve o comportamento atual de autenticação, troca obrigatória de senha, bloqueio de usuários e proteção das rotas.

## 3. Gerenciamento de usuários

Na área Sistema → Usuários e permissões, implemente:

**Criação de usuário**

- Substituir o seletor de role única por um componente de seleção múltipla.
- Utilizar checkboxes ou outro componente acessível e consistente com o design existente.
- Permitir selecionar uma ou várias roles.
- Exigir pelo menos uma role.
- Manter o fluxo atual de criação e geração de senha temporária.

**Edição de usuário**

- Adicionar a possibilidade de editar as roles de usuários existentes.
- Criar endpoint protegido para atualização das roles.
- Restringir essa operação exclusivamente aos administradores.
- Exibir as roles atuais de cada usuário.
- Permitir adicionar e remover roles sem recriar a conta.
- Apresentar feedback claro de sucesso, erro e validação.
- Atualizar imediatamente a interface após salvar.

A interface deverá funcionar corretamente em desktop e dispositivos móveis.

## 4. Regras de autorização

Preserve a matriz de permissões atualmente implementada.

As permissões de cada usuário serão a união das suas roles.

Exemplos:

- `cashier` + `library`: PDV e Livraria.
- `cashier` + `finance`: permissões de Caixa e Financeiro.
- Somente `library`: mantém exclusivamente as permissões que essa role já possui.
- Somente `cashier`: mantém exclusivamente suas permissões atuais.
- `admin`: mantém as permissões administrativas existentes.

Não conceder privilégios adicionais por conveniência.

Revise todas as autorizações do backend, incluindo as permissões específicas da livraria, operações financeiras, gerenciamento de usuários, estoque e vendas.

A interface não deve ser considerada fonte de segurança; o backend precisa impedir operações não autorizadas independentemente da visibilidade dos menus.

## 5. Navegação e experiência de usuário

Adapte a navegação para usuários com múltiplas roles.

Requisitos:

- Exibir todos os módulos aos quais o usuário possui acesso.
- Não duplicar itens de navegação.
- Não exigir escolha de uma role ativa.
- Manter a responsividade.
- Exibir os perfis associados ao usuário de maneira legível.
- Garantir que o redirecionamento após o login escolha uma tela permitida.
- Impedir navegação para módulos não autorizados.
- Atualizar as permissões exibidas quando forem alteradas no servidor.

Preserve o design visual e os componentes já existentes.

## 6. Segurança e consistência

Implemente as seguintes garantias:

- Apenas administradores podem atribuir e remover roles.
- Usuários comuns não podem modificar as próprias permissões.
- Não permitir roles inválidas, vazias ou duplicadas.
- Impedir alterações que deixem o sistema sem nenhum administrador ativo.
- Não permitir elevação de privilégios por manipulação de requisições HTTP.
- Revogar imediatamente os acessos removidos, na próxima requisição.
- Registrar alterações de roles no sistema de auditoria, com autor, usuário afetado, roles anteriores e novas roles.
- Garantir que usuários inativos continuem sem acesso.
- Preservar todas as regras de autorização existentes.

## 7. Testes

Utilize TDD nos seguintes pontos de integração, considerados os limites de teste acordados para esta funcionalidade:

1. API de gerenciamento de usuários: criação, atualização, validação e autorização.
2. Autenticação e middleware: resolução das roles atuais, autorização por união e revogação de privilégios.
3. Interface e navegação: combinação de permissões e apresentação dos módulos disponíveis.

Cobrir especialmente:

- Migração de usuários antigos.
- Usuários com uma única role.
- Usuários com múltiplas roles.
- Combinação `cashier` + `library`.
- Usuários sem privilégios administrativos.
- Tentativas de edição não autorizadas.
- Remoção da última role administrativa ativa.
- Revogação de acesso com JWT ainda válido.
- Persistência após reinicialização.
- Compatibilidade com os dados e fluxos existentes.

Execute também os testes atuais do backend e frontend, garantindo que não existam regressões.

## 8. Restrições

- Não modificar funcionalidades não relacionadas.
- Não alterar o design geral da aplicação.
- Não excluir usuários ou dados existentes.
- Não alterar senhas ou credenciais.
- Não realizar deploy ou modificar o servidor de produção.
- Não introduzir dependências desnecessárias.
- Evitar soluções provisórias, verificações duplicadas e código excessivamente acoplado.
- Preservar os padrões e convenções existentes.

Trabalhe em uma branch específica para a funcionalidade, preservando a branch principal.

## 9. Entregáveis

Implemente a funcionalidade de ponta a ponta.

Ao final:

1. Explique a estratégia de modelagem adotada.
2. Resuma as alterações realizadas no backend e frontend.
3. Descreva a migração SQLite e os cuidados para implantação.
4. Informe os testes executados e seus resultados.
5. Apresente possíveis riscos ou pontos pendentes.
6. Realize a revisão final usando a skill `code-review`, corrigindo problemas encontrados antes de considerar a implementação concluída.

**Critério principal de aceitação:** um administrador deve conseguir atribuir as roles Livraria e Caixa ao mesmo usuário, e esse usuário deve acessar ambos os módulos, com as permissões corretas, usando uma única conta, sem perder nenhum comportamento existente.