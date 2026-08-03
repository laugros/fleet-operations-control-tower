# Especificação Executável v2.1.3
## Autorização e Acesso Externo da DEMO-R1

**Produto:** Fleet Operations Control Tower  
**Release:** `DEMO-R1`  
**Status:** `NORMATIVE_PENDING_FINAL_REVIEW`  
**Não autoriza scaffold**

---

Tokens externos são opacos, persistidos somente por hash e limitados por
parada, audiência, sujeito, geração, expiração e quantidade de usos.

A revogação manual não pertence à API. A política normativa é
`AutoRevokeExternalAccess`.

Todas as 24 respostas externas declaram:

```text
Cache-Control: no-store
Pragma: no-cache
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Content-Security-Policy
X-Demo-Generation-ID
```

`CAPTURED_EXTERNAL_SUPPLIER` e `CAPTURED_EXTERNAL_DRIVER` somente podem ser
usados após `createExternalSession` produzir `session_cookie` e `csrf_token`.

```text
EXTERNAL_ACCESS = HASH_ONLY
FINAL_REVIEW = PENDING
SCAFFOLD = NOT AUTHORIZED
```
