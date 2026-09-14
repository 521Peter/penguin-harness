/**
 * The once-only decision behind company mode's beta notice (features/company/beta-badge.tsx):
 * the first switch into the mode in a browser raises it, every later one does not, and a
 * storage that is absent or refuses to answer raises nothing rather than raising it forever.
 */
import { describe, expect, it } from "vitest";
import {
  BETA_NOTICE_KEY,
  markBetaNoticeShown,
  shouldShowBetaNotice,
} from "../src/features/company/beta-badge";

/** The in-memory stand-in for localStorage (this package's vitest runs in Node, which has none). */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    read: (key: string): string | null => map.get(key) ?? null,
  };
}

/** A browser with site data blocked: every access throws rather than returning null. */
const throwingStorage = {
  getItem(): string | null {
    throw new Error("access denied");
  },
  setItem(): void {
    throw new Error("access denied");
  },
};

describe("shouldShowBetaNotice", () => {
  it("is owed on a browser that has never seen it, and not after it is marked", () => {
    const storage = memoryStorage();
    expect(shouldShowBetaNotice(storage)).toBe(true);
    markBetaNoticeShown(storage);
    expect(storage.read(BETA_NOTICE_KEY)).toBe("1");
    expect(shouldShowBetaNotice(storage)).toBe(false);
  });

  it("stays owed while the flag holds anything but the mark", () => {
    expect(shouldShowBetaNotice(memoryStorage({ [BETA_NOTICE_KEY]: "" }))).toBe(true);
    expect(shouldShowBetaNotice(memoryStorage({ [BETA_NOTICE_KEY]: "true" }))).toBe(true);
    expect(shouldShowBetaNotice(memoryStorage({ [BETA_NOTICE_KEY]: "0" }))).toBe(true);
  });

  it("answers no when storage throws, so the notice cannot repeat on every switch", () => {
    expect(shouldShowBetaNotice(throwingStorage)).toBe(false);
    expect(() => markBetaNoticeShown(throwingStorage)).not.toThrow();
  });

  it("answers no when there is no storage at all (Node, no localStorage)", () => {
    expect(shouldShowBetaNotice()).toBe(false);
    expect(() => markBetaNoticeShown()).not.toThrow();
  });
});
