# Revisão final — perfis múltiplos

Skill: `.agents/skills/code-review/SKILL.md`. Ponto fixo aprovado pelo usuário: `3861285ebea673f458d4e83b65d571116617e61b`. Especificação: [spec.md](./spec.md). Dois agentes executaram os eixos em paralelo, em modo somente leitura.

## Standards

Não foram encontradas violações dos padrões documentados nem conflitos com a ADR 0001.

A análise inicial identificou duas sugestões de manutenção:

- Possível **Duplicated Code**: AppShell repetia a formatação dos perfis e mantinha seus próprios rótulos, enquanto SettingsView usava outra função e outra fonte de rótulos. A correção centralizou `profileLabels` em `frontend/src/access.js`, baseada em `roleOptions`, reutilizando-a nos dois componentes.
- Possível **Mysterious Name**: `hideOperationalSensitiveForFinance` passou a decidir por permissão de escrita, tornando o nome impreciso. A função foi renomeada para `hideOperationalSensitiveWithoutWritePermission`, com todas as chamadas atualizadas.

O agente conferiu as correções e confirmou: **0 violações documentadas e 0 sugestões pendentes**.

## Spec

Nenhum achado confirmado.

A implementação atende aos requisitos examinados: migração transacional e idempotente sem reconstruir `users`, projeção compatível do campo legado, união das permissões, autorização pelas roles atuais do banco, revogação com JWT válido, proteção administrativa, preservação do último administrador ativo e auditoria transacional.

A interface permite criar e editar múltiplos perfis, atualiza a listagem após salvar e sincroniza permissões da sessão. Os testes adicionados cobrem Caixa + Livraria, validação, autorização, revogação, persistência após reabertura e navegação em desktop e dispositivos móveis.

Não foram identificados requisitos ausentes, implementação incorreta ou expansão funcional indevida. A correção da matriz exibida em SettingsView acompanha a matriz efetiva existente; a atualização da data de uma fixture permite executar a regressão atual.

Resultado: Standards — 0 achados pendentes (2 sugestões resolvidas); Spec — 0 achados; sem problema pendente em qualquer eixo.
