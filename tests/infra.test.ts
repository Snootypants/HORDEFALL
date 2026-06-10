import { describe, expect, test, vi } from 'vitest';
import { Logger, LogLevel } from '../src/core/Logger';
import { Profiler } from '../src/core/Profiler';
import { FixedTimestepLoop } from '../src/core/GameLoop';

describe('Logger', () => {
  test('filters messages below the active level', () => {
    const sink = vi.fn();
    const log = new Logger('test', LogLevel.Warn, sink);
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(sink).toHaveBeenCalledTimes(2);
  });

  test('ring buffer keeps the most recent entries up to capacity', () => {
    const log = new Logger('test', LogLevel.Debug, () => {}, 3);
    log.info('1');
    log.info('2');
    log.info('3');
    log.info('4');
    const entries = log.recent();
    expect(entries.length).toBe(3);
    expect(entries[0].message).toBe('2');
    expect(entries[2].message).toBe('4');
  });

  test('child loggers prefix their channel', () => {
    const sink = vi.fn();
    const log = new Logger('root', LogLevel.Debug, sink);
    const ai = log.child('ai');
    ai.info('thinking');
    expect(sink.mock.calls[0][0].channel).toBe('root.ai');
  });
});

describe('Profiler', () => {
  test('records section timings and exposes averages', () => {
    let fakeNow = 0;
    const prof = new Profiler(() => fakeNow);
    prof.begin('ai');
    fakeNow = 5;
    prof.end('ai');
    prof.frameDone();
    prof.begin('ai');
    fakeNow = 8; // 3ms this frame
    prof.end('ai');
    prof.frameDone();
    const ms = prof.averageMs('ai');
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5);
    expect(prof.lastMs('ai')).toBeCloseTo(3);
  });

  test('unknown sections report 0', () => {
    const prof = new Profiler(() => 0);
    expect(prof.averageMs('nope')).toBe(0);
  });
});

describe('FixedTimestepLoop', () => {
  test('runs fixed steps to consume accumulated time', () => {
    const steps: number[] = [];
    const loop = new FixedTimestepLoop(1 / 60, (dt) => steps.push(dt));
    loop.advance(1 / 60 * 3 + 0.001);
    expect(steps.length).toBe(3);
    expect(steps[0]).toBeCloseTo(1 / 60);
  });

  test('clamps huge frame spikes to maxSteps (no spiral of death)', () => {
    let count = 0;
    const loop = new FixedTimestepLoop(1 / 60, () => count++, 5);
    loop.advance(2.0); // 120 steps worth
    expect(count).toBe(5);
  });

  test('alpha exposes interpolation fraction of a partial step', () => {
    const loop = new FixedTimestepLoop(0.1, () => {});
    loop.advance(0.15);
    expect(loop.alpha).toBeCloseTo(0.5);
  });
});
