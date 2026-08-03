import { describe, expect, it } from "vitest";
import {
  consumeRateLimit,
  isSensitiveFile,
  matchesDomain,
  normalizeUrl,
  redact,
  signAgentPayload,
  validateAdminToken,
  verifyAgentSignature,
} from "./index";
describe("security", () => {
  it("normalizes tracking but preserves functional params", () =>
    expect(normalizeUrl("https://shop.test/p?utm_source=x&size=M&skuId=2#x")).toBe(
      "https://shop.test/p?size=M&skuId=2",
    ));
  it("sorts params", () =>
    expect(normalizeUrl("https://x.test/?z=1&a=2")).toBe("https://x.test/?a=2&z=1"));
  it("matches exact and explicit wildcards safely", () => {
    expect(matchesDomain("shop.example.com", "*.example.com")).toBe(true);
    expect(matchesDomain("evil-example.com", "*.example.com")).toBe(false);
    expect(matchesDomain("example.com", "*.example.com")).toBe(false);
  });
  it("redacts secrets", () => expect(redact("token=abc Bearer xyz")).not.toContain("abc"));
  it("detects sensitive files", () => {
    expect(isSensitiveFile(".env.local")).toBe(true);
    expect(isSensitiveFile("src/button.tsx")).toBe(false);
  });
  it("verifies timestamped HMAC", () => {
    const t = String(Date.now());
    const s = signAgentPayload("{}", "secret", t);
    expect(verifyAgentSignature("{}", "secret", t, s)).toBe(true);
  });
  it("validates the administrative token in constant-time form", () => {
    expect(validateAdminToken("demo", "demo")).toBe(true);
    expect(validateAdminToken("bad", "demo")).toBe(false);
  });
  it("rate limits", () => {
    const key = crypto.randomUUID();
    expect(consumeRateLimit(key, 1, 1000).allowed).toBe(true);
    expect(consumeRateLimit(key, 1, 1000).allowed).toBe(false);
  });
});
