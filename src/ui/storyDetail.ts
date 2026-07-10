import { hierarchyStore } from '../state/hierarchy'
import { registryStore } from '../state/registry'
import type { Story, Topic } from '../state/hierarchy'
import { listProfiles, bindAgentToStory, createRun, listRuns, cancelRun } from '../api/registry'
import { toast } from './toast'

// ── Main Render ──

export function renderStoryDetail(container: HTMLElement, storyId: number): void {
  const story = findStory(storyId)
  if (!story) {
    container.innerHTML = '<div class="empty-state"><h3>Story not found</h3></div>'
    return
  }

  const wsId = hierarchyStore.selectedWorkspaceId ?? 0
  const profiles = registryStore.profilesForWorkspace(wsId)
  const runs = registryStore.runsForStory(storyId)
  const topic = findTopicForStory(storyId)

  const hasRuns = runs.length > 0
  const runningRun = runs.find(r => r.status === 'running')
  const profile = story.agent_profile_id ? registryStore.getProfile(story.agent_profile_id) : null

  container.innerHTML = `
    <div class="story-detail">
      <div class="story-detail-header">
        <h2 class="story-detail-title">${esc(story.name)}</h2>
        <span class="story-detail-status ${story.status}">${story.status}</span>
      </div>

      <div class="story-detail-meta">
        ${topic ? `<span>Topic: ${esc(topic.name)}</span>` : ''}
        ${story.description ? `<p class="story-desc">${esc(story.description)}</p>` : ''}
      </div>

      <!-- Agent Binding -->
      <div class="story-section" id="story-agent-section">
        <h3>Agent</h3>
        ${profile
          ? `<div class="story-bound-agent">
              <span class="agent-name">${esc(profile.name)}</span>
              <span class="agent-provider">${profile.provider}</span>
              <span class="agent-status ${profile.status}">${profile.status}</span>
              ${!hasRuns ? '<button class="btn btn-small" id="btn-change-agent">Change</button>' : '<span class="agent-locked">locked (has runs)</span>'}
            </div>`
          : profiles.length === 0
            ? `<div class="story-unbound">
                <p class="text-muted">No Agents in this workspace.</p>
                <button class="btn btn-primary" id="btn-open-agents">Scan Local Agents</button>
              </div>`
            : `<div class="story-unbound">
                <p class="text-muted">No agent bound. Select an agent to run this story:</p>
                <select id="agent-select" class="agent-select">
                  <option value="">-- Select Agent --</option>
                  ${profiles.filter(p => p.status === 'active').map(p =>
                    `<option value="${p.id}">${esc(p.name)} (${p.provider})</option>`
                  ).join('')}
                </select>
                <button class="btn btn-primary" id="btn-bind-agent">Bind Agent</button>
              </div>`
        }
      </div>

      <!-- Run Controls -->
      ${profile ? `
      <div class="story-section" id="story-run-section">
        <h3>Run</h3>
        ${runningRun
          ? `<div class="story-running">
              <span class="status-dot active">●</span> Running — exec: ${runningRun.exec_id || '...'}
              <button class="btn btn-danger btn-small" id="btn-cancel-run" data-run-id="${runningRun.id}">Cancel</button>
            </div>`
          : `<div id="story-run-form">
              <label>Prompt <textarea id="run-prompt" rows="3" class="story-prompt">${esc(story.description || story.name)}</textarea></label>
              <button class="btn btn-primary" id="btn-run">Send</button>
            </div>`
        }
      </div>
      ` : ''}

      <!-- Run History -->
      <div class="story-section" id="story-runs-section">
        <h3>Run History</h3>
        ${runs.length === 0
          ? '<p class="text-muted">No runs yet.</p>'
          : `<div class="run-list">
              ${runs.map(r => `
                <div class="run-item ${r.status}">
                  <span class="run-id">#${r.id}</span>
                  <span class="run-status ${r.status}">${r.status}</span>
                  <span class="run-prompt-preview">${esc(truncate(r.prompt, 60))}</span>
                  ${r.session_key ? `<span class="run-session">session: ${r.session_key.substring(0, 8)}...</span>` : ''}
                  <span class="run-time">${new Date(r.created_at).toLocaleString()}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>
  `

  bindStoryHandlers(container, storyId, story)
}

function esc(s: string): string {
  const el = document.createElement('span')
  el.textContent = s
  return el.innerHTML
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + '...' : s
}

// ── Helpers ──

function findStory(storyId: number): Story | undefined {
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    for (const proj of ws.projects ?? []) {
      for (const topic of proj.topics ?? []) {
        const s = topic.stories?.find(s => s.id === storyId)
        if (s) return s
      }
    }
  }
  return undefined
}

function findTopicForStory(storyId: number): Topic | undefined {
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    for (const proj of ws.projects ?? []) {
      for (const topic of proj.topics ?? []) {
        if (topic.stories?.some(s => s.id === storyId)) return topic.topic
      }
    }
  }
  return undefined
}

// ── Event Handlers ──

function bindStoryHandlers(container: HTMLElement, storyId: number, story: Story): void {
  const wsId = hierarchyStore.selectedWorkspaceId ?? 0

  // Bind agent
  container.querySelector('#btn-bind-agent')?.addEventListener('click', async () => {
    const select = container.querySelector('#agent-select') as HTMLSelectElement
    const agentId = parseInt(select?.value ?? '0', 10)
    if (!agentId) { toast.error('Select an agent first'); return }
    try {
      await bindAgentToStory(storyId, agentId)
      toast.ok('Agent bound')
      // Refresh profiles in store then re-render
      const profiles = await listProfiles(wsId)
      registryStore.setProfiles(wsId, profiles)
      renderStoryDetail(container, storyId)
    } catch (e: unknown) {
      toast.error(`Bind failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // Scan Local Agents → switch to Agents view
  container.querySelector('#btn-open-agents')?.addEventListener('click', () => {
    import('../main').then(({ switchView }) => switchView('agents'))
  })

  // Change agent
  container.querySelector('#btn-change-agent')?.addEventListener('click', () => {
    // Re-render with unbound state (allows changing before runs exist)
    const origProfileId = story.agent_profile_id
    story.agent_profile_id = null
    renderStoryDetail(container, storyId)
    // Restore on cancel
    const cancelBtn = container.querySelector('#btn-bind-agent')
    cancelBtn?.addEventListener('click', () => {
      story.agent_profile_id = origProfileId
    }, { once: true })
  })

  // Run
  container.querySelector('#btn-run')?.addEventListener('click', async () => {
    const prompt = (container.querySelector('#run-prompt') as HTMLTextAreaElement)?.value ?? ''
    try {
      const result = await createRun(storyId, { prompt })
      toast.ok(`Run #${result.run_id} started`)
      // Refresh runs
      const runs = await listRuns(storyId)
      registryStore.setRuns(storyId, runs)
      renderStoryDetail(container, storyId)
    } catch (e: unknown) {
      toast.error(`Run failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  // Cancel
  container.querySelector('#btn-cancel-run')?.addEventListener('click', async () => {
    const runId = parseInt((container.querySelector('#btn-cancel-run') as HTMLElement)?.dataset.runId ?? '0', 10)
    if (!runId) return
    try {
      await cancelRun(storyId, runId)
      toast.ok('Run cancelled')
      const runs = await listRuns(storyId)
      registryStore.setRuns(storyId, runs)
      renderStoryDetail(container, storyId)
    } catch (e: unknown) {
      toast.error(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}
