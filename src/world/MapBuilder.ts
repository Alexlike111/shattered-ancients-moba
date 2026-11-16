import * as THREE from 'three';
import {
  AMBUSH_BRUSHES,
  ANCIENT_POS,
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  FOUNTAIN_POS,
  JUNGLE_CAMPS,
  LANE_WAYPOINTS,
} from './ArenaData';
import {
  createCliffRockTexture,
  createForestGroundTexture,
  createRiverWaterTexture,
  createStoneLaneTexture,
} from '../graphics/ProceduralTextures';

export interface BuiltArenaVisuals {
  root: THREE.Group;
  riverMesh: THREE.Mesh;
  riverTexture: THREE.Texture;
  skyMaterial: THREE.MeshBasicMaterial;
}

export function buildArenaWorld(scene: THREE.Scene): BuiltArenaVisuals {
  const root = new THREE.Group();
  root.name = 'MOBA_Arena_World';

  const groundTex = createForestGroundTexture();
  const roadTex = createStoneLaneTexture();
  const rockTex = createCliffRockTexture();
  const riverTex = createRiverWaterTexture();

  // 1. Почва арены
  const groundGeo = new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2 + 24, ARENA_HALF_SIZE * 2 + 24);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.92,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // 2. Река Разлома
  const riverLength = ARENA_HALF_SIZE * 2.65;
  const riverGeo = new THREE.PlaneGeometry(15, riverLength);
  const riverMat = new THREE.MeshStandardMaterial({
    map: riverTex,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.86,
    emissive: new THREE.Color(0x0a3948),
    emissiveIntensity: 0.45,
  });
  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.rotation.x = -Math.PI / 2;
  riverMesh.rotation.z = Math.PI / 4;
  riverMesh.position.y = 0.03;
  root.add(riverMesh);

  // 3. Каменные дороги 3 линий
  const laneMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.82,
    metalness: 0.08,
  });

  const buildRoadSegment = (a: THREE.Vector3, b: THREE.Vector3, width: number, yOffset = 0.05) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) + width * 0.45;
    const segGeo = new THREE.PlaneGeometry(width, len);
    const seg = new THREE.Mesh(segGeo, laneMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(dx, dz);
    seg.position.set((a.x + b.x) * 0.5, yOffset, (a.z + b.z) * 0.5);
    seg.receiveShadow = true;
    root.add(seg);
  };

  for (const laneKey of ['mid', 'top', 'bot'] as const) {
    const pts = LANE_WAYPOINTS[laneKey];
    for (let i = 0; i < pts.length - 1; i++) {
      buildRoadSegment(pts[i], pts[i + 1], 10.5, 0.055);
    }
  }

  // Каменный мост на Миде
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x3b4452,
    roughness: 0.72,
    metalness: 0.18,
  });
  const midBridge = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 17.5), bridgeMat);
  midBridge.position.set(0, 0.08, 0);
  midBridge.rotation.y = Math.PI / 4;
  midBridge.receiveShadow = true;
  root.add(midBridge);

  // 4. Цитадели баз Света и Пепла
  const buildBaseSanctum = (team: 'radiant' | 'dire') => {
    const isRad = team === 'radiant';
    const center = isRad ? ANCIENT_POS.radiant : ANCIENT_POS.dire;
    const fountain = isRad ? FOUNTAIN_POS.radiant : FOUNTAIN_POS.dire;
    const primaryHex = isRad ? 0x2dd4bf : 0xef4444;
    const stoneHex = isRad ? 0x283644 : 0x2a1c20;

    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 25.5, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: stoneHex, roughness: 0.65, metalness: 0.22 })
    );
    plaza.position.set(center.x, 0.14, center.z);
    plaza.receiveShadow = true;
    root.add(plaza);

    const fountainRing = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 9.2, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 })
    );
    fountainRing.position.set(fountain.x, 0.3, fountain.z);
    root.add(fountainRing);

    const fountainPool = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.2, 0.72, 16),
      new THREE.MeshStandardMaterial({
        color: primaryHex,
        emissive: primaryHex,
        emissiveIntensity: 0.9,
        roughness: 0.15,
      })
    );
    fountainPool.position.set(fountain.x, 0.34, fountain.z);
    root.add(fountainPool);
  };

  buildBaseSanctum('radiant');
  buildBaseSanctum('dire');

  // 5. Скальные укрытия джунглей
  const cliffMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    roughness: 0.88,
    metalness: 0.1,
  });

  for (const box of ARENA_OBSTACLES) {
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    const cx = (box.minX + box.maxX) * 0.5;
    const cz = (box.minZ + box.maxZ) * 0.5;

    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(w, box.height, d), cliffMat);
    mainBlock.position.set(cx, box.height * 0.5, cz);
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    root.add(mainBlock);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * 0.52, 2.8, 6), cliffMat);
    cap.position.set(cx, box.height + 1.2, cz);
    cap.castShadow = true;
    root.add(cap);
  }

  // 6. Стены периметра
  const wallHeight = 9.5;
  const perimeterLength = ARENA_HALF_SIZE * 2 + 8;
  const wallPositions: [number, number, number, number][] = [
    [0, -ARENA_HALF_SIZE - 2, perimeterLength, 4],
    [0, ARENA_HALF_SIZE + 2, perimeterLength, 4],
    [-ARENA_HALF_SIZE - 2, 0, 4, perimeterLength],
    [ARENA_HALF_SIZE + 2, 0, 4, perimeterLength],
  ];
  for (const [wx, wz, ww, wd] of wallPositions) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wallHeight, wd), cliffMat);
    wall.position.set(wx, wallHeight * 0.5, wz);
    root.add(wall);
  }

  // 7. КУСТЫ ЗАСАДЫ (Stealth Brush из Mobile Legends!)
  const brushBladeMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    emissive: 0x064e3b,
    emissiveIntensity: 0.35,
    roughness: 0.75,
  });
  const brushRingMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.25,
  });

  for (const brush of AMBUSH_BRUSHES) {
    const bGroup = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(brush.radius - 0.18, brush.radius, 24),
      brushRingMat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    bGroup.add(ring);

    // Пучки высокой изумрудной травы (полупрозрачные изнутри для комфорта от 1-го лица)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + (i % 3) * 0.3;
      const r = (0.25 + ((i * 7) % 10) / 12) * (brush.radius - 0.4);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.25, 4), brushBladeMat);
      blade.position.set(Math.cos(a) * r, 1.1, Math.sin(a) * r);
      blade.rotation.z = (Math.random() - 0.5) * 0.22;
      bGroup.add(blade);
    }
    bGroup.position.copy(brush.position);
    root.add(bGroup);
  }

  // 8. Круги лагерей, Титана и Черепахи Стихий
  for (const camp of JUNGLE_CAMPS) {
    const isBoss = camp.campType === 'titan_boss' || camp.campType === 'elemental_turtle';
    const ringColor =
      camp.campType === 'titan_boss'
        ? 0xf2cb78
        : camp.campType === 'elemental_turtle'
          ? 0x2dd4bf
          : camp.campType === 'red_buff'
            ? 0xf97316
            : camp.campType === 'blue_buff'
              ? 0x38bdf8
              : 0x94a3b8;

    const ringGeo = new THREE.RingGeometry(isBoss ? 6.8 : 3.6, isBoss ? 7.6 : 4.1, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(camp.x, 0.08, camp.z);
    root.add(ring);
  }

  // 9. Деревья и рунические преграды создаются динамически в системе физики разрушений!

  // 10. Динамический небесный купол для цикла Дня и Ночи
  const skyGeo = new THREE.SphereGeometry(290, 20, 14);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x182b44,
    side: THREE.BackSide,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMaterial);
  root.add(skyDome);

  scene.add(root);
  return {
    root,
    riverMesh,
    riverTexture: riverTex,
    skyMaterial,
  };
}
