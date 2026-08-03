# Correção v2.1.2 — Achados Major Restantes

**Etapa:** `5 de 7`  
**Resultado:** `COMPLETE`  
**Não autoriza scaffold**

---

# 1. Achados tratados

```text
R4-MAJ-001 = RESOLVED
R4-MAJ-003 = RESOLVED
R4-MAJ-005 = RESOLVED
```

`R4-MAJ-002`, `R4-MAJ-004` e `R4-MAJ-006` já haviam sido resolvidos na etapa
do runner.

# 2. Headers externos

```text
EXTERNAL_RESPONSES_CHECKED = 24
EXTERNAL_HEADER_GAPS = 0
```

# 3. Recuperação de reset

```text
WATCHDOG = demo-reset-recovery-watchdog
HEARTBEAT_INTERVAL = 10s
LEASE_TTL = 30s
SCAN_INTERVAL = 15s
MAX_RECOVERY_ATTEMPTS = 3
```

Crash após a barreira restaura automaticamente a geração de origem quando seu
checksum é válido. Incerteza ou corrupção leva a `FAILED_SAFE`.

# 4. Ciclo de vida

Os três artefatos usam o mesmo status:

```text
test catalog = NORMATIVE_PENDING_BASELINE_REGENERATION
traceability = NORMATIVE_PENDING_BASELINE_REGENERATION
backlog = NORMATIVE_PENDING_BASELINE_REGENERATION
```

# 5. Checksums

```text
OPENAPI = 0c3767e492f9fcd6762d43ad7609a9fabc2bdb89f2cf402d1e84538cb43fd72a
RESET_POLICY = ccd3312823c9839567e834616b805a384c7748bece336c6ec29e7f2d999b3c8d
TEST_CATALOG = e4a3b0d9f199746fb0f4db7673470fc3fd7dd104b21630ffbb14a0d182d359fe
RUNNER_PROGRAMS = 9900d6a339d22057d546b970f5a750d7faf59712a47e0b1f6766975955b9a89d
TRACEABILITY = 69e67e83900c56501e3363bb0e2df6245a194d5a92a8328e073f42a118b8d11d
BACKLOG = 0ea80e6bc641b7a59619870422b7a8e7333712e755684bf48ceba7caa5ece377
```

# 6. Progresso

```text
CURRENT_STAGE = 5 OF 7 — COMPLETE
REMAINING_STAGES = 2
NEXT = FINAL BASELINE AND BACKLOG REGENERATION
SCAFFOLD = NOT AUTHORIZED
```
