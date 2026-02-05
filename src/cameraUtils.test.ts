import { describe, expect, it } from "vitest";
import { buildVideoBlob, generateFilename, getSupportedMimeType } from "./cameraUtils";

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
});
