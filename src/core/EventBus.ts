/**
 * Typed publish/subscribe bus — the decoupling seam between sim, render, UI,
 * and audio. Systems never call each other directly for cross-cutting
 * reactions (sounds, particles, score popups); they emit events.
 *
 * Emission iterates a snapshot of the handler list so handlers may safely
 * unsubscribe (including themselves) mid-emit. Handler exceptions are caught
 * and logged so one bad listener cannot break gameplay.
 */

export type EventHandler<P> = (payload: P) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, EventHandler<never>[]>();

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    let list = this.handlers.get(event);
    if (!list) {
      list = [];
      this.handlers.set(event, list);
    }
    list.push(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as EventHandler<never>);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;
    // Snapshot so unsubscribe-during-emit cannot skip handlers.
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try {
        (snapshot[i] as EventHandler<Events[K]>)(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] handler for "${String(event)}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
