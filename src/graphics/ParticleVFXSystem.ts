import * as THREE from 'three';

interface BurstParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface BeamEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class ParticleVFXSystem {
  private scene: THREE.Scene;
  private particles: BurstParticle[] = [];
  private rings: ShockwaveRing[] = [];
  private beams: BeamEffect[] = [];
  private sharedBoxGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  public shakeAmount = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public addCameraShake(intensity: number): void {
    this.shakeAmount = Math.min(0.65, Math.max(this.shakeAmount, intensity));
  }

  public spawnBurst(
    origin: THREE.Vector3,
    colorHex: number,
    count = 14,
    speed = 7.5,
    gravity = 12
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1,
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sharedBoxGeo, mat.clone());
      mesh.position.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const up = 0.25 + Math.random() * 0.95;
      const spd = speed * (0.45 + Math.random() * 0.75);
      const velocity = new THREE.Vector3(
        Math.cos(theta) * spd,
        up * spd * 0.75,
        Math.sin(theta) * spd
      );
      const maxLife = 0.28 + Math.random() * 0.34;
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: maxLife, maxLife, gravity });
    }
  }

  public spawnShockwave(
    center: THREE.Vector3,
    radius: number,
    colorHex: number,
    duration = 0.38
  ): void {
    const geo = new THREE.RingGeometry(0.65, 1.0, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, 0.14, center.z);
    this.scene.add(mesh);
    this.rings.push({
      mesh,
      life: duration,
      maxLife: duration,
      startScale: 0.5,
      endScale: radius,
    });
  }

  public spawnBeam(
    start: THREE.Vector3,
    end: THREE.Vector3,
    colorHex: number,
    thickness = 0.16,
    duration = 0.28
  ): void {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.05) return;

    const geo = new THREE.CylinderGeometry(thickness, thickness, len, 8);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.lookAt(end);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: duration, maxLife: duration });
  }

  public spawnSkyPillar(center: THREE.Vector3, radius: number, colorHex: number): void {
    const geo = new THREE.CylinderGeometry(radius * 0.75, radius, 26, 18, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center.x, 13, center.z);
    this.scene.add(mesh);
    this.beams.push({ mesh, life: 0.55, maxLife: 0.55 });
  }

  public update(dt: number): void {
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.9);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < 0.08) {
        p.mesh.position.y = 0.08;
        p.velocity.y *= -0.3;
      }
      const ratio = p.life / p.maxLife;
      p.mesh.scale.setScalar(ratio);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      const scale = r.startScale + (r.endScale - r.startScale) * t;
      r.mesh.scale.setScalar(scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.88;
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
        continue;
      }
      const ratio = b.life / b.maxLife;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.9;
    }
  }

  public clearAll(): void {
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const r of this.rings) this.scene.remove(r.mesh);
    for (const b of this.beams) this.scene.remove(b.mesh);
    this.particles = [];
    this.rings = [];
    this.beams = [];
    this.shakeAmount = 0;
  }
}
