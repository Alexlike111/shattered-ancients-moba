import * as THREE from 'three';
import type { HeroArchetypeId } from '../types/game';

export class ViewModelRig {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.05, 12);

  private root = new THREE.Group();
  private rightHand = new THREE.Group();
  private leftHand = new THREE.Group();
  private orbsGroup = new THREE.Group();
  private parryShieldMesh: THREE.Mesh;

  private currentArchetype: HeroArchetypeId = 'butcher';
  private attackAnim = 0;
  private castAnim = 0;
  private spinActive = false;
  private bobTimer = 0;
  private swayX = 0;
  private swayY = 0;

  constructor() {
    const amb = new THREE.AmbientLight(0xdbeafe, 1.15);
    const keyLight = new THREE.DirectionalLight(0xfff4d6, 1.6);
    keyLight.position.set(2, 4, 3);
    this.scene.add(amb, keyLight, this.root);

    // Энергетическая дуга Идеального Парирования от первого лица!
    this.parryShieldMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.52, 6),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      })
    );
    this.parryShieldMesh.position.set(0, -0.05, -0.68);
    this.parryShieldMesh.visible = false;

    this.root.add(this.rightHand, this.leftHand, this.orbsGroup, this.parryShieldMesh);
    this.setHeroArchetype('butcher');
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public setHeroArchetype(archetype: HeroArchetypeId): void {
    this.currentArchetype = archetype;
    this.rightHand.clear();
    this.leftHand.clear();
    this.orbsGroup.clear();

    const gauntletMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.42,
      metalness: 0.65,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.85,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4a853,
      emissive: 0xd4a853,
      emissiveIntensity: 0.22,
      roughness: 0.3,
      metalness: 0.8,
    });

    const rForearm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.52), gauntletMat);
    rForearm.position.set(0.36, -0.34, -0.52);
    this.rightHand.add(rForearm);

    const lForearm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.48), gauntletMat);
    lForearm.position.set(-0.36, -0.36, -0.5);
    this.leftHand.add(lForearm);

    if (archetype === 'butcher') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.62), steelMat);
      blade.position.set(0.34, -0.2, -0.82);
      this.rightHand.add(blade);

      const hookShank = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 8), goldMat);
      hookShank.rotation.x = Math.PI / 2;
      hookShank.position.set(-0.34, -0.24, -0.74);
      const hookCurve = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.028, 8, 14, Math.PI * 1.25),
        steelMat
      );
      hookCurve.position.set(-0.34, -0.18, -0.96);
      this.leftHand.add(hookShank, hookCurve);
    } else if (archetype === 'invoker') {
      const rGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06, 0),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      rGem.position.set(0.34, -0.24, -0.68);
      this.rightHand.add(rGem);

      const colors = [0x38bdf8, 0xf97316, 0xfacc15];
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.075, 1),
          new THREE.MeshStandardMaterial({
            color: colors[i],
            emissive: colors[i],
            emissiveIntensity: 1.1,
            roughness: 0.15,
          })
        );
        this.orbsGroup.add(orb);
      }
    } else if (archetype === 'phantom') {
      const daggerMat = new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x14b8a6,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.75,
      });
      const rDagger = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.56, 4), daggerMat);
      rDagger.rotation.x = -Math.PI / 2;
      rDagger.position.set(0.32, -0.24, -0.82);
      this.rightHand.add(rDagger);

      const lDagger = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.56, 4), daggerMat);
      lDagger.rotation.x = -Math.PI / 2;
      lDagger.position.set(-0.32, -0.25, -0.8);
      this.leftHand.add(lDagger);
    } else if (archetype === 'marksman') {
      this.leftHand.visible = false;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.95), gauntletMat);
      body.position.set(0.26, -0.27, -0.72);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.65, 10), steelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.26, -0.23, -1.25);
      const energyCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.05, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      energyCore.position.set(0.26, -0.21, -0.78);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), goldMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.26, -0.15, -0.68);
      this.rightHand.add(body, barrel, energyCore, scope);
      return;
    } else if (archetype === 'berserker') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.05, 8), gauntletMat);
      shaft.rotation.x = Math.PI / 2.4;
      shaft.rotation.z = 0.2;
      shaft.position.set(0.28, -0.22, -0.78);

      const axeHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.28, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 0.55,
          metalness: 0.7,
        })
      );
      axeHead.position.set(0.22, -0.02, -1.06);
      this.rightHand.add(shaft, axeHead);
    } else if (archetype === 'warden') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.75, 8), gauntletMat);
      shaft.rotation.x = Math.PI / 2.3;
      shaft.position.set(0.35, -0.2, -0.76);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.32), goldMat);
      head.position.set(0.35, -0.02, -0.98);
      this.rightHand.add(shaft, head);

      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.44), goldMat);
      shield.rotation.y = 0.35;
      shield.position.set(-0.42, -0.22, -0.68);
      this.leftHand.add(shield);
    }

    this.leftHand.visible = true;
  }

  public triggerPrimaryAttack(): void {
    this.attackAnim = 1.0;
  }

  public triggerAbilityCast(): void {
    this.castAnim = 1.0;
  }

  public addLookDelta(dx: number, dy: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.14, -0.08, 0.08);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.14, -0.08, 0.08);
  }

  public update(
    dt: number,
    moveSpeedRatio: number,
    isStealthed: boolean,
    isSpinning: boolean,
    isScoped: boolean,
    isParrying = false,
    isSliding = false
  ): void {
    this.spinActive = isSpinning;
    this.root.visible = !isScoped;
    this.parryShieldMesh.visible = isParrying;
    if (isParrying) {
      this.parryShieldMesh.rotation.z += dt * 8;
    }

    this.bobTimer += dt * (2.5 + moveSpeedRatio * 8.5);
    const bobX = isSliding ? 0 : Math.cos(this.bobTimer * 0.5) * 0.016 * moveSpeedRatio;
    const bobY = isSliding ? 0 : Math.abs(Math.sin(this.bobTimer)) * 0.022 * moveSpeedRatio;

    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, Math.min(1, dt * 10));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, Math.min(1, dt * 10));

    this.root.position.set(bobX + this.swayX, -bobY + this.swayY, 0);
    // Лёгкий боевой наклон оружия во время тактического подката!
    this.root.rotation.z = THREE.MathUtils.lerp(
      this.root.rotation.z,
      isSliding ? -0.14 : 0,
      Math.min(1, dt * 12)
    );

    if (this.attackAnim > 0) {
      this.attackAnim = Math.max(0, this.attackAnim - dt * 4.6);
    }
    if (this.castAnim > 0) {
      this.castAnim = Math.max(0, this.castAnim - dt * 3.4);
    }

    const swingPulse = Math.sin(this.attackAnim * Math.PI);
    const castPulse = Math.sin(this.castAnim * Math.PI);

    if (isParrying) {
      // Перекрестная стойка парирования перед камерой!
      this.rightHand.position.set(-0.18, 0.12, -0.08);
      this.rightHand.rotation.set(0.2, 0.65, 0.85);
    } else if (this.currentArchetype === 'marksman') {
      this.rightHand.position.set(0, swingPulse * 0.035, swingPulse * 0.14);
      this.rightHand.rotation.set(swingPulse * 0.14, 0, 0);
    } else if (this.spinActive) {
      this.rightHand.rotation.set(-0.4, 0, performance.now() * 0.025);
    } else {
      this.rightHand.position.set(-swingPulse * 0.12, swingPulse * 0.05, -swingPulse * 0.18);
      this.rightHand.rotation.set(-swingPulse * 0.72, swingPulse * 0.45, -swingPulse * 0.35);
    }

    this.leftHand.position.set(castPulse * 0.06, castPulse * 0.08, -castPulse * 0.24);
    this.leftHand.rotation.set(-castPulse * 0.45, -castPulse * 0.2, 0);

    if (this.orbsGroup.children.length > 0) {
      const t = performance.now() * 0.0028;
      this.orbsGroup.children.forEach((orb, idx) => {
        const angle = t + (idx * Math.PI * 2) / 3;
        orb.position.set(
          Math.cos(angle) * 0.28,
          0.12 + Math.sin(angle * 2) * 0.04,
          -0.82 + Math.sin(angle) * 0.08
        );
        orb.rotation.y += dt * 2.5;
        orb.rotation.x += dt * 1.8;
      });
    }

    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj !== this.parryShieldMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.Material;
        mat.transparent = isStealthed;
        mat.opacity = isStealthed ? 0.36 : 1.0;
      }
    });
  }
}
