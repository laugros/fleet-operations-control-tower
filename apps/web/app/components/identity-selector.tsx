"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const identities = [
  ["demo.attendant", "Atendente"],
  ["demo.operations", "Analista de Operações"],
  ["demo.supervisor", "Supervisor"],
  ["demo.manager", "Gestor"],
  ["demo.admin", "Demo Admin"]
] as const;

export function IdentitySelector() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function selectIdentity(identityCode: string): Promise<void> {
    setPending(identityCode);
    setError(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"}/api/v1/demo/sessions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity_code: identityCode })
        }
      );
      if (!response.ok) throw new Error("Não foi possível iniciar a sessão de demonstração.");
      const csrf = response.headers.get("X-CSRF-Token");
      if (csrf) sessionStorage.setItem("fotc.csrf", csrf);
      router.push(identityCode === "demo.admin" ? "/app/demo-admin" : "/app/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="identity-panel" aria-labelledby="identity-title">
      <div>
        <p className="eyebrow">Identidade simulada</p>
        <h1 id="identity-title">Escolha como entrar na torre</h1>
        <p className="lead">As permissões vêm exclusivamente do seed autorizado.</p>
      </div>
      <div className="identity-grid">
        {identities.map(([code, label]) => (
          <button
            className="identity-card"
            disabled={pending !== null}
            key={code}
            onClick={() => void selectIdentity(code)}
            type="button"
          >
            <span>{label}</span>
            <small>{code}</small>
          </button>
        ))}
      </div>
      {error ? <p className="error-message">{error}</p> : null}
    </section>
  );
}
