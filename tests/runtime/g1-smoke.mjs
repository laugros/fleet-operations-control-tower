/* global console, fetch, process, setTimeout */

import { randomUUID } from "node:crypto";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.text();
  const result = {
    path,
    status: response.status,
    correlationId: response.headers.get("x-correlation-id"),
    generationId: response.headers.get("x-demo-generation-id")
  };
  console.log(JSON.stringify(result));
  if (response.status >= 400) console.error(body);
  return { response, body };
}

function expectStatus(result, expected) {
  if (result.response.status !== expected) {
    throw new Error(
      `${result.response.url} returned ${result.response.status}; expected ${expected}`
    );
  }
}

async function createAdminSession(correlationId) {
  const created = await request("/api/v1/demo/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": correlationId
    },
    body: JSON.stringify({ identity_code: "demo.admin" })
  });
  expectStatus(created, 201);
  return {
    cookie: created.response.headers.get("set-cookie").split(";", 1)[0],
    csrf: created.response.headers.get("x-csrf-token")
  };
}

const live = await request("/health/live", {
  headers: { "x-correlation-id": "11111111-1111-4111-8111-111111111111" }
});
expectStatus(live, 200);

const initialSession = await createAdminSession("22222222-2222-4222-8222-222222222222");

const currentSession = await request("/api/v1/session", {
  headers: {
    cookie: initialSession.cookie,
    "x-correlation-id": "33333333-3333-4333-8333-333333333333"
  }
});
expectStatus(currentSession, 200);

const demoStatus = await request("/api/v1/demo/status", {
  headers: {
    cookie: initialSession.cookie,
    "x-correlation-id": "44444444-4444-4444-8444-444444444444"
  }
});
expectStatus(demoStatus, 200);

const reset = await request("/api/v1/demo/reset", {
  method: "POST",
  headers: {
    cookie: initialSession.cookie,
    "content-type": "application/json",
    "x-csrf-token": initialSession.csrf,
    "idempotency-key": randomUUID(),
    "x-correlation-id": "55555555-5555-4555-8555-555555555555"
  },
  body: JSON.stringify({ seed_version: "2.1.3", confirmation: "RESET_DEMO" })
});
expectStatus(reset, 202);
const resetId = JSON.parse(reset.body).data.reset_id;

const replacementSession = await createAdminSession("66666666-6666-4666-8666-666666666666");
const resetStatus = await request(`/api/v1/demo/resets/${resetId}`, {
  headers: {
    cookie: replacementSession.cookie,
    "x-correlation-id": "77777777-7777-4777-8777-777777777777"
  }
});
expectStatus(resetStatus, 200);

let ready;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  ready = await request("/health/ready", {
    headers: { "x-correlation-id": "88888888-8888-4888-8888-888888888888" }
  });
  if (ready.response.status === 200) break;
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
expectStatus(ready, 200);

console.log(JSON.stringify({ status: "PASS", resetId }));
