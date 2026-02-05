import { describe, expect, it, vi } from "vitest";
import { buildVideoBlob, generateFilename, getSupportedMimeType, isMobile, saveBlob } from "./cameraUtils";

describe("cameraUtils", () => {
  it("getSupportedMimeType returns a string", () => {
    const result = getSupportedMimeType();
    expect(typeof result).toBe("string");
  });

  it("generateFilename matches expected pattern", () => {
    const name = generateFilename();
    // knee-session-YYYY-MM-DD-HHmmss.webm
    expect(name).toMatch(/^knee-session-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/);
  });

  it("buildVideoBlob produces a Blob of correct type", () => {
    const chunk = new Blob(["test"], { type: "video/webm" });
    const blob = buildVideoBlob([chunk], "video/webm");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("video/webm");
  });

  it("buildVideoBlob defaults to video/webm when mimeType is empty", () => {
    const chunk = new Blob(["data"]);
    const blob = buildVideoBlob([chunk], "");
    expect(blob.type).toBe("video/webm");
  });

  it("isMobile returns false in node (no navigator.userAgent)", () => {
    // In node environment, navigator is not defined — isMobile should handle gracefully
    // We mock navigator to test the function logic
    const orig = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(false);

    // iPad detection via MacIntel + touch
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 },
      writable: true,
      configurable: true,
    });
    expect(isMobile()).toBe(true);

    Object.defineProperty(globalThis, "navigator", { value: orig, writable: true, configurable: true });
  });

  it("saveBlob falls back to downloadBlob when navigator.share is undefined", async () => {
    // Set up minimal browser globals for node environment
    const origNav = globalThis.navigator;
    const origDoc = globalThis.document;
    const origURL = globalThis.URL;

    const clickSpy = vi.fn();
    const fakeAnchor = { href: "", download: "", click: clickSpy } as unknown as HTMLAnchorElement;

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0, share: undefined },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: vi.fn(() => fakeAnchor),
        body: { appendChild: vi.fn((el: unknown) => el), removeChild: vi.fn((el: unknown) => el) },
      },
      writable: true,
      configurable: true,
    });

    const fakeUrl = "blob:http://localhost/fake";
    const mockCreateObjectURL = vi.fn(() => fakeUrl);
    const mockRevokeObjectURL = vi.fn();
    // URL is a class — preserve it but override static methods
    const urlProxy = new Proxy(origURL, {
      get(target, prop) {
        if (prop === "createObjectURL") return mockCreateObjectURL;
        if (prop === "revokeObjectURL") return mockRevokeObjectURL;
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      },
    });
    Object.defineProperty(globalThis, "URL", { value: urlProxy, writable: true, configurable: true });

    const blob = new Blob(["test"], { type: "video/webm" });
    await saveBlob(blob, "test.webm");

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    // Restore
    Object.defineProperty(globalThis, "navigator", { value: origNav, writable: true, configurable: true });
    Object.defineProperty(globalThis, "document", { value: origDoc, writable: true, configurable: true });
    Object.defineProperty(globalThis, "URL", { value: origURL, writable: true, configurable: true });
  });
});
