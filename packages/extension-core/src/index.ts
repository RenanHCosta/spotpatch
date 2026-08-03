import type { CapturedElementContext, CapturedPageContext } from "@spotpatch/shared";
import {
  isSensitiveElement,
  normalizeUrl,
  sanitizeAttributes,
  sanitizeHtml,
} from "@spotpatch/security/browser";
export const USEFUL_STYLES = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "line-height",
  "border",
  "border-radius",
  "opacity",
  "visibility",
  "overflow",
  "z-index",
  "flex",
  "flex-direction",
  "align-items",
  "justify-content",
  "grid-template-columns",
] as const;
export function createCssSelector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  for (
    let depth = 0;
    current && depth < 6 && current !== document.documentElement;
    depth++, current = current.parentElement
  ) {
    let part = current.tagName.toLowerCase();
    const agent = current.getAttribute("data-agent-id");
    if (agent) {
      part += `[data-agent-id="${CSS.escape(agent)}"]`;
      parts.unshift(part);
      break;
    }
    const stable = [...current.classList]
      .filter(
        (v) => v.length > 2 && !/^(active|flex|block|relative|absolute|container|wrapper)$/.test(v),
      )
      .slice(0, 2);
    if (stable.length) part += stable.map((v) => `.${CSS.escape(v)}`).join("");
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter((v) => v.tagName === current?.tagName)
      : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(part);
  }
  return parts.join(" > ");
}
export function createXPath(element: Element): string {
  if (element.id) return `//*[@id="${element.id.replace(/"/g, '\\"')}"]`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter((v) => v.tagName === current?.tagName)
      : [];
    parts.unshift(
      `${current.tagName.toLowerCase()}[${Math.max(1, siblings.indexOf(current) + 1)}]`,
    );
    current = current.parentElement;
  }
  return `/${parts.join("/")}`;
}
export function isSelectable(element: Element): boolean {
  if (element.closest("[data-spotpatch-ui]")) return false;
  if (["HTML", "HEAD", "SCRIPT", "STYLE", "META", "LINK", "IFRAME"].includes(element.tagName))
    return false;
  if (isSensitiveElement(element)) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0
  );
}
const text = (value: string | null | undefined, max: number) =>
  value?.replace(/\s+/g, " ").trim().slice(0, max) ?? "";
export function captureElement(element: Element): CapturedElementContext {
  if (!isSelectable(element)) throw new Error("Element is not selectable");
  const rect = element.getBoundingClientRect(),
    style = getComputedStyle(element);
  const attributes = sanitizeAttributes(
    Object.fromEntries([...element.attributes].map((a) => [a.name, a.value])),
  );
  const computedStyles = Object.fromEntries(
    USEFUL_STYLES.map((name) => [name, style.getPropertyValue(name)]),
  );
  const parents = [];
  let parent = element.parentElement;
  while (parent && parents.length < 5) {
    parents.push({
      tagName: parent.tagName.toLowerCase(),
      id: parent.id || null,
      classList: [...parent.classList].slice(0, 30),
      textContent: text(parent.textContent, 1000),
    });
    parent = parent.parentElement;
  }
  return {
    tagName: element.tagName.toLowerCase(),
    textContent: text(element.textContent, 4000),
    cssSelector: createCssSelector(element),
    xpath: createXPath(element),
    outerHTML: sanitizeHtml(element.outerHTML),
    attributes,
    classList: [...element.classList].slice(0, 50),
    boundingBox: {
      x: rect.x,
      y: rect.y,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    computedStyles,
    parentContext: parents,
    nearbyText: text(element.parentElement?.textContent, 4000),
    dataAgentId: element.getAttribute("data-agent-id"),
  };
}
export function capturePage(installationId: string, sessionId: string): CapturedPageContext {
  return {
    pageUrl: location.href,
    normalizedUrl: normalizeUrl(location.href),
    hostname: location.hostname,
    pathname: location.pathname,
    pageTitle: text(document.title, 500),
    referrer: document.referrer || null,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio: devicePixelRatio || 1 },
    scroll: { x: scrollX, y: scrollY },
    installationId,
    sessionId,
  };
}
