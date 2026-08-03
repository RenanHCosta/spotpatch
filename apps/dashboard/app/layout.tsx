import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  title: "SpotPatch",
  description: "Feedback visual que vira Pull Request",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
