"use client";

import { useEffect, useState } from "react";

interface DemoStatus {
  seed_version: string;
  demo_now: string;
  runtime_status: string;
  active_generation_id: string;
}

export default function DemoAdminPage() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"}/api/v1/demo/status`,
          { credentials: "include" }
        );
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/");
          return;
        }
        if (!response.ok) throw new Error("Não foi possível consultar o status da demo.");
        const payload = (await response.json()) as { data: DemoStatus };
        setStatus(payload.data);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Falha inesperada.");
      }
    })();
  }, []);

  async function resetDemo(): Promise<void> {
    if (!status) return;
    setResetting(true);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"}/api/v1/demo/reset`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": sessionStorage.getItem("fotc.csrf") ?? "",
            "Idempotency-Key": crypto.randomUUID()
          },
          body: JSON.stringify({ seed_version: "2.1.3", confirmation: "RESET_DEMO" })
        }
      );
      if (!response.ok) throw new Error("O reset não pôde ser concluído.");
      const payload = (await response.json()) as { data: { status: string } };
      setResetStatus(payload.data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">UI-DEMO-ADMIN</p>
      <h1>Administração da demonstração</h1>
      {error ? <p className="error-message">{error}</p> : null}
      {status ? (
        <>
          <dl className="status-grid">
            <div><dt>Runtime</dt><dd>{status.runtime_status}</dd></div>
            <div><dt>Seed</dt><dd>{status.seed_version}</dd></div>
            <div><dt>Relógio</dt><dd>{new Date(status.demo_now).toLocaleString("pt-BR")}</dd></div>
            <div><dt>Geração</dt><dd className="mono">{status.active_generation_id}</dd></div>
          </dl>
          <section className="reset-panel">
            <div>
              <strong>Restaurar cenário determinístico</strong>
              <p>Preserva auditoria e o histórico de execuções de reset.</p>
            </div>
            <button disabled={resetting} onClick={() => void resetDemo()} type="button">
              {resetting ? "Restaurando…" : "Resetar demonstração"}
            </button>
            {resetStatus ? <p>Última execução: {resetStatus}</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
