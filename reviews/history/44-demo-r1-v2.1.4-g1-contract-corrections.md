# Correções de Executabilidade dos Contratos G1 — DEMO-R1 v2.1.4

**Base:** `880e2f2`  
**Branch candidata:** `codex/g1-runner-contract-corrections`  
**Status:** `CANDIDATE_PENDING_INDEPENDENT_REVIEW`  
**Classificação:** evidência histórica, não normativa  
**Autorização:** não autoriza G2, não renova R7 e não autoriza merge

## Escopo

Este slice responde à revisão independente do PR #1 e corrige somente a
executabilidade e a integridade dos contratos G1. Os achados históricos
`G1-RUN-M006` e `G1-RUN-M007` continuam aliases de `G1-RUN-B006` e
`G1-RUN-B007` na revisão R6.

| Achado | Correção candidata |
|---|---|
| `G1-RUN-B001` | `TST-AUTH-SESSION-002` envia `role_code: DEMO_ADMIN`. |
| `G1-RUN-B002/B003` | Fixtures de status, reset e auditoria possuem sessões, resets e auditoria executáveis. |
| `G1-RUN-B004` | Sessão expirada usa `internal.attendant.cookie`. |
| `G1-RUN-B005` | IAM-002/003 referenciam a sessão de `FX-ACTIVE-ATTENDANT-SESSION`. |
| `G1-RUN-B006` (alias M006) | Migration nomeia as três constraints físicas e o verificador compara a definição exata do índice parcial. |
| `G1-RUN-B007` (alias M007) | Precondição de seed usa v2.1.3. |
| Assembly | O script determinístico recompõe quatro fixtures afetadas, propaga metadados às seis camadas e atualiza manifestos, rastreabilidade e hashes derivados. |

## Achados da revisão independente do PR #1

| Achado | Resultado técnico |
|---|---|
| `PR1-BLK-001` | Corrigido. O resolved seed contém apenas `state_sha256`; os 12 artefatos aplicáveis são validados por JSON Schema/Ajv. |
| `PR1-BLK-002` | Corrigido. `used_by_test_ids` é derivado do catálogo e validado nos dois sentidos no resolved seed, manifesto e seis bundles. |
| `PR1-BLK-003` | Corrigido. `pnpm test:g1` executa validação estática, assembly integral e os 26 contratos reais contra API, PostgreSQL e worker. |
| `PR1-BLK-004` | Corrigido. A cadeia foi recomposta e verificada: 67/67 artefatos do baseline e 79/79 entradas de `SHA256SUMS.txt`. |
| `PR1-BLK-005` | **Permanece aberto como gate formal.** A correção não inventa uma nova decisão; é necessária nova revisão independente e decisão explícita de incorporação antes do merge. |
| `PR1-MAJ-001` | Corrigido. O verificador exige btree, expressão indexada `((1))`, predicado exato e `pg_get_indexdef` completo. |

## Integridade do escopo

- testes de ativação G1 executados: `26`;
- validações estáticas adicionais: `27`;
- schemas validados: `12`;
- fixtures verificadas: `98`;
- tabelas G1 autorizadas: `32`;
- fixtures requeridas pelo G1: `9`;
- bundles cumulativos recompostos: `6`;
- work packages de G2 a G6 implementados: `0`;
- contratos de produto, OpenAPI, eventos, comandos e políticas: não ampliados.

## Evidências executadas

```text
node tools/assemble-g1-correction.mjs: PASS
node tools/recompute-g1-hashes.mjs: PASS (6 bundles; 79 checksums)
node tools/verify-g1-assembly.mjs: PASS (12 schemas; 98 fixtures; 67 artefatos; 79 checksums)
pnpm test:g1: PASS (27 validações estáticas + 26 contratos reais)
pnpm test: PASS (mesma suíte integral)
pnpm lint: PASS
pnpm build: PASS
pnpm db:migrate: PASS (2 migrations; nenhuma pendente)
pnpm test:g1:db-contract: PASS (3/3, incluindo definição exata do índice parcial)
pnpm test:g1:runtime: PASS
```

## Limite de autoridade

As correções técnicas desta candidatura estão validadas, mas a autoridade R7
não é automaticamente renovada por alterações em contratos normativos e no
manifesto. O PR continua **NOT READY FOR MERGE** até que uma nova revisão
independente registre formalmente a decisão de incorporação. G2 a G6 continuam
fora do escopo e bloqueados.
