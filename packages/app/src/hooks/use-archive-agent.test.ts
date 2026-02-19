import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { __private__ } from "./use-archive-agent";

describe("useArchiveAgent", () => {
  it("tracks pending archive state in shared react-query cache", () => {
    const queryClient = new QueryClient();

    expect(
      __private__.isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      })
    ).toBe(false);

    __private__.setAgentArchiving({
      queryClient,
      serverId: "server-a",
      agentId: "agent-1",
      isArchiving: true,
    });

    expect(
      __private__.isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      })
    ).toBe(true);
    expect(
      __private__.isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-2",
      })
    ).toBe(false);

    __private__.setAgentArchiving({
      queryClient,
      serverId: "server-a",
      agentId: "agent-1",
      isArchiving: false,
    });

    expect(
      __private__.isAgentArchiving({
        queryClient,
        serverId: "server-a",
        agentId: "agent-1",
      })
    ).toBe(false);
  });

  it("removes an archived agent from cached list payloads", () => {
    const payload = {
      entries: [
        { agent: { id: "agent-1" } },
        { agent: { id: "agent-2" } },
      ],
      pageInfo: { hasMore: false },
    };

    const next = __private__.removeAgentFromListPayload(payload, "agent-1");

    expect(next.entries).toEqual([{ agent: { id: "agent-2" } }]);
    expect(next.pageInfo).toEqual({ hasMore: false });
  });
});
