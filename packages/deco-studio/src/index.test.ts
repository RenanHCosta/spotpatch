import { describe, expect, it } from "vitest";
import { mapDecoStatus } from "./index";
describe("Deco status", () => {
  it("maps durable states", () => {
    expect(mapDecoStatus("queued")).toBe("in_progress");
    expect(mapDecoStatus("completed")).toBe("completed");
    expect(mapDecoStatus("failed")).toBe("failed");
    expect(mapDecoStatus("future")).toBe("unknown");
  });
});
