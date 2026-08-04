# Revisão técnica de saída do G1_FOUNDATION

- **Assessment ID:** `G1-EXIT-2026-08-04`
- **Baseline:** `DEMO-R1 v2.1.4`
- **Commit avaliado:** `1553b985fc52f5d1e52b94faad72957886fed250`
- **Data:** `2026-08-04`
**Natureza:** evidência histórica não normativa

## Veredicto

```text
NOT READY FOR G2 IMPLEMENTATION
```

O scaffold e a implementação operacional do `G1_FOUNDATION` estão presentes,
compilam e executam localmente. Entretanto, a condição normativa de saída do
gate ainda não foi demonstrada pelo runner definido no baseline. A autorização
vigente continua limitada ao `G1_FOUNDATION`; `G2_DOMAIN` permanece
`BLOCKED_BY_PREVIOUS_GATE`.

## Evidências positivas

- `pnpm lint`: aprovado, sem erros ou warnings.
- `pnpm build`: aprovado para database, API, worker e web.
- `pnpm test:g1`: 26 testes reportados como aprovados.
- `pnpm test:g1:runtime`: smoke integrado aprovado para liveness, criação de
  sessão administrativa, consulta da sessão, status, reset, consulta do reset
  e recuperação do readiness.
- PostgreSQL, API e Mailpit saudáveis; web e worker ativos no Docker Compose.
- Migration G1, seed de 32 tabelas, reset, Outbox, auditoria e watchdog estão
  materializados no código.

Essas evidências sustentam `CODE_COMPLETE_RUNTIME_SMOKE_PASS`, mas não
substituem o contrato de aceitação executável.

## Blockers

### G1-EXIT-B001 — Runner dos 26 testes não executa as ações normativas

**Severidade:** BLOCKER

**Fontes afetadas:**
`tests/spec/demo-r1-test-runner-contract.yaml`,
`tests/spec/demo-r1-test-catalog.yaml`,
`tests/spec/demo-r1-gate-test-plan.yaml`,
`tests/activation/g1-foundation.spec.ts`.

O catálogo do G1 exige os seguintes executores:

| Tipo normativo | Quantidade | Execução observada |
|---|---:|---|
| `HTTP` | 14 | Smoke parcial; não executado como os 14 testes catalogados |
| `DB_PROGRAM` | 8 | Não executado pelo adapter `postgres-program` |
| `SCENARIO` | 1 | Não executado pelo `scenario-orchestrator` |
| `CLI` | 2 | Não executado com precondições e assertions catalogadas |
| `STATIC_ASSERTION` | 1 | Verificação parcial do bundle G1, sem o artifact-scanner normativo |

O arquivo `tests/activation/g1-foundation.spec.ts` implementa todos os IDs como
inspeções de conteúdo usando `readFileSync`, `toContain` e expressões regulares.
Isso confirma que determinados fragmentos existem, mas não executa as ações,
fixtures, falhas negativas, transações, constraints, recuperação ou assertions
definidas no catálogo.

**Impacto:** o resultado “26/26” não prova a condição de saída descrita pelo
backlog e pelo plano de testes.

**Correção requerida:** implementar os adapters necessários para o G1 ou um
runner G1 compatível que execute integralmente cada ação catalogada, sem
converter casos dinâmicos em inspeções estáticas.

### G1-EXIT-B002 — Evidência obrigatória por teste não foi produzida

**Severidade:** BLOCKER

**Fonte afetada:** `tests/spec/demo-r1-test-runner-contract.yaml`, seção
`evidence_contract`.

O contrato requer, por teste, `fixture_id`, hash do estado, tipo da ação,
timestamps, duração, status, correlation IDs, generation ID, inputs resolvidos,
captures, assertions, diff de banco e IDs de eventos. O relatório único do
Vitest não contém esse conjunto e não existem diretórios
`test-results/<run-id>/<test-id>/` com as evidências requeridas.

**Impacto:** não é possível auditar que os 26 testes normativos foram executados
com as fixtures e resultados esperados.

**Correção requerida:** gerar um artefato de evidência válido para cada teste e
um resumo do gate que referencie esses artefatos.

### G1-EXIT-B003 — O baseline não define a transição de autorização para G2

**Severidade:** BLOCKER DE GOVERNANÇA

**Fontes afetadas:**
`baseline/demo-r1-implementation-authorization.schema.json`,
`baseline/demo-r1-baseline-manifest.schema.json`,
`policies/demo-r1-implementation-authorization-policy.yaml`.

Os schemas v2.1.4 fixam literalmente `authorized_gate: G1_FOUNDATION`, revisão
`R7`, `later_gates_blocked: true` e `G2_DOMAIN: BLOCKED_BY_PREVIOUS_GATE`. Não
há schema, procedimento ou artefato normativo para promover um gate concluído e
autorizar o seguinte.

**Impacto:** mesmo após a execução conforme dos testes, alterar os arquivos
existentes diretamente violaria os próprios schemas e os hashes do manifesto.

**Correção requerida:** definir e aprovar um mecanismo de transição versionado,
incluindo responsáveis, schema da decisão, atualização do manifesto e regra de
integridade pós-montagem. Essa decisão não pode ser inferida por um agente de
código.

## Condições para nova avaliação

1. Executar os 26 testes do G1 pelos tipos de ação definidos no catálogo.
2. Produzir evidência individual conforme `evidence_contract`.
3. Demonstrar que todos os 26 testes estão `PASS`, sem usar testes deferidos
   como blockers do G1.
4. Aprovar e incorporar ao repositório o mecanismo normativo de transição de
   gates.
5. Somente então emitir uma decisão que marque G1 como concluído e G2 como
   autorizado.

## Decisão de escopo

Nenhum contrato normativo foi alterado nesta revisão. Nenhum work package de
G2 a G6 foi implementado. Este documento permanece em `reviews/history/`, que o
manifesto v2.1.4 declara como evidência histórica não incluída nos artefatos
normativos.
