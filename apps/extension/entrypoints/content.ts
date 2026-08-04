import { captureElement, capturePage, isSelectable } from "@spotpatch/extension-core";
import type {
  CapturedElementContext,
  CapturedPageContext,
  FeedbackCreateInput,
} from "@spotpatch/shared";
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
class Inspector {
  private project: Project | null = null;
  private hovered: Element | null = null;
  private root: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private overlay: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private countdown: HTMLDivElement | null = null;
  private activeForm: HTMLFormElement | null = null;
  private activeElement: Element | null = null;
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
    this.shadow.innerHTML = `<style>*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}.outline{position:fixed;border:2px solid #ec5b35;background:#ec5b3520;pointer-events:none}.label{position:fixed;max-width:280px;border-radius:6px;background:#101828;padding:6px 8px;color:white;font:700 11px system-ui;box-shadow:0 3px 10px #0003}.marker{position:fixed;display:grid;width:28px;height:28px;place-items:center;border:3px solid white;border-radius:50%;background:#ec5b35;color:white;font:800 11px system-ui;box-shadow:0 3px 12px #0005;pointer-events:auto;cursor:pointer}.marker.orphan{background:#667085}.card{position:fixed;width:340px;max-height:calc(100vh - 24px);overflow:auto;border:1px solid #d0d5dd;border-radius:14px;background:white;padding:16px;color:#101828;box-shadow:0 16px 50px #10182835;pointer-events:auto}.card h2{margin:0 0 4px;font-size:16px}.card p{margin:0 0 12px;color:#667085;font-size:12px}.preview{overflow:hidden;margin-bottom:12px;border-radius:8px;background:#f2f4f7;padding:9px;white-space:nowrap;text-overflow:ellipsis;font:600 11px monospace}.card textarea,.card input,.card select{width:100%;margin-top:5px;border:1px solid #d0d5dd;border-radius:7px;padding:8px;font-size:12px}.card textarea{min-height:90px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{display:block;margin-top:9px;color:#475467;font-size:10px;font-weight:800;text-transform:uppercase}.capture-preview{margin-top:14px;border-top:1px solid #e4e7ec;padding-top:12px}.capture-preview>strong{display:block;margin-bottom:8px;font-size:11px;text-transform:uppercase;color:#475467}.capture-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.capture-item{overflow:hidden;border:1px solid #e4e7ec;border-radius:8px;background:#f8fafc}.capture-item span{display:block;padding:6px 8px;font-size:10px;font-weight:800;color:#475467}.capture-item img{display:block;width:100%;height:104px;object-fit:contain;background:#eef2f6}.capture-item .capture-empty{display:grid;height:104px;place-items:center;padding:8px;text-align:center;font-size:10px;color:#667085}.capture-warning{margin:9px 0 0!important;border-radius:7px;background:#fffaeb;padding:8px;color:#93370d!important}.capture-countdown{position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;color:#fff;text-align:center;text-shadow:0 3px 18px #0008}.capture-countdown strong{font:900 clamp(88px,22vw,180px)/.85 Inter,system-ui,sans-serif}.capture-countdown span{margin-top:20px;border-radius:999px;background:#101828dd;padding:9px 14px;font:800 12px Inter,system-ui,sans-serif}.actions{display:flex;gap:8px;margin-top:14px}.actions button{height:36px;flex:1;border:0;border-radius:7px;background:#101828;color:white;font-weight:800;cursor:pointer}.actions button:disabled{cursor:wait;opacity:.6}.actions .cancel,.actions .recapture{border:1px solid #d0d5dd;background:white;color:#344054}.error{margin-top:10px!important;color:#b42318!important}[hidden]{display:none!important}</style>`;
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
      const ids = await this.ids();
      let draft: CaptureDraft | null = null;
      try {
        if (withCountdown) await this.runCaptureCountdown(controller.signal);
        else this.setCaptureMode("capturing");
        await waitForVisualUpdate();
        assertNotAborted(controller.signal);
        const element = captureElement(selectedElement),
          page = capturePage(ids.installationId, ids.sessionId);
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
