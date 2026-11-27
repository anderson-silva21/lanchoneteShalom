# ADR 0003: perfil tecnico e estrutura pastoral

## Contexto

A Gestao Pastoral precisa de contas que nao tenham acesso a vendas, estoque, Livraria ou Administracao geral. As funcoes de Coordenador, Pastor e Ovelha descrevem a estrutura comunitaria, enquanto a autenticacao precisa de perfis tecnicos e concessoes de acesso independentes. A agenda tambem combina eventos compartilhados e compromissos pastorais privados.

## Decisao

Adicionar o perfil tecnico `brothers`, que abre somente o modulo. Administradores do modulo recebem a permissao individual `brothers:users:manage` e podem criar contas vinculadas a cadastros, atribuindo somente permissoes `brothers:*`. Os papeis pastorais e seus vinculos sao dados datados, fora da tabela de papeis tecnicos.

Persistir a hierarquia pastoral e seus historicos, produzir o organograma em consulta dinamica e limitar a arvore pelo usuario autenticado e suas ligacoes pastorais. Servicos e ministerios sao entidades independentes e podem definir arvores organizacionais diferentes com nos hierarquicos configuraveis; nos e integrantes guardam situacao e datas de vinculo.

Tratar grupos de oracao como comunidades independentes, com cadastro proprio, integrantes e pastores vinculados separadamente e agenda habitual, sem vinculo com servicos ou ministerios. Participacoes em grupos nao substituem vinculos pastorais. Transferencias encerram o vinculo anterior e preservam o historico.

Guardar eventos comunitarios em tabelas proprias com visibilidade, participantes e referencias opcionais a servico ou grupo. Compromissos pessoais sao eventos privados do proprio usuario. Expandir recorrencias semanais para o intervalo requisitado, guardando excecoes por data para que ajustes nao reescrevam a serie.

Manter acompanhamentos na entidade reservada existente. O calendario recebe uma projecao sem notas ou categoria; o perfil de ovelha ve apenas seu proprio horario, e o pastor ve apenas as pessoas atualmente sob sua responsabilidade. Registrar historico de reagendamentos sem copiar notas privadas.

## Consequencias

Contas tecnicas podem atuar como Coordenador, Pastor ou Ovelha sem transformar esses conceitos comunitarios em privilegios globais. Uma conta exclusiva pode receber senha temporaria e troca obrigatoria. As consultas e os logs precisam aplicar a mesma segregacao no backend; a navegacao do frontend e apenas uma projecao dessas permissoes.

As series e as excecoes permitem calendarios recorrentes sem criar registros permanentes para cada data futura. Os papeis, participacoes em grupos e vinculos historicos permitem auditoria de mudancas de responsabilidade. A visao geral usa contagens agregadas e atividades comunitarias filtradas pelas permissoes; a pagina inicial do pastor exibe apenas sua area de responsabilidade. A interface reutiliza a identidade visual e a navegacao mobile do restante do sistema.

## Alternativas rejeitadas

- Reutilizar `admin` para administradores pastorais: ampliaria acesso a operacoes da Lanchonete e Livraria.
- Codificar `pastor` e `sheep` como perfis tecnicos: misturaria estrutura comunitaria e autorizacao, e limitaria combinacoes futuras.
- Expandir recorrencias como eventos fixos: acumularia ocorrencias futuras e tornaria ajustes de serie dificeis de propagar.
- Reutilizar eventos comunitarios para guardar notas pastorais: aumentaria o risco de exposicao por calendario, filtros e relatórios.
