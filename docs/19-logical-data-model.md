# Especificação Executável v2.1.4
## Modelo Lógico de Dados e Seed por Gate da DEMO-R1

**Status:** `NORMATIVE_AUTHORIZED_FOR_SCAFFOLD`  
**Escopo autorizado:** `G1_FOUNDATION`

```text
SCHEMA_TABLES_TOTAL = 61
FULL_SEEDED_TABLES = 47
G1_SCHEMA_TABLES = 32
G1_SEED_TABLES = 32
G1_REQUIRED_FIXTURES = 9
```

No G1, o runner deve carregar exclusivamente o bundle
`tests/spec/seed-layers/g1-foundation.json`. Tabelas e handlers futuros não
entram na validação.

```text
communication = NONCANONICAL
communication_message = CANONICAL
demo_scenario = LOGICAL_CONCEPT
supplier_site = G1_TABLE
```
