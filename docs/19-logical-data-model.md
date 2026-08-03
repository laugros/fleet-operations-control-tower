# Especificação Executável v2.1.3
## Modelo Lógico de Dados e Recuperação de Reset da DEMO-R1

**Produto:** Fleet Operations Control Tower  
**Release:** `DEMO-R1`  
**Status:** `NORMATIVE_PENDING_FINAL_REVIEW`  
**Não autoriza scaffold**

---

```text
PostgreSQL
UUID interno
event sequence por aggregate
Outbox e auditoria atômicas
SEED_VERSION = 2.1.3
RESOLVED_FIXTURES = 98
SEED_CONTRACT_SHA256 = 65eae2afb4af507e6a807186bc55b85dda3abc872a7c2b1160d72f47aab916ca
PLACEHOLDERS = 0
```

O digest do seed é calculado sobre `/seed_contract` e não inclui o próprio
digest.

```text
watchdog = demo-reset-recovery-watchdog
heartbeat = 10s
lease_ttl = 30s
scan_interval = 15s
maximum_recovery_attempts = 3
```

Crash durante a fase B causa rollback integral. Incerteza ou corrupção leva a
`FAILED_SAFE`.

```text
DATA_MODEL = V2.1.3
RESET_RECOVERY = DEFINED
FINAL_REVIEW = PENDING
SCAFFOLD = NOT AUTHORIZED
```
