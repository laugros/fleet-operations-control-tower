# Especificação Executável v2.1
## Escopo Funcional e Requisitos Atômicos da DEMO-R1

**Produto:** Fleet Operations Control Tower  
**Release:** `DEMO-R1`  
**Versão:** `v2.1.0`  
**Substitui:** `v2.0.1`  
**Status:** Revisado após a segunda revisão; pendente de realinhamento dos documentos 17 a 23  
**Decisões aprovadas:** recorte conservador da DEMO-R1  
**Não autoriza scaffold**

---

# 1. Finalidade

Este documento define a fronteira funcional normativa da `DEMO-R1`.

Ele estabelece:

- capacidades obrigatórias;
- capacidades técnicas de suporte;
- capacidades apenas seedadas;
- capacidades explicitamente adiadas;
- requisitos atômicos e testáveis;
- atores;
- estados finais;
- narrativa executiva;
- cenários E2E;
- critérios de aceite da release.

Os documentos 17 a 23 deverão ser derivados deste escopo.

Quando houver conflito, este documento prevalece para a `DEMO-R1`.

---

# 2. Objetivo da release

A `DEMO-R1` deverá demonstrar, em ambiente local e usando somente dados
fictícios, que a plataforma consegue coordenar uma parada de veículo do início
operacional até a resolução do caso, com:

- participação interna;
- tarefas paralelas;
- atualização digital do fornecedor;
- passagem controlada do tempo;
- detecção de inatividade;
- comunicação registrada;
- conclusão do serviço;
- confirmação de retirada pelo condutor;
- fechamento da parada;
- resolução do caso;
- atualização da timeline e dos indicadores fictícios.

A release não representa um piloto produtivo.

---

# 3. Estado final da narrativa

A jornada executiva termina obrigatoriamente com:

```text
VehicleStop.status = CLOSED
Case.status = RESOLVED
```

`Case.status = CLOSED` não pertence à `DEMO-R1`.

O fechamento administrativo posterior do caso fica adiado para o piloto.

---

# 4. Classificação de capacidades

## 4.1. `DEMO-MUST`

Capacidade funcional que deve estar implementada e demonstrável.

## 4.2. `TECHNICAL-SUPPORT`

Capacidade técnica necessária para sustentar um `DEMO-MUST`, mas que não é
apresentada como produto autônomo.

## 4.3. `SEED-ONLY`

Informação fictícia pré-carregada e somente leitura, sem fluxo administrativo.

## 4.4. `DEFERRED`

Capacidade explicitamente fora da `DEMO-R1`.

Nada classificado como `DEFERRED` poderá aparecer como endpoint, comando,
evento de negócio, tabela administrativa ou backlog implementável da demo.

---

# 5. Atores canônicos

| Ator | Código | Responsabilidade na demo |
|---|---|---|
| Atendente | `DEMO_ATTENDANT` | consultar, registrar comunicação, criar e concluir tarefas, resolver caso quando permitido |
| Analista operacional | `DEMO_OPERATIONS_ANALYST` | operar a parada, atualizar previsões internamente e acompanhar alertas |
| Supervisor | `DEMO_SUPERVISOR` | confirmar chegada divergente e executar ações sensíveis autorizadas |
| Gestor | `DEMO_MANAGER` | consultar painel e métricas |
| Administrador da demo | `DEMO_ADMIN` | selecionar identidade, avançar relógio e resetar cenário; sem privilégio operacional automático |
| Fornecedor externo | `EXTERNAL_SUPPLIER` | consultar contexto mínimo e atualizar previsão |
| Condutor externo | `EXTERNAL_DRIVER` | consultar contexto mínimo e confirmar retirada |
| Sistema | `SYSTEM` | avaliar tempo, gerar alertas, projetar timeline e métricas |
| Adapter de e-mail | `FAKE_EMAIL_ADAPTER` | entregar mensagem fictícia à Inbox |

---

# 6. Fluxo funcional obrigatório da parada

Estados da `VehicleStop` na `DEMO-R1`:

```text
SCHEDULED
AWAITING_ARRIVAL
VEHICLE_RECEIVED
IN_EXECUTION
SERVICE_COMPLETED
AWAITING_PICKUP
VEHICLE_PICKED_UP
CLOSED
```

Fluxo principal:

```text
SCHEDULED
→ AWAITING_ARRIVAL
→ VEHICLE_RECEIVED
→ IN_EXECUTION
→ SERVICE_COMPLETED
→ AWAITING_PICKUP
→ VEHICLE_PICKED_UP
→ CLOSED
```

Regras normativas:

1. relato de chegada não confirma a chegada;
2. confirmação de chegada é necessária antes de iniciar o serviço;
3. conclusão do serviço não significa liberação;
4. liberação não significa retirada;
5. retirada deve ser confirmada separadamente;
6. a duração da parada termina na retirada confirmada;
7. a parada só fecha após a retirada confirmada;
8. orçamento não altera o estado da parada na demo;
9. reabertura e cancelamento da parada não pertencem à demo.

---

# 7. Fluxo funcional obrigatório do caso

Estados do `Case` usados na `DEMO-R1`:

```text
NEW
IN_PROGRESS
WAITING_THIRD_PARTY
RESOLVED
```

Fluxo principal:

```text
NEW
→ IN_PROGRESS
↔ WAITING_THIRD_PARTY
→ RESOLVED
```

Regras normativas:

1. o caso inicia em `NEW`;
2. o atendimento inicia o trabalho e move o caso para `IN_PROGRESS`;
3. espera por fornecedor pode mover o caso para `WAITING_THIRD_PARTY`;
4. nova atualização relevante retorna o caso a `IN_PROGRESS`;
5. o caso só resolve quando a parada principal estiver `CLOSED`;
6. tarefas obrigatórias abertas impedem a resolução;
7. `CloseCase`, `ReopenCase`, `CancelCase` e `MergeCase` ficam fora da demo.

---

# 8. Fluxo funcional obrigatório das tarefas

Estados da `Task` usados na `DEMO-R1`:

```text
NOT_STARTED
ASSIGNED
IN_PROGRESS
WAITING_THIRD_PARTY
COMPLETED
CANCELLED
```

Operações permitidas:

```text
CreateTask
AssignTask
StartTask
WaitTaskForThirdParty
ResumeTask
CompleteTask
CancelTask
```

Regras normativas:

1. tarefas independentes podem permanecer ativas em paralelo;
2. a demo não terá dependências formais entre tarefas;
3. a demo não terá estado `BLOCKED`;
4. tarefa concluída exige código e resumo de resultado;
5. tarefa cancelada exige motivo;
6. tarefa obrigatória aberta pode bloquear a resolução do caso ou o fechamento da parada;
7. alteração de prazo fica fora da demo.

---

# 9. Capacidade de regras e orçamento

## 9.1. Regras contextuais

Classificação:

```text
SEED-ONLY
```

Características:

- fictícias;
- somente leitura;
- associadas ao contexto do caso;
- sem CRUD;
- sem aprovação;
- sem versionamento administrativo;
- sem motor genérico;
- sem resolução de conflitos.

## 9.2. Orçamento

Classificação:

```text
SEED-ONLY
```

Características:

- resumo fictício opcional;
- somente leitura;
- exibido apenas como contexto;
- sem solicitação;
- sem webhook;
- sem aprovação;
- sem workflow;
- sem alteração de estado;
- sem endpoints de escrita.

---

# 10. Requisitos atômicos

## 10.1. Ambiente e segurança da demonstração

### `DEMO-ENV-001` — Inicialização local

**Classificação:** `DEMO-MUST`

Dado um ambiente Windows com WSL 2, quando o operador executar o comando
canônico de inicialização, então web, API, worker, PostgreSQL e Mailpit deverão
ficar disponíveis e os health checks deverão indicar prontidão.

### `DEMO-ENV-002` — Identificação visual da demo

**Classificação:** `DEMO-MUST`

Toda tela interna e externa deverá exibir permanentemente:

```text
Ambiente de demonstração — dados fictícios
```

### `DEMO-ENV-003` — Bloqueio fora do modo demo

**Classificação:** `TECHNICAL-SUPPORT`

Quando `DEMO_MODE=false`, endpoints de seleção de identidade, reset, relógio e
simuladores deverão responder `DEMO_FEATURE_DISABLED`.

### `DEMO-DATA-001` — Seed determinístico

**Classificação:** `TECHNICAL-SUPPORT`

O mesmo `seed_version` deverá produzir os mesmos IDs lógicos, cenários e valores
esperados.

### `DEMO-DATA-002` — Reset determinístico

**Classificação:** `DEMO-MUST`

O Demo Admin deverá restaurar dados transacionais, projeções, filas, tokens,
relógio e estado dos cenários para a versão de seed selecionada, sem deixar
estado parcial.

### `DEMO-DATA-003` — Exclusão de dados reais

**Classificação:** `TECHNICAL-SUPPORT`

O seed e os fluxos da demo deverão usar apenas nomes, contatos, placas, valores e
mensagens fictícios.

---

## 10.2. Identidade e autorização

### `DEMO-IAM-001` — Seleção de identidade

**Classificação:** `DEMO-MUST`

O usuário deverá selecionar apenas uma identidade interna previamente seedada.

### `DEMO-IAM-002` — Sessão da demo

**Classificação:** `TECHNICAL-SUPPORT`

A API deverá criar uma sessão assinada, expirá-la conforme política e não aceitar
papel ou permissão diretamente do navegador.

### `DEMO-IAM-003` — Autorização no servidor

**Classificação:** `TECHNICAL-SUPPORT`

Toda operação protegida deverá ser autorizada por identidade, permissão, escopo
e relação com o recurso.

### `DEMO-IAM-004` — Separação do Demo Admin

**Classificação:** `TECHNICAL-SUPPORT`

`DEMO_ADMIN` não deverá executar comandos operacionais sem selecionar
explicitamente outra identidade.

---

## 10.3. Busca, painel e métricas

### `DEMO-SEARCH-001` — Busca por placa

**Classificação:** `DEMO-MUST`

Uma placa fictícia normalizada deverá localizar o veículo, a parada ativa e o
caso relacionado dentro do escopo do usuário.

### `DEMO-SEARCH-002` — Busca por número público

**Classificação:** `DEMO-MUST`

O número público de caso ou parada deverá localizar o recurso correspondente.

### `DEMO-DASH-001` — Lista de paradas ativas

**Classificação:** `DEMO-MUST`

O painel deverá listar paradas não terminais com placa, cliente, fornecedor,
estado, previsão, tempo parado, tempo sem atualização, responsável, próxima ação
e alertas abertos.

### `DEMO-DASH-002` — Filtros do painel

**Classificação:** `DEMO-MUST`

O painel deverá filtrar por cliente, fornecedor, estado, presença de alerta e
inatividade.

### `DEMO-METRIC-001` — Contagem de paradas ativas

**Classificação:** `DEMO-MUST`

A métrica deverá contar paradas cujo estado não seja `CLOSED`.

### `DEMO-METRIC-002` — Contagem de paradas sem atualização

**Classificação:** `DEMO-MUST`

A métrica deverá contar paradas ativas com alerta aberto `STOP_NO_UPDATE`.

### `DEMO-METRIC-003` — Contagem de tarefas abertas

**Classificação:** `DEMO-MUST`

A métrica deverá contar tarefas cujo estado não seja `COMPLETED` nem `CANCELLED`.

### `DEMO-METRIC-004` — Contagem de contatos telefônicos

**Classificação:** `DEMO-MUST`

A métrica deverá contar ligações registradas no conjunto atual da demo.

Todas as métricas deverão ser identificadas como fictícias.

---

## 10.4. Caso

### `DEMO-CASE-001` — Iniciar trabalho no caso

**Classificação:** `DEMO-MUST`

Um atendente autorizado deverá mover um caso `NEW` para `IN_PROGRESS`.

### `DEMO-CASE-002` — Consultar visão operacional

**Classificação:** `DEMO-MUST`

A visão do caso deverá exibir dados principais, parada, tarefas, alertas,
comunicações, regras seedadas e timeline.

### `DEMO-CASE-003` — Aguardar fornecedor

**Classificação:** `DEMO-MUST`

Quando uma tarefa exigir atualização do fornecedor, o caso poderá entrar em
`WAITING_THIRD_PARTY` com motivo, terceiro e ação esperada.

### `DEMO-CASE-004` — Retomar após atualização

**Classificação:** `DEMO-MUST`

Uma atualização válida do fornecedor deverá permitir o retorno do caso a
`IN_PROGRESS`.

### `DEMO-CASE-005` — Resolver caso

**Classificação:** `DEMO-MUST`

O atendente autorizado deverá resolver o caso somente quando:

- a parada principal estiver `CLOSED`;
- não houver tarefa obrigatória aberta;
- não houver conflito de chegada pendente;
- código e resumo de resolução forem informados.

O estado final deverá ser `RESOLVED`.

---

## 10.5. Tarefas

### `DEMO-TASK-001` — Criar tarefa

**Classificação:** `DEMO-MUST`

Um usuário autorizado deverá criar uma tarefa vinculada ao caso e,
opcionalmente, à parada.

### `DEMO-TASK-002` — Atribuir tarefa

**Classificação:** `DEMO-MUST`

Uma tarefa deverá ser atribuída a equipe e, opcionalmente, a um usuário
autorizado.

### `DEMO-TASK-003` — Iniciar tarefa

**Classificação:** `DEMO-MUST`

Uma tarefa `NOT_STARTED` ou `ASSIGNED` deverá poder entrar em `IN_PROGRESS`.

### `DEMO-TASK-004` — Aguardar terceiro

**Classificação:** `DEMO-MUST`

Uma tarefa `IN_PROGRESS` deverá poder entrar em `WAITING_THIRD_PARTY` com
terceiro e ação esperada.

### `DEMO-TASK-005` — Retomar tarefa

**Classificação:** `DEMO-MUST`

Uma tarefa `WAITING_THIRD_PARTY` deverá poder voltar a `IN_PROGRESS` quando a
ação esperada ocorrer.

### `DEMO-TASK-006` — Concluir tarefa

**Classificação:** `DEMO-MUST`

Uma tarefa ativa deverá entrar em `COMPLETED` somente com código e resumo de
resultado.

### `DEMO-TASK-007` — Cancelar tarefa

**Classificação:** `DEMO-MUST`

Uma tarefa ativa deverá entrar em `CANCELLED` somente com motivo e autorização.

### `DEMO-TASK-008` — Executar tarefas em paralelo

**Classificação:** `DEMO-MUST`

Duas tarefas independentes do mesmo caso deverão permanecer ativas
simultaneamente e ser concluídas em qualquer ordem.

---

## 10.6. Parada e chegada

### `DEMO-STOP-001` — Consultar visão operacional

**Classificação:** `DEMO-MUST`

A visão da parada deverá exibir estado, tempos, chegada, previsão, tarefas,
alertas, fornecedor, condutor e timeline.

### `DEMO-STOP-002` — Preparar chegada

**Classificação:** `DEMO-MUST`

Uma parada `SCHEDULED` deverá entrar em `AWAITING_ARRIVAL` por comando interno.

### `DEMO-STOP-003` — Registrar relato de chegada

**Classificação:** `DEMO-MUST`

Um usuário interno autorizado deverá registrar um horário relatado sem alterar
automaticamente o estado para `VEHICLE_RECEIVED`.

Fornecedor e condutor não registram chegada pela interface externa da
`DEMO-R1`.

### `DEMO-STOP-004` — Detectar conflito de chegada

**Classificação:** `DEMO-MUST`

Relatos com diferença superior a 15 minutos deverão gerar `ARRIVAL_CONFLICT`,
alerta e tarefa de validação.

### `DEMO-STOP-005` — Confirmar chegada

**Classificação:** `DEMO-MUST`

Um supervisor deverá confirmar a chegada com horário, método e justificativa
quando houver conflito.

A confirmação deverá mover a parada para `VEHICLE_RECEIVED`.

### `DEMO-STOP-006` — Iniciar serviço

**Classificação:** `DEMO-MUST`

Um analista autorizado deverá mover a parada de `VEHICLE_RECEIVED` para
`IN_EXECUTION`.

---

## 10.7. Fornecedor e previsão

### `DEMO-EXT-001` — Emitir acesso de fornecedor

**Classificação:** `DEMO-MUST`

Um usuário interno autorizado deverá emitir um token opaco, expirável,
revogável e limitado à parada e à ação de atualização de previsão.

### `DEMO-EXT-002` — Consultar contexto mínimo do fornecedor

**Classificação:** `DEMO-MUST`

O fornecedor deverá visualizar somente placa mascarada, modelo, estado
simplificado, previsão vigente e ação permitida.

### `DEMO-EXT-003` — Atualizar previsão pelo fornecedor

**Classificação:** `DEMO-MUST`

O fornecedor deverá registrar nova previsão com motivo usando idempotência.

A atualização deverá:

- preservar o histórico;
- atualizar a visão da parada;
- atualizar a timeline;
- reiniciar o relógio de inatividade;
- resolver alerta `STOP_NO_UPDATE` quando aplicável;
- permitir a retomada da tarefa e do caso relacionados.

---

## 10.8. Relógio e alertas

### `DEMO-CLOCK-001` — Avançar relógio

**Classificação:** `DEMO-MUST`

O Demo Admin deverá avançar o relógio da demo em minutos ou horas, sem alterar
timestamps históricos.

### `DEMO-ALERT-001` — Criar alerta de inatividade

**Classificação:** `DEMO-MUST`

Quando uma parada ativa exceder o limite seedado sem evento relevante, o sistema
deverá criar um único alerta aberto `STOP_NO_UPDATE`.

### `DEMO-ALERT-002` — Deduplicar alerta

**Classificação:** `TECHNICAL-SUPPORT`

Nova avaliação equivalente deverá adicionar ocorrência ao alerta aberto, sem
criar outro alerta.

### `DEMO-ALERT-003` — Resolver alerta por atualização

**Classificação:** `DEMO-MUST`

Uma atualização válida do fornecedor deverá resolver o alerta aberto relacionado
à ausência de atualização.

---

## 10.9. Comunicação

### `DEMO-COM-001` — Receber e-mail fictício

**Classificação:** `DEMO-MUST`

O adapter fake deverá entregar uma mensagem fictícia à Inbox com ID externo
idempotente.

### `DEMO-COM-002` — Sugerir vínculo

**Classificação:** `DEMO-MUST`

A mensagem deverá gerar uma sugestão de vínculo ao caso existente sem criar
automaticamente novo caso.

### `DEMO-COM-003` — Confirmar vínculo

**Classificação:** `DEMO-MUST`

Um usuário autorizado deverá confirmar o vínculo da conversa ao caso e registrar
a decisão na timeline.

### `DEMO-COM-004` — Registrar ligação

**Classificação:** `DEMO-MUST`

O atendente deverá registrar ligação com contato, resultado, observação e
próxima ação.

Quando vinculada à parada, a ligação deverá reiniciar o relógio de inatividade.

---

## 10.10. Conclusão, retirada e fechamento

### `DEMO-STOP-007` — Concluir serviço

**Classificação:** `DEMO-MUST`

Um analista autorizado deverá mover a parada de `IN_EXECUTION` para
`SERVICE_COMPLETED`.

`confirmed_departure_at` deverá permanecer nulo.

### `DEMO-STOP-008` — Liberar veículo

**Classificação:** `DEMO-MUST`

Um analista autorizado deverá mover a parada de `SERVICE_COMPLETED` para
`AWAITING_PICKUP`.

### `DEMO-EXT-004` — Emitir acesso de condutor

**Classificação:** `DEMO-MUST`

Um usuário interno autorizado deverá emitir token limitado à consulta mínima e
à confirmação de retirada da parada.

### `DEMO-EXT-005` — Consultar contexto mínimo do condutor

**Classificação:** `DEMO-MUST`

O condutor deverá visualizar somente placa mascarada, modelo, fornecedor,
estado simplificado e ação permitida.

### `DEMO-STOP-009` — Confirmar retirada pelo condutor

**Classificação:** `DEMO-MUST`

O condutor deverá confirmar a retirada por ação idempotente.

A confirmação deverá:

- registrar horário;
- mover a parada para `VEHICLE_PICKED_UP`;
- encerrar a duração da parada;
- revogar o token quando a ação não for mais necessária.

### `DEMO-STOP-010` — Fechar parada

**Classificação:** `DEMO-MUST`

Um usuário interno autorizado deverá mover a parada de `VEHICLE_PICKED_UP` para
`CLOSED` somente quando não houver tarefa obrigatória aberta nem conflito de
chegada pendente.

---

## 10.11. Timeline, eventos e auditoria

### `DEMO-EVT-001` — Persistência transacional

**Classificação:** `TECHNICAL-SUPPORT`

Toda mudança de estado deverá persistir aggregate, histórico, evento e Outbox na
mesma transação.

### `DEMO-EVT-002` — Consumo idempotente

**Classificação:** `TECHNICAL-SUPPORT`

A repetição do mesmo evento não deverá duplicar timeline, métrica, alerta ou
efeito externo.

### `DEMO-TIMELINE-001` — Timeline de caso e parada

**Classificação:** `DEMO-MUST`

A timeline deverá exibir os fatos relevantes em ordem determinística, com fonte,
ator e instante.

### `DEMO-TIMELINE-002` — Preservar correções

**Classificação:** `TECHNICAL-SUPPORT`

Confirmação ou correção posterior não deverá apagar relatos anteriores.

### `DEMO-AUDIT-001` — Auditoria mínima

**Classificação:** `TECHNICAL-SUPPORT`

Seleção de identidade, confirmação de chegada, emissão e uso de token, avanço do
relógio, reset, fechamento da parada e resolução do caso deverão ser auditados.

---

# 11. Capacidades `SEED-ONLY`

| Capacidade | Uso permitido |
|---|---|
| Clientes e contratos fictícios | contexto e escopo |
| Veículos e placas fictícias | busca e demonstração |
| Condutores fictícios | participação externa |
| Fornecedores fictícios | participação externa |
| Resumo de orçamento fictício | contexto somente leitura |
| Regras contextuais fictícias | orientação somente leitura |
| Limites de inatividade | configuração seedada |
| Métricas esperadas | fixtures de teste |

Não haverá interface ou API administrativa para essas capacidades.

---

# 12. Capacidades `DEFERRED`

Ficam fora da `DEMO-R1`:

- `Case.close`;
- reabertura, cancelamento e merge de caso;
- reabertura e cancelamento de parada;
- correção de retirada;
- workflow de diagnóstico;
- solicitação, recebimento ou aprovação de orçamento;
- webhook de orçamento;
- alteração de prazo de tarefa;
- estado `BLOCKED`;
- dependências formais entre tarefas;
- gestão administrativa de regras;
- motor genérico de regras;
- gestão de usuários, papéis e escopos;
- OIDC/SSO real;
- MFA;
- upload e scan de documentos;
- WhatsApp e SMS reais;
- faturamento;
- contestação;
- analytics corporativo;
- BI externo;
- microsserviços;
- Kubernetes;
- aplicação móvel nativa;
- IA produtiva.

---

# 13. Cenários E2E canônicos

## `E2E-DEMO-000` — Jornada executiva completa

### Estado inicial

- DemoClock no instante do seed;
- caso `NEW`;
- parada `SCHEDULED`;
- nenhuma tarefa concluída;
- nenhuma previsão recente;
- nenhum alerta aberto;
- métricas no valor inicial esperado.

### Sequência obrigatória

1. selecionar `DEMO_ATTENDANT`;
2. abrir o painel;
3. localizar a parada crítica;
4. abrir o caso;
5. iniciar o trabalho no caso;
6. preparar a chegada;
7. registrar e confirmar a chegada;
8. iniciar o serviço;
9. criar duas tarefas independentes;
10. colocar a tarefa de previsão em espera pelo fornecedor;
11. emitir token de fornecedor;
12. fornecedor atualizar a previsão;
13. verificar timeline atualizada;
14. avançar o relógio até gerar inatividade posterior;
15. verificar alerta `STOP_NO_UPDATE`;
16. registrar ligação;
17. atualizar novamente a previsão e resolver o alerta;
18. concluir as tarefas;
19. concluir o serviço;
20. liberar o veículo;
21. emitir token de condutor;
22. condutor confirmar retirada;
23. fechar a parada;
24. resolver o caso;
25. verificar timeline final;
26. verificar métricas atualizadas.

### Estado final

```text
VehicleStop = CLOSED
Case = RESOLVED
Tasks = COMPLETED or authorized CANCELLED
Open STOP_NO_UPDATE alerts = 0
```

### Métricas mínimas verificadas

- paradas ativas reduzidas em uma;
- tarefas abertas reduzidas conforme conclusão;
- paradas sem atualização retornam ao valor esperado;
- contatos telefônicos aumentam em uma unidade.

---

## `E2E-DEMO-001` — Inatividade e deduplicação

Demonstrar:

- avanço do relógio;
- criação de um único alerta;
- nova ocorrência sem alerta duplicado;
- resolução por atualização relevante.

---

## `E2E-DEMO-002` — Chegada divergente

Demonstrar:

- dois relatos;
- diferença superior a 15 minutos;
- conflito;
- alerta e tarefa;
- confirmação por supervisor;
- preservação dos relatos.

---

## `E2E-DEMO-003` — E-mail vinculado ao caso existente

Demonstrar:

- Inbox idempotente;
- sugestão de vínculo;
- confirmação humana;
- ausência de novo caso duplicado;
- timeline atualizada.

---

## `E2E-DEMO-004` — Tarefas paralelas

Demonstrar:

- duas tarefas independentes;
- execução simultânea;
- conclusão em ordem inversa;
- consolidação no mesmo caso;
- bloqueio da resolução enquanto tarefa obrigatória estiver aberta.

---

## `E2E-DEMO-005` — Serviço concluído sem retirada

Demonstrar:

- `SERVICE_COMPLETED`;
- retirada ainda nula;
- liberação para `AWAITING_PICKUP`;
- duração continuando;
- confirmação posterior pelo condutor;
- encerramento da duração;
- fechamento da parada.

---

# 14. Critérios de aceite da release

A `DEMO-R1` estará funcionalmente pronta somente quando:

1. todos os requisitos `DEMO-MUST` tiverem API, dados, evento, tela, backlog e
   teste canônicos;
2. todos os requisitos `TECHNICAL-SUPPORT` tiverem teste automatizado;
3. os seis cenários E2E passarem;
4. `E2E-DEMO-000` executar a narrativa completa;
5. o seed e o reset forem determinísticos;
6. a autorização for validada no servidor;
7. conclusão, liberação e retirada permanecerem separadas;
8. a parada terminar em `CLOSED`;
9. o caso terminar em `RESOLVED`;
10. nenhuma capacidade `DEFERRED` estiver implementada;
11. nenhum dado real estiver presente;
12. uma revisão independente declarar `READY FOR SCAFFOLD`.

---

# 15. Impacto nos documentos seguintes

Este documento exige:

- reescrita normativa do documento 17;
- matriz de permissão no documento 18;
- data dictionary completo no documento 19;
- OpenAPI no documento 20;
- schemas de eventos no documento 21;
- criação do catálogo de testes;
- regeneração integral dos documentos 22 e 23.

Os status antigos de F-001 a F-006 permanecem suspensos até nova revisão.

---

# 16. Status desta remediação

Este documento resolve as decisões de fronteira funcional associadas a:

- `R2-BLK-007`;
- `R2-BLK-008`;
- `R2-MAJ-012`.

Ele não resolve sozinho os demais blockers.

```text
SCAFFOLD = NOT AUTHORIZED
```
