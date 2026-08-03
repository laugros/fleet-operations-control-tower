# Especificação Executável v2.1.4
## Máquinas de Estado e Comandos de Domínio da DEMO-R1

**Status:** `NORMATIVE_AUTHORIZED_FOR_SCAFFOLD`  
**Escopo autorizado:** `G1_FOUNDATION`

```text
COMMANDS = 37
EVENT_TYPES = 33
RESET_EVENT_KERNEL = G1_FOUNDATION
DOMAIN_EVENT_EXTENSION = G2_DOMAIN / BLOCKED
```

O G1 pode implementar `DemoResetRequested` usando `domain_event`,
`integration_outbox` e `idempotency_record`. As demais mutações e consumers
de domínio permanecem no G2.

```text
SCAFFOLD = AUTHORIZED
AUTHORIZED_GATE = G1_FOUNDATION
```
