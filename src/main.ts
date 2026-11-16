import { MobaGameEngine } from './engine/MobaGameEngine';

function showBootError(message: string): void {
  const boot = document.getElementById('boot-screen');
  if (!boot) return;
  boot.classList.remove('is-hidden');
  boot.innerHTML = `
    <div style="max-width:440px;padding:24px;text-align:center;color:#f8fafc;font-family:system-ui,sans-serif;">
      <h2 style="color:#facc15;margin-bottom:10px;">Не удалось инициализировать 3D-арену</h2>
      <p style="font-size:0.9rem;color:#cbd5e1;line-height:1.45;margin-bottom:14px;">${message}</p>
      <button onclick="location.reload()" style="padding:10px 20px;border-radius:8px;border:none;background:#d4a853;color:#0f172a;font-weight:800;cursor:pointer;">
        Перезапустить
      </button>
    </div>
  `;
}

function bootstrap(): void {
  const canvas = document.getElementById('arena-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    showBootError('Не найден игровой холст #arena-canvas.');
    return;
  }

  try {
    const engine = new MobaGameEngine(canvas);
    engine.start();
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    showBootError(`Проверьте поддержку аппаратного ускорения WebGL в браузере (${details}).`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
