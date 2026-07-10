import { describe, expect, it, beforeEach } from 'vitest'
import { hierarchyStore } from '../state/hierarchy'
import { registryStore } from '../state/registry'
import { renderProjectBoard, renderTopicBoard } from './workspaceViews'

describe('workspace board views', () => {
  beforeEach(() => {
    registryStore.setProfiles(1, [{
      id: 9,
      user_id: 'u',
      workspace_id: 1,
      runtime_id: 1,
      provider: 'claude',
      name: 'Claude Default',
      description: '',
      default_cwd: '',
      model: '',
      permission_mode: '',
      system_prompt: '',
      status: 'active',
      created_by: 1,
      created_at: 0,
      updated_at: 0,
    }])
    hierarchyStore.setTree({
      workspaces: [{
        workspace: { id: 1, name: 'W', description: '', status: '', created_at: 0, updated_at: 0 },
        projects: [{
          project: { id: 2, workspace_id: 1, name: 'Project A', description: '', status: '', created_at: 0, updated_at: 0 },
          topics: [{
            topic: { id: 3, project_id: 2, name: 'Topic A', description: '', agent_type: '', status: '', created_at: 0, updated_at: 0 },
            stories: [{
              id: 4,
              topic_id: 3,
              name: 'Story A',
              description: '',
              session_key: '',
              agent_profile_id: 9,
              latest_run_status: 'running',
              latest_session_key: 'sess-1',
              status: 'in_progress',
              created_at: 0,
              updated_at: 0,
            }],
          }],
        }],
      }],
    })
  })

  it('renders project board with topic and story cards', () => {
    const el = document.createElement('div')
    renderProjectBoard(el, 2)
    expect(el.textContent).toContain('Project A')
    expect(el.textContent).toContain('Topic A')
    expect(el.textContent).toContain('Story A')
    expect(el.textContent).toContain('Claude Default')
    expect(el.textContent).toContain('running')
  })

  it('renders topic board with story count', () => {
    const el = document.createElement('div')
    renderTopicBoard(el, 3)
    expect(el.textContent).toContain('Topic A')
    expect(el.textContent).toContain('1 story')
    expect(el.textContent).toContain('Story A')
  })
})
