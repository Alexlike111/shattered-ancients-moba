import * as THREE from 'three';
import type { AmbushBrushZone, ObstacleBox } from '../types/game';

export const ARENA_HALF_SIZE = 104;

export const FOUNTAIN_POS = {
  radiant: new THREE.Vector3(-89, 0, -89),
  dire: new THREE.Vector3(89, 0, 89),
};

export const ANCIENT_POS = {
  radiant: new THREE.Vector3(-75, 0, -75),
  dire: new THREE.Vector3(75, 0, 75),
};

export const LANE_WAYPOINTS: Record<'top' | 'mid' | 'bot', THREE.Vector3[]> = {
  mid: [
    new THREE.Vector3(-72, 0, -72),
    new THREE.Vector3(-48, 0, -48),
    new THREE.Vector3(-22, 0, -22),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(22, 0, 22),
    new THREE.Vector3(48, 0, 48),
    new THREE.Vector3(72, 0, 72),
  ],
  top: [
    new THREE.Vector3(-75, 0, -64),
    new THREE.Vector3(-85, 0, -44),
    new THREE.Vector3(-85, 0, -6),
    new THREE.Vector3(-85, 0, 42),
    new THREE.Vector3(-81, 0, 81),
    new THREE.Vector3(-42, 0, 85),
    new THREE.Vector3(6, 0, 85),
    new THREE.Vector3(44, 0, 85),
    new THREE.Vector3(64, 0, 75),
  ],
  bot: [
    new THREE.Vector3(-64, 0, -75),
    new THREE.Vector3(-44, 0, -85),
    new THREE.Vector3(-6, 0, -85),
    new THREE.Vector3(42, 0, -85),
    new THREE.Vector3(81, 0, -81),
    new THREE.Vector3(85, 0, -42),
    new THREE.Vector3(85, 0, 6),
    new THREE.Vector3(85, 0, 44),
    new THREE.Vector3(75, 0, 64),
  ],
};

export interface TowerPlacement {
  id: string;
  team: 'radiant' | 'dire';
  lane: 'top' | 'mid' | 'bot' | 'base';
  tier: 1 | 2 | 3 | 4;
  name: string;
  x: number;
  z: number;
}

export const TOWER_PLACEMENTS: TowerPlacement[] = [
  // Radiant Towers
  { id: 'rad_mid_t1', team: 'radiant', lane: 'mid', tier: 1, name: 'Башня Света (Мид I)', x: -25, z: -25 },
  { id: 'rad_mid_t2', team: 'radiant', lane: 'mid', tier: 2, name: 'Башня Света (Мид II)', x: -50, z: -50 },
  { id: 'rad_top_t1', team: 'radiant', lane: 'top', tier: 1, name: 'Башня Света (Верх I)', x: -85, z: 12 },
  { id: 'rad_top_t2', team: 'radiant', lane: 'top', tier: 2, name: 'Башня Света (Верх II)', x: -85, z: -38 },
  { id: 'rad_bot_t1', team: 'radiant', lane: 'bot', tier: 1, name: 'Башня Света (Низ I)', x: 12, z: -85 },
  { id: 'rad_bot_t2', team: 'radiant', lane: 'bot', tier: 2, name: 'Башня Света (Низ II)', x: -38, z: -85 },
  { id: 'rad_base_t3', team: 'radiant', lane: 'base', tier: 3, name: 'Бастион Цитадели Света', x: -65, z: -65 },
  { id: 'rad_ancient', team: 'radiant', lane: 'base', tier: 4, name: 'ДРЕВНИЙ КРИСТАЛЛ СВЕТА', x: -76, z: -76 },

  // Dire Towers
  { id: 'dire_mid_t1', team: 'dire', lane: 'mid', tier: 1, name: 'Башня Пепла (Мид I)', x: 25, z: 25 },
  { id: 'dire_mid_t2', team: 'dire', lane: 'mid', tier: 2, name: 'Башня Пепла (Мид II)', x: 50, z: 50 },
  { id: 'dire_top_t1', team: 'dire', lane: 'top', tier: 1, name: 'Башня Пепла (Верх I)', x: -12, z: 85 },
  { id: 'dire_top_t2', team: 'dire', lane: 'top', tier: 2, name: 'Башня Пепла (Верх II)', x: 38, z: 85 },
  { id: 'dire_bot_t1', team: 'dire', lane: 'bot', tier: 1, name: 'Башня Пепла (Низ I)', x: 85, z: -12 },
  { id: 'dire_bot_t2', team: 'dire', lane: 'bot', tier: 2, name: 'Башня Пепла (Низ II)', x: 85, z: 38 },
  { id: 'dire_base_t3', team: 'dire', lane: 'base', tier: 3, name: 'Бастион Цитадели Пепла', x: 65, z: 65 },
  { id: 'dire_ancient', team: 'dire', lane: 'base', tier: 4, name: 'ДРЕВНЕЕ СЕРДЦЕ ПЕПЛА', x: 76, z: 76 },
];

export interface JungleCampPlacement {
  id: string;
  campType: 'red_buff' | 'blue_buff' | 'wolf_camp' | 'titan_boss' | 'elemental_turtle';
  name: string;
  x: number;
  z: number;
}

export const JUNGLE_CAMPS: JungleCampPlacement[] = [
  { id: 'camp_rad_red', campType: 'red_buff', name: 'Голем Багрового Огня', x: -34, z: -58 },
  { id: 'camp_rad_blue', campType: 'blue_buff', name: 'Страж Звёздного Эфира', x: -58, z: -34 },
  { id: 'camp_rad_wolves', campType: 'wolf_camp', name: 'Скальный Хищник', x: -56, z: 8 },
  { id: 'camp_dire_red', campType: 'red_buff', name: 'Голем Багрового Огня', x: 34, z: 58 },
  { id: 'camp_dire_blue', campType: 'blue_buff', name: 'Страж Звёздного Эфира', x: 58, z: 34 },
  { id: 'camp_dire_wolves', campType: 'wolf_camp', name: 'Скальный Хищник', x: 56, z: -8 },
  { id: 'camp_titan_boss', campType: 'titan_boss', name: 'ТИТАН РАЗЛОМА (ЛОРД)', x: -28, z: 28 },
  { id: 'camp_elemental_turtle', campType: 'elemental_turtle', name: 'ЧЕРЕПАХА СТИХИЙ', x: 28, z: -28 },
];

export const RUNE_SPOTS = [
  { id: 'rune_north', x: -14, z: 14 },
  { id: 'rune_south', x: 14, z: -14 },
];

// Кусты засады (Stealth Brush из Mobile Legends) — маскируют героев внутри!
export const AMBUSH_BRUSHES: AmbushBrushZone[] = [
  { id: 'brush_mid_nw', position: new THREE.Vector3(-9, 0, 9), radius: 3.8 },
  { id: 'brush_mid_se', position: new THREE.Vector3(9, 0, -9), radius: 3.8 },
  { id: 'brush_titan_gate', position: new THREE.Vector3(-20, 0, 24), radius: 4.0 },
  { id: 'brush_turtle_gate', position: new THREE.Vector3(20, 0, -24), radius: 4.0 },
  { id: 'brush_top_corner', position: new THREE.Vector3(-76, 0, 72), radius: 4.2 },
  { id: 'brush_bot_corner', position: new THREE.Vector3(76, 0, -72), radius: 4.2 },
  { id: 'brush_rad_jungle', position: new THREE.Vector3(-36, 0, -14), radius: 3.8 },
  { id: 'brush_dire_jungle', position: new THREE.Vector3(36, 0, 14), radius: 3.8 },
];

// Захватываемые Аванпосты в джунглях (Outposts из Dota 2)
export const OUTPOST_SPOTS = [
  { id: 'outpost_north', name: 'Северный Аванпост Леса', x: -50, z: 50 },
  { id: 'outpost_south', name: 'Южный Аванпост Леса', x: 50, z: -50 },
];

export const ARENA_OBSTACLES: ObstacleBox[] = [
  { minX: -22, maxX: -12, minZ: -4, maxZ: 6, height: 6.5 },
  { minX: 12, maxX: 22, minZ: -6, maxZ: 4, height: 6.5 },
  { minX: -6, maxX: 4, minZ: -22, maxZ: -12, height: 6.5 },
  { minX: -4, maxX: 6, minZ: 12, maxZ: 22, height: 6.5 },

  { minX: -41, maxX: -35, minZ: 22, maxZ: 39, height: 8.5 },
  { minX: -39, maxX: -22, minZ: 35, maxZ: 41, height: 8.5 },

  { minX: 35, maxX: 41, minZ: -39, maxZ: -22, height: 7.5 },
  { minX: 22, maxX: 39, minZ: -41, maxZ: -35, height: 7.5 },

  { minX: -72, maxX: -63, minZ: -18, maxZ: -6, height: 7.0 },
  { minX: 63, maxX: 72, minZ: 6, maxZ: 18, height: 7.0 },
  { minX: -18, maxX: -6, minZ: -72, maxZ: -63, height: 7.0 },
  { minX: 6, maxX: 18, minZ: 63, maxZ: 72, height: 7.0 },

  { minX: -48, maxX: -40, minZ: -28, maxZ: -20, height: 6.8 },
  { minX: 40, maxX: 48, minZ: 20, maxZ: 28, height: 6.8 },
  { minX: -28, maxX: -20, minZ: -48, maxZ: -40, height: 6.8 },
  { minX: 20, maxX: 28, minZ: 40, maxZ: 48, height: 6.8 },
];

export interface DestructiblePlacement {
  id: string;
  kind: 'tree' | 'rock_barricade';
  name: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  maxHp: number;
}

// Тактические разрушаемые деревья и рунические каменные преграды (валятся и раскалываются в бою!)
export const DESTRUCTIBLE_PLACEMENTS: DestructiblePlacement[] = [
  // Рунические каменные баррикады на ключевых перешейках леса и реки
  { id: 'barricade_mid_nw', kind: 'rock_barricade', name: 'Руническая Скальная Преграда', x: -18, z: 12, radius: 1.85, height: 4.4, maxHp: 460 },
  { id: 'barricade_mid_se', kind: 'rock_barricade', name: 'Руническая Скальная Преграда', x: 18, z: -12, radius: 1.85, height: 4.4, maxHp: 460 },
  { id: 'barricade_titan_gate', kind: 'rock_barricade', name: 'Врата Логова Титана', x: -31, z: 17, radius: 1.95, height: 4.8, maxHp: 520 },
  { id: 'barricade_turtle_gate', kind: 'rock_barricade', name: 'Врата Бухты Черепахи', x: 31, z: -17, radius: 1.95, height: 4.8, maxHp: 520 },
  { id: 'barricade_rad_cut', kind: 'rock_barricade', name: 'Лесной Завал Света', x: -33, z: -19, radius: 1.8, height: 4.2, maxHp: 440 },
  { id: 'barricade_dire_cut', kind: 'rock_barricade', name: 'Лесной Завал Пепла', x: 33, z: 19, radius: 1.8, height: 4.2, maxHp: 440 },
  { id: 'barricade_top_gank', kind: 'rock_barricade', name: 'Скальный Заслон Топа', x: -62, z: 22, radius: 1.85, height: 4.4, maxHp: 460 },
  { id: 'barricade_bot_gank', kind: 'rock_barricade', name: 'Скальный Заслон Бота', x: 62, z: -22, radius: 1.85, height: 4.4, maxHp: 460 },

  // Вековые деревья джунглей и берегов Реки (рушатся способностями, взрывами, метеоритами и Лордом!)
  { id: 'tree_01', kind: 'tree', name: 'Древо Разлома', x: -14, z: -5, radius: 0.85, height: 7.8, maxHp: 150 },
  { id: 'tree_02', kind: 'tree', name: 'Древо Разлома', x: -5, z: -14, radius: 0.85, height: 7.8, maxHp: 150 },
  { id: 'tree_03', kind: 'tree', name: 'Древо Разлома', x: 14, z: 5, radius: 0.85, height: 7.8, maxHp: 150 },
  { id: 'tree_04', kind: 'tree', name: 'Древо Разлома', x: 5, z: 14, radius: 0.85, height: 7.8, maxHp: 150 },
  { id: 'tree_05', kind: 'tree', name: 'Древо Разлома', x: -26, z: -12, radius: 0.9, height: 8.2, maxHp: 160 },
  { id: 'tree_06', kind: 'tree', name: 'Древо Разлома', x: -12, z: -26, radius: 0.9, height: 8.2, maxHp: 160 },
  { id: 'tree_07', kind: 'tree', name: 'Древо Разлома', x: 26, z: 12, radius: 0.9, height: 8.2, maxHp: 160 },
  { id: 'tree_08', kind: 'tree', name: 'Древо Разлома', x: 12, z: 26, radius: 0.9, height: 8.2, maxHp: 160 },
  { id: 'tree_09', kind: 'tree', name: 'Древо Разлома', x: -46, z: -12, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_10', kind: 'tree', name: 'Древо Разлома', x: -12, z: -46, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_11', kind: 'tree', name: 'Древо Разлома', x: 46, z: 12, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_12', kind: 'tree', name: 'Древо Разлома', x: 12, z: 46, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_13', kind: 'tree', name: 'Древо Разлома', x: -68, z: 28, radius: 0.9, height: 8.4, maxHp: 160 },
  { id: 'tree_14', kind: 'tree', name: 'Древо Разлома', x: 28, z: -68, radius: 0.9, height: 8.4, maxHp: 160 },
  { id: 'tree_15', kind: 'tree', name: 'Древо Разлома', x: -28, z: 68, radius: 0.9, height: 8.4, maxHp: 160 },
  { id: 'tree_16', kind: 'tree', name: 'Древо Разлома', x: 68, z: -28, radius: 0.9, height: 8.4, maxHp: 160 },
  { id: 'tree_17', kind: 'tree', name: 'Древо Разлома', x: -43, z: 43, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_18', kind: 'tree', name: 'Древо Разлома', x: 43, z: -43, radius: 0.9, height: 8.0, maxHp: 160 },
  { id: 'tree_19', kind: 'tree', name: 'Древо Разлома', x: -64, z: -52, radius: 0.9, height: 7.8, maxHp: 150 },
  { id: 'tree_20', kind: 'tree', name: 'Древо Разлома', x: 64, z: 52, radius: 0.9, height: 7.8, maxHp: 150 },
];

export interface DynamicCircleCollider {
  x: number;
  z: number;
  radius: number;
}

let activeDynamicColliders: DynamicCircleCollider[] = [];

export function setDynamicDestructibleColliders(colliders: DynamicCircleCollider[]): void {
  activeDynamicColliders = colliders;
}

export function resolveArenaCollisions(pos: THREE.Vector3, radius: number): void {
  const limit = ARENA_HALF_SIZE - radius;
  if (pos.x < -limit) pos.x = -limit;
  if (pos.x > limit) pos.x = limit;
  if (pos.z < -limit) pos.z = -limit;
  if (pos.z > limit) pos.z = limit;

  for (let i = 0; i < ARENA_OBSTACLES.length; i++) {
    const box = ARENA_OBSTACLES[i];
    const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        pos.x += (dx / dist) * overlap;
        pos.z += (dz / dist) * overlap;
      } else {
        const toLeft = Math.abs(pos.x - box.minX);
        const toRight = Math.abs(box.maxX - pos.x);
        const toTop = Math.abs(pos.z - box.minZ);
        const toBottom = Math.abs(box.maxZ - pos.z);
        const minEdge = Math.min(toLeft, toRight, toTop, toBottom);
        if (minEdge === toLeft) pos.x = box.minX - radius;
        else if (minEdge === toRight) pos.x = box.maxX + radius;
        else if (minEdge === toTop) pos.z = box.minZ - radius;
        else pos.z = box.maxZ + radius;
      }
    }
  }

  for (let i = 0; i < activeDynamicColliders.length; i++) {
    const col = activeDynamicColliders[i];
    const dx = pos.x - col.x;
    const dz = pos.z - col.z;
    const minDist = radius + col.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = minDist - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        pos.x += minDist;
      }
    }
  }
}

export function isPointInsideObstacle(x: number, z: number, padding = 0.2): boolean {
  if (Math.abs(x) > ARENA_HALF_SIZE - padding || Math.abs(z) > ARENA_HALF_SIZE - padding) {
    return true;
  }
  for (let i = 0; i < ARENA_OBSTACLES.length; i++) {
    const b = ARENA_OBSTACLES[i];
    if (
      x >= b.minX - padding &&
      x <= b.maxX + padding &&
      z >= b.minZ - padding &&
      z <= b.maxZ + padding
    ) {
      return true;
    }
  }
  for (let i = 0; i < activeDynamicColliders.length; i++) {
    const col = activeDynamicColliders[i];
    const dx = x - col.x;
    const dz = z - col.z;
    const r = col.radius + padding;
    if (dx * dx + dz * dz <= r * r) {
      return true;
    }
  }
  return false;
}

export function segmentHitsObstacle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  samples = 10
): boolean {
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const sx = ax + (bx - ax) * t;
    const sz = az + (bz - az) * t;
    if (isPointInsideObstacle(sx, sz, 0.05)) {
      return true;
    }
  }
  return false;
}

export function isPositionInBrush(pos: THREE.Vector3): boolean {
  for (let i = 0; i < AMBUSH_BRUSHES.length; i++) {
    const b = AMBUSH_BRUSHES[i];
    const dx = pos.x - b.position.x;
    const dz = pos.z - b.position.z;
    if (dx * dx + dz * dz <= b.radius * b.radius) {
      return true;
    }
  }
  return false;
}
