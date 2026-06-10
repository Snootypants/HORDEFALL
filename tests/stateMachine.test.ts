import { describe, expect, test, vi } from 'vitest';
import { StateMachine } from '../src/core/StateMachine';

type Ctx = { log: string[] };

describe('StateMachine', () => {
  function make() {
    const ctx: Ctx = { log: [] };
    const sm = new StateMachine<Ctx>(ctx, {
      idle: {
        enter: (c) => c.log.push('idle:enter'),
        update: (c) => c.log.push('idle:update'),
        exit: (c) => c.log.push('idle:exit'),
      },
      chase: {
        enter: (c) => c.log.push('chase:enter'),
        update: (c) => c.log.push('chase:update'),
      },
    }, 'idle');
    return { ctx, sm };
  }

  test('starts in initial state and calls its enter', () => {
    const { ctx, sm } = make();
    expect(sm.current).toBe('idle');
    expect(ctx.log).toEqual(['idle:enter']);
  });

  test('transition calls exit then enter', () => {
    const { ctx, sm } = make();
    sm.transitionTo('chase');
    expect(sm.current).toBe('chase');
    expect(ctx.log).toEqual(['idle:enter', 'idle:exit', 'chase:enter']);
  });

  test('update delegates to current state and accumulates time', () => {
    const { ctx, sm } = make();
    sm.update(0.5);
    sm.update(0.25);
    expect(ctx.log).toContain('idle:update');
    expect(sm.timeInState).toBeCloseTo(0.75);
  });

  test('transition resets timeInState', () => {
    const { sm } = make();
    sm.update(1.0);
    sm.transitionTo('chase');
    expect(sm.timeInState).toBe(0);
  });

  test('transition to same state is a no-op by default', () => {
    const { ctx, sm } = make();
    sm.transitionTo('idle');
    expect(ctx.log).toEqual(['idle:enter']);
  });

  test('transition to unknown state throws', () => {
    const { sm } = make();
    expect(() => sm.transitionTo('flying' as any)).toThrow();
  });
});
