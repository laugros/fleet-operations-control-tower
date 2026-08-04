import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";
import { DemoBanner } from "./components/demo-banner";

export const metadata: Metadata = {
  title: "Fleet Operations Control Tower",
  description: "DEMO-R1 — dados fictícios"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
