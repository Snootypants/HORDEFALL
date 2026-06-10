/**
 * Central UI sound routing. The UI layer never touches AudioManager — the
 * Game registers one hook at boot and every menu click/hover flows through
 * it (including outside runs, when no sim event bus exists).
 */

export type UiSoundKind = 'click' | 'hover';

let hook: ((kind: UiSoundKind) => void) | null = null;

export function setUiSoundHook(fn: ((kind: UiSoundKind) => void) | null): void {
  hook = fn;
}

export function playUiSound(kind: UiSoundKind): void {
  hook?.(kind);
}
