import { describe, it, expect, beforeEach } from 'vitest'
import { hierarchyStore } from './hierarchy'
import { sessionsStore, type Session } from './sessions'

const mkSession = (key: string, status = 'active'): Session => ({
  session_key: key,
  agent_type: 'claude',
  agent_session_id: key,
  status,
  last_event_time_ms: 1000,
})

describe('hierarchyStore', () => {
  beforeEach(() => {
    hierarchyStore.tree = null
    hierarchyStore.selectedWorkspaceId = null
    hierarchyStore.selectedProjectId = null
    hierarchyStore.selectedTopicId = null
    hierarchyStore.selectedStoryId = null
    hierarchyStore.expandedNodes = {}
  })

  // HIER-16: switchWorkspace changes selectedWorkspaceId and resets topic/story
  it('switchWorkspace changes selection and resets topic/story (HIER-16)', () => {
    hierarchyStore.selectedWorkspaceId = 1
    hierarchyStore.selectedTopicId = 5
    hierarchyStore.selectedStoryId = 10
    hierarchyStore.selectWorkspace(2)
    expect(hierarchyStore.selectedWorkspaceId).toBe(2)
    expect(hierarchyStore.selectedTopicId).toBeNull()
    expect(hierarchyStore.selectedStoryId).toBeNull()
  })

  it('selectProject clears topic and story selection', () => {
    hierarchyStore.selectedTopicId = 2
    hierarchyStore.selectedStoryId = 3

    hierarchyStore.selectProject(1)

    expect(hierarchyStore.selectedProjectId).toBe(1)
    expect(hierarchyStore.selectedTopicId).toBeNull()
    expect(hierarchyStore.selectedStoryId).toBeNull()
  })

  it('selectTopic sets topicId and expands node', () => {
    hierarchyStore.selectTopic(7, 'My Topic')
    expect(hierarchyStore.selectedTopicId).toBe(7)
    expect(hierarchyStore.selectedTopicName).toBe('My Topic')
    expect(hierarchyStore.expandedNodes['topic_7']).toBe(true)
  })

  it('selectStory clears topic selection', () => {
    hierarchyStore.selectedTopicId = 3
    hierarchyStore.selectStory(5)
    expect(hierarchyStore.selectedStoryId).toBe(5)
    expect(hierarchyStore.selectedTopicId).toBeNull()
  })

  it('toggleNode flips expansion state', () => {
    // Default (undefined) is treated as expanded by the render layer.
    // First click collapses, second expands.
    hierarchyStore.toggleNode('ws_1')
    expect(hierarchyStore.expandedNodes['ws_1']).toBe(false)
    hierarchyStore.toggleNode('ws_1')
    expect(hierarchyStore.expandedNodes['ws_1']).toBe(true)
  })

  it('setTree defaults to first workspace if none selected', () => {
    const tree = {
      workspaces: [
        { workspace: { id: 10, name: 'W1', description: '', status: '', created_at: 0, updated_at: 0 }, projects: [] },
        { workspace: { id: 20, name: 'W2', description: '', status: '', created_at: 0, updated_at: 0 }, projects: [] },
      ],
    }
    hierarchyStore.setTree(tree)
    expect(hierarchyStore.selectedWorkspaceId).toBe(10)
  })

  it('setTree does not override existing selection', () => {
    hierarchyStore.selectedWorkspaceId = 20
    const tree = {
      workspaces: [
        { workspace: { id: 10, name: 'W1', description: '', status: '', created_at: 0, updated_at: 0 }, projects: [] },
      ],
    }
    hierarchyStore.setTree(tree)
    expect(hierarchyStore.selectedWorkspaceId).toBe(20)
  })

  it('applyEvent hierarchy_snapshot sets tree', () => {
    hierarchyStore.applyEvent({ type: 'hierarchy_snapshot', hierarchy: { workspaces: [] } })
    expect(hierarchyStore.tree).toEqual({ workspaces: [] })
  })

  it('applyEvent hierarchy_updated sets tree', () => {
    hierarchyStore.applyEvent({ type: 'hierarchy_updated', hierarchy: { workspaces: [] } })
    expect(hierarchyStore.tree).toEqual({ workspaces: [] })
  })

  it('keeps story status separate from latest run status', () => {
    hierarchyStore.setTree({
      workspaces: [{
        workspace: { id: 1, name: 'W', description: '', status: '', created_at: 0, updated_at: 0 },
        projects: [{
          project: { id: 2, workspace_id: 1, name: 'P', description: '', status: '', created_at: 0, updated_at: 0 },
          topics: [{
            topic: { id: 3, project_id: 2, name: 'T', description: '', agent_type: '', status: '', created_at: 0, updated_at: 0 },
            stories: [{
              id: 4,
              topic_id: 3,
              name: 'S',
              description: '',
              session_key: '',
              status: 'in_progress',
              latest_run_status: 'running',
              created_at: 0,
              updated_at: 0,
            }],
          }],
        }],
      }],
    })

    const story = hierarchyStore.tree?.workspaces[0].projects[0].topics[0].stories[0]
    expect(story?.status).toBe('in_progress')
    expect(story?.latest_run_status).toBe('running')
  })
})

// SESS-07: card expansion is independent per session key
describe('sessionsStore card expansion (SESS-07)', () => {
  beforeEach(() => {
    sessionsStore.sessions = {}
    sessionsStore.expandedCards = {}
  })

  it('toggleCard is independent per key (SESS-07)', () => {
    sessionsStore.sessions = { a: mkSession('a'), b: mkSession('b') }
    sessionsStore.toggleCard('a')
    expect(sessionsStore.expandedCards['a']).toBe(true)
    expect(sessionsStore.expandedCards['b']).toBeUndefined()
    sessionsStore.toggleCard('b')
    expect(sessionsStore.expandedCards['b']).toBe(true)
    // Toggling b again doesn't affect a
    sessionsStore.toggleCard('b')
    expect(sessionsStore.expandedCards['a']).toBe(true)
    expect(sessionsStore.expandedCards['b']).toBe(false)
  })
})
