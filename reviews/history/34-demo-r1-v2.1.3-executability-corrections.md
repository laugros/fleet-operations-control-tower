# Correção de Executabilidade da DEMO-R1 v2.1.3

**Ciclo:** correção posterior à revisão R5  
**Etapa:** `1 de 4`  
**Status:** `NORMATIVE_PENDING_DOCUMENT_REGENERATION`  
**Não autoriza scaffold**

---

# 1. Achados tratados

```text
R5-BLK-001 = RESOLVED IN EXECUTABILITY ARTIFACTS
R5-BLK-002 = RESOLVED IN EXECUTABILITY ARTIFACTS
R5-MAJ-001 = RESOLVED IN EXECUTABILITY ARTIFACTS
R5-MAJ-002 = RESOLVED IN EXECUTABILITY ARTIFACTS
```

# 2. Seed determinístico

O placeholder foi eliminado das 98 fixtures.

```text
SEED_CONTRACT_SHA256 = 65eae2afb4af507e6a807186bc55b85dda3abc872a7c2b1160d72f47aab916ca
PLACEHOLDER_OCCURRENCES = 0
FIXTURE_CHECKSUM_ERRORS = 0
```

O digest é calculado exclusivamente sobre `/seed_contract`, usando JSON
canônico com chaves ordenadas. Ele não inclui o próprio digest nem os checksums
das fixtures, portanto não existe autorreferência.

O alias histórico foi substituído:

```text
FX-SEED-V210 → FX-SEED-V213
```

# 3. Registries do runner

Foram criados registries machine-readable para:

```text
WORKERS = 4
ACTOR_PROFILES = 9
DB_OPERATION_CODES = 1
```

Workers usados pelos cenários:

```text
alert-evaluator
arrival-evaluator
fake-email-inbox-consumer
```

Perfis externos capturados agora exigem `session_cookie` e `csrf_token`,
produzidos explicitamente por `createExternalSession`.

# 4. Schemas discriminados

Cada passo de `EVENT_PROGRAM` e `SCENARIO` possui schema próprio selecionado
por `step.op`, com `additionalProperties: false`.

```text
PERMISSIVE_STEP_SCHEMA_PATHS = 0
ACTION_SCHEMA_ERRORS = 0
PROGRAM_SCHEMA_ERRORS = 0
```

# 5. Schema revision

As 39 precondições antigas foram substituídas por:

```text
Schema revision DEMO_R1_V213 aplicada.
```

# 6. Estado

```text
CURRENT_STAGE = 1 OF 4 — COMPLETE
REMAINING_STAGES = 3
NEXT = NORMATIVE DOCUMENT AND CHECKSUM REGENERATION
SCAFFOLD = NOT AUTHORIZED
```
