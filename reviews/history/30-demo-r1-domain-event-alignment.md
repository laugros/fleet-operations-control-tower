# Correção v2.1.2 — Alinhamento de Domínio e Eventos

**Etapa:** `4 de 7`  
**Achado principal:** `R4-BLK-004`  
**Resultado:** `RESOLVED IN DOMAIN_EVENT_ARTIFACTS`  
**Não autoriza scaffold**

---

# Alterações

1. `CreateArrivalConflictAlert` foi formalizado.
2. `ResolveArrivalConflictAlert` foi formalizado.
3. `AutoRevokeExternalAccess` foi formalizado.
4. `RevokeExternalAccess` foi removido do event registry e marcado como proibido.
5. `revokeExternalAccess` foi removido das operações fonte.
6. `updateForecastInternal` foi removido de `CompletionForecastUpdated`.
7. Foi criado um command registry com 37 comandos.
8. Todos os comandos sistêmicos foram marcados como não executáveis em replay.

# Evidência

```text
COMMANDS = 37
EVENTS = 33
CONSUMERS = 15
MISSING_COMMANDS = 0
UNKNOWN_SOURCE_OPERATIONS = 0
REMOVED_OPERATION_REFERENCES = 0
BROKEN_EVENT_SCHEMA_REFS = 0
```

# Progresso

```text
CURRENT_STAGE = 4 OF 7 — COMPLETE
REMAINING_STAGES = 3
NEXT = REMAINING_MAJOR_FINDINGS
SCAFFOLD = NOT AUTHORIZED
```
