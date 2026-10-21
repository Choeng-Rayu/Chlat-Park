import { describe, expect, it } from "vitest";
import { inferTone } from "./status-badge.js";
import { cx } from "./types.js";

describe("inferTone", () => {
  it("maps a known status to its tone", () => {
    expect(inferTone("ACTIVE")).toBe("success");
    expect(inferTone("MANUAL_REVIEW")).toBe("danger");
    expect(inferTone("PENDING_CLAIM")).toBe("info");
  });

  it("is case-insensitive", () => {
    expect(inferTone("active")).toBe("success");
  });

  it("matches a status embedded in a longer label", () => {
    expect(inferTone("EXIT_COMPLETED")).toBe("neutral");
    expect(inferTone("payment_paid")).toBe("success");
  });

  it("falls back to neutral for an unknown status", () => {
    expect(inferTone("WHATEVER")).toBe("neutral");
  });
});

describe("cx", () => {
  it("joins the truthy class names", () => {
    expect(cx("a", "b")).toBe("a b");
  });

  it("drops the falsy ones", () => {
    expect(cx("a", undefined, null, false, "b")).toBe("a b");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cx(undefined, null, false)).toBe("");
  });
});
