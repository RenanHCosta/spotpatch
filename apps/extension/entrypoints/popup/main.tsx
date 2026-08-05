import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, MessageSquarePlus } from "lucide-react";
import "./style.css";

const API = import.meta.env.WXT_PUBLIC_SPOTPATCH_API_URL || "http://localhost:3001";
const DASHBOARD = import.meta.env.WXT_PUBLIC_SPOTPATCH_DASHBOARD_URL || "http://localhost:3000";
type Resolution = { projectId: string; name: string; enabled: boolean };

function App() {
  const [hostname, setHostname] = useState("");
  const [project, setProject] = useState<Resolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;
      const host = new URL(tab.url).hostname;
      setHostname(host);
      try {
        const response = await fetch(`${API}/api/public/projects/resolve?hostname=${encodeURIComponent(host)}`);
        const payload = (await response.json()) as { success: boolean; data?: Resolution; error?: { message: string } };
        if (!response.ok) throw new Error(payload.error?.message);
        setProject(payload.data ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Domínio indisponível");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function send(type: string) {
    setActionError("");
    setSending(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("A aba ativa não foi encontrada.");
      try {
        await chrome.tabs.sendMessage(tab.id, { type, project });
      } catch {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-scripts/content.js"] });
        await chrome.tabs.sendMessage(tab.id, { type, project });
      }
      window.close();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível ativar o SpotPatch nesta página.");
      setSending(false);
    }
  }

  return (
    <main>
      <header>
        <span className="brand">spotpatch</span>
        <span className="status">
          <span className={loading ? "dot reconnecting" : error ? "dot offline" : "dot"} />
          {loading ? "reconectando" : error ? "offline" : "conectado"}
        </span>
      </header>
      <section>
        <p className="eyebrow">Página atual</p>
        <h1>{hostname || "Nova aba"}</h1>
        <div className="project">
          <span className={project ? "dot" : "dot offline"} />
          <div>
            <strong>{project?.name ?? "Projeto não encontrado"}</strong>
            <small>{loading ? "verificando domínio" : project ? "domínio habilitado" : error || "domínio não configurado"}</small>
          </div>
        </div>
        {actionError && <div className="warning">{actionError}</div>}
        <div className="actions">
          <button disabled={!project || sending} onClick={() => send("SPOTPATCH_START_INSPECTION")} className="primary">
            <MessageSquarePlus size={14} />
            Comentar na página
          </button>
          <button disabled={!project || sending} onClick={() => send("SPOTPATCH_LOAD_MARKERS")} className="secondary">
            Ver feedbacks
          </button>
        </div>
        <a href={`${DASHBOARD.replace(/\/+$/, "")}/backlog`} target="_blank">
          Abrir dashboard <ExternalLink size={14} />
        </a>
      </section>
      <footer>{hostname || "nenhum domínio"} · extensão ativa</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
