import { captureElement, capturePage, isSelectable } from "@spotpatch/extension-core";
import type { FeedbackCreateInput } from "@spotpatch/shared";
import { defineContentScript } from "wxt/utils/define-content-script";
const API = import.meta.env.WXT_PUBLIC_SPOTPATCH_API_URL || "http://localhost:3001";
type Project = { projectId: string; name: string };
type Marker = {
  id: string;
  number: number;
  comment: string;
  status: string;
  selector: string;
  boundingBox: { left: number; top: number; width: number; height: number };
};
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    const controller = new Inspector();
    chrome.runtime.onMessage.addListener((message: { type: string; project?: Project }) => {
      if (message.type === "SPOTPATCH_START_INSPECTION" && message.project)
        void controller.start(message.project);
      if (message.type === "SPOTPATCH_LOAD_MARKERS" && message.project)
        void controller.loadMarkers(message.project);
    });
  },
});
class Inspector {
  private project: Project | null = null;
  private hovered: Element | null = null;
  private root: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private activeForm: HTMLFormElement | null = null;
  private markers: Marker[] = [];
  async ids() {
    const result = (await chrome.runtime.sendMessage({ type: "SPOTPATCH_GET_IDS" })) as {
      success: boolean;
      installationId?: string;
      sessionId?: string;
      error?: string;
    };
    if (!result.success || !result.installationId || !result.sessionId)
      throw new Error(result.error || "Não foi possível identificar esta instalação.");
    return { installationId: result.installationId, sessionId: result.sessionId };
  }
  mount() {
    if (this.root) return;
    this.root = document.createElement("div");
    this.root.dataset.spotpatchUi = "true";
    this.root.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    this.shadow = this.root.attachShadow({ mode: "open" });
    this.shadow.innerHTML = `<style>*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}.outline{position:fixed;border:2px solid #ec5b35;background:#ec5b3520;pointer-events:none}.label{position:fixed;max-width:280px;border-radius:6px;background:#101828;padding:6px 8px;color:white;font:700 11px system-ui;box-shadow:0 3px 10px #0003}.marker{position:fixed;display:grid;width:28px;height:28px;place-items:center;border:3px solid white;border-radius:50%;background:#ec5b35;color:white;font:800 11px system-ui;box-shadow:0 3px 12px #0005;pointer-events:auto;cursor:pointer}.marker.orphan{background:#667085}.card{position:fixed;width:340px;max-height:calc(100vh - 24px);overflow:auto;border:1px solid #d0d5dd;border-radius:14px;background:white;padding:16px;color:#101828;box-shadow:0 16px 50px #10182835;pointer-events:auto}.card h2{margin:0 0 4px;font-size:16px}.card p{margin:0 0 12px;color:#667085;font-size:12px}.preview{overflow:hidden;margin-bottom:12px;border-radius:8px;background:#f2f4f7;padding:9px;white-space:nowrap;text-overflow:ellipsis;font:600 11px monospace}.card textarea,.card input,.card select{width:100%;margin-top:5px;border:1px solid #d0d5dd;border-radius:7px;padding:8px;font-size:12px}.card textarea{min-height:90px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{display:block;margin-top:9px;color:#475467;font-size:10px;font-weight:800;text-transform:uppercase}.actions{display:flex;gap:8px;margin-top:14px}.actions button{height:36px;flex:1;border:0;border-radius:7px;background:#101828;color:white;font-weight:800;cursor:pointer}.actions .cancel{border:1px solid #d0d5dd;background:white;color:#344054}.error{margin-top:10px!important;color:#b42318!important}</style>`;
    document.documentElement.append(this.root);
    this.overlay = document.createElement("div");
    this.overlay.className = "outline";
    this.label = document.createElement("div");
    this.label.className = "label";
    this.shadow.append(this.overlay, this.label);
  }
  async start(project: Project) {
    this.project = project;
    this.mount();
    this.closeForm();
    this.overlay!.style.display = "none";
    this.label!.style.display = "none";
    document.documentElement.style.cursor = "crosshair";
    addEventListener("mousemove", this.onMove, true);
    addEventListener("click", this.onClick, true);
    addEventListener("keydown", this.onKey, true);
  }
  stop() {
    document.documentElement.style.cursor = "";
    removeEventListener("mousemove", this.onMove, true);
    removeEventListener("click", this.onClick, true);
    removeEventListener("keydown", this.onKey, true);
    if (this.overlay) this.overlay.style.display = "none";
    if (this.label) this.label.style.display = "none";
    this.hovered = null;
  }
  onMove = (event: MouseEvent) => {
    const target = event.composedPath().find((v) => v instanceof Element) as Element | undefined;
    if (!target || !isSelectable(target)) {
      if (this.overlay) this.overlay.style.display = "none";
      return;
    }
    this.hovered = target;
    const box = target.getBoundingClientRect();
    Object.assign(this.overlay!.style, {
      display: "block",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    this.label!.textContent = `${target.tagName.toLowerCase()} · ${(target.textContent || "").trim().slice(0, 35)} · ${Math.round(box.width)}×${Math.round(box.height)}`;
    Object.assign(this.label!.style, {
      display: "block",
      left: `${Math.max(8, box.left)}px`,
      top: `${Math.max(8, box.top - 30)}px`,
    });
  };
  onClick = (event: MouseEvent) => {
    if (!this.hovered) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = this.hovered;
    this.stop();
    void this.openForm(selected);
  };
  onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.stop();
  };
  onOutsideFormClick = (event: MouseEvent) => {
    if (!this.activeForm || event.composedPath().includes(this.activeForm)) return;
    this.closeForm(this.activeForm);
  };
  onFormKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.closeForm(this.activeForm ?? undefined);
  };
  closeForm(expected?: HTMLFormElement) {
    if (expected && this.activeForm !== expected) {
      expected.remove();
      return;
    }
    this.shadow?.querySelectorAll(".card").forEach((card) => card.remove());
    this.activeForm = null;
    removeEventListener("click", this.onOutsideFormClick, true);
    removeEventListener("keydown", this.onFormKey, true);
  }
  async openForm(element: Element) {
    this.closeForm();
    const context = captureElement(element),
      box = element.getBoundingClientRect(),
      card = document.createElement("form");
    card.className = "card";
    card.style.left = `${Math.min(innerWidth - 352, Math.max(12, box.right + 12))}px`;
    card.style.top = `${Math.min(innerHeight - 420, Math.max(12, box.top))}px`;
    card.innerHTML = `<h2>Novo feedback</h2><p>${this.project?.name}</p><div class="preview">${context.tagName} · ${context.textContent.slice(0, 70) || context.cssSelector}</div><label class="field">Comentário<textarea name="comment" minlength="5" maxlength="2000" required placeholder="Explique o que precisa mudar"></textarea></label><div class="row"><label class="field">Categoria<select name="category"><option value="visual_bug">Bug visual</option><option value="functional_bug">Bug funcional</option><option value="content_change">Mudança de conteúdo</option><option value="ux_improvement">Melhoria de UX</option><option value="performance">Performance</option><option value="accessibility">Acessibilidade</option><option value="other">Outro</option></select></label><label class="field">Prioridade<select name="priority"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label></div><div class="row"><label class="field">Nome opcional<input name="name" maxlength="100"/></label><label class="field">Email opcional<input name="email" type="email" maxlength="320"/></label></div><div class="actions"><button type="button" class="cancel">Cancelar</button><button type="submit">Enviar feedback</button></div>`;
    this.shadow!.append(card);
    this.activeForm = card;
    card.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    card.querySelector(".cancel")?.addEventListener("click", () => this.closeForm(card));
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit(card, element);
    });
    queueMicrotask(() => {
      if (this.activeForm !== card) return;
      addEventListener("click", this.onOutsideFormClick, true);
      addEventListener("keydown", this.onFormKey, true);
    });
  }
  async submit(form: HTMLFormElement, selectedElement: Element) {
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true;
    submit.textContent = "Enviando…";
    form.querySelector(".error")?.remove();
    try {
      const data = new FormData(form),
        ids = await this.ids(),
        root = this.root,
        previousVisibility = root?.style.visibility ?? "";
      let element: ReturnType<typeof captureElement>;
      let page: ReturnType<typeof capturePage>;
      let capture: { success: boolean; viewport?: string; element?: string };
      if (root) root.style.visibility = "hidden";
      try {
        await waitForVisualUpdate();
        element = captureElement(selectedElement);
        page = capturePage(ids.installationId, ids.sessionId);
        capture = (await chrome.runtime.sendMessage({
          type: "SPOTPATCH_CAPTURE",
          boundingBox: element.boundingBox,
          devicePixelRatio: page.viewport.devicePixelRatio,
        })) as { success: boolean; viewport?: string; element?: string };
      } finally {
        if (root) root.style.visibility = previousVisibility;
      }
      const payload: FeedbackCreateInput = {
          idempotencyKey: crypto.randomUUID(),
          projectId: this.project!.projectId,
          comment: String(data.get("comment")),
          category: String(data.get("category")) as FeedbackCreateInput["category"],
          priority: String(data.get("priority")) as FeedbackCreateInput["priority"],
          page,
          element,
          ...(data.get("name") ? { authorName: String(data.get("name")) } : {}),
          ...(data.get("email") ? { authorEmail: String(data.get("email")) } : {}),
          ...(capture.viewport ? { screenshot: capture.viewport } : {}),
          ...(capture.element ? { elementScreenshot: capture.element } : {}),
        };
      const response = await fetch(`${API}/api/public/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!response.ok || !json.success) throw new Error(json.error?.message || "Falha no envio");
      this.closeForm(form);
      await this.loadMarkers(this.project!);
    } catch (error) {
      form.insertAdjacentHTML(
        "beforeend",
        `<p class="error">${escapeHtml(error instanceof Error ? error.message : "Falha no envio")}</p>`,
      );
      submit.disabled = false;
      submit.textContent = "Enviar feedback";
    }
  }
  async loadMarkers(project: Project) {
    this.project = project;
    this.mount();
    const ids = await this.ids(),
      page = capturePage(ids.installationId, ids.sessionId),
      response = await fetch(
        `${API}/api/public/feedback/page?projectId=${encodeURIComponent(project.projectId)}&url=${encodeURIComponent(page.normalizedUrl)}`,
      ),
      payload = (await response.json()) as { success: boolean; data?: Marker[] };
    this.markers = payload.data ?? [];
    this.renderMarkers();
    addEventListener("scroll", this.renderMarkers, { passive: true });
    addEventListener("resize", this.renderMarkers, { passive: true });
  }
  renderMarkers = () => {
    if (!this.shadow) return;
    this.shadow.querySelectorAll(".marker").forEach((v) => v.remove());
    for (const marker of this.markers) {
      let target: Element | null = null;
      try {
        target = document.querySelector(marker.selector);
      } catch {
        target = null;
      }
      const box = target?.getBoundingClientRect(),
        node = document.createElement("button");
      node.className = `marker${target ? "" : " orphan"}`;
      node.textContent = String(marker.number);
      node.title = `${marker.comment}${target ? "" : " (elemento não reencontrado)"}`;
      node.style.left = `${Math.max(4, (box?.left ?? marker.boundingBox.left) + 8)}px`;
      node.style.top = `${Math.max(4, (box?.top ?? marker.boundingBox.top) + 8)}px`;
      this.shadow.append(node);
    }
  };
}
function escapeHtml(value: string) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
function waitForVisualUpdate() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
