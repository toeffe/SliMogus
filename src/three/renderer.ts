import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';

export interface ThreeRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  setSize: (width: number, height: number) => void;
  destroy: () => void;
}

export async function createThreeRenderer(container: HTMLElement): Promise<ThreeRenderer> {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight,
  );
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x04060c, 1);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;';
  container.appendChild(renderer.domElement);

  return {
    renderer,
    canvas: renderer.domElement,
    setSize: (width, height) => {
      renderer.setSize(width, height, false);
    },
    destroy: () => {
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
