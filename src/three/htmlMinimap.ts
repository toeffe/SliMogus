import type { TileMap } from '@sim/tilemap';
import type { ViewSnapshot } from '@game/viewSnapshot';

const SIZE = 200;
const MARGIN = 12;

export interface HtmlMinimap {
  update: (snapshot: ViewSnapshot) => void;
  destroy: () => void;
}

/** Short labels so cramped rooms still read on a 200px map. */
function roomLabel(name: string): string {
  if (name === 'Upper Engine') return 'Engine';
  return name;
}

/** Screen-fixed canvas minimap (avoids 3D minimap complexity). */
export function createHtmlMinimap(root: HTMLElement, tileMap: TileMap): HtmlMinimap {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.className = 'three-minimap';
  canvas.style.cssText = `position:fixed;top:${MARGIN}px;right:${MARGIN}px;width:${SIZE}px;height:${SIZE}px;z-index:12;border:2px solid #5a5348;border-radius:4px;pointer-events:none;background:#12100e;`;
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const scale =
    SIZE / Math.max(tileMap.width * tileMap.tileSize, tileMap.height * tileMap.tileSize);

  const update = (snapshot: ViewSnapshot): void => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(18,16,14,0.9)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (const room of tileMap.rooms) {
      const x = room.x0 * tileMap.tileSize * scale;
      const y = room.y0 * tileMap.tileSize * scale;
      const w = (room.x1 - room.x0 + 1) * tileMap.tileSize * scale;
      const h = (room.y1 - room.y0 + 1) * tileMap.tileSize * scale;
      ctx.fillStyle = `#${room.color.toString(16).padStart(6, '0')}cc`;
      ctx.fillRect(x, y, w, h);

      const label = roomLabel(room.name);
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,6,4,0.85)';
      ctx.strokeText(label, x + w / 2, y + h / 2);
      ctx.fillStyle = '#e8e0d4';
      ctx.fillText(label, x + w / 2, y + h / 2);
    }

    const localEntity = snapshot.entities.find((e) => e.id === snapshot.localPlayerId);
    const localRole = localEntity?.role;
    // Living crew: self only. Impostors: living others. Ghosts: others including dead.
    const seeOthers = snapshot.localIsGhost || localRole === 'impostor';

    for (const entity of snapshot.entities) {
      const isLocal = entity.id === snapshot.localPlayerId;
      if (!isLocal) {
        if (!seeOthers) continue;
        if (!snapshot.localIsGhost && !entity.alive) continue;
      }
      const r = isLocal ? 4 : 3;
      ctx.beginPath();
      ctx.fillStyle = `#${entity.color.toString(16).padStart(6, '0')}`;
      ctx.arc(entity.x * scale, entity.y * scale, r, 0, Math.PI * 2);
      ctx.fill();
      if (isLocal) {
        ctx.strokeStyle = '#e8e0d4';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  };

  return {
    update,
    destroy: () => canvas.remove(),
  };
}
