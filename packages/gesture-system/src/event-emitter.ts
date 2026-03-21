/**
 * Minimal typed event emitter used by all tracker classes.
 */

type Listener = (...args: unknown[]) => void;

export class TypedEventEmitter<TEvents extends Record<string, Listener>> {
  private _listeners = new Map<keyof TEvents, Set<Listener>>();

  /** Register a listener for `event`. */
  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener as Listener);
  }

  /** Remove a previously registered listener. */
  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(listener as Listener);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /** Emit `event` with the provided arguments. */
  protected emit<K extends keyof TEvents>(
    event: K,
    ...args: Parameters<TEvents[K]>
  ): void {
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(...args);
        } catch {
          // Swallow listener errors so they don't break the tracking loop.
        }
      }
    }
  }

  /** Remove all listeners (optionally for a single event). */
  removeAllListeners(event?: keyof TEvents): void {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /** Return the number of listeners for `event`. */
  listenerCount(event: keyof TEvents): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}
