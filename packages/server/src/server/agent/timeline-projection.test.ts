import { describe, expect, test } from "vitest";

import type { AgentTimelineRow } from "./agent-manager.js";
import { projectTimelineRows } from "./timeline-projection.js";

describe("projectTimelineRows", () => {
  test("merges adjacent assistant chunks in projected mode", () => {
    const rows: AgentTimelineRow[] = [
      {
        seq: 1,
        timestamp: "2026-02-13T00:00:00.000Z",
        item: { type: "assistant_message", text: "Hel" },
      },
      {
        seq: 2,
        timestamp: "2026-02-13T00:00:00.100Z",
        item: { type: "assistant_message", text: "lo" },
      },
      {
        seq: 3,
        timestamp: "2026-02-13T00:00:00.200Z",
        item: { type: "user_message", text: "next" },
      },
    ];

    const projected = projectTimelineRows(rows, "codex", "projected");

    expect(projected).toHaveLength(2);
    expect(projected[0]?.item).toEqual({
      type: "assistant_message",
      text: "Hello",
    });
    expect(projected[0]?.seqStart).toBe(1);
    expect(projected[0]?.seqEnd).toBe(2);
    expect(projected[0]?.sourceSeqRanges).toEqual([{ startSeq: 1, endSeq: 2 }]);
    expect(projected[0]?.collapsed).toContain("assistant_merge");
  });

  test("collapses tool lifecycle by callId and reports exact source seq ranges", () => {
    const rows: AgentTimelineRow[] = [
      {
        seq: 1,
        timestamp: "2026-02-13T00:00:00.000Z",
        item: {
          type: "tool_call",
          callId: "call_1",
          name: "shell",
          status: "running",
          error: null,
          detail: {
            type: "unknown",
            input: { cmd: "pwd" },
            output: null,
          },
        },
      },
      {
        seq: 2,
        timestamp: "2026-02-13T00:00:00.100Z",
        item: { type: "assistant_message", text: "working" },
      },
      {
        seq: 3,
        timestamp: "2026-02-13T00:00:00.200Z",
        item: {
          type: "tool_call",
          callId: "call_1",
          name: "shell",
          status: "completed",
          error: null,
          detail: {
            type: "unknown",
            input: { cmd: "pwd" },
            output: { stdout: "/tmp" },
          },
        },
      },
    ];

    const projected = projectTimelineRows(rows, "codex", "projected");

    expect(projected).toHaveLength(2);
    const tool = projected[0];
    expect(tool?.item.type).toBe("tool_call");
    if (tool?.item.type === "tool_call") {
      expect(tool.item.status).toBe("completed");
      expect(tool.item.callId).toBe("call_1");
    }
    expect(tool?.sourceSeqRanges).toEqual([
      { startSeq: 1, endSeq: 1 },
      { startSeq: 3, endSeq: 3 },
    ]);
    expect(tool?.collapsed).toContain("tool_lifecycle");
  });

  test("returns canonical rows unchanged in canonical mode", () => {
    const rows: AgentTimelineRow[] = [
      {
        seq: 10,
        timestamp: "2026-02-13T00:00:00.000Z",
        item: { type: "assistant_message", text: "A" },
      },
      {
        seq: 11,
        timestamp: "2026-02-13T00:00:00.100Z",
        item: { type: "assistant_message", text: "B" },
      },
    ];

    const projected = projectTimelineRows(rows, "codex", "canonical");

    expect(projected).toHaveLength(2);
    expect(projected[0]?.item).toEqual(rows[0]?.item);
    expect(projected[1]?.item).toEqual(rows[1]?.item);
    expect(projected[0]?.collapsed).toEqual([]);
    expect(projected[1]?.collapsed).toEqual([]);
  });
});
