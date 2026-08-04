# Evidências de implementação — G1_FOUNDATION

Baseline: `DEMO-R1 v2.1.4`
Autorização: `R7 / READY_FOR_G1_SCAFFOLD`
Escopo: somente work packages e slices `G1_FOUNDATION`

## Validações transversais

- Work packages implementados na sequência normativa: 11.
- Slices registrados: 31.
- Testes de ativação materializados: 26 de 26.
- Modelos Prisma: 32.
- Tabelas na migration G1: 32.
- Tabelas futuras: 0.
- Bundle usado: `tests/spec/seed-layers/g1-foundation.json`.
- Fixtures disponíveis no bundle: 9.
- Evento implementado no kernel G1: somente `DemoResetRequested` v2.
- `pnpm test:g1`: aprovado, 26/26.
- `pnpm test:g1:runtime`: aprovado para liveness, sessão Demo Admin,
  autorização, status, reset, nova geração, consulta do reset e recovery do worker.
- `pnpm lint`: aprovado, zero erros e zero warnings.
- `pnpm build`: aprovado para database, API, worker e web.
- Prisma Client 7.9.1: gerado com sucesso.
- `prisma validate`: aprovado para `packages/database/prisma/schema.prisma`.
- Smoke test da API compilada: `GET /health/live` respondeu `200`,
  `{"status":"UP"}` e preservou `X-Correlation-ID`.
- Migration `202608020001_g1_foundation`: aplicada com sucesso em PostgreSQL 17.
- Seed `FX-SEED-V213`: carregado com contrato de 32 tabelas e manifesto 2.1.4 ativo.
- Docker Compose: PostgreSQL, Mailpit, API, worker e web executando localmente;
  API, PostgreSQL e Mailpit reportam estado saudável.

## Evidência por slice

| Slice | Estado | Evidência principal |
|---|---|---|
| `WP-DEMO-ENV-001/S1` | CODE_COMPLETE | `apps/api/src/health/health.controller.ts`, `compose.yaml` |
| `WP-DEMO-ENV-001/S2` | VERIFIED_STATIC | `TST-API-GET-LIVENESS-001`, `TST-API-GET-READINESS-001`, `TST-DEMO-ENV-001` |
| `WP-DEMO-ENV-003/S1` | CODE_COMPLETE | `apps/api/src/common/demo-mode.service.ts` |
| `WP-DEMO-ENV-003/S2` | VERIFIED_STATIC | `TST-API-CREATE-DEMO-SESSION-001`, `TST-API-RESET-DEMO-SCENARIO-001` |
| `WP-DEMO-DATA-003/S1` | CODE_COMPLETE | checks fictícios na migration e em `packages/database/prisma/seed-g1.ts` |
| `WP-DEMO-DATA-003/S2` | VERIFIED_STATIC | `TST-DEMO-DATA-001`, `TST-DEMO-SEED-001` |
| `WP-DEMO-DATA-001/S1` | CODE_COMPLETE | schema de 32 tabelas e loader exclusivo do bundle G1 |
| `WP-DEMO-DATA-001/S2` | VERIFIED_STATIC | `TST-DEMO-SEED-001` |
| `WP-DEMO-IAM-001/S1` | CODE_COMPLETE | modelos IAM e constraints de FK/unicidade |
| `WP-DEMO-IAM-001/S2` | CODE_COMPLETE | `POST /api/v1/demo/sessions` |
| `WP-DEMO-IAM-001/S3` | CODE_COMPLETE | `apps/web/app/components/identity-selector.tsx` |
| `WP-DEMO-IAM-001/S4` | VERIFIED_STATIC | sete testes ativos vinculados ao pacote |
| `WP-DEMO-ENV-002/S1` | CODE_COMPLETE | `apps/web/app/components/demo-banner.tsx`; superfícies externas não criadas |
| `WP-DEMO-ENV-002/S2` | DEFERRED_BY_GATE | `TST-DEMO-BANNER-001` permanece corretamente adiado para G5 |
| `WP-DEMO-IAM-002/S1` | CODE_COMPLETE | `demo_internal_session`, hashes, TTLs e revogação |
| `WP-DEMO-IAM-002/S2` | CODE_COMPLETE | `GET /api/v1/session`, `DELETE /api/v1/demo/sessions/current` |
| `WP-DEMO-IAM-002/S3` | CODE_COMPLETE | shell interno e fluxo de sessão |
| `WP-DEMO-IAM-002/S4` | VERIFIED_STATIC | sete testes ativos vinculados ao pacote |
| `WP-DEMO-IAM-003/S1` | CODE_COMPLETE | grants de role, unidade, cliente e equipe com FKs |
| `WP-DEMO-IAM-003/S2` | VERIFIED_STATIC | `TST-AUTH-SESSION-002`, `TST-DATA-IAM-001`, `TST-DATA-IAM-004` |
| `WP-DEMO-AUDIT-001/S1` | CODE_COMPLETE | `security_audit_record`, auditoria de reset e watchdog |
| `WP-DEMO-AUDIT-001/S2` | VERIFIED_STATIC | `TST-AUDIT-003`, `TST-DATA-RESET-003` |
| `WP-DEMO-IAM-004/S1` | CODE_COMPLETE | Demo Admin sem grants operacionais no seed G1 |
| `WP-DEMO-IAM-004/S2` | CODE_COMPLETE | `GET /api/v1/demo/status`; permissões `demo.read_status` e `demo.reset` |
| `WP-DEMO-IAM-004/S3` | CODE_COMPLETE | `apps/web/app/app/demo-admin/page.tsx` |
| `WP-DEMO-IAM-004/S4` | VERIFIED_STATIC | três testes ativos vinculados ao pacote |
| `WP-DEMO-DATA-002/S1` | CODE_COMPLETE | reset, geração, runtime, lease, evento, Outbox e idempotência |
| `WP-DEMO-DATA-002/S2` | CODE_COMPLETE | `POST /api/v1/demo/reset`, `GET /api/v1/demo/resets/{resetId}` |
| `WP-DEMO-DATA-002/S3` | CODE_COMPLETE | restauração e `DemoResetRequested`/Outbox/idempotência na mesma transação |
| `WP-DEMO-DATA-002/S4` | CODE_COMPLETE | status administrativo e dados da execução de reset |
| `WP-DEMO-DATA-002/S5` | VERIFIED_RUNTIME | migration, seed, reset transacional, nova geração, Outbox, auditoria e recovery validados em PostgreSQL 17 |

## Nota de compatibilidade do baseline

O bundle seed v2.1.4 usa os códigos persistidos `demo.status.read` e
`demo.clock.advance`, enquanto OpenAPI, backlog e rastreabilidade usam
`demo.read_status` e `demo.advance_clock`. A aplicação normaliza esses dois
códigos na fronteira de autorização sem modificar nenhum artefato normativo.
Além disso, `session.read` é tratado como capability intrínseca de uma sessão
interna autenticada, pois o endpoint G1 exige essa permission e o bundle não
contém uma linha persistida com esse código.

Essas compatibilidades ficam explicitamente registradas aqui e não alteram o
bundle, o OpenAPI, o backlog ou a rastreabilidade.
