import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Camera, Scene } from 'three';

export interface NameTagLayer {
  readonly renderer: CSS2DRenderer;
  acquire: (name: string) => CSS2DObject;
  release: (obj: CSS2DObject) => void;
  render: (scene: Scene, camera: Camera) => void;
  setSize: (width: number, height: number) => void;
  destroy: () => void;
}

export function createNameTagLayer(container: HTMLElement): NameTagLayer {
  const renderer = new CSS2DRenderer();
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight,
  );
  renderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
  container.appendChild(renderer.domElement);

  return {
    renderer,
    acquire: (name) => {
      const el = document.createElement('div');
      el.className = 'three-nametag';
      el.textContent = name;
      el.style.cssText =
        'color:#e8e0d4;font:600 12px JetBrains Mono,monospace;text-shadow:0 1px 3px #000;white-space:nowrap;transform:translateY(-18px);';
      return new CSS2DObject(el);
    },
    release: (obj) => {
      obj.element.remove();
      obj.removeFromParent();
    },
    render: (scene, camera) => renderer.render(scene, camera),
    setSize: (w, h) => renderer.setSize(w, h),
    destroy: () => {
      renderer.domElement.remove();
    },
  };
}
