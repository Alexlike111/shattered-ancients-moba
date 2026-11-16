import * as THREE from 'three';

function createCanvasTex(
  size: number,
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1
): THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawFn(ctx, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createForestGroundTexture(): THREE.Texture {
  return createCanvasTex(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#16211c';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 1 + Math.random() * 4;
        ctx.fillStyle =
          i % 3 === 0
            ? 'rgba(34, 54, 42, 0.55)'
            : i % 3 === 1
              ? 'rgba(18, 28, 24, 0.65)'
              : 'rgba(46, 66, 48, 0.35)';
        ctx.fillRect(x, y, r, r);
      }
    },
    26,
    26
  );
}

export function createStoneLaneTexture(): THREE.Texture {
  return createCanvasTex(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#2a313b';
      ctx.fillRect(0, 0, s, s);
      const rows = 8;
      const cols = 4;
      const bh = s / rows;
      const bw = s / cols;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (bw * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * bw + offset;
          const y = r * bh;
          const shade = 38 + Math.floor(Math.random() * 18);
          ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 12})`;
          ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
      }
      ctx.strokeStyle = 'rgba(212, 168, 83, 0.14)';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, s - 12, s - 12);
    },
    1,
    8
  );
}

export function createCliffRockTexture(): THREE.Texture {
  return createCanvasTex(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#1d242e';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 180; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const w = 10 + Math.random() * 34;
        const h = 6 + Math.random() * 24;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(42, 52, 66, 0.45)' : 'rgba(14, 18, 24, 0.55)';
        ctx.fillRect(x, y, w, h);
      }
    },
    2,
    2
  );
}

export function createRiverWaterTexture(): THREE.Texture {
  return createCanvasTex(
    256,
    (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#0c3b49');
      grad.addColorStop(0.5, '#135669');
      grad.addColorStop(1, '#0b3442');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      ctx.strokeStyle = 'rgba(125, 232, 255, 0.22)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 36; i++) {
        const y = (i / 36) * s;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.33, y + 8, s * 0.66, y - 8, s, y);
        ctx.stroke();
      }
    },
    4,
    18
  );
}
