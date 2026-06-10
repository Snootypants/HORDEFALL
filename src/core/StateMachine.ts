/**
 * Minimal generic FSM used by enemy AI and game-flow states. States are plain
 * objects with optional enter/update/exit hooks operating on a shared context.
 */

export interface StateDef<C> {
  enter?: (ctx: C) => void;
  update?: (ctx: C, dt: number) => void;
  exit?: (ctx: C) => void;
}

export class StateMachine<C, S extends string = string> {
  private readonly ctx: C;
  private readonly states: Record<string, StateDef<C>>;
  private _current: S;
  private _timeInState = 0;

  constructor(ctx: C, states: Record<S, StateDef<C>> | Record<string, StateDef<C>>, initial: S) {
    this.ctx = ctx;
    this.states = states as Record<string, StateDef<C>>;
    if (!this.states[initial]) throw new Error(`StateMachine: unknown initial state "${initial}"`);
    this._current = initial;
    this.states[initial].enter?.(this.ctx);
  }

  get current(): S {
    return this._current;
  }

  get timeInState(): number {
    return this._timeInState;
  }

  transitionTo(next: S): void {
    if (next === this._current) return;
    const target = this.states[next];
    if (!target) throw new Error(`StateMachine: unknown state "${next}"`);
    this.states[this._current].exit?.(this.ctx);
    this._current = next;
    this._timeInState = 0;
    target.enter?.(this.ctx);
  }

  update(dt: number): void {
    this._timeInState += dt;
    this.states[this._current].update?.(this.ctx, dt);
  }
}
