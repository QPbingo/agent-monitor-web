import { hierarchyStore, type ProjectNode, type TopicNode, type Story } from '../state/hierarchy'
import { registryStore } from '../state/registry'
import { esc } from '../utils/format'

// ── Public API ──

export function renderProjectBoard(container: HTMLElement, projectId: number): void {
  const project = findProject(projectId)
  if (!project) {
    container.innerHTML = '<div class="empty-state"><h3>Project not found</h3></div>'
    return
  }

  const topics = project.topics || []

  container.innerHTML = `
    <div class="board-shell">
      <div class="board-header">
        <h2>${esc(project.project.name)}</h2>
        ${project.project.description ? `<p class="board-header-desc">${esc(project.project.description)}</p>` : ''}
        <span class="board-header-count">${topics.length} topic${topics.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="board-lanes">
        ${topics.length === 0
          ? '<div class="empty-state"><p>No topics yet</p></div>'
          : topics.map(t => renderTopicLane(t)).join('')
        }
      </div>
    </div>
  `

  bindBoardHandlers(container)
}

export function renderTopicBoard(container: HTMLElement, topicId: number): void {
  const topicNode = findTopicNode(topicId)
  if (!topicNode) {
    container.innerHTML = '<div class="empty-state"><h3>Topic not found</h3></div>'
    return
  }

  const stories = topicNode.stories || []

  container.innerHTML = `
    <div class="board-shell">
      <div class="board-header">
        <h2>${esc(topicNode.topic.name)}</h2>
        ${topicNode.topic.description ? `<p class="board-header-desc">${esc(topicNode.topic.description)}</p>` : ''}
        <span class="board-header-count">${stories.length} ${stories.length === 1 ? 'story' : 'stories'}</span>
      </div>
      <div class="board-lanes">
        ${stories.length === 0
          ? '<div class="empty-state"><p>No stories yet</p></div>'
          : `<div class="topic-lane">
              <div class="topic-lane-stories">
                ${stories.map(s => renderStoryCard(s)).join('')}
              </div>
            </div>`
        }
      </div>
    </div>
  `

  bindBoardHandlers(container)
}

// ── Internal render helpers ──

function renderTopicLane(topicNode: TopicNode): string {
  const stories = topicNode.stories || []
  return `
    <div class="topic-lane">
      <div class="topic-lane-header">
        <span class="topic-lane-name">${esc(topicNode.topic.name)}</span>
        <span class="topic-lane-count">${stories.length}</span>
      </div>
      <div class="topic-lane-stories">
        ${stories.length === 0
          ? '<div class="topic-lane-empty">No stories</div>'
          : stories.map(s => renderStoryCard(s)).join('')
        }
      </div>
    </div>
  `
}

function renderStoryCard(story: Story): string {
  const agentName = story.agent_profile_id
    ? (registryStore.getProfile(story.agent_profile_id)?.name || 'No Agent')
    : 'No Agent'
  const sessionKey = story.latest_session_key
    ? story.latest_session_key.slice(0, 8)
    : 'No session'
  const storyStatus = story.status || 'open'
  const runStatus = story.latest_run_status || 'not_run'

  return `
    <div class="story-card" data-story-id="${story.id}">
      <div class="story-card-name">${esc(story.name)}</div>
      <div class="story-card-meta">
        <span class="story-agent">${esc(agentName)}</span>
        <span class="story-session">${esc(sessionKey)}</span>
      </div>
      <div class="story-card-status">
        <span class="status-badge story-badge-${storyStatus}">${esc(storyStatus)}</span>
        <span class="status-badge run-badge-${runStatus}">${esc(runStatus)}</span>
      </div>
    </div>
  `
}

// ── Click handling ──

function bindBoardHandlers(container: HTMLElement): void {
  container.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-story-id]')
    if (!card) return
    const storyId = parseInt(card.dataset.storyId!, 10)
    if (!storyId) return
    import('../main').then(({ showStoryDetail }) => showStoryDetail(storyId)).catch(() => {
      // Fallback if main module not available (e.g. in tests)
      hierarchyStore.selectStory(storyId)
    })
  })
}

// ── Tree search helpers ──

function findProject(projectId: number): ProjectNode | undefined {
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    const p = ws.projects?.find(p => p.project.id === projectId)
    if (p) return p
  }
  return undefined
}

function findTopicNode(topicId: number): TopicNode | undefined {
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    for (const proj of ws.projects ?? []) {
      const t = proj.topics?.find(t => t.topic.id === topicId)
      if (t) return t
    }
  }
  return undefined
}
