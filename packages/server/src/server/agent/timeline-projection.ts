import type { AgentProvider, AgentTimelineItem, ToolCallDetail } from "./agent-sdk-types.js";
import type { AgentTimelineRow } from "./agent-manager.js";

export type TimelineProjectionMode = "canonical" | "projected";

export type TimelineSeqRange = {
  startSeq: number;
  endSeq: number;
};

export type TimelineProjectionKind = "assistant_merge" | "tool_lifecycle";

export type TimelineProjectionEntry = {
  provider: AgentProvider;
  item: AgentTimelineItem;
  timestamp: string;
  seqStart: number;
  seqEnd: number;
  sourceSeqRanges: TimelineSeqRange[];
  collapsed: TimelineProjectionKind[];
};

type WorkingEntry = TimelineProjectionEntry;

function appendSeqToRanges(ranges: TimelineSeqRange[], seq: number): TimelineSeqRange[] {
  if (ranges.length === 0) {
    return [{ startSeq: seq, endSeq: seq }];
  }

  const next = [...ranges];
  const last = next[next.length - 1];
  if (!last) {
    return [{ startSeq: seq, endSeq: seq }];
  }

  if (seq <= last.endSeq + 1) {
    last.endSeq = Math.max(last.endSeq, seq);
    return next;
  }

  next.push({ startSeq: seq, endSeq: seq });
  return next;
}

function mergeSeqRanges(
  existing: TimelineSeqRange[],
  incoming: TimelineSeqRange[]
): TimelineSeqRange[] {
  let merged = [...existing];
  for (const range of incoming) {
    for (let seq = range.startSeq; seq <= range.endSeq; seq += 1) {
      merged = appendSeqToRanges(merged, seq);
    }
  }
  return merged;
}

function mergeToolCallDetail(existing: ToolCallDetail, incoming: ToolCallDetail): ToolCallDetail {
  if (existing.type === "unknown" && incoming.type !== "unknown") {
    return incoming;
  }
  if (incoming.type === "unknown" && existing.type !== "unknown") {
    return existing;
  }
  return incoming;
}

function mergeToolCallItems(
  existing: Extract<AgentTimelineItem, { type: "tool_call" }>,
  incoming: Extract<AgentTimelineItem, { type: "tool_call" }>
): Extract<AgentTimelineItem, { type: "tool_call" }> {
  const mergedDetail = mergeToolCallDetail(existing.detail, incoming.detail);
  const mergedMetadata =
    existing.metadata || incoming.metadata
      ? { ...(existing.metadata ?? {}), ...(incoming.metadata ?? {}) }
      : undefined;

  const merged: Extract<AgentTimelineItem, { type: "tool_call" }> = {
    ...existing,
    ...incoming,
    detail: mergedDetail,
    metadata: mergedMetadata,
  };

  if (incoming.status === "failed") {
    merged.error = incoming.error;
  } else if (incoming.status === "completed" || incoming.status === "canceled") {
    merged.error = null;
  } else if (incoming.error !== undefined) {
    merged.error = incoming.error;
  }

  return merged;
}

function makeCanonicalEntries(
  rows: readonly AgentTimelineRow[],
  provider: AgentProvider
): WorkingEntry[] {
  return rows.map((row) => ({
    provider,
    item: row.item,
    timestamp: row.timestamp,
    seqStart: row.seq,
    seqEnd: row.seq,
    sourceSeqRanges: [{ startSeq: row.seq, endSeq: row.seq }],
    collapsed: [],
  }));
}

function collapseToolLifecycle(entries: readonly WorkingEntry[]): WorkingEntry[] {
  const output: WorkingEntry[] = [];
  const toolIndexByCallId = new Map<string, number>();

  for (const entry of entries) {
    if (entry.item.type !== "tool_call") {
      output.push(entry);
      continue;
    }

    const existingIndex = toolIndexByCallId.get(entry.item.callId);
    if (existingIndex === undefined) {
      toolIndexByCallId.set(entry.item.callId, output.length);
      output.push(entry);
      continue;
    }

    const existing = output[existingIndex];
    if (!existing || existing.item.type !== "tool_call") {
      output.push(entry);
      continue;
    }

    const mergedItem = mergeToolCallItems(existing.item, entry.item);
    const mergedRanges = mergeSeqRanges(existing.sourceSeqRanges, entry.sourceSeqRanges);
    const collapsed = existing.collapsed.includes("tool_lifecycle")
      ? existing.collapsed
      : ([...existing.collapsed, "tool_lifecycle"] as TimelineProjectionKind[]);

    output[existingIndex] = {
      ...existing,
      item: mergedItem,
      seqEnd: Math.max(existing.seqEnd, entry.seqEnd),
      sourceSeqRanges: mergedRanges,
      collapsed,
    };
  }

  return output;
}

function mergeAssistantChunks(entries: readonly WorkingEntry[]): WorkingEntry[] {
  const output: WorkingEntry[] = [];

  for (const entry of entries) {
    const previous = output[output.length - 1];
    const shouldMerge =
      previous &&
      previous.item.type === "assistant_message" &&
      entry.item.type === "assistant_message" &&
      previous.seqEnd + 1 === entry.seqStart;

    if (!shouldMerge || !previous) {
      output.push(entry);
      continue;
    }
    const previousAssistant = previous.item as Extract<
      AgentTimelineItem,
      { type: "assistant_message" }
    >;
    const entryAssistant = entry.item as Extract<
      AgentTimelineItem,
      { type: "assistant_message" }
    >;

    const collapsedKinds = new Set<TimelineProjectionKind>([
      ...previous.collapsed,
      ...entry.collapsed,
      "assistant_merge",
    ]);

    output[output.length - 1] = {
      ...previous,
      item: {
        type: "assistant_message",
        text: `${previousAssistant.text}${entryAssistant.text}`,
      },
      seqEnd: entry.seqEnd,
      sourceSeqRanges: mergeSeqRanges(previous.sourceSeqRanges, entry.sourceSeqRanges),
      collapsed: Array.from(collapsedKinds),
    };
  }

  return output;
}

export function projectTimelineRows(
  rows: readonly AgentTimelineRow[],
  provider: AgentProvider,
  mode: TimelineProjectionMode
): TimelineProjectionEntry[] {
  const canonical = makeCanonicalEntries(rows, provider);
  if (mode === "canonical") {
    return canonical;
  }

  const toolCollapsed = collapseToolLifecycle(canonical);
  return mergeAssistantChunks(toolCollapsed);
}
