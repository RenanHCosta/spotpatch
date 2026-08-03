import type { CapturedElementContext, CodeSearchHint } from "@spotpatch/shared";

const TRACKING = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

export type DomainRule = { hostname: string; wildcard?: boolean };
export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}
export function matchesDomain(hostname: string, rule: DomainRule | string): boolean {
  const actual = normalizeHostname(hostname);
  const raw = typeof rule === "string" ? rule : rule.hostname;
  const configured = normalizeHostname(raw.replace(/^\*\./, ""));
  const wildcard =
    typeof rule === "string"
      ? raw.startsWith("*.")
      : Boolean(rule.wildcard) || raw.startsWith("*.");
  return wildcard
    ? actual !== configured && actual.endsWith(`.${configured}`)
    : actual === configured;
}

const secretName =
  /(password|passwd|token|secret|authorization|cookie|card|cvv|cvc|session|api[-_]?key)/i;
export function redact(value: string): string {
  return value
    .replace(/(bearer\s+)[\w.+/=:-]+/gi, "$1[REDACTED]")
    .replace(/((?:password|token|secret|api[-_]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
export function sanitizeAttributes(input: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input).slice(0, 50)) {
    if (!/^on/i.test(key)) {
      output[key] = secretName.test(key) ? "[REDACTED]" : value.slice(0, 1000);
    }
  }
  return output;
}
export function sanitizeHtml(input: string): string {
  return redact(input)
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/\s(value|srcdoc)=("[^"]*"|'[^']*')/gi, ' $1="[REDACTED]"')
    .slice(0, 30_000);
}
export function isSensitiveElement(element: Element): boolean {
  if (
    element.closest(
      '[data-sensitive],input[type="password"],[autocomplete*="cc-"],form[action*="login" i],form[action*="checkout" i],form[action*="payment" i]',
    )
  )
    return true;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

const GENERIC = new Set([
  "div",
  "flex",
  "container",
  "button",
  "active",
  "wrapper",
  "block",
  "relative",
  "absolute",
]);
export function generateCodeSearchHints(
  element: CapturedElementContext,
  pageUrl: string,
): CodeSearchHint[] {
  const hints: CodeSearchHint[] = [];
  const add = (
    value: string | undefined | null,
    type: CodeSearchHint["type"],
    weight: number,
  ) => {
    const normalized = value?.trim();
    if (
      normalized &&
      normalized.length > 1 &&
      !GENERIC.has(normalized.toLowerCase()) &&
      !hints.some((hint) => hint.value === normalized && hint.type === type)
    ) {
      hints.push({ value: normalized.slice(0, 300), type, weight });
    }
  };
  add(element.dataAgentId, "data_agent_id", 1);
  add(element.attributes.id, "element_id", 0.95);
  add(element.attributes["aria-label"], "aria_label", 0.9);
  add(element.textContent.slice(0, 120), "text", 0.8);
  element.classList.forEach((value) => add(value, "class", 0.55));
  add(element.attributes.href || element.attributes.src, "url", 0.5);
  element.parentContext.forEach((parent) =>
    add(parent.id || parent.textContent.slice(0, 80), "ancestor", 0.35),
  );
  add(new URL(pageUrl).pathname, "route", 0.3);
  return hints.sort((a, b) => b.weight - a.weight).slice(0, 20);
}

export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /secret/i,
  /^\.github\/workflows\//i,
  /(^|\/)(auth|authentication|payment|payments|permissions|infra|infrastructure|deploy|migrations?)(\/|$)/i,
  /branch[-_]?protection/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /postinstall/i,
  /\.prod(?:uction)?\./i,
];
export function isSensitiveFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((value) => value > now - windowMs);
  const allowed = bucket.timestamps.length < limit;
  if (allowed) bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterMs: allowed ? 0 : Math.max(0, (bucket.timestamps[0] ?? now) + windowMs - now),
  };
}
