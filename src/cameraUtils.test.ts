import { describe, expect, it } from "vitest";
import { buildVideoBlob, getSupportedMimeType } from "./cameraUtils";

describe("cameraUtils", () => {
  it("getSupportedMimeType returns a string", () => {
    const result = getSupportedMimeType();
    expect(typeof result).toBe("string");
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
