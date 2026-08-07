# Correções de Executabilidade dos Contratos G1 — DEMO-R1 v2.1.4

**Base:** `880e2f2`  
**Branch candidata:** `codex/g1-runner-contract-corrections`  
**Status:** `CANDIDATE_PENDING_INDEPENDENT_REVIEW`  
**Classificação:** evidência histórica, não normativa  
**Autorização:** não autoriza G2 e não substitui a decisão R7

## Escopo

Este slice responde à revisão independente do PR #1 e corrige somente a
executabilidade dos contratos G1. Os achados históricos `G1-RUN-M006` e
`G1-RUN-M007` são aliases de `G1-RUN-B006` e `G1-RUN-B007` na revisão R6.

| Achado | Correção candidata |
|---|---|
| `G1-RUN-B001` | `TST-AUTH-SESSION-002` envia `role_code: DEMO_ADMIN`. |
| `G1-RUN-B002/B003` | `FX-API-RESET` agora contém sessão administrativa válida, reset concluído e auditoria; status, reset e auditoria usam essa fixture. |
| `G1-RUN-B004` | Sessão expirada usa `internal.attendant.cookie`. |
| `G1-RUN-B005` | IAM-002/003 referenciam a sessão existente de `FX-ACTIVE-ATTENDANT-SESSION`. |
| `G1-RUN-B006` (alias M006) | Migration renomeia as três constraints físicas e o verificador valida tabela, tipo, definição e predicado. |
| `G1-RUN-B007` (alias M007) | Precondição de seed usa v2.1.3. |
| Assembly | Script determinístico recompõe `FX-API-RESET`, atualiza seis camadas, manifestos, rastreabilidade e hashes derivados. |

## Integridade do escopo

- testes de ativação G1: `26`;
- validação estrutural adicional: `1`;
- tabelas G1 autorizadas: `32`;
- fixtures G1 requeridas: `9`;
- work packages de G2 a G6: não implementados;
- contratos de produto, OpenAPI, eventos, comandos e políticas: não ampliados.

## Evidências executadas

```text
pnpm install: PASS (yaml 2.8.1 declarado no lockfile)
pnpm test:g1: PASS (26 testes de ativação + assembly estrutural)
pnpm test:g1:db-contract: PASS (definições físicas 3/3)
pnpm test:g1:runtime: PASS
pnpm test: PASS
pnpm lint: PASS
pnpm build: PASS
```

## Limite de autoridade

Esta correção continua candidata. Os hashes foram recompostos para revisão,
mas a autoridade R7 não é automaticamente renovada por este commit. O merge
deve aguardar nova revisão independente; G2 permanece bloqueado até autorização
explícita do gate.
