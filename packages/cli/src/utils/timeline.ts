import type { AgentTimelineItem, DaemonClient } from '@getpaseo/server'

type TimelineFetchResult = {
  entries: Array<{ item: AgentTimelineItem }>
}

type TimelineFetchClient = {
  fetchAgentTimeline: (
    agentId: string,
    options: {
      direction: 'tail'
      limit: 0
      projection: 'projected'
    }
  ) => Promise<TimelineFetchResult>
}

type FetchProjectedTimelineItemsInput = {
  client: DaemonClient
  agentId: string
}

export async function fetchProjectedTimelineItems(
  input: FetchProjectedTimelineItemsInput
): Promise<AgentTimelineItem[]> {
  const timelineClient = input.client as unknown as TimelineFetchClient
  const timeline = await timelineClient.fetchAgentTimeline(input.agentId, {
    direction: 'tail',
    limit: 0,
    projection: 'projected',
  })
  return timeline.entries.map((entry) => entry.item)
}
