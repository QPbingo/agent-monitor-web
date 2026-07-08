import { API_BASE, SSE_PATH } from '../config'
import { Store } from '../state/store'

export type SSEEventType =
  | 'snapshot'
  | 'session_added'
  | 'delta'
  | 'hierarchy_snapshot'
  | 'hierarchy_updated'
  | 'agent_executions'
  | 'agent_exec_started'
  | 'agent_session_created'
  | 'agent_message'
  | 'agent_error'
  | 'agent_cancelled'
  // Agent Registry
  | 'agent_registry_snapshot'
  | 'agent_profile_updated'
  | 'agent_capabilities_updated'
  // Story Runs
  | 'story_run_started'
  | 'story_run_updated'

export interface SSEEvent {
  type: SSEEventType
  [key: string]: unknown
}

export type SSEHandler = (event: SSEEvent) => void

// Connection states surfaced to the UI. `disconnected` covers both "never
// opened" and "closed + waiting for retry" so the indicator pill is a single
// uni-polar flag instead of a tri-state.
export type SSEStatus = 'disconnected' | 'connecting' | 'connected'

// Heartbeat / timeout tuning. Server sends `: ping` SSE comments every 25s;
// if we receive nothing (data or comment) for 60s we treat the connection as
// dead and force reconnect.
const DEAD_TIMEOUT_MS = 60_000

// SSEStatusBus is a tiny pub/sub for status changes. SSEManager writes,
// ConnectionIndicator reads. Keeping it separate from the SSEManager's
// event stream avoids UI coupling to private internals.
class SSEStatusBus extends Store {
  private _current: SSEStatus = 'disconnected'
  current(): SSEStatus { return this._current }
  set(s: SSEStatus): void {
    if (s === this._current) return
    this._current = s
    this.notify()
  }
}
export const sseStatusBus = new SSEStatusBus()

// SSEManager owns the EventSource connection and dispatches parsed events to
// registered handlers. It also coordinates multi-tab sharing via
// BroadcastChannel: only the "leader" tab holds an actual EventSource; other
// tabs receive events relayed over BroadcastChannel.
//
// Leader election (BC-02/03/04):
//   - The leader broadcasts a heartbeat every 3s.
//   - A follower that does not see a leader heartbeat for 5s becomes leader.
//   - When the leader tab closes (beforeunload), it broadcasts `leader_gone`
//     so a follower can take over quickly.
export class SSEManager {
  private es: EventSource | null = null
  private handlers = new Set<SSEHandler>()
  private deadTimer: ReturnType<typeof setTimeout> | null = null
  private bc: BroadcastChannel | null = null
  private leaderHeartbeat: ReturnType<typeof setInterval> | null = null
  private followerWait: ReturnType<typeof setTimeout> | null = null
  private isLeader = false
  private disposed = false
  private closeRetries = 0
  private retryCooldown: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.initBroadcastChannel()
  }

  connect(): void {
    if (this.disposed) return
    sseStatusBus.set('connecting')
    if (this.bc) {
      // Ask if there's already a leader; wait briefly before self-promoting.
      this.bc.postMessage({ kind: 'whois_leader' })
      this.followerWait = setTimeout(() => this.becomeLeader(), 500)
    } else {
      // No BroadcastChannel — always leader (single-tab fallback).
      this.becomeLeader()
    }
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return
    try {
      this.bc = new BroadcastChannel('agent-monitor-sse')
      this.bc.onmessage = (e) => this.onBCMessage(e.data)
      window.addEventListener('beforeunload', () => {
        if (this.isLeader) this.bc?.postMessage({ kind: 'leader_gone' })
      })
    } catch {
      // Some browsers expose BroadcastChannel but constructing it throws
      // (e.g. private-mode Safari). Fall back to single-tab mode.
      this.bc = null
    }
  }

  private onBCMessage(msg: { kind: string; event?: SSEEvent }): void {
    switch (msg.kind) {
      case 'leader_here':
        if (this.followerWait) {
          clearTimeout(this.followerWait)
          this.followerWait = null
        }
        break
      case 'leader_heartbeat':
        if (this.followerWait) clearTimeout(this.followerWait)
        this.followerWait = setTimeout(() => this.becomeLeader(), 5_000)
        break
      case 'leader_gone':
      case 'whois_leader':
        if (this.isLeader) this.bc?.postMessage({ kind: 'leader_here' })
        if (msg.kind === 'leader_gone' && !this.isLeader) {
          if (this.followerWait) clearTimeout(this.followerWait)
          this.followerWait = setTimeout(() => this.becomeLeader(), 200)
        }
        break
      case 'relay_event':
        if (msg.event) this.dispatch(msg.event)
        break
    }
  }

  private becomeLeader(): void {
    if (this.isLeader) return
    this.isLeader = true
    this.bc?.postMessage({ kind: 'leader_here' })
    this.leaderHeartbeat = setInterval(() => {
      this.bc?.postMessage({ kind: 'leader_heartbeat' })
    }, 3_000)
    this.openEventSource()
  }

  private openEventSource(): void {
    if (this.es) this.es.close()
    sseStatusBus.set('connecting')
    const url = API_BASE + SSE_PATH
    try {
      this.es = new EventSource(url, { withCredentials: true })
    } catch {
      // EventSource undefined in some restricted environments.
      sseStatusBus.set('disconnected')
      this.dispatch({ type: 'agent_error', error: 'EventSource unsupported' } as SSEEvent)
      return
    }

    this.es.onopen = () => {
      this.closeRetries = 0
      sseStatusBus.set('connected')
      this.resetDeadTimer()
    }

    this.es.onmessage = (e) => {
      this.resetDeadTimer()
      this.closeRetries = 0  // reset on successful message receipt
      try {
        const event = JSON.parse(e.data) as SSEEvent
        this.dispatch(event)
        this.bc?.postMessage({ kind: 'relay_event', event })
      } catch {
        // ignore malformed
      }
    }

    this.es.onerror = () => {
      // CLOSED may be a transient network blip / daemon restart, not
      // necessarily auth failure. Retry a few times before giving up.
      if (this.es?.readyState === 2) {
        this.clearDeadTimer()
        this.closeRetries = (this.closeRetries || 0) + 1
        if (this.closeRetries >= 3) {
          sseStatusBus.set('disconnected')
          if (this.es) { this.es.close(); this.es = null }
          this.dispatch({ type: 'agent_error', error: 'sse_connection_lost' } as SSEEvent)
          // Schedule a cooldown recovery: reset retry counter after 30s so
          // a later manual reconnect (e.g. user clicks "Retry") doesn't start
          // with exhausted retries (BUG-004).
          this.retryCooldown = setTimeout(() => {
            this.closeRetries = 0
          }, 30_000)
          return
        }
        sseStatusBus.set('connecting')
        setTimeout(() => this.openEventSource(), 1500)
        return
      }
      // CONNECTING state → EventSource is retrying; just mark us as connecting.
      sseStatusBus.set('connecting')
      this.resetDeadTimer()
    }
    this.resetDeadTimer()
  }

  private resetDeadTimer(): void {
    if (this.deadTimer) clearTimeout(this.deadTimer)
    this.deadTimer = setTimeout(() => {
      // No traffic for DEAD_TIMEOUT_MS — force reconnect.
      // Capture + null the EventSource reference before close() so the old
      // ES's async onerror callback doesn't read this.es after it's already
      // been replaced by openEventSource() (BUG-003: dead-timer race).
      const old = this.es
      this.es = null
      if (old) old.close()
      this.openEventSource()
    }, DEAD_TIMEOUT_MS)
  }

  private clearDeadTimer(): void {
    if (this.deadTimer) clearTimeout(this.deadTimer)
    this.deadTimer = null
  }

  private dispatch(event: SSEEvent): void {
    for (const h of this.handlers) {
      try {
        h(event)
      } catch {
        // handler errors must not break other handlers
      }
    }
  }

  on(handler: SSEHandler): void {
    this.handlers.add(handler)
  }

  off(handler: SSEHandler): void {
    this.handlers.delete(handler)
  }

  close(): void {
    this.disposed = true
    this.clearDeadTimer()
    if (this.retryCooldown) { clearTimeout(this.retryCooldown); this.retryCooldown = null }
    if (this.leaderHeartbeat) clearInterval(this.leaderHeartbeat)
    if (this.followerWait) clearTimeout(this.followerWait)
    if (this.es) this.es.close()
    this.es = null
    if (this.isLeader && this.bc) this.bc.postMessage({ kind: 'leader_gone' })
    if (this.bc) {
      try { this.bc.close() } catch { /* ignore */ }
    }
    this.bc = null
    sseStatusBus.set('disconnected')
  }
}