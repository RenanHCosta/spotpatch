import { captureElement, capturePage, isSelectable } from "@spotpatch/extension-core";
import type {
  CapturedElementContext,
  CapturedPageContext,
  FeedbackCreateInput,
} from "@spotpatch/shared";
import { defineContentScript } from "wxt/utils/define-content-script";
const API = import.meta.env.WXT_PUBLIC_SPOTPATCH_API_URL || "http://localhost:3001";
const DASHBOARD = (
  import.meta.env.WXT_PUBLIC_SPOTPATCH_DASHBOARD_URL || "http://localhost:3000"
).replace(/\/+$/, "");
type Project = { projectId: string; name: string };
type Marker = {
  id: string;
  number: number;
  comment: string;
  category: string;
  status: string;
  date: string;
  selector: string;
  boundingBox: { left: number; top: number; width: number; height: number };
};
type CaptureResponse = {
  success: boolean;
  viewport?: string;
  element?: string;
  error?: string;
};
type CaptureDraft = {
  page: CapturedPageContext;
  element: CapturedElementContext;
  capture: CaptureResponse;
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
function selectableTargetAtPoint(x: number, y: number): Element | null {
  const raw = document.elementFromPoint(x, y);
  if (!raw) return null;
  const target =
    raw instanceof SVGElement
      ? (raw.closest("button,a,[role='button']") ?? raw.ownerSVGElement ?? raw)
      : raw;
  return isSelectable(target) ? target : null;
}
class Inspector {
  private project: Project | null = null;
  private hovered: Element | null = null;
  private onSelectionViewportChange = () => {
    if (this.overlay) this.overlay.style.display = "none";
    if (this.label) this.label.style.display = "none";
    this.hovered = null;
  };
  private root: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private countdown: HTMLDivElement | null = null;
  private activeForm: HTMLFormElement | null = null;
  private activeElement: Element | null = null;
  private activeMarkerCard: HTMLElement | null = null;
  private captureController: AbortController | null = null;
  private isCapturing = false;
  private captureDrafts = new WeakMap<HTMLFormElement, CaptureDraft>();
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
    this.shadow.innerHTML = `<style>:host{--ink:oklch(0.16 0.006 264);--ink-soft:oklch(0.24 0.006 264);--mute:oklch(0.55 0.015 264);--mute-soft:oklch(0.71 0.013 264);--line:oklch(0.92 0.004 264);--surface:oklch(1 0 0);--canvas:oklch(0.985 0.002 264);--accent:oklch(0.6 0.15 149);--accent-hover:oklch(0.68 0.17 149);--accent-soft:oklch(0.95 0.045 149);--warn:oklch(0.72 0.13 80);--danger:oklch(0.55 0.16 27)}*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}.outline{position:fixed;border:2px solid var(--accent);background:color-mix(in oklch,var(--accent) 10%,transparent);pointer-events:none}.label{position:fixed;max-width:280px;border-radius:4px;background:var(--ink);padding:6px 8px;color:var(--surface);font:500 11px "JetBrains Mono",monospace;pointer-events:none}.marker{position:fixed;display:grid;width:28px;height:28px;place-items:center;border:2px solid var(--surface);border-radius:50%;background:var(--accent);color:var(--surface);font:600 11px "JetBrains Mono",monospace;pointer-events:auto;cursor:pointer}.marker.orphan{background:var(--mute)}.card{position:fixed;width:340px;max-height:calc(100vh - 24px);overflow:auto;border:1px solid var(--line);border-radius:4px;background:var(--surface);padding:12px;color:var(--ink);pointer-events:auto}.card h2{margin:0 0 4px;font-size:13.5px}.card p{margin:0 0 12px;color:var(--mute);font-size:11.5px}.preview{overflow:hidden;margin-bottom:12px;border-block:1px solid var(--line);background:var(--canvas);padding:9px;white-space:nowrap;text-overflow:ellipsis;font:500 11px "JetBrains Mono",monospace}.card textarea,.card input,.card select{width:100%;margin-top:5px;border:1px solid var(--line);border-radius:4px;background:var(--surface);padding:8px;color:var(--ink);font-size:12.5px;outline:none}.card textarea:focus,.card input:focus,.card select:focus{border-color:var(--accent)}.card textarea{min-height:90px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{display:block;margin-top:9px;color:var(--mute);font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}.capture-preview{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}.capture-preview>strong{display:block;margin-bottom:8px;color:var(--mute);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.capture-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.capture-item{overflow:hidden;border:1px solid var(--line);background:var(--canvas)}.capture-item span{display:block;padding:6px 8px;color:var(--mute);font-size:10px;font-weight:600}.capture-item img{display:block;width:100%;height:104px;object-fit:contain;background:var(--canvas)}.capture-item .capture-empty{display:grid;height:104px;place-items:center;padding:8px;text-align:center;font-size:10px;color:var(--mute-soft)}.capture-warning{margin:9px 0 0!important;border-top:1px solid var(--warn);padding:8px 0;color:var(--ink)!important}.capture-countdown{position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:color-mix(in oklch,var(--surface) 12%,transparent);color:var(--ink);text-align:center}.capture-countdown strong{border:1px solid var(--line);background:var(--surface);padding:8px 12px;font:600 64px/1 "JetBrains Mono",monospace}.capture-countdown span{margin-top:12px;border:1px solid var(--line);border-radius:4px;background:var(--surface);padding:9px 14px;font:600 12px Inter,system-ui,sans-serif}.actions{display:flex;gap:8px;margin-top:14px}.actions button{height:36px;flex:1;border:1px solid var(--accent);border-radius:4px;background:var(--accent);color:var(--surface);font-weight:600;cursor:pointer}.actions button:hover{background:var(--accent-hover)}.actions button:disabled{cursor:wait;opacity:.6}.actions .cancel,.actions .recapture{border-color:var(--line);background:var(--surface);color:var(--ink)}.actions .cancel:hover,.actions .recapture:hover{background:var(--canvas)}.error{margin-top:10px!important;border-top:1px solid var(--danger);padding-top:8px;color:var(--danger)!important}[hidden]{display:none!important}</style>`;
    const markerCardStyle = document.createElement("style");
    markerCardStyle.textContent = `.marker-card{position:fixed;width:300px;max-height:calc(100vh - 24px);overflow:auto;border:1px solid var(--line);border-radius:4px;background:var(--surface);padding:12px;color:var(--ink);pointer-events:auto}.marker-card header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:8px}.marker-card header strong{font-size:13.5px}.marker-card .marker-close{display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:4px;background:var(--canvas);color:var(--mute);cursor:pointer}.marker-card .marker-comment{margin:12px 0;font-size:12.5px;line-height:1.5}.marker-card dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;border-top:1px solid var(--line);padding-top:10px}.marker-card dt{font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}.marker-card dd{margin:3px 0 0;font:500 11px "JetBrains Mono",monospace;color:var(--ink)}.marker-card a{display:block;margin-top:14px;border-radius:4px;background:var(--accent);padding:10px 12px;color:var(--surface);text-align:center;text-decoration:none;font-size:12px;font-weight:600}`;
    this.shadow.append(markerCardStyle);
    document.documentElement.append(this.root);
    this.overlay = document.createElement("div");
    this.overlay.className = "outline";
    this.label = document.createElement("div");
    this.label.className = "label";
    this.countdown = document.createElement("div");
    this.countdown.className = "capture-countdown";
    const countdownValue = document.createElement("strong"),
      countdownLabel = document.createElement("span");
    countdownValue.textContent = "3";
    countdownLabel.textContent = "Prepare o estado da página";
    this.countdown.append(countdownValue, countdownLabel);
    this.shadow.append(this.overlay, this.label, this.countdown);
  }
  async start(project: Project) {
    this.project = project;
    this.mount();
    this.closeMarkerCard();
    this.closeForm();
    this.overlay!.style.display = "none";
    this.label!.style.display = "none";
    document.documentElement.style.cursor = "crosshair";
    addEventListener("mousemove", this.onMove, true);
    addEventListener("click", this.onClick, true);
    addEventListener("keydown", this.onKey, true);
    addEventListener("scroll", this.onSelectionViewportChange, true);
    addEventListener("resize", this.onSelectionViewportChange);
  }
  stop() {
    document.documentElement.style.cursor = "";
    removeEventListener("mousemove", this.onMove, true);
    removeEventListener("click", this.onClick, true);
    removeEventListener("keydown", this.onKey, true);
    removeEventListener("scroll", this.onSelectionViewportChange, true);
    removeEventListener("resize", this.onSelectionViewportChange);
    if (this.overlay) this.overlay.style.display = "none";
    if (this.label) this.label.style.display = "none";
    this.hovered = null;
  }
  onMove = (event: MouseEvent) => {
    const target = selectableTargetAtPoint(event.clientX, event.clientY);
    if (!target) {
      this.onSelectionViewportChange();
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
      left: `${Math.min(Math.max(8, box.left), Math.max(8, innerWidth - 288))}px`,
      top: `${box.top >= 36 ? box.top - 30 : Math.min(innerHeight - 30, box.bottom + 6)}px`,
    });
  };
  onClick = (event: MouseEvent) => {
    if (!this.hovered) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = selectableTargetAtPoint(event.clientX, event.clientY) ?? this.hovered;
    if (!selected) return;
    this.stop();
    void this.openForm(selected);
  };
  onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.stop();
  };
  onOutsideFormClick = (event: MouseEvent) => {
    if (
      this.isCapturing ||
      !this.activeForm ||
      event.composedPath().includes(this.activeForm)
    )
      return;
    this.closeForm(this.activeForm);
  };
  onFormKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.closeForm(this.activeForm ?? undefined);
  };
  onFormViewportChange = () => {
    if (!this.activeForm || !this.activeElement?.isConnected) return;
    positionCommentForm(this.activeForm, this.activeElement);
  };
  onOutsideMarkerClick = (event: MouseEvent) => {
    if (!this.activeMarkerCard || event.composedPath().includes(this.activeMarkerCard)) return;
    this.closeMarkerCard();
  };
  onMarkerKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.closeMarkerCard();
  };
  closeMarkerCard() {
    this.activeMarkerCard?.remove();
    this.activeMarkerCard = null;
    removeEventListener("click", this.onOutsideMarkerClick, true);
    removeEventListener("keydown", this.onMarkerKey, true);
  }
  openMarkerCard(marker: Marker, anchor: HTMLElement) {
    this.closeMarkerCard();
    const card = createMarkerCard(marker);
    this.shadow!.append(card);
    this.activeMarkerCard = card;
    positionMarkerCard(card, anchor.getBoundingClientRect());
    card.querySelector(".marker-close")?.addEventListener("click", () => this.closeMarkerCard());
    queueMicrotask(() => {
      if (this.activeMarkerCard !== card) return;
      addEventListener("click", this.onOutsideMarkerClick, true);
      addEventListener("keydown", this.onMarkerKey, true);
    });
  }
  setCaptureMode(mode: "idle" | "countdown" | "capturing") {
    this.shadow
      ?.querySelectorAll<HTMLElement>(".outline,.label,.marker,.card")
      .forEach((node) => {
        node.style.visibility = mode === "idle" ? "" : "hidden";
      });
    if (this.countdown) this.countdown.style.display = mode === "countdown" ? "flex" : "none";
  }
  async runCaptureCountdown(signal: AbortSignal) {
    const value = this.countdown?.querySelector<HTMLElement>("strong");
    if (!value) throw new Error("Contagem regressiva indisponível.");
    this.setCaptureMode("countdown");
    for (const second of [3, 2, 1]) {
      assertNotAborted(signal);
      value.textContent = String(second);
      await abortableDelay(1000, signal);
    }
    this.setCaptureMode("capturing");
  }
  closeForm(expected?: HTMLFormElement) {
    if (expected && this.activeForm !== expected) {
      this.captureDrafts.delete(expected);
      expected.remove();
      return;
    }
    this.captureController?.abort();
    this.captureController = null;
    this.isCapturing = false;
    this.setCaptureMode("idle");
    if (this.activeForm) this.captureDrafts.delete(this.activeForm);
    this.shadow?.querySelectorAll(".card").forEach((card) => card.remove());
    this.activeForm = null;
    this.activeElement = null;
    removeEventListener("click", this.onOutsideFormClick, true);
    removeEventListener("keydown", this.onFormKey, true);
    removeEventListener("resize", this.onFormViewportChange);
    removeEventListener("scroll", this.onFormViewportChange, true);
    visualViewport?.removeEventListener("resize", this.onFormViewportChange);
  }
  async openForm(element: Element) {
    this.closeForm();
    const context = captureElement(element),
      box = element.getBoundingClientRect(),
      card = createCommentForm(
        this.project?.name ?? "Projeto SpotPatch",
        `${context.tagName} · ${context.textContent.slice(0, 70) || context.cssSelector}`,
      );
    positionCommentForm(card, element, box);
    this.shadow!.append(card);
    this.activeForm = card;
    this.activeElement = element;
    card.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    card.querySelector(".cancel")?.addEventListener("click", () => this.closeForm(card));
    card.querySelector(".recapture")?.addEventListener("click", () => {
      void this.prepareCapture(card, element, true);
    });
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit(card, element);
    });
    queueMicrotask(() => {
      if (this.activeForm !== card) return;
      addEventListener("click", this.onOutsideFormClick, true);
      addEventListener("keydown", this.onFormKey, true);
      addEventListener("resize", this.onFormViewportChange);
      addEventListener("scroll", this.onFormViewportChange, true);
      visualViewport?.addEventListener("resize", this.onFormViewportChange);
    });
  }
  async submit(form: HTMLFormElement, selectedElement: Element) {
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const draft = this.captureDrafts.get(form);
    if (!draft) {
      await this.prepareCapture(form, selectedElement);
      return;
    }
    submit.disabled = true;
    submit.textContent = "Enviando…";
    form.querySelector(".error")?.remove();
    try {
      const data = new FormData(form),
        payload: FeedbackCreateInput = {
          idempotencyKey: crypto.randomUUID(),
          projectId: this.project!.projectId,
          comment: String(data.get("comment")),
          category: String(data.get("category")) as FeedbackCreateInput["category"],
          priority: String(data.get("priority")) as FeedbackCreateInput["priority"],
          page: draft.page,
          element: draft.element,
          ...(data.get("name") ? { authorName: String(data.get("name")) } : {}),
          ...(data.get("email") ? { authorEmail: String(data.get("email")) } : {}),
          ...(draft.capture.viewport ? { screenshot: draft.capture.viewport } : {}),
          ...(draft.capture.element ? { elementScreenshot: draft.capture.element } : {}),
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
      appendFormError(form, error);
      submit.disabled = false;
      submit.textContent = "Enviar feedback";
    }
  }
  async prepareCapture(
    form: HTMLFormElement,
    selectedElement: Element,
    withCountdown = false,
  ) {
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!,
      recapture = form.querySelector<HTMLButtonElement>(".recapture")!,
      controller = new AbortController();
    this.captureController?.abort();
    this.captureController = controller;
    this.isCapturing = true;
    this.captureDrafts.delete(form);
    submit.disabled = true;
    submit.textContent = "Capturando…";
    recapture.disabled = true;
    form.querySelector(".error")?.remove();
    try {
      const fallbackElement = captureElement(selectedElement);
      const ids = await this.ids();
      let draft: CaptureDraft | null = null;
      try {
        if (withCountdown) await this.runCaptureCountdown(controller.signal);
        else this.setCaptureMode("capturing");
        await waitForVisualUpdate();
        assertNotAborted(controller.signal);
        let element: CapturedElementContext;
        try {
          element = captureElement(selectedElement);
        } catch {
          element = fallbackElement;
        }
        const page = capturePage(ids.installationId, ids.sessionId);
        let capture: CaptureResponse;
        try {
          capture = (await chrome.runtime.sendMessage({
            type: "SPOTPATCH_CAPTURE",
            boundingBox: element.boundingBox,
            devicePixelRatio: page.viewport.devicePixelRatio,
          })) as CaptureResponse;
        } catch (error) {
          capture = {
            success: false,
            error: error instanceof Error ? error.message : "Screenshot failed",
          };
        }
        assertNotAborted(controller.signal);
        draft = { page, element, capture };
      } finally {
        if (this.captureController === controller) this.setCaptureMode("idle");
      }
      if (!draft) throw new Error("Não foi possível preparar a captura.");
      if (this.activeForm !== form) return;
      this.captureDrafts.set(form, draft);
      renderCapturePreview(form, draft.capture);
      submit.textContent = "Enviar feedback";
    } catch (error) {
      if (!isAbortError(error)) {
        appendFormError(form, error);
        submit.textContent = "Revisar captura";
      }
    } finally {
      if (this.captureController === controller) {
        this.captureController = null;
        this.isCapturing = false;
        this.setCaptureMode("idle");
      }
      if (this.activeForm === form) {
        submit.disabled = false;
        recapture.disabled = false;
      }
    }
  }
  async loadMarkers(project: Project) {
    this.project = project;
    this.mount();
    this.closeMarkerCard();
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
    this.closeMarkerCard();
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
      node.type = "button";
      node.className = `marker${target ? "" : " orphan"}`;
      node.textContent = String(marker.number);
      node.title = `${marker.comment}${target ? "" : " (elemento não reencontrado)"}`;
      node.style.left = `${Math.max(4, (box?.left ?? marker.boundingBox.left) + 8)}px`;
      node.style.top = `${Math.max(4, (box?.top ?? marker.boundingBox.top) + 8)}px`;
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openMarkerCard(marker, node);
      });
      this.shadow.append(node);
    }
  };
}
const markerCategoryLabels: Record<string, string> = {
  visual_bug: "Bug visual",
  functional_bug: "Bug funcional",
  content_change: "Mudança de conteúdo",
  ux_improvement: "Melhoria de UX",
  performance: "Performance",
  accessibility: "Acessibilidade",
  other: "Outro",
};
const markerStatusLabels: Record<string, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  closed: "Fechado",
};
function createMarkerCard(marker: Marker) {
  const card = document.createElement("article"),
    header = document.createElement("header"),
    title = document.createElement("strong"),
    close = document.createElement("button"),
    comment = document.createElement("p"),
    metadata = document.createElement("dl"),
    link = document.createElement("a");

  card.className = "marker-card";
  title.textContent = `Feedback #${marker.number}`;
  close.type = "button";
  close.className = "marker-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Fechar detalhes do feedback");
  header.append(title, close);

  comment.className = "marker-comment";
  comment.textContent = marker.comment;
  metadata.append(
    createMarkerMetadata("Categoria", markerCategoryLabels[marker.category] ?? marker.category),
    createMarkerMetadata("Status", markerStatusLabels[marker.status] ?? marker.status),
    createMarkerMetadata("Criado em", formatMarkerDate(marker.date)),
  );

  link.href = `${DASHBOARD}/backlog/${encodeURIComponent(marker.id)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Abrir no dashboard";
  card.append(header, comment, metadata, link);
  return card;
}
function createMarkerMetadata(label: string, value: string) {
  const wrapper = document.createElement("div"),
    term = document.createElement("dt"),
    description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}
function formatMarkerDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
function positionMarkerCard(card: HTMLElement, anchor: DOMRect) {
  const margin = 12,
    viewportWidth = Math.max(0, visualViewport?.width ?? innerWidth),
    viewportHeight = Math.max(0, visualViewport?.height ?? innerHeight),
    width = Math.max(0, Math.min(300, viewportWidth - margin * 2)),
    maximumLeft = Math.max(margin, viewportWidth - width - margin);
  card.style.width = `${width}px`;
  const cardHeight = Math.min(card.scrollHeight, Math.max(0, viewportHeight - margin * 2)),
    maximumTop = Math.max(margin, viewportHeight - cardHeight - margin),
    top = Math.min(maximumTop, Math.max(margin, anchor.top)),
    left =
      viewportWidth - anchor.right - margin >= width
        ? anchor.right + margin
        : anchor.left - margin >= width
          ? anchor.left - width - margin
          : Math.min(maximumLeft, Math.max(margin, anchor.left));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.maxHeight = `${Math.max(0, viewportHeight - top - margin)}px`;
}
function positionCommentForm(form: HTMLFormElement, element: Element, currentBox?: DOMRect) {
  const margin = 12,
    viewportWidth = Math.max(0, visualViewport?.width ?? innerWidth),
    viewportHeight = Math.max(0, visualViewport?.height ?? innerHeight),
    width = Math.max(0, Math.min(340, viewportWidth - margin * 2)),
    box = currentBox ?? element.getBoundingClientRect(),
    maximumLeft = Math.max(margin, viewportWidth - width - margin);
  let left: number;

  if (viewportWidth - box.right - margin >= width) left = box.right + margin;
  else if (box.left - margin >= width) left = box.left - width - margin;
  else left = Math.min(maximumLeft, Math.max(margin, box.left));

  const preferredHeight = Math.min(620, Math.max(0, viewportHeight - margin * 2)),
    maximumTop = Math.max(margin, viewportHeight - margin - preferredHeight),
    top = Math.min(maximumTop, Math.max(margin, box.top)),
    availableHeight = Math.max(0, viewportHeight - top - margin);

  form.style.width = `${width}px`;
  form.style.left = `${left}px`;
  form.style.top = `${top}px`;
  form.style.maxHeight = `${availableHeight}px`;
}
function renderCapturePreview(form: HTMLFormElement, capture: CaptureResponse) {
  const section = form.querySelector<HTMLElement>(".capture-preview")!,
    viewport = form.querySelector<HTMLElement>('[data-capture="viewport"]')!,
    element = form.querySelector<HTMLElement>('[data-capture="element"]')!,
    warning = form.querySelector<HTMLElement>(".capture-warning")!,
    recapture = form.querySelector<HTMLButtonElement>(".recapture")!;

  renderCaptureImage(viewport, "Viewport", capture.viewport);
  renderCaptureImage(element, "Elemento", capture.element);
  section.hidden = false;
  recapture.hidden = false;
  form.querySelector<HTMLButtonElement>(".cancel")!.style.gridColumn = "1";

  if (!capture.viewport) {
    warning.textContent =
      "A captura da viewport falhou. Você pode refazer ou enviar o feedback sem imagens.";
    warning.hidden = false;
  } else if (!capture.element) {
    warning.textContent =
      "A viewport foi capturada, mas o recorte do elemento falhou. Você pode refazer ou continuar.";
    warning.hidden = false;
  } else {
    warning.textContent = "";
    warning.hidden = true;
  }
}
function renderCaptureImage(container: HTMLElement, label: string, dataUrl?: string) {
  const title = document.createElement("span");
  title.textContent = label;
  container.replaceChildren(title);
  if (dataUrl) {
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = `Prévia da captura: ${label.toLowerCase()}`;
    container.append(image);
    return;
  }
  const empty = document.createElement("div");
  empty.className = "capture-empty";
  empty.textContent = "Captura indisponível";
  container.append(empty);
}
function appendFormError(form: HTMLFormElement, error: unknown) {
  form.querySelector(".error")?.remove();
  const errorMessage = document.createElement("p");
  errorMessage.className = "error";
  errorMessage.textContent = error instanceof Error ? error.message : "Falha no envio";
  form.append(errorMessage);
}
function createCommentForm(projectName: string, previewText: string) {
  const form = document.createElement("form"),
    title = document.createElement("h2"),
    project = document.createElement("p"),
    preview = document.createElement("div"),
    comment = document.createElement("textarea"),
    category = createSelect("category", [
      ["visual_bug", "Bug visual"],
      ["functional_bug", "Bug funcional"],
      ["content_change", "Mudança de conteúdo"],
      ["ux_improvement", "Melhoria de UX"],
      ["performance", "Performance"],
      ["accessibility", "Acessibilidade"],
      ["other", "Outro"],
    ]),
    priority = createSelect(
      "priority",
      [
        ["low", "Baixa"],
        ["medium", "Média"],
        ["high", "Alta"],
        ["critical", "Crítica"],
      ],
      "medium",
    ),
    metadataRow = document.createElement("div"),
    selectRow = document.createElement("div"),
    name = document.createElement("input"),
    email = document.createElement("input"),
    capturePreview = document.createElement("section"),
    captureTitle = document.createElement("strong"),
    captureGrid = document.createElement("div"),
    viewportPreview = document.createElement("div"),
    elementPreview = document.createElement("div"),
    captureWarning = document.createElement("p"),
    actions = document.createElement("div"),
    cancel = document.createElement("button"),
    recapture = document.createElement("button"),
    submit = document.createElement("button");

  form.className = "card";
  title.textContent = "Novo feedback";
  project.textContent = projectName;
  preview.className = "preview";
  preview.textContent = previewText;

  comment.name = "comment";
  comment.minLength = 5;
  comment.maxLength = 2000;
  comment.required = true;
  comment.placeholder = "Explique o que precisa mudar";

  selectRow.className = "row";
  selectRow.append(createField("Categoria", category), createField("Prioridade", priority));

  name.name = "name";
  name.maxLength = 100;
  email.name = "email";
  email.type = "email";
  email.maxLength = 320;
  metadataRow.className = "row";
  metadataRow.append(createField("Nome opcional", name), createField("Email opcional", email));

  capturePreview.className = "capture-preview";
  capturePreview.hidden = true;
  captureTitle.textContent = "Revisão da captura";
  captureGrid.className = "capture-grid";
  viewportPreview.className = "capture-item";
  viewportPreview.dataset.capture = "viewport";
  elementPreview.className = "capture-item";
  elementPreview.dataset.capture = "element";
  captureGrid.append(viewportPreview, elementPreview);
  captureWarning.className = "capture-warning";
  captureWarning.hidden = true;
  capturePreview.append(captureTitle, captureGrid, captureWarning);

  actions.className = "actions";
  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr)";
  cancel.type = "button";
  cancel.className = "cancel";
  cancel.textContent = "Cancelar";
  cancel.style.gridColumn = "1 / -1";
  cancel.style.gridRow = "2";
  recapture.type = "button";
  recapture.className = "recapture";
  recapture.textContent = "Refazer";
  recapture.hidden = true;
  recapture.style.gridColumn = "2";
  recapture.style.gridRow = "2";
  submit.type = "submit";
  submit.textContent = "Revisar captura";
  submit.style.gridColumn = "1 / -1";
  submit.style.gridRow = "1";
  submit.style.whiteSpace = "nowrap";
  actions.append(cancel, recapture, submit);

  form.append(
    title,
    project,
    preview,
    createField("Comentário", comment),
    selectRow,
    metadataRow,
    capturePreview,
    actions,
  );
  return form;
}
function createField(
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
) {
  const label = document.createElement("label");
  label.className = "field";
  label.append(document.createTextNode(labelText), control);
  return label;
}
function createSelect(
  name: string,
  options: ReadonlyArray<readonly [value: string, label: string]>,
  selected?: string,
) {
  const select = document.createElement("select");
  select.name = name;
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  if (selected) select.value = selected;
  return select;
}
function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError");
}
function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
function abortableDelay(milliseconds: number, signal: AbortSignal) {
  assertNotAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
        clearTimeout(timeout);
        reject(new DOMException("Capture cancelled", "AbortError"));
      },
      timeout = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function waitForVisualUpdate() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
