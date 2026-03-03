import { describe, expect, it } from 'vitest'
import {
  applyStoredOrdering,
  buildSidebarProjectsFromWorkspaces,
} from './use-sidebar-workspaces-list'
import type { WorkspaceDescriptor } from '@/stores/session-store'

interface OrderedItem {
  key: string
}

function item(key: string): OrderedItem {
  return { key }
}

describe('applyStoredOrdering', () => {
  it('keeps unknown items on the baseline while applying stored order', () => {
    const result = applyStoredOrdering({
      items: [item('new'), item('a'), item('b')],
      storedOrder: ['b', 'a'],
      getKey: (entry) => entry.key,
    })

    expect(result.map((entry) => entry.key)).toEqual(['new', 'b', 'a'])
  })

  it('ignores stale and duplicate stored keys', () => {
    const result = applyStoredOrdering({
      items: [item('x'), item('y')],
      storedOrder: ['missing', 'y', 'y', 'x'],
      getKey: (entry) => entry.key,
    })

    expect(result.map((entry) => entry.key)).toEqual(['y', 'x'])
  })

  it('returns baseline when there is no persisted order', () => {
    const baseline = [item('first'), item('second')]
    const result = applyStoredOrdering({
      items: baseline,
      storedOrder: [],
      getKey: (entry) => entry.key,
    })

    expect(result).toBe(baseline)
  })
})

describe('buildSidebarProjectsFromWorkspaces', () => {
  it('uses workspace descriptor name and status directly', () => {
    const workspaces: WorkspaceDescriptor[] = [
      {
        id: '/repo/main',
        projectId: 'project-1',
        name: 'feat/hard-cut',
        status: 'failed',
        activityAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]

    const projects = buildSidebarProjectsFromWorkspaces({
      serverId: 'srv',
      workspaces,
      projectOrder: [],
      workspaceOrderByScope: {},
    })

    expect(projects).toHaveLength(1)
    expect(projects[0]?.statusBucket).toBe('failed')
    expect(projects[0]?.workspaces[0]?.name).toBe('feat/hard-cut')
    expect(projects[0]?.workspaces[0]?.statusBucket).toBe('failed')
  })
})
