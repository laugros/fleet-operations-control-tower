# Correções de Executabilidade dos Contratos G1 — DEMO-R1 v2.1.4

**Base:** `880e2f2`  
**Branch candidata:** `codex/g1-runner-contract-corrections`  
**Status:** `CANDIDATE_PENDING_INDEPENDENT_REVIEW`  
**Classificação:** evidência histórica, não normativa  
**Autorização:** não autoriza G2 e não substitui a decisão R7

## Escopo

Este slice corrige exclusivamente os sete achados executáveis registrados em
`reviews/history/43-g1-runner-contract-executability-review.md`. Nenhuma seed,
entidade, operação, permissão, evento ou requisito foi criado.

| Achado | Correção candidata |
|---|---|
| `G1-RUN-B001` | `TST-AUTH-SESSION-002` passou a enviar `role_code: DEMO_ADMIN`, distinguindo o request inválido do request válido de `TST-AUTH-SESSION-001`. |
| `G1-RUN-B002` | `TST-API-GET-DEMO-RESET-001`, `TST-DATA-RESET-005` e `TST-AUDIT-003` passaram a usar `FX-DATA-INTEGRITY`, que já contém o reset e a auditoria exigidos. |
| `G1-RUN-B003` | `TST-API-GET-DEMO-STATUS-001` passou a usar a credencial `internal.admin.cookie`. |
| `G1-RUN-B004` | `TST-AUTH-SESSION-004` passou a usar a credencial `internal.attendant.cookie`, correspondente ao hash da fixture expirada. |
| `G1-RUN-B005` | `TST-DATA-IAM-002/003` passaram a referenciar a linha existente de `demo_internal_session` em `FX-ACTIVE-ATTENDANT-SESSION`; a referência inexistente `VALID_DEMO_INTERNAL_SESSION` foi eliminada. |
| `G1-RUN-M006` | Uma migration corretiva renomeia as constraints físicas para `pk_user_role`, `fk_user_customer_scope_customer` e `uq_demo_reset_running`. |
| `G1-RUN-M007` | A precondição de `TST-DEMO-SEED-001` passou de seed v2.1.0 para v2.1.3. |

## Integridade do escopo

- fixtures completas: inalteradas;
- bundles de seed por gate: inalterados;
- total de testes G1: `26`;
- tabelas G1: `32`;
- work packages de G2 a G6: inalterados;
- contratos OpenAPI, eventos, comandos e políticas: inalterados.

## Evidências executadas

```text
YAML 1.2 — demo-r1-test-catalog.yaml: VALID
YAML 1.2 — demo-r1-test-runner-programs.yaml: VALID
pnpm db:migrate: PASS (2 migrations; corrective migration applied)
constraint catalog verification: PASS (3/3 names)
pnpm test:g1:db-contract: PASS (3/3 names)
pnpm test:g1: PASS (26/26)
pnpm test: PASS (26/26)
pnpm lint: PASS
pnpm build: PASS
pnpm test:g1:runtime: PASS
```

## Limite de autoridade

Esta correção é candidata. A `main` e a decisão R7 permanecem preservadas.
Antes de qualquer merge normativo, um revisor independente deve verificar o
diff, decidir sobre a incorporação e atualizar os hashes de assembly afetados.
Mesmo após a incorporação, G2 continua bloqueado até autorização explícita do
gate; este slice não constitui tal autorização.
