import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { mergePendingCreateImages } from "./pending-create-images";

function userMessage(params: {
  id: string;
  text: string;
  images?: Array<{ uri: string; mimeType: string }>;
}): StreamItem {
  return {
    kind: "user_message",
    id: params.id,
    text: params.text,
    timestamp: new Date("2026-01-01T00:00:00Z"),
    ...(params.images ? { images: params.images } : {}),
  };
}

describe("mergePendingCreateImages", () => {
  it("returns same reference when pending images are absent", () => {
    const streamItems = [userMessage({ id: "msg-1", text: "hello" })];
    const result = mergePendingCreateImages({
      streamItems,
      messageId: "msg-1",
      text: "hello",
      images: [],
    });
    expect(result).toBe(streamItems);
  });

  it("merges images by messageId when the matched message has none", () => {
    const streamItems = [userMessage({ id: "msg-1", text: "hello" })];
    const images = [{ uri: "file:///tmp/image-1.jpg", mimeType: "image/jpeg" }];
    const result = mergePendingCreateImages({
      streamItems,
      messageId: "msg-1",
      text: "hello",
      images,
    });

    expect(result).not.toBe(streamItems);
    const updated = result[0];
    expect(updated?.kind).toBe("user_message");
    if (updated?.kind !== "user_message") {
      throw new Error("Expected user_message item");
    }
    expect(updated.images).toEqual(images);
  });

  it("falls back to text matching when messageId does not match", () => {
    const streamItems = [userMessage({ id: "msg-1", text: "same text" })];
    const images = [{ uri: "file:///tmp/image-2.jpg", mimeType: "image/jpeg" }];
    const result = mergePendingCreateImages({
      streamItems,
      messageId: "missing-id",
      text: "same text",
      images,
    });

    const updated = result[0];
    expect(updated?.kind).toBe("user_message");
    if (updated?.kind !== "user_message") {
      throw new Error("Expected user_message item");
    }
    expect(updated.images).toEqual(images);
  });

  it("does not overwrite existing user message images", () => {
    const existingImages = [{ uri: "file:///tmp/existing.jpg", mimeType: "image/jpeg" }];
    const streamItems = [
      userMessage({ id: "msg-1", text: "hello", images: existingImages }),
    ];
    const result = mergePendingCreateImages({
      streamItems,
      messageId: "msg-1",
      text: "hello",
      images: [{ uri: "file:///tmp/new.jpg", mimeType: "image/jpeg" }],
    });

    expect(result).toBe(streamItems);
    const unchanged = result[0];
    expect(unchanged?.kind).toBe("user_message");
    if (unchanged?.kind !== "user_message") {
      throw new Error("Expected user_message item");
    }
    expect(unchanged.images).toEqual(existingImages);
  });
});
