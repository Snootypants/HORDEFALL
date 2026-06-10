import { describe, expect, test, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';

interface TestEvents {
  'enemy:died': { id: number; score: number };
  'wave:start': { wave: number };
  [key: string]: unknown;
}

describe('EventBus', () => {
  test('emit delivers payload to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('enemy:died', fn);
    bus.emit('enemy:died', { id: 3, score: 10 });
    expect(fn).toHaveBeenCalledWith({ id: 3, score: 10 });
  });

  test('off unsubscribes', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('wave:start', fn);
    bus.off('wave:start', fn);
    bus.emit('wave:start', { wave: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  test('on returns an unsubscribe function', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const unsub = bus.on('wave:start', fn);
    unsub();
    bus.emit('wave:start', { wave: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  test('once fires exactly one time', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('wave:start', fn);
    bus.emit('wave:start', { wave: 1 });
    bus.emit('wave:start', { wave: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('unsubscribing during emit does not skip other handlers', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const unsubA = bus.on('wave:start', () => {
      calls.push('a');
      unsubA();
    });
    bus.on('wave:start', () => calls.push('b'));
    bus.emit('wave:start', { wave: 1 });
    expect(calls).toEqual(['a', 'b']);
    bus.emit('wave:start', { wave: 2 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  test('a throwing handler does not break other handlers', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('wave:start', () => {
      throw new Error('boom');
    });
    bus.on('wave:start', fn);
    expect(() => bus.emit('wave:start', { wave: 1 })).not.toThrow();
    expect(fn).toHaveBeenCalled();
  });

  test('clear removes all handlers', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on('wave:start', fn);
    bus.clear();
    bus.emit('wave:start', { wave: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
