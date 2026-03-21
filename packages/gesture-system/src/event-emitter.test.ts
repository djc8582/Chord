import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from './event-emitter.js';

type TestEvents = {
  data: (value: number) => void;
  error: (err: Error) => void;
  done: () => void;
};

class TestEmitter extends TypedEventEmitter<TestEvents> {
  /** Expose emit publicly for testing. */
  public fireEvent<K extends keyof TestEvents>(
    event: K,
    ...args: Parameters<TestEvents[K]>
  ): void {
    this.emit(event, ...args);
  }
}

describe('TypedEventEmitter', () => {
  it('should register and call a listener', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.fireEvent('data', 42);
    expect(listener).toHaveBeenCalledWith(42);
  });

  it('should support multiple listeners for the same event', () => {
    const emitter = new TestEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('data', a);
    emitter.on('data', b);
    emitter.fireEvent('data', 7);
    expect(a).toHaveBeenCalledWith(7);
    expect(b).toHaveBeenCalledWith(7);
  });

  it('should remove a specific listener with off()', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();
    emitter.on('data', listener);
    emitter.off('data', listener);
    emitter.fireEvent('data', 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('should not throw when removing a listener that was never added', () => {
    const emitter = new TestEmitter();
    expect(() => emitter.off('data', () => {})).not.toThrow();
  });

  it('should support zero-arg events', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();
    emitter.on('done', listener);
    emitter.fireEvent('done');
    expect(listener).toHaveBeenCalled();
  });

  it('should pass Error objects to error listeners', () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();
    emitter.on('error', listener);
    const err = new Error('test');
    emitter.fireEvent('error', err);
    expect(listener).toHaveBeenCalledWith(err);
  });

  it('should removeAllListeners for a specific event', () => {
    const emitter = new TestEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('data', a);
    emitter.on('done', b);
    emitter.removeAllListeners('data');
    emitter.fireEvent('data', 1);
    emitter.fireEvent('done');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('should removeAllListeners for all events', () => {
    const emitter = new TestEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('data', a);
    emitter.on('done', b);
    emitter.removeAllListeners();
    emitter.fireEvent('data', 1);
    emitter.fireEvent('done');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('should report listenerCount correctly', () => {
    const emitter = new TestEmitter();
    expect(emitter.listenerCount('data')).toBe(0);
    const fn = vi.fn();
    emitter.on('data', fn);
    expect(emitter.listenerCount('data')).toBe(1);
    emitter.on('data', vi.fn());
    expect(emitter.listenerCount('data')).toBe(2);
    emitter.off('data', fn);
    expect(emitter.listenerCount('data')).toBe(1);
  });

  it('should swallow errors thrown by listeners', () => {
    const emitter = new TestEmitter();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    emitter.on('data', bad);
    emitter.on('data', good);
    // Should NOT throw:
    expect(() => emitter.fireEvent('data', 99)).not.toThrow();
    // The second listener should still be called:
    expect(good).toHaveBeenCalledWith(99);
  });
});
