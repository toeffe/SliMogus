import type { Role } from '@game/roles';

export interface RoleRevealHandle {
  destroy: () => void;
}

const DEFAULT_DURATION_MS = 3000;

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  crewmate: 'Crewmate',
  impostor: 'Impostor',
};

const ROLE_HINT: Readonly<Record<Role, string>> = {
  crewmate: 'Complete tasks and find the impostor.',
  impostor: 'Blend in, sabotage, and eliminate the crew.',
};

/**
 * Brief "You are Crewmate/Impostor" overlay shown once at the start of a
 * game. Auto-dismisses after `durationMs`, or immediately on click/tap —
 * whichever comes first (clearing the pending timeout either way, so
 * `destroy` never double-removes an already-removed element).
 */
export function showRoleReveal(
  root: HTMLElement,
  role: Role,
  durationMs = DEFAULT_DURATION_MS,
  onDismiss?: () => void,
): RoleRevealHandle {
  const el = document.createElement('div');
  el.className = `role-reveal role-reveal--${role}`;
  el.innerHTML = `
    <div class="role-reveal__card">
      <p class="role-reveal__label">You are</p>
      <h1 class="role-reveal__role">${ROLE_LABEL[role]}</h1>
      <p class="role-reveal__hint">${ROLE_HINT[role]}</p>
    </div>
  `;
  root.appendChild(el);
  // Notify listeners (e.g. pointer-lock UI) that a blocking overlay appeared.
  window.dispatchEvent(new Event('slimogus:overlay-changed'));

  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(timeoutId);
    el.remove();
    window.dispatchEvent(new Event('slimogus:overlay-changed'));
    onDismiss?.();
  };
  const timeoutId = window.setTimeout(dismiss, durationMs);
  el.addEventListener('click', dismiss);

  return { destroy: dismiss };
}
