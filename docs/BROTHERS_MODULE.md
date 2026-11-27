# Gestao Pastoral e Calendario Comunitario

## Perfis de acesso

`brothers` e um perfil tecnico exclusivo do modulo. Ele nao concede acesso a Lanchonete, Livraria ou Sistema. As permissoes do modulo sao administradas separadamente dos papeis pastorais. Uma conta pode ser vinculada a um cadastro de irmao; essa ligacao permite mostrar apenas o proprio perfil a uma ovelha e limitar o pastor as ovelhas sob sua responsabilidade. Admin global continua com acesso completo, mas os administradores do modulo nao recebem privilegios globais.

## Hierarquia

Papeis pastorais (`coordinator`, `pastor`, `sheep`) sao atribuicoes datadas em `brother_pastoral_roles`, independentes dos perfis tecnicos. `pastoral_coordinator_assignments` e `pastoral_assignments` mantem relacoes ativas e historicas. A transferencia encerra a relacao anterior e inicia uma nova sem apagar o historico. A arvore e consultada dinamicamente e restringe nomes e ramos conforme a autorizacao.

Servicos e ministerios sao entidades proprias. `ministry_structure_nodes` permite criar niveis independentes por servico — coordenacoes, equipes ou niveis personalizados — e definir pai, responsavel, situacao e integrantes por periodo. O cadastro legado de integrante direto no servico permanece visivel na raiz da estrutura. Alteracoes ficam em `ministry_history` e `ministry_structure_history`.

Grupo de oracao e entidade comunitaria independente da recorrencia do calendario. O proprio grupo armazena servico relacionado, responsavel, dia e horario habituais, local, data de inicio e situacao. `brother_group_memberships` preserva participacoes por periodo; transferencias encerram o vinculo de origem e iniciam o de destino. `prayer_group_pastors` registra pastores vinculados sem substituir a lista de integrantes. `prayer_group_history` registra alteracoes do cadastro e dos vinculos.

## Calendario

`community_events` guarda compromissos compartilhados e privados e pode apontar para um servico ou grupo; `community_event_participants` controla acesso de participantes. Series semanais geram ocorrencias no intervalo consultado e `community_event_occurrences` permite ajustar, mover ou cancelar uma data sem alterar a serie. O horario habitual do grupo gera sua recorrencia comunitaria; `prayer_group_schedules` e `prayer_group_occurrences` mantem recorrencias e excecoes individuais.

Acompanhamentos pastorais continuam em `brother_followups`, separados de eventos comunitarios. O calendario mostra apenas titulo generico, data, horario e local; nunca retorna notas ou categoria privada. A pessoa vinculada ve o proprio compromisso. Coordenacao ve a estrutura inteira e pastores veem acompanhamentos das ovelhas vinculadas. Alteracoes de data, horario ou situacao geram historico sem duplicar o conteudo das notas.

Pastores podem organizar compromissos pessoais privados em `community_events` pelos endpoints `/api/pastoral/personal-events`; o backend fixa responsavel e visibilidade privada e restringe a edicao ao proprio usuario. A tela inicial do pastor prioriza suas ovelhas, acompanhamentos proximos e realizados, grupos relacionados e eventos autorizados da Obra. A visao geral da Obra retorna contagens e atividades conforme as permissoes sem expor dados pessoais por padrao.

## Contas do modulo

`POST /api/pastoral/users` cria usuario com o unico perfil tecnico `brothers`, vincula um cadastro e define permissoes do modulo. `GET /api/pastoral/users`, `PATCH /api/pastoral/users/:id` e `POST /api/pastoral/users/:id/reset-password` administram acessos exclusivos, ativacao e redefinicao de senha. A senha temporaria exige troca no primeiro acesso.

## Rotas principais

- `/api/pastoral/overview` e `/home`: resumo agregado da Obra e inicio contextual do usuario.
- `/api/brothers`: cadastro, grupos, servicos e acompanhamentos; leitura de acompanhamentos e cadastro permanecem separados.
- `/api/brothers/groups`: cadastro e filtros de grupos por servico, responsavel, dia e situacao; subrotas de membros permitem adicionar, remover e transferir integrantes com historico.
- `/api/brothers/ministries/:id/structure`: hierarquia e integrantes de um servico, com subrotas para criar e editar niveis e atribuir integrantes.
- `/api/pastoral/me`: dados permitidos do proprio cadastro vinculado.
- `/api/pastoral/orgchart`, `/roles`, `/assignments` e `/coordinator-assignments`: estrutura, papeis e vinculos historicos.
- `/api/pastoral/calendar`, `/events`, `/personal-events` e `/groups/:id/schedules`: calendario, eventos comunitarios e pessoais e recorrencias.
- `/api/pastoral/appointments`: agendamento, reagendamento e historico de acompanhamentos restritos.
- `/api/pastoral/users`: contas exclusivas do modulo e suas permissoes.

Todas as rotas validam permissoes no backend. Logs de `/api/brothers` e `/api/pastoral` omitem corpo e query string para proteger dados pessoais. As telas usam listas, divisores e controles com area de toque ampliada; a grade mensal e apresentada em telas maiores e o celular prioriza a lista cronologica.

## Limites atuais

Fotos podem ser exibidas quando `photo_url` estiver preenchido, mas nao ha fluxo de upload pessoal; foi preservado o armazenamento atual de imagens de produtos. Participantes de eventos podem ser vinculados via API e pela tela de cadastro. O vocabulario de situacao comunitaria e categoria pastoral continua aberto. Antes de uso com dados reais, definir finalidade, base legal, retencao, correcao/exclusao e responsaveis pelo tratamento de dados sensiveis conforme LGPD.
