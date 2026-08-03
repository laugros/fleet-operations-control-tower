# Especificação Executável v2.1.3
## Contrato do Test Runner da DEMO-R1

**Produto:** Fleet Operations Control Tower  
**Release:** `DEMO-R1`  
**Status:** `NORMATIVE_PENDING_FINAL_REVIEW`  
**Não autoriza scaffold**

---

SHA-256 do contrato: `8389937b0f2c49d09f92881501a69c3c967be3249f09dbf27d0586afd5231edc`.  
SHA-256 do schema do contrato: `ae86888fb7c5c90a843a8253d01e5473ec61dd6daca66a59c99998f7e9b97571`.  
SHA-256 dos programas: `3972330e306ba4b303d3ecfbb62e9255878fd01399c2517d5b97db4c17887bca`.  
SHA-256 do schema de programas: `a1d80ccbb41bca913ed066a54c638ecd7be07a162a985be7b6f1aa27864e4c7e`.  
SHA-256 do schema de ações: `2527517cf88e4da59a9c43f8c8d8687e2ba82f232666074846b0464d2964ce2f`.  
SHA-256 do registry de workers: `a29d65ca1c2ea8877af69956a11006fd63581d268a51ab7e85eeb7f004f325c3`.  
SHA-256 do schema de workers: `82965b9b4d9e2ab9b5eb2fe3b3579e022d573dc354240b88120db809e8a304b9`.  
SHA-256 do registry de atores: `13915dad0d84cc0f17514a2afb554a9dd476088527198892eb9ba099de12db26`.  
SHA-256 do schema de atores: `c515ba7c4673eca3886fcc7e6396bc15ce3a9e7e867f0df3dc09be7348a7be59`.  
SHA-256 do registry de operações DB: `4548eb3becd7130e7e38e5d455d1fcc7adbea15da0361ca8fc7da97ccde220fb`.  
SHA-256 do schema de operações DB: `01b777fb33efee389e6fbea28403f53bd5a088765a2193e85b08315c2a3e307b`.  
SHA-256 do catálogo: `b6bab52164206a04e219a4a6e59727deb23a30cc60f247aeb231266a131118c0`.  
SHA-256 do schema do catálogo: `87e1933a3ac76c2f521fb0e791b2437e4fe0ccbc6bb36f1d3b5d844483a9cdbb`.  

```text
WORKERS = 4
ACTOR_PROFILES = 9
DB_OPERATION_CODES = 1
PERMISSIVE_STEP_SCHEMAS = 0
```

`createExternalSession` deverá produzir `session_cookie` e `csrf_token`
antes do uso de um perfil externo capturado.

Passos de `EVENT_PROGRAM` e `SCENARIO` são discriminados por `step.op`.

```text
RUNNER_CONTRACT = V2.1.3
UNREGISTERED_EXECUTORS = 0
FINAL_REVIEW = PENDING
SCAFFOLD = NOT AUTHORIZED
```
