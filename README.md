# DEMO-R1 v2.1.4 — baseline autorizado pela R7

Fonte de verdade de autorização:

`baseline/demo-r1-implementation-authorization.yaml`

Escopo autorizado: somente `G1_FOUNDATION`.

Use o bundle de seed `tests/spec/seed-layers/g1-foundation.json` e execute os 26 testes de ativação do G1. Testes deferidos não bloqueiam este gate. G2 a G6 permanecem bloqueados.

## Docker no runner G1

O runner descobre `docker` pelo `PATH`. Quando o executável não estiver no
`PATH`, defina `FOTC_DOCKER_BIN` com o caminho absoluto de `docker.exe` (Windows)
ou `docker` antes de executar `pnpm test:g1`. O runner adiciona somente o
diretório desse executável ao `PATH`; nenhum caminho de usuário é embutido no
código.
