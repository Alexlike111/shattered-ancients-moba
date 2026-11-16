import * as THREE from 'three';
import { resolveArenaCollisions, type DestructiblePlacement } from '../world/ArenaData';
import type { DestructiblePropRuntime, GraphicsQuality } from '../types/game';

interface RagdollNode {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  radius: number;
  invMass: number;
}

interface RagdollConstraint {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
}

interface LimbVisual {
  mesh: THREE.Object3D;
  nodeA: number;
  nodeB: number;
}

export interface ActiveRagdoll {
  id: string;
  group: THREE.Group;
  nodes: RagdollNode[];
  constraints: RagdollConstraint[];
  limbs: LimbVisual[];
  headMesh: THREE.Object3D;
  life: number;
  maxLife: number;
  settledSoundPlayed: boolean;
}

export interface DebrisBody {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  halfHeight: number;
  radius: number;
  restitution: number;
  friction: number;
  gravity: number;
  life: number;
  maxLife: number;
}

interface FallingTreeBody {
  pivot: THREE.Group;
  fallAxis: THREE.Vector3;
  angle: number;
  angularSpeed: number;
  bounced: boolean;
  life: number;
}

interface CraterDecal {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

export interface RagdollSpawnOptions {
  origin: THREE.Vector3;
  yaw: number;
  impulse: THREE.Vector3;
  scale?: number;
  armorHex: number;
  accentHex: number;
  skinHex?: number;
}

export class DestructionPhysicsSystem {
  private scene: THREE.Scene;
  private ragdolls: ActiveRagdoll[] = [];
  private debris: DebrisBody[] = [];
  private fallingTrees: FallingTreeBody[] = [];
  private craters: CraterDecal[] = [];

  private maxDebris = 150;
  private maxRagdolls = 12;
  private maxCraters = 16;
  private idSeq = 1;

  // Переиспользуемые геометрии осколков для экономии памяти GPU на телефонах и ПК
  private rockGeoSmall = new THREE.DodecahedronGeometry(0.34, 0);
  private rockGeoMed = new THREE.DodecahedronGeometry(0.62, 0);
  private rockGeoSlab = new THREE.BoxGeometry(0.95, 0.55, 0.78);
  private crystalGeo = new THREE.OctahedronGeometry(0.42, 0);
  private woodChunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.95, 6);
  private splinterGeo = new THREE.BoxGeometry(0.12, 0.55, 0.14);

  private upVec = new THREE.Vector3(0, 1, 0);
  private tmpDir = new THREE.Vector3();
  private tmpMid = new THREE.Vector3();
  private tmpDelta = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();

  public onImpactSound?: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public setQualityBudget(quality: GraphicsQuality, isMobile: boolean): void {
    if (quality === 'performance') {
      this.maxDebris = 44;
      this.maxRagdolls = 4;
      this.maxCraters = 6;
    } else if (quality === 'high' || isMobile) {
      this.maxDebris = 90;
      this.maxRagdolls = 8;
      this.maxCraters = 12;
    } else {
      this.maxDebris = 180;
      this.maxRagdolls = 14;
      this.maxCraters = 20;
    }
  }

  public getActiveCounts(): { ragdolls: number; debris: number; craters: number } {
    return {
      ragdolls: this.ragdolls.length,
      debris: this.debris.length,
      craters: this.craters.length,
    };
  }

  public createDestructibleProp(p: DestructiblePlacement): DestructiblePropRuntime {
    const mesh = new THREE.Group();
    const intactGroup = new THREE.Group();
    const ruinGroup = new THREE.Group();
    ruinGroup.visible = false;

    if (p.kind === 'tree') {
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x452c1e, roughness: 0.9 });
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1b4d38, roughness: 0.82 });
      const foliageTopMat = new THREE.MeshStandardMaterial({ color: 0x226347, roughness: 0.78 });

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.68, 3.6, 7), trunkMat);
      trunk.position.y = 1.8;
      trunk.castShadow = true;

      const crown1 = new THREE.Mesh(new THREE.ConeGeometry(2.55, 4.5, 7), foliageMat);
      crown1.position.y = 4.9;
      crown1.castShadow = true;

      const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.85, 3.5, 7), foliageTopMat);
      crown2.position.y = 7.05;
      crown2.castShadow = true;

      intactGroup.add(trunk, crown1, crown2);

      // Остающийся после сруба расщеплённый пень
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.72, 0.78, 7), trunkMat);
      stump.position.y = 0.39;
      const jagged = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.45, 5),
        new THREE.MeshStandardMaterial({ color: 0x855836, roughness: 0.92 })
      );
      jagged.position.y = 0.92;
      ruinGroup.add(stump, jagged);
    } else {
      // Руническая скальная баррикада (можно разбить оружием или взорвать!)
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.84,
        metalness: 0.16,
      });
      const runeMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.85,
        roughness: 0.3,
      });

      const leftPillar = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), rockMat);
      leftPillar.scale.set(1.05, 1.55, 0.95);
      leftPillar.position.set(-0.65, 1.9, 0.15);
      leftPillar.castShadow = true;

      const rightPillar = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 0), rockMat);
      rightPillar.scale.set(0.95, 1.4, 1.05);
      rightPillar.position.set(0.7, 1.7, -0.15);
      rightPillar.castShadow = true;

      const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), runeMat);
      coreCrystal.position.set(0, 2.45, 0);
      coreCrystal.name = 'fractureCore';

      intactGroup.add(leftPillar, rightPillar, coreCrystal);

      // Плоские обломки фундамента после пролома прохода
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const rubble = new THREE.Mesh(this.rockGeoSmall, rockMat);
        rubble.position.set(Math.cos(a) * 1.15, 0.18, Math.sin(a) * 1.15);
        rubble.scale.set(1.2, 0.55, 1.1);
        ruinGroup.add(rubble);
      }
    }

    mesh.add(intactGroup, ruinGroup);
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);

    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      position: new THREE.Vector3(p.x, 0, p.z),
      radius: p.radius,
      height: p.height,
      hp: p.maxHp,
      maxHp: p.maxHp,
      alive: true,
      respawnTimer: 0,
      respawnDuration: p.kind === 'tree' ? 65 : 85,
      mesh,
      intactGroup,
      ruinGroup,
    };
  }

  /**
   * Спавн полноценного шарнирного 3D Ragdoll на системе Верле (7 узлов + 11 связей костей)
   */
  public spawnHumanoidRagdoll(opts: RagdollSpawnOptions): void {
    while (this.ragdolls.length >= this.maxRagdolls) {
      this.removeRagdollAt(0);
    }

    const s = opts.scale ?? 1.0;
    const cosY = Math.cos(opts.yaw);
    const sinY = Math.sin(opts.yaw);
    const toWorld = (lx: number, ly: number, lz: number): THREE.Vector3 =>
      new THREE.Vector3(
        opts.origin.x + (lx * cosY + lz * sinY) * s,
        opts.origin.y + ly * s,
        opts.origin.z + (-lx * sinY + lz * cosY) * s
      );

    // 7 анатомических узлов: 0=таз, 1=грудь, 2=голова, 3=л.рука, 4=пр.рука, 5=л.ступня, 6=пр.ступня
    const localJoints: [number, number, number, number, number][] = [
      [0, 0.95, 0, 0.28, 0.85], // 0: pelvis
      [0, 1.62, 0, 0.32, 0.8], // 1: chest
      [0, 2.22, 0, 0.25, 1.1], // 2: head
      [-0.64, 1.25, -0.1, 0.18, 1.35], // 3: leftHand
      [0.64, 1.25, -0.18, 0.18, 1.25], // 4: rightHand
      [-0.28, 0.16, 0.05, 0.18, 1.15], // 5: leftFoot
      [0.28, 0.16, -0.05, 0.18, 1.15], // 6: rightFoot
    ];

    // Предполагаемый dt = 1/60 для стартового шага Верле (prevPos = pos - vel * dt)
    const fixedDt = 1 / 60;
    const nodes: RagdollNode[] = localJoints.map(([lx, ly, lz, rad, invMass], idx) => {
      const pos = toWorld(lx, ly, lz);
      // Верхняя часть тела получает чуть больший импульс для реалистичного кувырка!
      const heightBoost = idx === 1 || idx === 2 ? 1.28 : idx === 3 || idx === 4 ? 1.15 : 0.72;
      const spinJitterX = (Math.random() - 0.5) * 3.8;
      const spinJitterZ = (Math.random() - 0.5) * 3.8;
      const vx = opts.impulse.x * heightBoost + spinJitterX;
      const vy = Math.max(2.6, opts.impulse.y * heightBoost + Math.random() * 2.4);
      const vz = opts.impulse.z * heightBoost + spinJitterZ;
      const prevPos = new THREE.Vector3(
        pos.x - vx * fixedDt,
        pos.y - vy * fixedDt,
        pos.z - vz * fixedDt
      );
      return {
        pos,
        prevPos,
        radius: rad * s,
        invMass,
      };
    });

    const makeConstraint = (a: number, b: number, stiffness: number): RagdollConstraint => ({
      a,
      b,
      restLength: nodes[a].pos.distanceTo(nodes[b].pos),
      stiffness,
    });

    const constraints: RagdollConstraint[] = [
      // Основные кости скелета
      makeConstraint(0, 1, 0.96), // Позвоночник
      makeConstraint(1, 2, 0.96), // Шея
      makeConstraint(1, 3, 0.92), // Левая рука
      makeConstraint(1, 4, 0.92), // Правая рука
      makeConstraint(0, 5, 0.94), // Левая нога
      makeConstraint(0, 6, 0.94), // Правая нога
      // Угловые ограничители суставов (сохраняют реалистичную анатомию в полёте и на земле)
      makeConstraint(0, 2, 0.55),
      makeConstraint(5, 6, 0.38),
      makeConstraint(3, 4, 0.28),
      makeConstraint(1, 5, 0.34),
      makeConstraint(1, 6, 0.34),
    ];

    const group = new THREE.Group();
    const armorMat = new THREE.MeshStandardMaterial({
      color: opts.armorHex,
      roughness: 0.5,
      metalness: 0.48,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: opts.accentHex,
      emissive: opts.accentHex,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.65,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: opts.skinHex ?? 0xd6c7b8,
      roughness: 0.72,
    });

    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.76 * s, 0.74 * s, 0.46 * s),
      armorMat
    );
    torsoMesh.castShadow = true;
    const chestCrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.36 * s, 0.32 * s, 0.52 * s),
      accentMat
    );
    torsoMesh.add(chestCrest);

    const leftArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * s, 0.72 * s, 0.24 * s),
      armorMat
    );
    const rightArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * s, 0.72 * s, 0.24 * s),
      accentMat
    );
    const leftLegMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28 * s, 0.82 * s, 0.28 * s),
      armorMat
    );
    const rightLegMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28 * s, 0.82 * s, 0.28 * s),
      armorMat
    );

    const headGroup = new THREE.Group();
    const headBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.44 * s, 0.46 * s, 0.44 * s),
      skinMat
    );
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 * s, 0.14 * s, 0.48 * s),
      accentMat
    );
    visor.position.y = 0.05 * s;
    headGroup.add(headBox, visor);

    group.add(torsoMesh, leftArmMesh, rightArmMesh, leftLegMesh, rightLegMesh, headGroup);
    this.scene.add(group);

    const limbs: LimbVisual[] = [
      { mesh: torsoMesh, nodeA: 0, nodeB: 1 },
      { mesh: leftArmMesh, nodeA: 1, nodeB: 3 },
      { mesh: rightArmMesh, nodeA: 1, nodeB: 4 },
      { mesh: leftLegMesh, nodeA: 0, nodeB: 5 },
      { mesh: rightLegMesh, nodeA: 0, nodeB: 6 },
    ];

    // Дополнительно отлетающий из рук трофейный осколок оружия/брони!
    this.spawnSingleDebris(
      toWorld(0.45, 1.35, -0.35),
      new THREE.Vector3(
        opts.impulse.x * 1.15 + (Math.random() - 0.5) * 6,
        Math.max(4.5, opts.impulse.y * 1.1 + 3),
        opts.impulse.z * 1.15 + (Math.random() - 0.5) * 6
      ),
      this.splinterGeo,
      accentMat,
      0.22 * s,
      1.35 * s,
      4.2
    );

    const maxLife = 6.2;
    const ragdoll: ActiveRagdoll = {
      id: `ragdoll_${this.idSeq++}`,
      group,
      nodes,
      constraints,
      limbs,
      headMesh: headGroup,
      life: maxLife,
      maxLife,
      settledSoundPlayed: false,
    };

    this.syncRagdollMeshes(ragdoll, 0);
    this.ragdolls.push(ragdoll);
  }

  /**
   * Реалистичный повал дерева от удара или взрыва (ствол падает по дуге от источника урона и раскалывается)
   */
  public spawnFallingTree(treeOrigin: THREE.Vector3, impactSource: THREE.Vector3): void {
    const away = new THREE.Vector3(
      treeOrigin.x - impactSource.x,
      0,
      treeOrigin.z - impactSource.z
    );
    if (away.lengthSq() < 0.01) {
      away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }
    away.normalize();

    // Ось вращения перпендикулярна направлению падения: cross(UP, away)
    const fallAxis = new THREE.Vector3().crossVectors(this.upVec, away).normalize();

    const pivot = new THREE.Group();
    pivot.position.set(treeOrigin.x, 0.65, treeOrigin.z);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x452c1e, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1b4d38, roughness: 0.82 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 3.2, 7), trunkMat);
    trunk.position.y = 1.6;
    const crown1 = new THREE.Mesh(new THREE.ConeGeometry(2.45, 4.3, 7), foliageMat);
    crown1.position.y = 4.4;
    const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.2, 7), foliageMat);
    crown2.position.y = 6.4;

    pivot.add(trunk, crown1, crown2);
    this.scene.add(pivot);

    this.fallingTrees.push({
      pivot,
      fallAxis,
      angle: 0.06,
      angularSpeed: 1.45,
      bounced: false,
      life: 4.4,
    });

    // Щепки и листва в точке перелома ствола
    this.spawnFractureBurst(
      treeOrigin.clone().setY(1.1),
      'wood',
      10,
      away.clone().multiplyScalar(6.5).setY(4.5),
      0x855836,
      0x22c55e
    );
  }

  /**
   * Взрывной разлёт 3D-осколков камня, кристаллов или древесины с реальной гравитацией и отскоками
   */
  public spawnFractureBurst(
    origin: THREE.Vector3,
    materialKind: 'stone' | 'crystal' | 'wood',
    count: number,
    directionalBias?: THREE.Vector3,
    primaryHex = 0x475569,
    glowHex = 0xf59e0b,
    scaleMultiplier = 1.0
  ): void {
    const primaryMat = new THREE.MeshStandardMaterial({
      color: primaryHex,
      roughness: materialKind === 'crystal' ? 0.2 : 0.82,
      metalness: materialKind === 'crystal' ? 0.55 : 0.15,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: glowHex,
      emissive: glowHex,
      emissiveIntensity: materialKind === 'wood' ? 0.15 : 0.9,
      roughness: 0.3,
    });

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = (4.5 + Math.random() * 8.5) * Math.min(1.4, scaleMultiplier);
      const vel = new THREE.Vector3(
        Math.cos(theta) * speed,
        4.2 + Math.random() * 7.8,
        Math.sin(theta) * speed
      );
      if (directionalBias) {
        vel.addScaledVector(directionalBias, 0.45 + Math.random() * 0.4);
      }

      const useGlow = i % 3 === 0;
      const geo =
        materialKind === 'wood'
          ? i % 2 === 0
            ? this.woodChunkGeo
            : this.splinterGeo
          : useGlow
            ? this.crystalGeo
            : i % 2 === 0
              ? this.rockGeoMed
              : this.rockGeoSlab;

      const s = (0.55 + Math.random() * 0.75) * scaleMultiplier;
      const spawnPos = origin
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.2, (Math.random() - 0.5) * 1.4));

      this.spawnSingleDebris(
        spawnPos,
        vel,
        geo,
        useGlow ? glowMat : primaryMat,
        0.26 * s,
        s,
        4.6 + Math.random() * 2.4
      );
    }
  }

  /**
   * Полное обрушение Башни или Древнего Трона с каскадом каменных блоков, осколков кристалла и кратером
   */
  public spawnStructureCollapse(
    position: THREE.Vector3,
    isAncient: boolean,
    team: 'radiant' | 'dire'
  ): void {
    const stoneColor = team === 'radiant' ? 0x28394d : 0x382026;
    const crystalColor = team === 'radiant' ? 0x2dd4bf : 0xef4444;
    const height = isAncient ? 5.8 : 6.8;
    const layers = isAncient ? 4 : 3;
    const perLayer = isAncient ? 10 : 7;

    for (let layer = 0; layer < layers; layer++) {
      const y = 1.0 + (layer / layers) * height;
      this.spawnFractureBurst(
        new THREE.Vector3(position.x, y, position.z),
        layer === layers - 1 ? 'crystal' : 'stone',
        perLayer,
        undefined,
        stoneColor,
        crystalColor,
        isAncient ? 1.45 : 1.15
      );
    }

    this.spawnCrater(position, isAncient ? 6.2 : 3.6, crystalColor, 28);
    this.applyExplosionForce(position, isAncient ? 14 : 9, isAncient ? 18 : 12);
  }

  /**
   * Выжженный кратер / раскол породы на земле от метеоритов, ультимейтов и обрушения башен
   */
  public spawnCrater(
    center: THREE.Vector3,
    radius: number,
    glowHex: number,
    duration = 14
  ): void {
    while (this.craters.length >= this.maxCraters) {
      const oldest = this.craters.shift();
      if (oldest) this.disposeGroup(oldest.group);
    }

    const group = new THREE.Group();
    const scorchDisc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.92, 20),
      new THREE.MeshBasicMaterial({
        color: 0x090d14,
        transparent: true,
        opacity: 0.78,
      })
    );
    scorchDisc.rotation.x = -Math.PI / 2;
    scorchDisc.position.y = 0.062;

    const magmaRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.58, radius * 0.95, 18),
      new THREE.MeshBasicMaterial({
        color: glowHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    magmaRing.rotation.x = -Math.PI / 2;
    magmaRing.position.y = 0.068;

    group.add(scorchDisc, magmaRing);

    // Зубчатая каменная кромка по краю кратера
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x27303d, roughness: 0.9 });
    const rimChunks = 7;
    for (let i = 0; i < rimChunks; i++) {
      const a = (i / rimChunks) * Math.PI * 2 + Math.random() * 0.3;
      const chunk = new THREE.Mesh(this.rockGeoSmall, rimMat);
      chunk.position.set(Math.cos(a) * radius * 0.86, 0.14, Math.sin(a) * radius * 0.86);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      chunk.scale.set(1.1, 0.55, 0.9);
      group.add(chunk);
    }

    group.position.set(center.x, 0, center.z);
    this.scene.add(group);
    this.craters.push({ group, life: duration, maxLife: duration });
  }

  /**
   * Ударная волна взрыва: разбрасывает лежащие на земле осколки и Ragdoll-тела!
   */
  public applyExplosionForce(center: THREE.Vector3, radius: number, strength: number): void {
    const rSq = radius * radius;

    for (const d of this.debris) {
      const dx = d.mesh.position.x - center.x;
      const dz = d.mesh.position.z - center.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < rSq) {
        const dist = Math.max(0.4, Math.sqrt(dSq));
        const falloff = 1 - dist / radius;
        const push = strength * falloff;
        d.velocity.x += (dx / dist) * push;
        d.velocity.z += (dz / dist) * push;
        d.velocity.y += push * 0.68 + 2.5;
        d.angularVelocity.set(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14
        );
      }
    }

    const fixedDt = 1 / 60;
    for (const rag of this.ragdolls) {
      for (const node of rag.nodes) {
        const dx = node.pos.x - center.x;
        const dz = node.pos.z - center.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < rSq) {
          const dist = Math.max(0.4, Math.sqrt(dSq));
          const falloff = 1 - dist / radius;
          const push = strength * falloff * 0.85;
          node.prevPos.x -= (dx / dist) * push * fixedDt;
          node.prevPos.z -= (dz / dist) * push * fixedDt;
          node.prevPos.y -= (push * 0.6 + 2.2) * fixedDt;
        }
      }
    }
  }

  private spawnSingleDebris(
    pos: THREE.Vector3,
    velocity: THREE.Vector3,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    halfHeight: number,
    scale: number,
    maxLife: number
  ): void {
    while (this.debris.length >= this.maxDebris) {
      const oldest = this.debris.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
      }
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.scale.setScalar(scale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(mesh);

    this.debris.push({
      mesh,
      velocity,
      angularVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * 11,
        (Math.random() - 0.5) * 11,
        (Math.random() - 0.5) * 11
      ),
      halfHeight: Math.max(0.12, halfHeight),
      radius: Math.max(0.2, halfHeight * 1.1),
      restitution: 0.38 + Math.random() * 0.16,
      friction: 0.78,
      gravity: 23.5,
      life: maxLife,
      maxLife,
    });
  }

  public update(dt: number): void {
    const safeDt = Math.min(0.033, Math.max(0.001, dt));

    // 1. Обновление твёрдых 3D-обломков (камни, кристаллы, щепки, куски оружия)
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const b = this.debris[i];
      b.life -= safeDt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.debris.splice(i, 1);
        continue;
      }

      b.velocity.y -= b.gravity * safeDt;
      b.mesh.position.addScaledVector(b.velocity, safeDt);

      // Столкновение и отскок от поверхности арены
      if (b.mesh.position.y < b.halfHeight) {
        b.mesh.position.y = b.halfHeight;
        if (b.velocity.y < -2.2) {
          b.velocity.y = -b.velocity.y * b.restitution;
          b.velocity.x *= b.friction;
          b.velocity.z *= b.friction;
          b.angularVelocity.multiplyScalar(0.68);
        } else {
          b.velocity.y = 0;
          b.velocity.x *= Math.max(0, 1 - 7.5 * safeDt);
          b.velocity.z *= Math.max(0, 1 - 7.5 * safeDt);
          b.angularVelocity.multiplyScalar(Math.max(0, 1 - 9.0 * safeDt));
        }
      }

      // Столкновение со скалами и преградами
      this.tmpPos.set(b.mesh.position.x, 0, b.mesh.position.z);
      resolveArenaCollisions(this.tmpPos, b.radius);
      if (
        Math.abs(this.tmpPos.x - b.mesh.position.x) > 0.001 ||
        Math.abs(this.tmpPos.z - b.mesh.position.z) > 0.001
      ) {
        b.mesh.position.x = this.tmpPos.x;
        b.mesh.position.z = this.tmpPos.z;
        b.velocity.x *= -0.45;
        b.velocity.z *= -0.45;
      }

      b.mesh.rotation.x += b.angularVelocity.x * safeDt;
      b.mesh.rotation.y += b.angularVelocity.y * safeDt;
      b.mesh.rotation.z += b.angularVelocity.z * safeDt;

      // Плавное погружение осколков в землю в конце жизни
      if (b.life < 0.85) {
        const shrink = Math.max(0.05, b.life / 0.85);
        b.mesh.position.y -= (1 - shrink) * 0.35 * safeDt * 10;
      }
    }

    // 2. Обновление падающих срубленных деревьев
    for (let i = this.fallingTrees.length - 1; i >= 0; i--) {
      const ft = this.fallingTrees[i];
      ft.life -= safeDt;
      if (ft.life <= 0) {
        this.disposeGroup(ft.pivot);
        this.fallingTrees.splice(i, 1);
        continue;
      }

      if (ft.angle < Math.PI * 0.48) {
        ft.angularSpeed += Math.sin(Math.max(0.12, ft.angle)) * 6.8 * safeDt;
        ft.angle += ft.angularSpeed * safeDt;
        if (ft.angle >= Math.PI * 0.48) {
          ft.angle = Math.PI * 0.48;
          if (!ft.bounced) {
            ft.bounced = true;
            ft.angularSpeed = -ft.angularSpeed * 0.22;
            // При ударе кроны о землю разлетаются ветви и листва!
            const tipOffset = new THREE.Vector3(0, 6.2, 0).applyAxisAngle(ft.fallAxis, ft.angle);
            this.spawnFractureBurst(
              ft.pivot.position.clone().add(tipOffset),
              'wood',
              8,
              undefined,
              0x226347,
              0x452c1e,
              0.9
            );
          } else {
            ft.angularSpeed = 0;
          }
        }
      } else if (Math.abs(ft.angularSpeed) > 0.02) {
        ft.angularSpeed += 6.0 * safeDt;
        ft.angle = Math.min(Math.PI * 0.48, ft.angle + ft.angularSpeed * safeDt);
      }

      ft.pivot.setRotationFromAxisAngle(ft.fallAxis, ft.angle);
      if (ft.life < 1.0) {
        ft.pivot.position.y = 0.65 - (1.0 - ft.life) * 1.4;
      }
    }

    // 3. Обновление шарнирных 3D Ragdoll-тел (Verlet + 4 итерации костных связей)
    const gravityStep = 23.5 * safeDt * safeDt;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const rag = this.ragdolls[i];
      rag.life -= safeDt;
      if (rag.life <= 0) {
        this.removeRagdollAt(i);
        continue;
      }

      // Интеграция Верле
      for (const n of rag.nodes) {
        const vx = (n.pos.x - n.prevPos.x) * 0.985;
        const vy = (n.pos.y - n.prevPos.y) * 0.988;
        const vz = (n.pos.z - n.prevPos.z) * 0.985;

        n.prevPos.copy(n.pos);
        n.pos.x += vx;
        n.pos.y += vy - gravityStep;
        n.pos.z += vz;
      }

      // 4 итерации решения ограничений костей + коллизий с землёй и скалами
      let hitGroundHard = false;
      for (let iter = 0; iter < 4; iter++) {
        for (const c of rag.constraints) {
          const na = rag.nodes[c.a];
          const nb = rag.nodes[c.b];
          this.tmpDelta.subVectors(nb.pos, na.pos);
          const dist = this.tmpDelta.length();
          if (dist < 1e-5) continue;
          const diff = (dist - c.restLength) / dist;
          const wSum = na.invMass + nb.invMass;
          if (wSum <= 0) continue;
          const corr = diff * c.stiffness;
          const corrA = corr * (na.invMass / wSum);
          const corrB = corr * (nb.invMass / wSum);
          na.pos.addScaledVector(this.tmpDelta, corrA);
          nb.pos.addScaledVector(this.tmpDelta, -corrB);
        }

        for (const n of rag.nodes) {
          if (n.pos.y < n.radius) {
            const impactVel = n.prevPos.y - n.pos.y;
            if (impactVel > 0.14) hitGroundHard = true;
            n.pos.y = n.radius;
            // Трение о каменную мостовую арены
            n.prevPos.x = THREE.MathUtils.lerp(n.prevPos.x, n.pos.x, 0.24);
            n.prevPos.z = THREE.MathUtils.lerp(n.prevPos.z, n.pos.z, 0.24);
          }

          this.tmpPos.set(n.pos.x, 0, n.pos.z);
          resolveArenaCollisions(this.tmpPos, n.radius);
          n.pos.x = this.tmpPos.x;
          n.pos.z = this.tmpPos.z;
        }
      }

      if (hitGroundHard && !rag.settledSoundPlayed) {
        rag.settledSoundPlayed = true;
        this.onImpactSound?.();
      }

      const sinkOffset = rag.life < 1.1 ? (1.1 - rag.life) * 1.15 : 0;
      this.syncRagdollMeshes(rag, sinkOffset);
    }

    // 4. Затухание кратеров и выжженных следов на земле
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const c = this.craters[i];
      c.life -= safeDt;
      if (c.life <= 0) {
        this.disposeGroup(c.group);
        this.craters.splice(i, 1);
        continue;
      }
      if (c.life < 3.0) {
        const alpha = c.life / 3.0;
        c.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.Material;
            if (mat.transparent) {
              mat.opacity = alpha * 0.7;
            }
          }
        });
      }
    }
  }

  private syncRagdollMeshes(rag: ActiveRagdoll, sinkOffset: number): void {
    for (const limb of rag.limbs) {
      const a = rag.nodes[limb.nodeA].pos;
      const b = rag.nodes[limb.nodeB].pos;
      this.tmpMid.addVectors(a, b).multiplyScalar(0.5);
      this.tmpMid.y -= sinkOffset;
      limb.mesh.position.copy(this.tmpMid);

      this.tmpDir.subVectors(b, a);
      if (this.tmpDir.lengthSq() > 1e-6) {
        this.tmpDir.normalize();
        limb.mesh.quaternion.setFromUnitVectors(this.upVec, this.tmpDir);
      }
    }

    const chest = rag.nodes[1].pos;
    const head = rag.nodes[2].pos;
    rag.headMesh.position.set(head.x, head.y - sinkOffset, head.z);
    this.tmpDir.subVectors(head, chest);
    if (this.tmpDir.lengthSq() > 1e-6) {
      this.tmpDir.normalize();
      rag.headMesh.quaternion.setFromUnitVectors(this.upVec, this.tmpDir);
    }
  }

  private removeRagdollAt(index: number): void {
    const rag = this.ragdolls[index];
    if (!rag) return;
    this.disposeGroup(rag.group);
    this.ragdolls.splice(index, 1);
  }

  private disposeGroup(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        if (
          m.geometry !== this.rockGeoSmall &&
          m.geometry !== this.rockGeoMed &&
          m.geometry !== this.rockGeoSlab &&
          m.geometry !== this.crystalGeo &&
          m.geometry !== this.woodChunkGeo &&
          m.geometry !== this.splinterGeo
        ) {
          m.geometry.dispose();
        }
      }
    });
  }

  public clearAll(): void {
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      this.removeRagdollAt(i);
    }
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
    }
    for (const ft of this.fallingTrees) {
      this.disposeGroup(ft.pivot);
    }
    for (const cr of this.craters) {
      this.disposeGroup(cr.group);
    }
    this.debris = [];
    this.fallingTrees = [];
    this.craters = [];
  }
}
