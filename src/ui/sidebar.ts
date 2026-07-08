import { hierarchyStore, type ProjectNode, type TopicNode } from '../state/hierarchy'
import { esc } from '../utils/format'
import { showCreateModal } from './modals'

// JS hover tracking — survives SSE-driven innerHTML rebuilds.
let hoveredTreeId: string | null = null

function initTreeHoverTracking(container: HTMLElement): void {
  if ((container as unknown as { _hoverWired?: boolean })._hoverWired) return
  ;(container as unknown as { _hoverWired?: boolean })._hoverWired = true
  container.addEventListener('mouseover', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.tree-item')
    if (!item) return
    const id = item.dataset.id
    if (!id || id === hoveredTreeId) return
    if (hoveredTreeId) {
      container.querySelector(`.tree-item[data-id="${CSS.escape(hoveredTreeId)}"]`)?.classList.remove('hover')
    }
    hoveredTreeId = id
    item.classList.add('hover')
  })
  container.addEventListener('mouseout', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.tree-item')
    if (!item) return
    const related = (e as MouseEvent).relatedTarget as HTMLElement | null
    if (related && item.contains(related)) return
    const id = item.dataset.id
    if (id && id === hoveredTreeId) {
      item.classList.remove('hover')
      hoveredTreeId = null
    }
  })
}

export function renderSidebar(): void {
  const tree = hierarchyStore.tree
  const container = document.getElementById('sidebar-tree')
  if (!container || !tree || !tree.workspaces) return

  initTreeHoverTracking(container)

  const ws = tree.workspaces.find((w) => w.workspace.id === hierarchyStore.selectedWorkspaceId)
  if (!ws) { container.innerHTML = ''; hoveredTreeId = null; return }

  let html = ''
  if (ws.projects) {
    for (const proj of ws.projects) html += renderProjectNode(proj)
  }

  container.innerHTML = html
  // Re-apply hover after DOM rebuild.
  if (hoveredTreeId) {
    const el = container.querySelector(`.tree-item[data-id="${CSS.escape(hoveredTreeId)}"]`)
    if (el) el.classList.add('hover')
  }
}

export function bindTreeHandlers(): void {
  const container = document.getElementById('sidebar-tree')
  if (!container) return
  bindTreeEventDelegation(container)
}

function renderProjectNode(proj: ProjectNode): string {
  const pId = 'proj_' + proj.project.id
  const pOpen = hierarchyStore.expandedNodes[pId] !== false
  const sel = hierarchyStore.selectedTopicId === null && !hierarchyStore.selectedStoryId ? ' active' : ''
  let h = `<div class="tree-item${sel}" data-action="toggle-proj" data-id="${pId}">
    <span class="dot project"></span>${esc(proj.project.name)}
    <span class="add-child" data-action="create-topic" data-id="${proj.project.id}" role="button" tabindex="0" aria-label="Add topic to ${esc(proj.project.name)}">+</span>
  </div>`
  if (proj.topics && proj.topics.length > 0) {
    h += `<div class="tree-children${pOpen ? ' open' : ''}" id="${pId}">`
    for (const topic of proj.topics) h += renderTopicNode(topic)
    h += '</div>'
  }
  return h
}

function renderTopicNode(topic: TopicNode): string {
  const sel = hierarchyStore.selectedTopicId === topic.topic.id ? ' active' : ''
  let h = `<div class="tree-item child${sel}" data-action="select-topic" data-id="${topic.topic.id}">
    <span class="dot service"></span>${esc(topic.topic.name)}
  </div>`
  if (topic.stories && topic.stories.length > 0) {
    h += '<div class="tree-stories">'
    for (const story of topic.stories) {
      const sSel = hierarchyStore.selectedStoryId === story.id ? ' active' : ''
      h += `<div class="tree-item story-item${sSel}" data-action="select-story" data-id="${story.id}">
        <span class="dot story-dot"></span>${esc(story.name)}
        ${story.agent_profile_id ? '<span class="story-agent-badge">agent</span>' : ''}
      </div>`
    }
    h += '</div>'
  }
  return h
}

function bindTreeEventDelegation(container: HTMLElement): void {
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLElement>('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    const id = btn.dataset.id ?? ''
    switch (action) {
      case 'toggle-proj':
        hierarchyStore.toggleNode(id)
        break
      case 'select-topic':
        hierarchyStore.selectTopic(parseInt(id, 10), '')
        break
      case 'select-story':
        hierarchyStore.selectStory(parseInt(id, 10))
        break
      case 'create-topic':
        e.stopPropagation()
        showCreateModal('topic', parseInt(id, 10))
        break
    }
  })
}
