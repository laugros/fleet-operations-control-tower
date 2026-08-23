# Revisão Técnica Independente R9 — DEMO-R1 v2.1.4

## 1. Identificação e limites

- `review_id`: `R9`
- repositório: `https://github.com/laugros/fleet-operations-control-tower`
- PR: `#1`
- branch: `codex/g1-runner-contract-corrections`
- base do PR: `880e2f202014f8a9f17f58657ccf49e45541f796`
- commit técnico congelado revisado (`C_TECH_FINAL`): `a84c0bee8a03b112d77cac060f5a6081e3f7dd7c`
- candidata ativa: `baseline/candidates/demo-r1-v2.1.4-g1-correction-integrity-root-v3.yaml`

Esta revisão é independente e review-only. Ela não é decisão formal, não
ratifica a raiz, não autoriza merge, não renova R7 e não autoriza G2–G6.

## 2. Veredictos

**Veredicto técnico:** `NOT READY FOR FORMAL RATIFICATION`

**Veredicto de merge nesta etapa:** `NOT READY FOR MERGE`

A raiz v3 resolve tecnicamente `PR1-BLK-004-A` e rejeita `R8-MUT-003`, mas a
revisão encontrou `R9-BLK-001`: o PR altera uma migration G1 já aplicada na
base, sem migration posterior que materialize essa mudança em bancos
existentes. A suíte passa em banco criado do zero, porém falha no caminho de
upgrade da própria base do PR. Assim, `PR1-BLK-005` continua aberto, mas não é
o único blocker restante.

## 3. Gate inicial e estado Git/GitHub

Antes de qualquer arquivo R9 ser criado, foram confirmados:

- branch local correta e `HEAD` exato `a84c0bee8a03b112d77cac060f5a6081e3f7dd7c`;
- worktree rastreado limpo;
- upstream local no mesmo SHA;
- PR #1 aberto, não draft, não merged, base `main`, head remoto no mesmo SHA;
- `main` local e remoto em `880e2f202014f8a9f17f58657ccf49e45541f796`;
- 13 commits e 48 arquivos alterados entre a base e o commit revisado;
- nenhum diff rastreado após `C_TECH_FINAL` e nenhuma mudança oculta no checkout;
- nenhuma implementação funcional G2–G6 no diff de produto;
- `AGENTS.md` e `docs/00-document-index.md` ausentes.

A consulta `git ls-remote` falhou por certificado local (`unable to get local
issuer certificate`). A API autenticada do GitHub confirmou independentemente
o PR e os SHAs remoto da branch e de `main`.

## 4. Recomposição independente da candidata

Um comparador temporário independente leu os bytes integrais dos 43 artefatos,
sem chamar as ferramentas de integridade do repositório. O comparador validou
o YAML contra o schema, recalculou SHA-256 e tamanhos dos bytes literais e
recompôs o conjunto por JSON UTF-8 sem whitespace, chaves recursivamente
ordenadas e arrays preservados.

| Item | Resultado |
|---|---|
| Schema da v3 | PASS |
| Hash literal da v3 | `3cef64272bd7768c62858a504de5812ddb95c44d0806cbaaf3794e27b753ca8d` |
| `protected_set_sha256` declarado | `3ffbb71dfe58a66e25ce5f8d1963180bad4c12f59e801783298eb113987f5719` |
| `protected_set_sha256` recomposto | `3ffbb71dfe58a66e25ce5f8d1963180bad4c12f59e801783298eb113987f5719` |
| Artefatos | 43/43 existentes, hash e tamanho coincidentes |
| Paths | POSIX relativos, lexicográficos, únicos e sem autorreferência |
| Roles | 43/43 coincidentes com o inventário independente |
| Allowlist pós-revisão | 11/11, igualdade exata e ordenada |
| Autoridade | `ratified: false`, `merge_authorized: false`, G2–G6 não autorizados |

Os 48 paths alterados no PR se dividem exatamente em 43 paths protegidos e
cinco exclusões deliberadas: `SHA256SUMS.txt`, o baseline manifest e as três
candidatas v1/v2/v3. `SHA256SUMS.txt` e o baseline manifest continuam camadas
derivadas fora da raiz; as candidatas não podem autorreferenciar-se.

As candidatas preservadas têm hashes literais:

- v1: `2041166cd4515f147b00f37f22758dd3236a7b86533bd40a619c0cf5e0667dea`;
- v2: `952b704c58121521aaa00f2fdc8d45120996df1b8391ec2963da1d046e7aa41f`.

Somente v3 é referenciada pelas ferramentas e testes como candidata ativa.

## 5. Independência, mutações e ratificação

Em cópias temporárias isoladas, o hash literal da v3 permaneceu
`3cef64272bd7768c62858a504de5812ddb95c44d0806cbaaf3794e27b753ca8d`
antes e depois de assembly, recomposição G1, recomposição do baseline e
verificação. O criador recusou sobrescrever v3 com
`CANDIDATE_ROOT_ALREADY_EXISTS`.

`R8-MUT-003` foi reproduzido alterando
`FX-API-RESET.tables.demo_runtime_control[0].version` de `1` para `8`, seguido
de assembly e recomposição de hashes. O verificador do repositório e o
comparador independente retornaram exit code não zero por divergência contra a
raiz congelada. Resultado: `REJECT`.

Todas as mutações obrigatórias foram rejeitadas:

- fixture normativa;
- `apps/api/src/demo/demo.service.ts`;
- migration G1;
- `tests/runtime/g1-contract-runner.mts`;
- `tools/verify-g1-assembly.mjs`, usando o comparador independente não mutado;
- `tools/recompute-g1-hashes.mjs`;
- `package.json` e `pnpm-lock.yaml`;
- relatório e evidência JSON R8;
- schema da candidata;
- entrada ausente, adicional, path duplicado, ordem alterada e hash/tamanho divergentes.

Não existe validador fictício de decisão. Tanto a ferramenta da candidata
quanto o verificador retornaram exit code `1` e
`RATIFICATION_VALIDATION_UNAVAILABLE` com `--require-ratified`. A presença de
um YAML artificial de decisão em cópia temporária não mudou o resultado
técnico: `PASS_CANDIDATE_MATCH_PENDING_RATIFICATION`, com
`merge_authorized: false`.

## 6. Runner, contratos e evidências

Na execução bem-sucedida `g1-20260823234536497`:

- 26/26 contratos G1 executaram e passaram;
- 133/133 assertions declaradas executaram, sem paths ausentes;
- cada assertion declarada possui executor identificável;
- 26/26 `evidence.json` foram produzidos;
- `database_diff` registra preparação concluída antes do snapshot e a exclui
  dos efeitos do contrato, com diferenças por linha;
- nenhuma referência `fixture://credentials/`, marcador `g1-fake-secret:` ou
  nome `FOTC_TEST_` apareceu nas evidências;
- `DemoResetRequested` passou schema, payload e regra transacional: o insert
  seleciona a geração ativa de origem e é condicionado a ela antes da troca da
  geração ativa; a assertion `demo_generation_id` foi executada e evidenciada;
- não foi encontrada funcionalidade G2–G6.

## 7. Comandos literais

| Comando | Exit code | Resultado |
|---|---:|---|
| `node tools/verify-g1-assembly.mjs` | 0 | PASS candidato pendente; 43 protegidos |
| `pnpm test:g1` — tentativa 1 | 1 | Docker Desktop não iniciado |
| `pnpm test:g1` — tentativa 2 | 1 | banco da base rejeitou `PREPARING` (`23514`) |
| `pnpm test:g1` — banco recriado | 0 | 44/44 testes estáticos; 26/26 contratos; 133/133 assertions |
| `pnpm test` | 0 | mesma suíte integral passou |
| `pnpm lint` | 0 | PASS |
| `pnpm build` | 0 | database, API, worker e web passaram |
| `pnpm db:migrate` | 0 | duas migrations; nenhuma pendente, inclusive no banco incompatível |
| `pnpm test:g1:db-contract` | 0 | três constraints verificadas |
| `pnpm test:g1:runtime` | 0 | smoke PASS |
| `git diff --check` | 0 | PASS |
| `pnpm verify:g1:candidate-root` | 0 | PASS pendente de ratificação |
| `pnpm test:g1:assembly` | 0 | PASS |
| `pnpm test:g1:static` | 0 | 44/44, incluindo 15 mutações |
| candidata `--require-ratified` | 1 | `RATIFICATION_VALIDATION_UNAVAILABLE` |
| verificador `--require-ratified` | 1 | `RATIFICATION_VALIDATION_UNAVAILABLE` |

Não ocorreu timeout. O volume descartável local
`fleet-operations-control-tower_fleet-demo-postgres` foi removido após
verificação explícita para permitir o teste em banco limpo; seus dados locais
de demo não são recuperáveis por esta revisão. A falha de Docker da primeira
tentativa foi ambiental. A segunda falha é evidência do achado técnico abaixo.

## 8. Achados

### R9-BLK-001 — BLOCKER

- **Arquivo e seção:**
  `packages/database/prisma/migrations/202608020001_g1_foundation/migration.sql`,
  constraint `ck_demo_generation_status`; migration posterior
  `202608040001_g1_contract_constraint_names`.
- **Evidência reproduzível:** partindo de um banco que aplicou a migration da
  base `880e2f2`, mudar para o commit revisado e executar `pnpm db:migrate`.
  O comando retorna exit code `0`, “2 migrations found” e “No pending
  migrations”. `pg_get_constraintdef` continua permitindo apenas
  `CREATED`, `ACTIVE`, `RETIRED` e `FAILED`. A chamada de reset tenta inserir
  `PREPARING` e falha com PostgreSQL `23514`; `pnpm test:g1` termina em exit
  code `1`. A migration posterior apenas renomeia três constraints/índices e
  não recria `ck_demo_generation_status`.
- **Impacto:** bancos que seguiram a base oficial não recebem o estado exigido
  pelo novo reset. A funcionalidade e a suíte só passam após recriação
  destrutiva do banco, portanto o estado técnico não é aplicável de forma
  reprodutível pelo fluxo de migration declarado.
- **Correção recomendada:** preservar a migration já publicada e adicionar
  uma nova migration append-only que substitua
  `ck_demo_generation_status` para incluir `PREPARING`; adicionar teste de
  upgrade desde a base do PR, não apenas teste de banco vazio.
- **Impede ratificação:** sim.
- **Impede merge:** sim.

## 9. Status final dos blockers

| ID | Status R9 |
|---|---|
| `PR1-BLK-004-A` | `RESOLVED_TECHNICALLY` — 43/43 protegidos e drift autoconsistente rejeitado pela v3 |
| `R8-MUT-003` | `RESOLVED` — reprodução obrigatória rejeitada |
| `R9-BLK-001` | `OPEN_TECHNICAL_BLOCKER` |
| `PR1-BLK-005` | `OPEN_FORMAL_BLOCKER` |

`PR1-BLK-005` permanece aberto porque não existe decisão formal pós-R7
incorporada. Ele não é o único blocker restante: `R9-BLK-001` precisa ser
corrigido e revisto antes de a candidata poder seguir para ratificação formal.
G2–G6 continuam bloqueados.
