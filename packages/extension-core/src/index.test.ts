// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createCssSelector, createXPath } from "./index";

beforeEach(() => {
  document.body.innerHTML = `<main><section data-agent-id="product-card"><button class="buy specific">Comprar</button></section></main>`;
  Object.defineProperty(globalThis, "CSS", { value: { escape: (value: string) => value } });
});

describe("DOM locators", () => {
  it("prefers data-agent-id ancestry in CSS selectors", () => {
    const button = document.querySelector("button")!;
    expect(createCssSelector(button)).toContain('[data-agent-id="product-card"]');
    expect(document.querySelector(createCssSelector(button))).toBe(button);
  });

  it("creates a deterministic XPath", () => {
    expect(createXPath(document.querySelector("button")!)).toContain("button[1]");
  });
});
