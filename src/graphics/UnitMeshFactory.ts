import * as THREE from 'three';
import type { HeroArchetypeId } from '../types/game';

export function createHeroThirdPersonMesh(
  archetype: HeroArchetypeId,
  team: 'radiant' | 'dire',
  accentHexStr: string
): THREE.Group {
  const group = new THREE.Group();
  const teamColor = team === 'radiant' ? 0x2dd4bf : 0xef4444;
  const accentColor = new THREE.Color(accentHexStr).getHex();

  const armorMat = new THREE.MeshStandardMaterial({
    color: team === 'radiant' ? 0x1e3a4c : 0x3b1d24,
    roughness: 0.45,
    metalness: 0.55,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.28,
    roughness: 0.35,
    metalness: 0.7,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd6c7b8,
    roughness: 0.7,
  });

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.18, 24),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  // Золотая сфера аватара BKB (показывается во время иммунитета к магии)
  const bkbAura = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 14, 12),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    })
  );
  bkbAura.position.y = 1.4;
  bkbAura.visible = false;
  bkbAura.name = 'bkbAura';
  group.add(bkbAura);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.34), armorMat);
  leftLeg.position.set(-0.24, 0.45, 0);
  leftLeg.name = 'leftLeg';
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.34), armorMat);
  rightLeg.position.set(0.24, 0.45, 0);
  rightLeg.name = 'rightLeg';

  const isHeavy = archetype === 'butcher' || archetype === 'warden' || archetype === 'berserker';
  const torsoWidth = isHeavy ? 1.05 : 0.78;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, 1.05, 0.54), armorMat);
  torso.position.y = 1.42;
  torso.castShadow = true;

  const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.58), trimMat);
  emblem.position.y = 1.5;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.48), skinMat);
  head.position.y = 2.24;
  head.castShadow = true;

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.52),
    new THREE.MeshBasicMaterial({ color: teamColor })
  );
  visor.position.set(0, 2.28, -0.02);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(torsoWidth * 0.5 + 0.18, 1.78, 0);
  rightArmPivot.name = 'rightArmPivot';

  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.78, 0.28), armorMat);
  armMesh.position.y = -0.3;
  rightArmPivot.add(armMesh);

  if (archetype === 'butcher') {
    const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 1.35), trimMat);
    cleaver.position.set(0, -0.55, -0.65);
    rightArmPivot.add(cleaver);
  } else if (archetype === 'invoker') {
    for (let i = 0; i < 3; i++) {
      const orbColors = [0x38bdf8, 0xf97316, 0xeab308];
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 1),
        new THREE.MeshBasicMaterial({ color: orbColors[i] })
      );
      const angle = (i / 3) * Math.PI * 2;
      orb.position.set(Math.cos(angle) * 0.85, 2.55, Math.sin(angle) * 0.85);
      orb.name = `orb_${i}`;
      group.add(orb);
    }
  } else if (archetype === 'phantom') {
    const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 4), trimMat);
    dagger.rotation.x = -Math.PI / 2;
    dagger.position.set(0, -0.55, -0.55);
    rightArmPivot.add(dagger);
  } else if (archetype === 'marksman') {
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 1.85), trimMat);
    rifle.position.set(-0.1, -0.42, -0.82);
    rightArmPivot.add(rifle);
  } else if (archetype === 'berserker') {
    const axeShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 6), armorMat);
    axeShaft.rotation.x = Math.PI / 2;
    axeShaft.position.set(0, -0.5, -0.65);
    const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.14), trimMat);
    axeBlade.position.set(0, -0.5, -1.25);
    rightArmPivot.add(axeShaft, axeBlade);
  } else if (archetype === 'warden') {
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.7), trimMat);
    hammer.position.set(0, -0.55, -0.95);
    rightArmPivot.add(hammer);

    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.95), trimMat);
    shield.position.set(-(torsoWidth * 0.5 + 0.28), 1.35, -0.35);
    group.add(shield);
  }

  group.add(leftLeg, rightLeg, torso, emblem, head, visor, rightArmPivot);
  return group;
}

export function animateHeroMesh(
  mesh: THREE.Group,
  dt: number,
  speed: number,
  swingAnim: number,
  isStealthed: boolean,
  isBkbActive = false
): void {
  const leftLeg = mesh.getObjectByName('leftLeg');
  const rightLeg = mesh.getObjectByName('rightLeg');
  const rightArm = mesh.getObjectByName('rightArmPivot');
  const bkbAura = mesh.getObjectByName('bkbAura');

  if (bkbAura) {
    bkbAura.visible = isBkbActive;
    if (isBkbActive) bkbAura.rotation.y += dt * 3.2;
  }
  mesh.scale.setScalar(isBkbActive ? 1.22 : 1.0);

  const walkPhase = performance.now() * 0.011;
  const moveFactor = Math.min(1, speed / 7);

  if (leftLeg && rightLeg) {
    leftLeg.rotation.x = Math.sin(walkPhase) * 0.65 * moveFactor;
    rightLeg.rotation.x = -Math.sin(walkPhase) * 0.65 * moveFactor;
  }
  if (rightArm) {
    rightArm.rotation.x =
      swingAnim > 0
        ? -Math.sin(swingAnim * Math.PI) * 1.45
        : -Math.sin(walkPhase) * 0.35 * moveFactor;
  }

  for (let i = 0; i < 3; i++) {
    const orb = mesh.getObjectByName(`orb_${i}`);
    if (orb) {
      const a = performance.now() * 0.003 + (i * Math.PI * 2) / 3;
      orb.position.x = Math.cos(a) * 0.88;
      orb.position.z = Math.sin(a) * 0.88;
      orb.rotation.y += dt * 2.5;
    }
  }

  mesh.visible = true;
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name !== 'bkbAura') {
      const m = (child as THREE.Mesh).material as THREE.Material;
      if (isStealthed) {
        m.transparent = true;
        m.opacity = 0.28;
      } else if (m.opacity === 0.28) {
        m.opacity = 1;
      }
    }
  });
}

export function createCreepMesh(
  creepType: 'melee' | 'ranged' | 'siege' | 'lord_boss',
  team: 'radiant' | 'dire',
  empowered: boolean
): THREE.Group {
  const group = new THREE.Group();
  const color = team === 'radiant' ? 0x2dd4bf : 0xef4444;
  const bodyHex = team === 'radiant' ? 0x1d4d4f : 0x4f1d24;

  // ГИГАНТСКИЙ МАРШИРУЮЩИЙ ЛОРД-ТИТАН (как в Mobile Legends!)
  if (creepType === 'lord_boss') {
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.35,
      metalness: 0.75,
    });
    const goldGlow = new THREE.MeshStandardMaterial({
      color: 0xf2cb78,
      emissive: color,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.8, 1.7), armorMat);
    torso.position.y = 2.4;
    torso.castShadow = true;

    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.6, 6), goldGlow);
    crown.position.y = 4.4;

    const warhammer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 2.4), goldGlow);
    warhammer.position.set(1.45, 2.5, -1.0);

    const auraRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2cb78, side: THREE.DoubleSide })
    );
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.08;

    group.add(torso, crown, warhammer, auraRing);
    return group;
  }

  const scale = empowered ? 1.32 : 1.0;
  const mat = new THREE.MeshStandardMaterial({
    color: bodyHex,
    roughness: 0.6,
    metalness: 0.35,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: empowered ? 0.85 : 0.4,
  });

  if (creepType === 'siege') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 2.1), mat);
    hull.position.y = 0.65;
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.6, 8), glowMat);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, 1.15, -0.5);
    group.add(hull, cannon);
  } else {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, creepType === 'melee' ? 0.68 : 0.56, 4, 8),
      mat
    );
    body.position.y = 0.82;
    const crest = new THREE.Mesh(
      creepType === 'melee'
        ? new THREE.BoxGeometry(0.5, 0.28, 0.5)
        : new THREE.ConeGeometry(0.34, 0.65, 5),
      glowMat
    );
    crest.position.y = 1.52;
    group.add(body, crest);
  }

  group.scale.setScalar(scale);
  return group;
}

export function createTowerOrAncientMesh(
  team: 'radiant' | 'dire',
  tier: 1 | 2 | 3 | 4,
  attackRange: number
): { group: THREE.Group; crystal: THREE.Mesh; laserLine: THREE.Line } {
  const group = new THREE.Group();
  const isAncient = tier === 4;
  const mainColor = team === 'radiant' ? 0x2dd4bf : 0xef4444;
  const stoneColor = team === 'radiant' ? 0x243447 : 0x2f1d22;

  const stoneMat = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.55,
    metalness: 0.35,
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: mainColor,
    emissive: mainColor,
    emissiveIntensity: 1.15,
    roughness: 0.15,
    metalness: 0.2,
  });

  if (isAncient) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 2.2, 8), stoneMat);
    base.position.y = 1.1;
    base.castShadow = true;

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.2, 1.1), stoneMat);
      pillar.position.set(Math.cos(a) * 3.8, 3.1, Math.sin(a) * 3.8);
      group.add(pillar);
    }

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.35, 0), crystalMat);
    crystal.position.y = 5.6;
    group.add(base, crystal);

    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 5.6, 0),
      new THREE.Vector3(0, 5.6, 0),
    ]);
    const laserLine = new THREE.Line(
      laserGeo,
      new THREE.LineBasicMaterial({ color: mainColor, transparent: true, opacity: 0.9 })
    );
    laserLine.visible = false;
    group.add(laserLine);

    return { group, crystal, laserLine };
  }

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.25, 5.4, 8), stoneMat);
  base.position.y = 2.7;
  base.castShadow = true;

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.5, 1.1, 8), stoneMat);
  crown.position.y = 5.6;

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), crystalMat);
  crystal.position.y = 7.3;

  const rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(attackRange - 0.14, attackRange, 48),
    new THREE.MeshBasicMaterial({
      color: mainColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.24,
    })
  );
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.07;

  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 7.3, 0),
    new THREE.Vector3(0, 1.2, 0),
  ]);
  const laserLine = new THREE.Line(
    laserGeo,
    new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.88 })
  );
  laserLine.visible = false;

  group.add(base, crown, crystal, rangeRing, laserLine);
  return { group, crystal, laserLine };
}

export function createJungleMonsterMesh(
  campType: 'red_buff' | 'blue_buff' | 'wolf_camp' | 'titan_boss' | 'elemental_turtle'
): THREE.Group {
  const group = new THREE.Group();

  if (campType === 'elemental_turtle') {
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x115e59,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.3,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.75, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
    shell.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 1.1), shellMat);
    head.position.set(0, 0.75, -1.85);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65, 0),
      new THREE.MeshBasicMaterial({ color: 0x5eead4 })
    );
    gem.position.y = 2.1;
    group.add(shell, head, gem);
    return group;
  }

  const isBoss = campType === 'titan_boss';
  const color =
    campType === 'titan_boss'
      ? 0xf2cb78
      : campType === 'red_buff'
        ? 0xf97316
        : campType === 'blue_buff'
          ? 0x38bdf8
          : 0x94a3b8;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isBoss ? 0x282119 : 0x262e38,
    roughness: 0.55,
    metalness: 0.45,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
  });

  const scale = isBoss ? 2.25 : campType === 'wolf_camp' ? 0.95 : 1.35;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.95), bodyMat);
  torso.position.y = 1.25;
  torso.castShadow = true;

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), coreMat);
  core.position.set(0, 1.35, -0.38);

  const horns = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 5), coreMat);
  horns.position.set(0, 2.35, 0);

  group.add(torso, core, horns);
  group.scale.setScalar(scale);
  return group;
}

export function createWardMesh(team: 'radiant' | 'dire'): THREE.Group {
  const group = new THREE.Group();
  const color = team === 'radiant' ? 0x2dd4bf : 0xef4444;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.22, 1.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
  );
  pole.position.y = 0.75;
  const eye = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: color, emissiveIntensity: 1.1 })
  );
  eye.position.y = 1.8;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(13.8, 14.0, 32),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;

  group.add(pole, eye, ring);
  return group;
}

export function createOutpostMesh(): { group: THREE.Group; beacon: THREE.Mesh } {
  const group = new THREE.Group();
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.1, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x273244, roughness: 0.6, metalness: 0.35 })
  );
  stone.position.y = 1.6;

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: 0x94a3b8,
      emissiveIntensity: 0.9,
    })
  );
  beacon.position.y = 4.2;

  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(5.7, 6.0, 32),
    new THREE.MeshBasicMaterial({
      color: 0xf2cb78,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    })
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.07;

  group.add(stone, beacon, zoneRing);
  return { group, beacon };
}

export function createProjectileMesh(color: number, scale = 1): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 10, 10), mat);
}
