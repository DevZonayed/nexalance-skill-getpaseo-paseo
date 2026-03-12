import { describe, expect, it, vi, beforeEach } from "vitest";

const tauriState = vi.hoisted(() => ({
  api: null as any,
}));

vi.mock("@/utils/tauri", () => ({
  getTauri: () => tauriState.api,
}));

import {
  normalizePickedImageAssets,
  openImagePathsWithTauriDialog,
} from "./image-attachment-picker";

describe("image-attachment-picker", () => {
  beforeEach(() => {
    tauriState.api = null;
  });

  it("normalizes a picked File into a blob source", async () => {
    const file = new File(["hello"], "picked.png", { type: "image/png" });

    const result = await normalizePickedImageAssets([
      {
        uri: "blob:test",
        mimeType: "image/png",
        fileName: null,
        file,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source.kind).toBe("blob");
    expect(result[0]?.fileName).toBe("picked.png");
    expect(result[0]?.mimeType).toBe("image/png");
  });

  it("keeps filesystem picker results as file uris", async () => {
    const result = await normalizePickedImageAssets([
      {
        uri: "file:///tmp/picked.png",
        mimeType: "image/png",
        fileName: "picked.png",
      },
    ]);

    expect(result).toEqual([
      {
        source: { kind: "file_uri", uri: "file:///tmp/picked.png" },
        mimeType: "image/png",
        fileName: "picked.png",
      },
    ]);
  });

  it("converts data urls into blob sources when no file path exists", async () => {
    const result = await normalizePickedImageAssets([
      {
        uri: "data:image/png;base64,AAEC",
        mimeType: "image/png",
        fileName: "inline.png",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source.kind).toBe("blob");
    expect(result[0]?.fileName).toBe("inline.png");
    expect(result[0]?.mimeType).toBe("image/png");
  });

  it("uses the tauri dialog api when available", async () => {
    const open = vi.fn().mockResolvedValue(["/tmp/one.png", "/tmp/two.jpg"]);
    tauriState.api = {
      dialog: { open },
    };

    const result = await openImagePathsWithTauriDialog();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: true,
        directory: false,
        title: "Attach images",
      })
    );
    expect(result).toEqual(["/tmp/one.png", "/tmp/two.jpg"]);
  });

  it("falls back to core invoke for the tauri dialog plugin", async () => {
    const invoke = vi.fn().mockResolvedValue("/tmp/one.png");
    tauriState.api = {
      core: { invoke },
    };

    const result = await openImagePathsWithTauriDialog();

    expect(invoke).toHaveBeenCalledWith("plugin:dialog|open", {
      options: expect.objectContaining({
        multiple: true,
        directory: false,
        title: "Attach images",
      }),
    });
    expect(result).toEqual(["/tmp/one.png"]);
  });
});
