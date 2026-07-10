import { beforeEach, describe, expect, it } from 'vitest'
import { renderStoryDetail } from './storyDetail'
import { hierarchyStore } from '../state/hierarchy'
import { registryStore } from '../state/registry'

describe('renderStoryDetail', () => {
  beforeEach(() => {
    // Reset all stores
    hierarchyStore.tree = null
    hierarchyStore.selectedWorkspaceId = null
    registryStore.profilesByWorkspace = {}
    registryStore.runsByStory = {}
  })

  it('does not render a New Session checkbox', () => {
    // Set up hierarchy with a story that has a bound agent
    hierarchyStore.tree = {
      workspaces: [{
        workspace: { id: 1, name: 'WS', description: '', status: '', created_at: 0, updated_at: 0 },
        projects: [{
          project: { id: 1, workspace_id: 1, name: 'Proj', description: '', status: '', created_at: 0, updated_at: 0 },
          topics: [{
            topic: { id: 1, project_id: 1, name: 'Topic', description: '', agent_type: 'claude', status: '', created_at: 0, updated_at: 0 },
            stories: [{
              id: 42,
              topic_id: 1,
              name: 'Test Story',
              description: 'A test story',
              session_key: '',
              agent_profile_id: 1,
              status: 'open',
              created_at: 0,
              updated_at: 0,
            }],
          }],
        }],
      }],
    }
    hierarchyStore.selectedWorkspaceId = 1

    // Set up a profile so the agent section renders
    registryStore.profilesByWorkspace[1] = [{
      id: 1,
      user_id: 'u1',
      workspace_id: 1,
      runtime_id: 1,
      provider: 'claude',
      name: 'Test Agent',
      description: '',
      default_cwd: '',
      model: '',
      permission_mode: '',
      system_prompt: '',
      status: 'active',
      created_by: 1,
      created_at: 0,
      updated_at: 0,
    }]

    const container = document.createElement('div')
    renderStoryDetail(container, 42)

    expect(container.textContent).not.toContain('New Session')
    expect(container.querySelector('#run-new-session')).toBeNull()
  })
})
