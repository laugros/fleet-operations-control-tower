# Especificação Executável v2.1.3
## Máquinas de Estado e Comandos de Domínio da DEMO-R1

**Produto:** Fleet Operations Control Tower  
**Release:** `DEMO-R1`  
**Status:** `NORMATIVE_PENDING_FINAL_REVIEW`  
**Não autoriza scaffold**

---

```text
COMMANDS = 37
SYSTEM_COMMANDS = 11
VehicleStop final = CLOSED
Case final = RESOLVED
RevokeExternalAccess = FORBIDDEN
```

Comandos sistêmicos executam somente em `LIVE_ONLY`, exigem geração ativa e
não são executados em replay. Cada comando persiste atomicamente estado,
histórico, evento principal, Outbox e auditoria.

```text
DOMAIN_COMMAND_REGISTRY = V2.1.3
FINAL_REVIEW = PENDING
SCAFFOLD = NOT AUTHORIZED
```
