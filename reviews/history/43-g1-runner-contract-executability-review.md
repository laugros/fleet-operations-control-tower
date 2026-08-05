# Revisão de executabilidade do runner G1

- **Assessment ID:** `G1-RUNNER-2026-08-04`
- **Baseline:** `DEMO-R1 v2.1.4`
- **Commit de referência:** `1d8e3c6`
- **Escopo:** 26 testes de ativação de `G1_FOUNDATION`
- **Natureza:** evidência histórica não normativa

## Veredicto

```text
G1 RUNNER BLOCKED BY NORMATIVE CONTRADICTIONS
```

Não é possível implementar um runner que execute literalmente os 26 testes do
catálogo e obtenha `PASS` sem modificar inputs, fixtures ou identificadores
normativos. Fazer essas escolhas dentro do código do runner mascararia defeitos
do baseline e violaria as regras `fail_on_missing`, `unknown_program_id:
FAIL_RUN` e `unresolved_reference: FAIL_TEST_BEFORE_EXECUTION`.

Nenhum contrato normativo foi alterado e nenhuma funcionalidade de G2 foi
implementada.

## Blockers adicionais

### G1-RUN-B001 — Dois testes enviam o mesmo request e exigem resultados opostos

**Severidade:** BLOCKER

`TST-AUTH-SESSION-001` e `TST-AUTH-SESSION-002` executam:

```json
{
  "identity_code": "demo.attendant"
}
```

no mesmo endpoint `POST /api/v1/demo/sessions`, com fixture
`FX-NO-SESSION`. O primeiro espera `201`; o segundo, cujo título é “Role
forjado é rejeitado pelo schema”, espera `400 INVALID_REQUEST`, mas não inclui
qualquer campo de role ou claim forjado.

**Impacto:** uma implementação determinística não pode satisfazer os dois
resultados.

**Correção normativa requerida:** incluir explicitamente no segundo request o
campo forjado que deve ser rejeitado ou corrigir seu resultado esperado.

### G1-RUN-B002 — Consulta de reset aponta para linha ausente na fixture declarada

**Severidade:** BLOCKER

`TST-API-GET-DEMO-RESET-001` usa `FX-API-RESET` e consulta o ID
`2a5e717a-d5e0-5dda-bf7a-b9f57b64f065`, esperando `200`. O bundle autorizado
contém zero linhas em `FX-API-RESET.tables.demo_reset_execution`. Esse ID existe
em `FX-DATA-INTEGRITY`, não na fixture selecionada pelo teste.

**Impacto:** com restauração isolada por teste, a resposta correta é `404`, não
`200`.

**Correção normativa requerida:** inserir a execução na `FX-API-RESET`, trocar
a fixture do teste ou definir uma etapa causadora/capture antes da consulta.

### G1-RUN-B003 — Teste administrativo usa credencial operacional

**Severidade:** BLOCKER DE SEGURANÇA

`TST-API-GET-DEMO-STATUS-001` envia
`fixture://credentials/internal.operations.cookie` e espera `200`. O OpenAPI
define `x-scope-policy: SCOPE-DEMO-ADMIN` para `getDemoStatus`, e a separação do
Demo Admin é requisito do G1.

**Impacto:** aceitar literalmente o teste removeria a separação entre Demo
Admin e funções operacionais.

**Correção normativa requerida:** usar a credencial administrativa ou alterar
formalmente a política de acesso; o runner não pode escolher entre essas
decisões.

### G1-RUN-B004 — Sessão expirada e credencial pertencem a identidades diferentes

**Severidade:** BLOCKER DE COBERTURA

`FX-EXPIRED-SESSION` contém uma sessão cujo hash é derivado de
`internal.attendant.cookie`, mas `TST-AUTH-SESSION-004` envia
`internal.operations.cookie`. A resposta `SESSION_EXPIRED` pode ocorrer por
token inexistente, sem provar a expiração por inatividade que dá nome ao teste.

**Impacto:** o teste pode produzir falso positivo e não validar o comportamento
pretendido.

**Correção normativa requerida:** alinhar a credencial do request à sessão
expirada da fixture ou fornecer uma sessão expirada para operations.

### G1-RUN-B005 — Row template obrigatório não possui definição

**Severidade:** BLOCKER

Os programas `TST-DATA-IAM-002` e `TST-DATA-IAM-003` referenciam
`template_id: VALID_DEMO_INTERNAL_SESSION`. Nenhum registry ou definição desse
template existe em `tests/spec`, nos seed layers ou no contrato do runner.

**Impacto:** a fonte do `CLONE_INSERT`/`PATCH_UPDATE` não pode ser resolvida e o
contrato determina falha antes da execução para referências não resolvidas.

**Correção normativa requerida:** adicionar um registry versionado de row
templates e definir integralmente `VALID_DEMO_INTERNAL_SESSION`.

### G1-RUN-B006 — Nomes de constraints esperados não existem no schema aplicado

**Severidade:** MAJOR

| Programa | Nome esperado | Nome aplicado |
|---|---|---|
| `TST-DATA-IAM-001` | `pk_user_role` | `user_role_pkey` |
| `TST-DATA-IAM-004` | `fk_user_customer_scope_customer` | `user_customer_scope_customer_id_fkey` |
| `TST-DATA-RESET-001` | `uq_demo_reset_running` | `uq_demo_reset_active` |

O contrato exige comparação do nome da constraint quando declarado.

**Impacto:** os programas falham mesmo quando a regra estrutural equivalente é
enforced pelo PostgreSQL.

**Correção requerida:** após a correção dos blockers normativos, alinhar a
migration G1 aos nomes normativos ou corrigir formalmente os programas. Essa
escolha deve ser explícita e acompanhada de migration compatível para bancos já
criados.

### G1-RUN-B007 — Precondição do seed referencia versão inexistente no baseline

**Severidade:** MAJOR

`TST-DEMO-SEED-001` declara “Manifesto seed v2.1.0 disponível”, enquanto o
catálogo, o bundle e as chamadas do G1 usam seed `2.1.3`. Não há manifesto
v2.1.0 disponibilizado como input executável do gate.

**Impacto:** a precondição literal não pode ser demonstrada pelo pacote atual.

**Correção normativa requerida:** corrigir a versão da precondição ou incorporar
explicitamente o manifesto requerido.

## Correções mínimas antes do runner

1. Corrigir `TST-AUTH-SESSION-002` para conter o claim forjado.
2. Alinhar `TST-API-GET-DEMO-RESET-001` à fixture que contém a execução.
3. Alinhar `TST-API-GET-DEMO-STATUS-001` a `SCOPE-DEMO-ADMIN`.
4. Alinhar `TST-AUTH-SESSION-004` à sessão expirada correta.
5. Definir o registry e o conteúdo de `VALID_DEMO_INTERNAL_SESSION`.
6. Decidir os nomes canônicos das três constraints divergentes.
7. Corrigir a versão da precondição de seed.
8. Regenerar os bundles, planos, hashes e manifesto afetados por essas
   correções, seguindo um mecanismo de versionamento aprovado.

Somente depois dessas correções um agente pode implementar o runner sem
inventar comportamento ou adulterar a evidência de aceitação.
