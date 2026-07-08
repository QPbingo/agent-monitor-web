import { Store } from './store'
import type { SSEEvent } from '../sse/manager'
import type {
  Runtime, Capability, AgentProfile, StoryRun,
} from '../api/registry'

class RegistryStore extends Store {
  runtime: Runtime | null = null
  capabilities: Capability[] = []
  profilesByWorkspace: Record<number, AgentProfile[]> = {}
  runsByStory: Record<number, StoryRun[]> = {}
  selectedProfileId: number | null = null

  applyEvent(event: SSEEvent): void {
    switch (event.type) {
      case 'agent_registry_snapshot': {
        this.runtime = (event.runtime as Runtime) ?? null
        this.capabilities = (event.capabilities as Capability[]) ?? []
        this.notify()
        break
      }
      case 'agent_capabilities_updated': {
        this.capabilities = (event as unknown as Capability[]) ?? []
        this.notify()
        break
      }
      case 'agent_profile_updated': {
        // Profile update may come as the full profile object or null (refresh needed)
        const profile = event as unknown as AgentProfile | null
        if (profile && profile.workspace_id) {
          this.upsertProfile(profile)
        }
        this.notify()
        break
      }
      case 'story_run_started':
      case 'story_run_updated': {
        const run = event as unknown as StoryRun
        if (run && run.story_id) {
          this.upsertRun(run)
        }
        this.notify()
        break
      }
    }
  }

  // ── Profiles ──

  setProfiles(workspaceId: number, profiles: AgentProfile[]): void {
    this.profilesByWorkspace[workspaceId] = profiles
    this.notify()
  }

  upsertProfile(profile: AgentProfile): void {
    const ws = profile.workspace_id
    if (!this.profilesByWorkspace[ws]) {
      this.profilesByWorkspace[ws] = []
    }
    const idx = this.profilesByWorkspace[ws].findIndex(p => p.id === profile.id)
    if (idx >= 0) {
      this.profilesByWorkspace[ws][idx] = profile
    } else {
      this.profilesByWorkspace[ws].push(profile)
    }
  }

  removeProfile(id: number, workspaceId: number): void {
    const ws = this.profilesByWorkspace[workspaceId]
    if (ws) {
      this.profilesByWorkspace[workspaceId] = ws.filter(p => p.id !== id)
    }
  }

  profilesForWorkspace(workspaceId: number): AgentProfile[] {
    return this.profilesByWorkspace[workspaceId] ?? []
  }

  getProfile(id: number): AgentProfile | undefined {
    for (const ws of Object.values(this.profilesByWorkspace)) {
      const p = ws.find(p => p.id === id)
      if (p) return p
    }
    return undefined
  }

  selectProfile(id: number | null): void {
    this.selectedProfileId = id
    this.flushSync()
  }

  // ── Runs ──

  setRuns(storyId: number, runs: StoryRun[]): void {
    this.runsByStory[storyId] = runs
    this.notify()
  }

  upsertRun(run: StoryRun): void {
    if (!this.runsByStory[run.story_id]) {
      this.runsByStory[run.story_id] = []
    }
    const idx = this.runsByStory[run.story_id].findIndex(r => r.id === run.id)
    if (idx >= 0) {
      this.runsByStory[run.story_id][idx] = run
    } else {
      this.runsByStory[run.story_id].push(run)
    }
  }

  runsForStory(storyId: number): StoryRun[] {
    return this.runsByStory[storyId] ?? []
  }

  runsForProfile(profileId: number): StoryRun[] {
    const runs: StoryRun[] = []
    for (const rs of Object.values(this.runsByStory)) {
      for (const r of rs) {
        if (r.agent_profile_id === profileId) {
          runs.push(r)
        }
      }
    }
    runs.sort((a, b) => b.id - a.id)
    return runs
  }
}

export const registryStore = new RegistryStore()
