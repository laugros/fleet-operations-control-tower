# Correções de Executabilidade por Gate — DEMO-R1 v2.1.4

**Ciclo:** correção posterior ao bloqueio do Codex  
**Etapa:** `1 de 4`  
**Classificação:** evidência histórica, não normativa  
**Não autoriza scaffold**

---

# Resultado

```text
GATE_TEST_ACTIVATION = DEFINED
TESTS_ACTIVATED_EXACTLY_ONCE = 208
G1_ACTIVATION_TESTS = 26
G1_DEFERRED_LINKED_TESTS = 24
FINAL_REGRESSION_TESTS = 6
```

Os exemplos apontados pelo Codex foram formalizados:

```text
E2E-DEMO-000 = G6_EXECUTIVE / FINAL_REGRESSION
TST-DEMO-BANNER-001 = G5_EXTERNAL
TST-SM-CROSS-010 = G3_PROJECTIONS
TST-EVT-CONTRACT-011 = G2_DOMAIN
TST-DATA-RESET-004 = G2_DOMAIN
```

A obrigação de cada work package foi dividida em:

```text
gate_required_test_ids
deferred_test_ids
deferred_until_gate_by_test
```

Um teste `DEFERRED_BY_GATE` não pode bloquear o gate atual.

# Correção do ciclo reset/eventos

O `WP-DEMO-DATA-002` passa a incluir o kernel mínimo:

```text
domain_event
integration_outbox
idempotency_record
```

Esse kernel suporta somente `DemoResetRequested`. O
`WP-DEMO-EVT-001`, no G2, passa a estender o kernel para as demais mutações,
históricos e consumers.

# Política de autorização

Mensagens de chat e pacotes de revisão separados não autorizam scaffold. A
autorização final exigirá decisão `R7` incorporada ao próprio repositório,
status normativo autorizado e verificação posterior à montagem.

```text
CURRENT_STAGE = 1 OF 4 — COMPLETE
REMAINING_STAGES = 3
NEXT = SEED LAYERING AND TABLE CONTRACT CORRECTION
SCAFFOLD = NOT AUTHORIZED
```
