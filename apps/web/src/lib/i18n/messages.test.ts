import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import km from "../../messages/km.json";

/**
 * The message-catalogue parity test.
 *
 * A missing Khmer translation is not a cosmetic bug: the guard at the gate
 * and the motorcycle owner paying the fee read Khmer. A key that exists in
 * `en.json` and not in `km.json` renders as the raw key on the Khmer page.
 *
 * This test walks both catalogues and asserts that they have exactly the
 * same key set, at every depth.
 */

/** Collect every leaf key of a nested object, as dotted paths. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("the message catalogues", () => {
  it("have the same key set", () => {
    const english = leafKeys(en).sort();
    const khmer = leafKeys(km).sort();

    expect(khmer.filter((key) => !english.includes(key))).toEqual([]);
    expect(english.filter((key) => !khmer.includes(key))).toEqual([]);
  });

  it("have no empty translations", () => {
    for (const key of leafKeys(km)) {
      const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], km);

      expect(typeof value, `km.${key} must be a string`).toBe("string");
      expect((value as string).trim(), `km.${key} must not be empty`).not.toBe("");
    }
  });

  it("cover the key namespaces the app uses", () => {
    const english = leafKeys(en);

    for (const namespace of [
      "app",
      "common",
      "nav",
      "home",
      "guard",
      "ticket",
      "owner",
      "admin",
      "footer",
    ]) {
      expect(
        english.some((key) => key.startsWith(`${namespace}.`)),
        `the "${namespace}" namespace must have messages`,
      ).toBe(true);
    }
  });

  it("use the documented key convention", () => {
    for (const key of leafKeys(en)) {
      expect(key, `"${key}" must be dot-separated lowercase`).toMatch(
        /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/,
      );
    }
  });
});
