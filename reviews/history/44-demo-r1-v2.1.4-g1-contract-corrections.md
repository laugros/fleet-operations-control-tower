# Correções de Executabilidade dos Contratos G1 — DEMO-R1 v2.1.4

**Base:** `880e2f2`  
**Branch candidata:** `codex/g1-runner-contract-corrections`  
**Commit técnico:** commit desta correção na branch candidata
**Status:** `CANDIDATE_PENDING_INDEPENDENT_REVIEW`  
**Classificação:** evidência histórica, não normativa  
**Autorização:** não renova R7, não autoriza G2 e não autoriza merge

## Escopo

Este slice responde às revisões independentes do PR #1 e corrige somente a
integridade e a executabilidade dos contratos G1. Os aliases históricos
`G1-RUN-M006`/`G1-RUN-M007` continuam equivalentes a `G1-RUN-B006`/`G1-RUN-B007`.

## Correções aplicadas

| Achado | Resultado |
|---|---|
| `PR1-BLK-001` | Resolvido: resolved seed e artefatos são validados por JSON Schema/Ajv. |
| `PR1-BLK-002` | Resolvido: `used_by_test_ids` é derivado do catálogo e comparado entre catálogo, resolved seed, manifesto e bundles. |
| `PR1-BLK-003` | Resolvido tecnicamente: o runner executa os 26 contratos, valida requests/responses OpenAPI, eventos, assertions de banco e grava 26 evidências estruturadas. |
| `PR1-BLK-004` | Resolvido tecnicamente: os 98 hashes internos e todos os `layer_state_sha256` existentes nos seis bundles são recalculados e verificados. |
| `PR1-BLK-004-A` | Resolvido: o verificador agora recalcula todos os hashes de fixture e bundle, não apenas quatro fixtures especiais. |
| `PR1-BLK-002-A` | Resolvido: o manifesto é validado semanticamente, incluindo IDs conhecidos e igualdade ordenada de uso. |
| `PR1-BLK-003-A` | Resolvido: `pnpm test:g1`/`pnpm test` executam o runner real e cada teste gera `test-results/<run-id>/<test-id>/evidence.json`. |
| `PR1-MAJ-001` | Resolvido: constraint exige btree, `((1))`, predicado exato e `pg_get_indexdef`. |
| Evento `DemoResetRequested` | Corrigido para o schema normativo: payload, `DEMO_RESET`, generation rule, source type/id e classificação. |
| `PR1-BLK-005` | **Permanece aberto como gate formal.** Nenhuma decisão nova foi inventada ou embutida nos arquivos R7. |

## Integridade do escopo

- testes de ativação G1: `26` contratos reais;
- validações estáticas: `27`;
- schemas validados: `12`;
- fixtures verificadas: `98`;
- tabelas G1 autorizadas: `32`;
- bundles cumulativos verificados: `6`;
- work packages funcionais de G2 a G6: `0`;
- evidências estruturadas por contrato: `26`;
- contratos de produto ampliados: não.

## Evidências executadas

```text
node tools/assemble-g1-correction.mjs: PASS (98 fixture hashes)
node tools/recompute-g1-hashes.mjs: PASS (6 bundles; 79 checksums)
node tools/verify-g1-assembly.mjs: PASS (12 schemas; 98 fixtures; 67 artefatos; 79 checksums)
pnpm test:g1: PASS (27 estáticos + 26 contratos reais)
pnpm test: PASS (mesma suíte integral)
pnpm lint: PASS
pnpm build: PASS
pnpm db:migrate: PASS (2 migrations; nenhuma pendente)
pnpm test:g1:db-contract: PASS (3/3)
pnpm test:g1:runtime: PASS
```

Cada execução do runner cria um diretório `test-results/<run-id>/` ignorado pelo
Git, com uma evidência JSON por teste contendo fixture/hash, inputs redigidos,
assertions, diffs de banco, IDs de evento, correlação, geração e duração.

## Limite de autoridade

As correções técnicas estão validadas, mas a autoridade R7 não é
automaticamente renovada por alterações em contratos normativos, manifestos ou
implementação. O PR continua **NOT READY FOR MERGE** até nova revisão
independente e decisão formal incorporada ao repositório. G2 a G6 continuam
fora do escopo e bloqueados.
