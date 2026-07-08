import { registryStore } from '../state/registry'
import { hierarchyStore } from '../state/hierarchy'
import {
  scanCapabilities, listProfiles, createProfile, updateProfile, deleteProfile,
} from '../api/registry'
import { toast } from './toast'

let selectedProfileId: number | null = null

// ── Main Render ──

export function renderAgentsView(container: HTMLElement): void {
  const wsId = hierarchyStore.selectedWorkspaceId ?? 0
  const { runtime, capabilities } = registryStore
  const profiles = registryStore.profilesForWorkspace(wsId)

  const runtimeName = runtime?.name ?? runtime?.hostname ?? 'unknown'
  const runtimeOnline = runtime != null

  container.innerHTML = `
    <div class="agents-view">
      <div class="agents-header">
        <h2 class="agents-title">Agents</h2>
        <div class="agents-runtime">
          <span class="status-dot ${runtimeOnline ? 'active' : ''}">●</span>
          ${runtimeName}
        </div>
        <button class="btn btn-primary" id="btn-scan">Scan Local Agents</button>
      </div>

      <div class="agents-grid">
        <div class="agents-capabilities" id="agents-capabilities">
          <h3>Capabilities</h3>
          ${capabilities.length === 0
            ? '<p class="text-muted">No capabilities detected. Click "Scan Local Agents" to detect installed agents.</p>'
            : capabilities.map(c => `
              <div class="cap-item">
                <span class="cap-provider">${c.provider}</span>
                <span class="cap-status ${c.available ? 'ok' : 'err'}">${c.available ? '✓ available' : '✗ not found'}</span>
                <span class="cap-version">${c.version}</span>
                <span class="cap-auth ${c.auth_status}">auth: ${c.auth_status}</span>
              </div>
            `).join('')}
        </div>

        <div class="agents-profiles" id="agents-profiles">
          <div class="agents-profiles-header">
            <h3>Profiles</h3>
            <button class="btn btn-small" id="btn-new-profile">+ New Profile</button>
          </div>
          ${profiles.length === 0
            ? '<p class="text-muted">No agent profiles in this workspace.</p>'
            : profiles.map(p => `
              <div class="profile-item ${p.id === selectedProfileId ? 'selected' : ''} ${p.status === 'disabled' ? 'disabled' : ''}"
                   data-profile-id="${p.id}">
                <div class="profile-name">${esc(p.name)}</div>
                <div class="profile-provider">${p.provider}</div>
                <div class="profile-status ${p.status}">${p.status}</div>
              </div>
            `).join('')}
        </div>
      </div>

      <div class="profile-editor" id="profile-editor" style="display:none">
        <!-- Populated when a profile is selected or "New" is clicked -->
      </div>
    </div>
  `

  bindHandlers(container)
}

function esc(s: string): string {
  const el = document.createElement('span')
  el.textContent = s
  return el.innerHTML
}

// ── Event Binding ──

function bindHandlers(container: HTMLElement): void {
  container.querySelector('#btn-scan')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-scan') as HTMLButtonElement
    btn.disabled = true
    btn.textContent = 'Scanning...'
    try {
      const result = await scanCapabilities()
      if (result) {
        registryStore.runtime = result.runtime
        registryStore.capabilities = result.capabilities
        toast.ok('Scan complete')
        renderAgentsView(container)
      }
    } catch (e: unknown) {
      toast.error(`Scan failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      btn.disabled = false
      btn.textContent = 'Scan Local Agents'
    }
  })

  container.querySelector('#btn-new-profile')?.addEventListener('click', () => {
    selectedProfileId = null
    renderProfileEditor(container)
  })

  container.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt((el as HTMLElement).dataset.profileId ?? '0', 10)
      selectedProfileId = id
      registryStore.selectProfile(id)
      renderProfileEditor(container)
      // Re-highlight
      container.querySelectorAll('.profile-item').forEach(e => e.classList.remove('selected'))
      el.classList.add('selected')
    })
  })
}

// ── Profile Editor ──

function renderProfileEditor(container: HTMLElement): void {
  const editor = container.querySelector('#profile-editor') as HTMLElement
  if (!editor) return

  const profile = selectedProfileId ? registryStore.getProfile(selectedProfileId) : null

  editor.style.display = 'block'
  editor.innerHTML = `
    <h3>${profile ? 'Edit Profile' : 'New Profile'}</h3>
    <form id="profile-form">
      <label>Name <input type="text" name="name" value="${esc(profile?.name ?? '')}" required></label>
      <label>Provider
        <select name="provider">
          ${['claude', 'codex', 'opencode'].map(p =>
            `<option value="${p}" ${profile?.provider === p ? 'selected' : ''}>${p}</option>`
          ).join('')}
        </select>
      </label>
      <label>Description <input type="text" name="description" value="${esc(profile?.description ?? '')}"></label>
      <label>Default CWD <input type="text" name="default_cwd" value="${esc(profile?.default_cwd ?? '')}"></label>
      <label>Model <input type="text" name="model" value="${esc(profile?.model ?? '')}"></label>
      <label>Permission Mode <input type="text" name="permission_mode" value="${esc(profile?.permission_mode ?? '')}"></label>
      <label>System Prompt <textarea name="system_prompt" rows="3">${esc(profile?.system_prompt ?? '')}</textarea></label>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${profile ? 'Update' : 'Create'}</button>
        ${profile ? '<button type="button" class="btn btn-danger" id="btn-disable-profile">Disable</button>' : ''}
        <button type="button" class="btn" id="btn-cancel-edit">Cancel</button>
      </div>
    </form>
  `

  const form = editor.querySelector('#profile-form') as HTMLFormElement
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const data = new FormData(form)
    const input = {
      name: data.get('name') as string,
      provider: data.get('provider') as string,
      description: data.get('description') as string,
      default_cwd: data.get('default_cwd') as string,
      model: data.get('model') as string,
      permission_mode: data.get('permission_mode') as string,
      system_prompt: data.get('system_prompt') as string,
    }

    const wsId = hierarchyStore.selectedWorkspaceId ?? 0
    try {
      if (profile) {
        await updateProfile(profile.id, input)
        toast.ok('Profile updated')
      } else {
        await createProfile(wsId, input)
        toast.ok('Profile created')
      }
      // Refresh
      const profiles = await listProfiles(wsId)
      registryStore.setProfiles(wsId, profiles)
      selectedProfileId = null
      renderAgentsView(container)
    } catch (e: unknown) {
      toast.error(`${profile ? 'Update' : 'Create'} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  editor.querySelector('#btn-cancel-edit')?.addEventListener('click', () => {
    selectedProfileId = null
    renderAgentsView(container)
  })

  editor.querySelector('#btn-disable-profile')?.addEventListener('click', async () => {
    if (!profile) return
    try {
      await deleteProfile(profile.id)
      toast.ok('Profile disabled')
      const wsId = hierarchyStore.selectedWorkspaceId ?? 0
      const profiles = await listProfiles(wsId)
      registryStore.setProfiles(wsId, profiles)
      selectedProfileId = null
      renderAgentsView(container)
    } catch (e: unknown) {
      toast.error(`Disable failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}
