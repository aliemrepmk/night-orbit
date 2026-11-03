/**
 * Typed publish/subscribe for "something happened" messages (PLAN.md §6). Systems emit events
 * without knowing who listens (audio, stats, radio and HUD subscribe independently).
 */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Subscribes to an event. Returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers can unsubscribe (or subscribe) while the event is being delivered.
    for (const h of [...set]) (h as (p: Events[K]) => void)(payload);
  }

  /** Removes every handler (e.g. on mission restart). */
  clear(): void {
    this.handlers.clear();
  }
}
