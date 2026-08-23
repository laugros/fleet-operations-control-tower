# Revisão Independente Final R8 — DEMO-R1 v2.1.4

## 1. Veredicto

NOT READY FOR MERGE

## 2. Resumo executivo

A revisão foi executada de forma independente sobre o commit `39aa28173ca6c5e4199ca8e1b4ddf81489f8dc0e` do PR #1. O checkout estava limpo e coincidia com o `head_sha` do PR. Não houve implementação, merge, alteração de decisão R7 nem interação de escrita no GitHub.

Há progresso técnico material e reproduzível: `pnpm test:g1` executou literalmente e passou com 27 validações estáticas e 26 contratos reais; API, PostgreSQL, worker e `pnpm demo:up` foram exercitados; foram produzidos 26 `evidence.json`; os 98 `state_sha256`, 367 `full_state_sha256`, 367 `layer_state_sha256`, seis hashes de bundle, 67 entradas do baseline manifest e 79 entradas de `SHA256SUMS.txt` coincidem com o conteúdo atual.

Esses resultados não encerram os blockers. O verificador aceita alterações semânticas autoconsistentes depois que os utilitários regeneram a própria raiz de hashes; a igualdade ordenada de `used_by_test_ids` pode ser contornada porque o verificador ordena os valores antes da comparação; e o runner ignora a assertion declarada de `demo_generation_id`. Na execução reproduzida, o `DemoResetRequested` ficou associado à geração de origem enquanto, após a transação que o gravou, a geração ativa era a de destino. A implementação e a especificação descrevem a origem como geração do evento, mas a regra normativa exige a geração ativa no momento de produção; o runner não prova esse instante e emite PASS mesmo sem exercer a assertion.

Separadamente, não existe decisão formal incorporada após R7. Dezoito artefatos manifestados foram alterados no PR e seus hashes foram atualizados, mas o baseline continua declarando `review_id: R7` e `final_review_required: false`. Este relatório R8 é evidência histórica e não constitui autorização. Portanto, mesmo que os blockers técnicos fossem corrigidos, `PR1-BLK-005` continuaria impedindo o merge até decisão formal nova e incorporada.

## 3. Status dos blockers anteriores

| ID | Status R8 | Conclusão |
|---|---|---|
| `PR1-BLK-004-A` | REABERTO / PARCIALMENTE RESOLVIDO | A recomputação completa funciona e detecta fixture alterada com digest antigo, mas uma alteração semântica de estado seguida pelos utilitários de assembly e hash passa integralmente. A cadeia comprova autoconsistência, não aderência ao conteúdo autorizado. |
| `PR1-BLK-002-A` | REABERTO | O conteúdo atual tem igualdade ordenada, porém o verificador usa `.sort()` no esperado, no resolved seed e no manifesto. A ordem invertida e propagada para todos os artefatos passa após recomputação. |
| `PR1-BLK-003-A` | REABERTO / PARCIALMENTE RESOLVIDO | O comando literal e os 26 contratos/evidências existem, mas assertions declaradas não são integralmente executadas; em especial, `event_assertions.demo_generation_id` é ignorada e a regra temporal da geração ativa não é validada. |
| `PR1-BLK-005` | ABERTO | Não há decisão formal pós-R7 incorporada ao repositório. R8 não renova R7 e não autoriza merge ou G2. |
| `PR1-MAJ-001` | RESOLVIDO | `pnpm db:migrate` indicou duas migrations e nenhuma pendente; `pnpm test:g1:db-contract` confirmou nome, schema, tabela, tipo, definição, btree, expressão `((1))` e predicado das três constraints. |

## 4. Evidências reproduzidas

- PR #1: aberto, não merged, base `880e2f202014f8a9f17f58657ccf49e45541f796`, head `39aa28173ca6c5e4199ca8e1b4ddf81489f8dc0e`, 33 arquivos alterados.
- `AGENTS.md`: inexistente no checkout.
- `docs/00-document-index.md`: inexistente no checkout.
- Todos os demais artefatos obrigatórios foram lidos ou parseados integralmente, inclusive os seis bundles, resolved seed, catálogo, programas, OpenAPI e schema de eventos.
- `pnpm test:g1`: PASS; 27/27 validações estáticas, assembly 12 schemas/98 fixtures/67 artefatos/79 checksums e 26/26 contratos reais.
- `pnpm db:migrate`: PASS; nenhuma migration pendente.
- `pnpm test:g1:db-contract`: PASS; 3/3 constraints.
- `pnpm lint`: PASS.
- Evidência dinâmica: `test-results/g1-20260809202158473/`, 26 diretórios de teste, 26 arquivos `evidence.json`, nenhum campo obrigatório ausente, zero referências `fixture://credentials/`, zero marcador `g1-fake-secret:` e 12 marcadores explícitos de redação.
- A primeira execução no sandbox falhou ao iniciar `docker`; a repetição autorizada com acesso ao Docker Desktop local passou integralmente. A falha inicial foi ambiental e não foi usada como achado de produto.

## 5. Blockers remanescentes

### PR1-BLK-004-A — BLOCKER

- **Arquivo/seção:** `tools/assemble-g1-correction.mjs`; `tools/recompute-g1-hashes.mjs:12,49-61`; `tools/verify-g1-assembly.mjs:56-87`; baseline manifest e `SHA256SUMS.txt`.
- **Evidência reproduzível:** em cópia temporária limpa do commit, alterar `FX-API-RESET.tables.demo_runtime_control[0].version` de `1` para `8`, executar `node tools/assemble-g1-correction.mjs`, `node tools/recompute-g1-hashes.mjs` e `node tools/verify-g1-assembly.mjs`. Os três comandos retornam exit code `0`; o verificador encerra com `PASS`, 12 schemas, 98 fixtures, 67 artefatos e 79 checksums. Em contraste, a mesma alteração sem atualizar o digest falha com `FX-API-RESET state_sha256 is not reproducible`.
- **Impacto:** a cadeia detecta inconsistência acidental, mas não rejeita alteração semântica autoconsistente. Como os mesmos utilitários reescrevem bundles, documentos, baseline manifest e `SHA256SUMS.txt`, o PASS não prova que o conteúdo continua sendo o conteúdo formalmente autorizado.
- **Correção recomendada:** vincular a verificação a uma raiz autorizada independente dos artefatos recomputáveis, incorporada por decisão formal e não regravada pelo comando técnico; o verificador deve falhar quando o conjunto semântico divergir dessa raiz sem nova decisão.
- **Bloqueia o merge:** sim.

### PR1-BLK-002-A — BLOCKER

- **Arquivo/seção:** `tools/verify-g1-assembly.mjs:44-55` e `:77-78`.
- **Evidência reproduzível:** inverter a ordem dos quatro `used_by_test_ids` de `FX-API-RESET` no resolved seed, manifesto e seis bundles; recomputar os hashes. `node tools/verify-g1-assembly.mjs` retorna exit code `0`. O motivo está nas linhas 51, 52 e 55: esperado, resolved seed e manifesto são ordenados antes da comparação. Os bundles apenas repetem a ordem já aceita.
- **Impacto:** o estado atual é 98/98 e 367/367 ordenadamente igual, mas a propriedade exigida não é protegida. Uma regressão de ordem pode receber PASS e invalidar consumidores que tratem a sequência como normativa.
- **Correção recomendada:** construir uma única ordem canônica esperada e comparar resolved seed, manifesto e bundles sem ordenar os valores observados; adicionar teste negativo que inverta somente a ordem e exija falha.
- **Bloqueia o merge:** sim.

### PR1-BLK-003-A — BLOCKER

- **Arquivo/seção:** `tests/runtime/g1-contract-runner.mts:348-384`; `tests/spec/demo-r1-test-catalog.yaml:8120-8174`; `apps/api/src/demo/demo.service.ts:199-235`; `events/fleet-operations-control-tower-demo-r1.event-registry.yaml:103-128`.
- **Evidência reproduzível:** o catálogo declara `event_assertions.demo_generation_id`, mas o runner só verifica `schema_version` e `aggregate_sequence_equals_resulting_version`. Na execução R8, o evento do reset final passou no schema normativo, continha o payload completo, `aggregate_type=DEMO_RESET`, `aggregate_sequence=aggregate_version`, `source_type=DEMO_ADMIN_USER`, `source_id`, classificação `CONFIDENTIAL` e `schema_version=2`. A consulta pós-transação retornou `event_generation_id=64b8509b-d1e2-5e34-b3b5-fc05deaa648a`, `active_generation_id=5db71f6e-8ff4-4c3c-a336-48e26cc3c1c4` e `matches_active=false`. O serviço atualiza o runtime para a geração alvo antes de inserir o evento com `runtime.activeGenerationId`, a geração de origem.
- **Impacto:** o runner produz falso PASS para uma assertion declarada e não prova a regra normativa “event.demo_generation_id MUST equal the active generation at production”. A descrição “emitido na geração de origem” não elimina a necessidade de provar que a origem ainda era ativa no instante de produção; a ordem transacional atual não fornece essa prova.
- **Correção recomendada:** executar explicitamente `event_assertions.demo_generation_id` e a regra relacional contra o runtime no ponto transacional de produção. Se a intenção normativa entre “geração de origem” e “geração ativa” precisar mudar, registrar decisão formal; não inferir essa mudança no runner ou na implementação.
- **Bloqueia o merge:** sim.

### PR1-BLK-005 — BLOCKER FORMAL

- **Arquivo/seção:** `policies/demo-r1-implementation-authorization-policy.yaml`; `baseline/demo-r1-implementation-authorization.yaml`; `baseline/demo-r1-baseline-manifest.yaml:3-9`; decisão R7.
- **Evidência reproduzível:** o histórico Git dos arquivos de decisão/autorização contém somente o commit R7 `bc6d7e49c75fb40d0742775b0d5a0c3e6c3d54a1`, anterior ao PR. O PR altera 18 artefatos listados no baseline manifest, enquanto o manifest atual continua com `review_id: R7` e `final_review_required: false`. Não existe decisão R8 ou outra decisão posterior incorporada.
- **Impacto:** correção técnica não equivale a autorização de incorporação. O rehash do baseline não renova o escopo decisório de R7.
- **Correção recomendada:** após sanar e rever os blockers técnicos, incorporar uma nova decisão formal conforme a policy, atualizar os artefatos de autorização/manifesto pelo processo autorizado e executar verificação de integridade pós-assembly.
- **Bloqueia o merge:** sim.

## 6. Achados major

### R8-MAJ-001 — MAJOR

- **Arquivo/seção:** `tests/runtime/g1-contract-runner.mts`, execução das expectations; catálogo G1.
- **Evidência reproduzível:** `TST-DEMO-RESET-001` declara “RESEED equivale ao manifesto”, “filas, receipts e leases anteriores limpos ou abortados” e preservação de auditoria/histórico. O runner verifica estados de geração/runtime e contagens de audit/outbox, mas não compara o reseed completo ao manifesto nem verifica filas, receipts e leases. `TST-AUDIT-003` declara “sem segredos”, porém sua evidência lista apenas schema HTTP e duas assertions de auditoria. O campo `conforms_to_openapi_operation` também não é comparado ao `operationId`; a resolução usa somente path e método.
- **Impacto:** 26 contratos executados não equivalem a 100% das assertions declaradas executadas. O relatório de correção superestima a cobertura real de banco, segurança e OpenAPI.
- **Correção recomendada:** criar cobertura rastreável assertion-a-assertion, falhando a suíte se qualquer expectation declarada não tiver executor e registro correspondente na evidência.
- **Bloqueia o merge:** sim, enquanto a suíte for usada como evidência de fechamento de `PR1-BLK-003-A`.

### R8-MAJ-002 — MAJOR

- **Arquivo/seção:** `tests/runtime/g1-contract-runner.mts:116-202`, `snapshotDatabase`/`database_diff`.
- **Evidência reproduzível:** o snapshot “before” ocorre antes de `restoreG1Fixture`, que é executado dentro do trabalho do teste. Assim, `TST-DATA-IAM-001` registra mudanças em `demo_reset_execution`, `security_audit_record` e `demo_internal_session` causadas pela troca de fixture, embora seu contrato seja uma inserção rejeitada em `user_role`. O diff contém apenas contagens de nove tabelas, não diferenças de linhas ou a transação efetivamente exercitada.
- **Impacto:** `database_diff` existe formalmente, mas mistura preparação com efeito do teste e pode atribuir mudanças irrelevantes ao contrato. Isso reduz a força probatória dos 26 artefatos.
- **Correção recomendada:** restaurar a fixture antes do snapshot inicial e produzir diff do estado relevante ao contrato, distinguindo preparação, ação e rollback.
- **Bloqueia o merge:** sim, para aceitação baseada na evidência atual do runner.

## 7. Achados minor

### R8-MIN-001 — MINOR

- **Arquivo/seção:** `tests/runtime/g1-contract-runner.mts:16-20,209-212`.
- **Evidência reproduzível:** em Windows, o runner injeta um caminho absoluto específico de usuário para o Docker Desktop e executa CLI com `shell: true`; Node emitiu `DEP0190` sobre concatenação não escapada de argumentos. A execução fora do sandbox passou, portanto não houve falha funcional nesta máquina.
- **Impacto:** reduz portabilidade e aumenta risco de divergência entre ambientes Windows.
- **Correção recomendada:** descobrir `docker` por PATH/configuração de ambiente e evitar `shell: true` quando os argumentos puderem ser passados diretamente.
- **Bloqueia o merge:** não isoladamente.

## 8. Validação do runner e evidências por teste

| Item | Resultado R8 |
|---|---|
| Comando literal `pnpm test:g1` | PASS fora do sandbox, exit code 0 |
| Validações estáticas | 27/27 PASS |
| Contratos reais | 26/26 PASS no executor atual |
| API real | PASS; processo `apps/api/dist/main.js`, porta 3100 |
| PostgreSQL real | PASS; restore de fixtures, SQL e assertions consultaram `localhost:5432` |
| Worker real | PASS; worker de readiness e watchdog foram iniciados |
| `pnpm demo:up` | PASS; health live em porta 3000 |
| OpenAPI request/response | Requests e responses HTTP exercitados e validados por Ajv; `operationId` declarado não é comparado |
| `DemoResetRequested` | Schema normativo PASS; regra relacional de geração ativa não comprovada e estado pós-transação divergente |
| Assertions de banco | Parcialmente exercitadas; há expectativas sem executor completo |
| Evidências | 26/26 arquivos em `test-results/g1-20260809202158473/<test-id>/evidence.json` |
| Campos obrigatórios | 26/26 contêm todos os 15 campos exigidos |
| Redação | zero referências de credencial e zero fake secrets; 12 marcadores redigidos |

Os 15 campos presentes são: `test_id`, `fixture_id`, `fixture_state_sha256`, `action_type`, `started_at`, `completed_at`, `duration_ms`, `status`, `correlation_ids`, `generation_id`, `resolved_non_sensitive_inputs`, `captures`, `assertions`, `database_diff` e `event_ids`. A presença estrutural foi confirmada; os achados acima limitam a suficiência semântica de `assertions`, `database_diff` e da geração do evento.

## 9. Validação da cadeia de hashes

| Verificação independente | Resultado |
|---|---:|
| `state_sha256` | 98/98 |
| `full_state_sha256` nos seis bundles | 367/367 |
| `layer_state_sha256` nos seis bundles | 367/367 |
| Hash do arquivo de bundle no plano | 6/6 |
| Referências de snapshot/alias | 98/98 |
| Baseline manifest — hash | 67/67 |
| Baseline manifest — tamanho | 67/67 |
| `SHA256SUMS.txt` | 79/79 |

Distribuição dos 367 estados por bundle: G1 9, G2 47, G3 54, G4 67, G5 92 e G6 98. Alteração de fixture sem digest atualizado foi rejeitada. Alteração semântica com todos os digests atualizados foi aceita, de modo que a cadeia atual comprova consistência interna, mas não autenticidade em relação a uma decisão formal imutável.

## 10. Validação do escopo G1

Não foi encontrada implementação funcional de work packages G2 a G6. As mudanças de código de produto estão limitadas ao reset G1 e à migration de nomes de constraints G1; o restante é runner, testes, ferramentas, evidência e recomposição documental.

Nos seis bundles não houve adição ou remoção de fixture. As únicas mudanças de conteúdo de tabelas em bundles posteriores atingem `FX-API-READ-BASE`, `FX-API-RESET`, `FX-DATA-INTEGRITY` e `FX-MUTATED-DEMO`, as mesmas quatro fixtures usadas pelas correções G1; as demais diferenças são `used_by_test_ids` e hashes derivados. Isso é compatível tecnicamente com propagação cumulativa, não com implementação funcional futura.

O PR altera 18 artefatos normativos manifestados, incluindo catálogo, programas, seed, seis bundles, rastreabilidade e documentos. Há justificativa técnica de correção G1, mas não há ratificação formal pós-R7. A atualização do baseline manifest para apontar aos novos hashes, mantendo R7 como review vigente, é uma alteração normativa ainda não autorizada para incorporação.

## 11. Status da autorização formal

`PR1-BLK-005` permanece aberto. A policy exige decisão incorporada ao repositório; mensagens, pacote separado e este relatório não são suficientes. Os arquivos de autorização continuam referindo R7 e não existe decisão posterior no histórico do branch ou no estado do PR.

Correção técnica, revisão independente e autorização formal são três atos distintos. Esta R8 fornece revisão e evidência; não concede autorização, não renova R7, não libera G2 e não torna o PR mergeável por autoridade.

## 12. Recomendação final

- O PR **não pode ser merged** no estado atual.
- O PR **ainda depende de decisão formal nova e incorporada** depois do fechamento técnico e de nova verificação independente.
- **G2 continua bloqueado**, assim como G3 a G6.
- Antes do merge, devem ocorrer: correção e teste negativo dos blockers de integridade/ordem; execução integral das assertions declaradas; prova transacional da regra de geração do `DemoResetRequested` sem inventar semântica; correção da evidência de banco; nova revisão independente; decisão formal incorporada; atualização autorizada do baseline/authorization; e verificação pós-assembly final.
