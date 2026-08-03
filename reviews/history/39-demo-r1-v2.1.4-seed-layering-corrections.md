# Correções de Seed por Camadas — DEMO-R1 v2.1.4

**Ciclo:** correção posterior ao bloqueio do Codex  
**Etapa:** `2 de 4`  
**Classificação:** evidência histórica, não normativa  
**Não autoriza scaffold**

---

# Contrato de tabelas

```text
SCHEMA_TABLES = 61
FULL_RELEASE_SEEDED_TABLES = 47
EMPTY_SCHEMA_ONLY_TABLES = 14
```

Correções canônicas:

```text
communication → communication_message
demo_scenario → conceito lógico, sem tabela física
supplier_site → G1_FOUNDATION / WP-DEMO-DATA-001
```

# Seed por gate

```text
G1_FOUNDATION = 9 fixtures / 32 seed tables / 32 schema tables
G2_DOMAIN = 47 fixtures / 40 seed tables / 45 schema tables
G3_PROJECTIONS = 54 fixtures / 40 seed tables / 52 schema tables
G4_TIME_COMMUNICATION = 67 fixtures / 43 seed tables / 56 schema tables
G5_EXTERNAL = 92 fixtures / 47 seed tables / 61 schema tables
G6_EXECUTIVE = 98 fixtures / 47 seed tables / 61 schema tables
```

Cada bundle contém somente as fixtures exigidas pelos testes cumulativos do
gate e somente as tabelas já introduzidas. Tabelas futuras são retiradas antes
da validação de schema e coluna.

# Integridade

```text
SEED_CONTRACT_SHA256 = 75c54f84cbb9fb98492a272b88bd634aeddf72bf73d27e4b993a764bbb4b2b5b
FULL_FIXTURE_CHECKSUM_ERRORS = 0
LAYER_FIXTURE_CHECKSUM_ERRORS = 0
BUNDLE_CHECKSUM_ERRORS = 0
UNKNOWN_TABLE_REFERENCES = 0
```

```text
CURRENT_STAGE = 2 OF 4 — COMPLETE
REMAINING_STAGES = 2
NEXT = ASSEMBLE AND VALIDATE PRE-REVIEW BASELINE V2.1.4
SCAFFOLD = NOT AUTHORIZED
```
