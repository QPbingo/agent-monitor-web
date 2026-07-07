// Pub/sub store base with notification batching.
//
// SSE events (deltas, snapshots) → notify()     → batched via microtask
// User actions (clicks, toggles)     → flushSync() → immediate synchronous
//
// Subscribers can check `this._sync` to decide whether to use rAF for
// expensive DOM updates (SSE batching) or render immediately (user action).
export type Listener = () => void

export class Store {
  private listeners = new Set<Listener>()
  private pending = false
  _sync = false  // true during flushSync() — read by subscribers to pick render path

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  /** Batched — coalesces rapid calls into one microtask-tick notification.
   *  Safe to call in tight SSE loops. */
  protected notify(): void {
    if (this.pending) return
    this.pending = true
    queueMicrotask(() => {
      this.pending = false
      this._sync = false
      this.emit()
    })
  }

  /** Immediate — for user actions that need frame-synchronous feedback. */
  protected flushSync(): void {
    this.pending = false
    this._sync = true
    this.emit()
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l() } catch { /* handler errors must not break other subscribers */ }
    }
  }
}
