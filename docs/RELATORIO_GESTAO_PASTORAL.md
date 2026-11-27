# Relatório de implementação — Gestão de Irmãos, Serviços, Grupos e Calendário

**Data:** 26/11/2026  
**Branch:** `feature/gestao-irmaos`  
**Situação:** implementação local concluída e validada; sem commit, merge ou publicação.

## Objetivo

Ampliar a Gestão de Irmãos com estrutura organizacional flexível, administração de grupos de oração, espaços de trabalho pastorais, calendário integrado e visão geral comunitária, mantendo os limites de acesso entre Admin, coordenação, pastores e ovelhas.

## O que foi implementado

### Serviços e organograma

- Serviços e ministérios agora aceitam organogramas com níveis aninhados, como coordenações, equipes e outras estruturas definidas pela comunidade.
- Cada nível pode ter responsável, integrantes, estado ativo e histórico de alterações e transferências.
- A visão geral apresenta totais de irmãos, pastores, ovelhas, serviços, grupos e integrantes de grupos.

### Grupos de oração

- Criados cadastro, consulta, edição, filtros e detalhe de grupos, incluindo descrição, serviço relacionado, responsável, dia e horário habitual, local, data de início e situação.
- Integrantes podem ser adicionados, removidos ou transferidos entre grupos com preservação dos períodos e do histórico.
- Pastores podem ser associados ou desligados de um grupo, mantendo o registro histórico.
- A agenda habitual do grupo é criada separadamente das ocorrências e integrada ao calendário; alterações individuais não apagam a série recorrente.

### Experiência pastoral e acompanhamento

- O início do pastor reúne próximas e anteriores atividades de acompanhamento, ovelhas vinculadas, resumo autorizado dos perfis, grupos relacionados, eventos comunitários e compromissos pessoais.
- O pastor pode abrir o perfil pastoral permitido e agendar acompanhamento de suas ovelhas.
- A ovelha recebe uma visão de seus próprios compromissos e eventos comunitários visíveis.
- Eventos pessoais permanecem privados e vinculados ao próprio usuário; a agenda permite editar ou cancelar uma ocorrência sem alterar toda a recorrência.

### Calendário, acesso e interface

- Eventos podem ser vinculados a um serviço ou grupo. A agenda combina eventos comunitários, grupos recorrentes, acompanhamentos autorizados e compromissos pessoais privados.
- O perfil Admin mantém acesso à administração, e as rotas validam permissões e vínculos no backend.
- A interface usa navegação contextual e responsiva, listas adequadas a celular e agenda em formato de lista em telas estreitas.
- Foram preservadas as permissões específicas do módulo e o isolamento dos módulos Lanchonete e Livraria.

### Persistência e documentação

- Migrações adicionam campos e tabelas de estrutura de serviços, grupos, pastores de grupo, vínculos, calendário e históricos, preservando os dados existentes.
- Atualizados `GLOSSARY.md`, `docs/BROTHERS_MODULE.md` e `docs/adr/0003-pastoral-access-calendar.md` com os conceitos e decisões da evolução.

## Validação executada

- Backend: **105 testes aprovados**.
- Frontend unitário: **20 testes aprovados**.
- Fluxos E2E: **5 testes aprovados**, incluindo permissões, Admin, perfil exclusivo do módulo e início pastoral em tela de celular.
- ESLint: aprovado.
- Build de produção: concluído.
- `git diff --check`: concluído sem erros.

O build emite um aviso de que o bundle JavaScript principal excede 500 kB após minificação; o aviso não impediu a compilação.

## Limitações e próximos cuidados

- Há suporte para exibir `photo_url`, mas envio e gerenciamento de fotos pessoais não fazem parte desta entrega.
- Categorias e situações comunitárias ainda dependem de definição funcional antes de ampliação.
- Antes do uso com dados reais, definir finalidade, base legal, retenção, correção e exclusão de dados pessoais, além dos responsáveis pelo tratamento conforme a LGPD.
- A implementação foi validada no ambiente de desenvolvimento. Não houve deploy ou validação operacional em produção.
