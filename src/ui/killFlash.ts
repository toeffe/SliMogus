export interface KillFlashHandle {
  flash: () => void;
  destroy: () => void;
}

/** Brief full-screen red flash when a kill is observed locally. */
export function createKillFlash(root: HTMLElement): KillFlashHandle {
  const el = document.createElement('div');
  el.className = 'kill-flash';
  el.hidden = true;
  root.appendChild(el);

  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    flash() {
      el.hidden = false;
      el.classList.remove('kill-flash--active');
      // Force reflow so re-adding the class restarts the CSS animation.
      void el.offsetWidth;
      el.classList.add('kill-flash--active');
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        el.hidden = true;
        el.classList.remove('kill-flash--active');
        timer = undefined;
      }, 280);
    },
    destroy: () => {
      if (timer !== undefined) clearTimeout(timer);
      el.remove();
    },
  };
}
