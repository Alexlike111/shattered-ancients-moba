import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { HERO_DEFINITIONS, HERO_LIST } from '../data/heroes';
import { SHOP_ITEMS_BY_ID } from '../data/items';
import { getAvailableTalentChoices } from '../data/talents';
import {
  ANCIENT_POS,
  DESTRUCTIBLE_PLACEMENTS,
  FOUNTAIN_POS,
  JUNGLE_CAMPS,
  LANE_WAYPOINTS,
  OUTPOST_SPOTS,
  RUNE_SPOTS,
  TOWER_PLACEMENTS,
  isPositionInBrush,
  resolveArenaCollisions,
  segmentHitsObstacle,
  setDynamicDestructibleColliders,
} from '../world/ArenaData';
import { buildArenaWorld, type BuiltArenaVisuals } from '../world/MapBuilder';
import {
  animateHeroMesh,
  createCreepMesh,
  createHeroThirdPersonMesh,
  createJungleMonsterMesh,
  createOutpostMesh,
  createProjectileMesh,
  createTowerOrAncientMesh,
  createWardMesh,
} from '../graphics/UnitMeshFactory';
import { ViewModelRig } from '../graphics/ViewModelRig';
import { ParticleVFXSystem } from '../graphics/ParticleVFXSystem';
import { DestructionPhysicsSystem } from '../physics/DestructionPhysicsSystem';
import { SoundEngine } from '../audio/SoundEngine';
import { InputController, detectMobileOrTouchDevice } from '../input/InputController';
import { AIController } from '../systems/AIController';
import {
  MAX_HERO_LEVEL,
  canUpgradeAbility,
  computeHeroStats,
  isBackstabAngle,
  mitigateDamage,
  xpRequiredForNextLevel,
} from '../systems/StatsCalculator';
import { HUDManager, type LobbyStartConfig } from '../ui/HUDManager';
import type {
  AbilitySlot,
  ActiveProjectile,
  CreepRuntime,
  DestructiblePropRuntime,
  GraphicsQuality,
  GroundZoneEffect,
  HeroArchetypeId,
  HeroRuntime,
  JungleMonsterRuntime,
  LaneId,
  MatchMode,
  OutpostRuntime,
  RiverRuneRuntime,
  TacticalPing,
  TalentMutationId,
  TeamId,
  TowerRuntime,
  VisionWardRuntime,
} from '../types/game';

export class MobaGameEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private isMobileDevice: boolean;

  private arenaVisuals: BuiltArenaVisuals;
  private viewModel = new ViewModelRig();
  private vfx: ParticleVFXSystem;
  private physics: DestructionPhysicsSystem;
  private sound = new SoundEngine();
  private ai = new AIController();
  private input: InputController;
  private hud: HUDManager;

  private state: 'lobby' | 'playing' | 'ended' = 'lobby';
  private matchMode: MatchMode = '5v5';
  private quality: GraphicsQuality = 'ultra';

  private lobbyStageGroup = new THREE.Group();
  private lobbyOrbitAngle = 0;

  private heroes: HeroRuntime[] = [];
  private playerHero: HeroRuntime | null = null;
  private creeps: CreepRuntime[] = [];
  private towers: TowerRuntime[] = [];
  private monsters: JungleMonsterRuntime[] = [];
  private runes: RiverRuneRuntime[] = [];
  private wards: VisionWardRuntime[] = [];
  private outposts: OutpostRuntime[] = [];
  private destructibles: DestructiblePropRuntime[] = [];
  private projectiles: ActiveProjectile[] = [];
  private groundZones: GroundZoneEffect[] = [];
  private pings: TacticalPing[] = [];

  private elapsedTime = 0;
  private dayNightOffset = 0;
  private isNightTime = false;
  private waveTimer = 19.5;
  private waveCounter = 0;
  private radiantEmpoweredTimer = 0;
  private direEmpoweredTimer = 0;
  private radiantKills = 0;
  private direKills = 0;
  private firstBloodClaimed = false;
  private sniperZoomTimer = 0;
  private playerJumpVelY = 0;

  private lastHitImpulse = new THREE.Vector3(0, 4, 0);
  private daySkyColor = new THREE.Color(0x1b3352);
  private nightSkyColor = new THREE.Color(0x060b16);
  private dayFogColor = new THREE.Color(0x0d1826);
  private nightFogColor = new THREE.Color(0x050811);

  private lastFrameTime = performance.now();
  private idCounter = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobileDevice = detectMobileOrTouchDevice();

    // Надёжная инициализация WebGL с запасным режимом для мобильных браузеров
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !this.isMobileDevice,
        powerPreference: 'high-performance',
      });
    } catch {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
      });
    }

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.isMobileDevice ? 1.5 : 2)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.15,
      360
    );

    this.setupLightingAndAtmosphere();
    this.arenaVisuals = buildArenaWorld(this.scene);
    this.vfx = new ParticleVFXSystem(this.scene);
    this.physics = new DestructionPhysicsSystem(this.scene);
    this.physics.onImpactSound = () => this.sound.playRagdollImpact();

    const defaultQuality: GraphicsQuality = this.isMobileDevice ? 'high' : 'ultra';
    this.setupPostProcessing(defaultQuality);
    this.physics.setQualityBudget(defaultQuality, this.isMobileDevice);

    this.scene.add(this.lobbyStageGroup);
    this.setLobbyPreviewHero('butcher');

    this.hud = new HUDManager({
      onSelectLobbyHero: (heroId) => this.setLobbyPreviewHero(heroId),
      onStartMatch: (cfg) => this.startMatch(cfg),
      onReturnToLobby: () => this.returnToLobby(),
      onCastAbility: (slot) => {
        if (this.playerHero) this.castHeroAbility(this.playerHero, slot);
      },
      onUpgradeAbility: (slot) => {
        if (this.playerHero) this.upgradeHeroAbility(this.playerHero, slot);
      },
      onCastBattleSpell: () => {
        if (this.playerHero) this.castBattleSpell(this.playerHero);
      },
      onRecall: () => {
        if (this.playerHero && this.playerHero.alive) {
          this.playerHero.isRecalling = true;
          this.playerHero.recallTimer = 3.5;
          this.hud.showAnnouncer('ТЕЛЕПОРТАЦИЯ НА БАЗУ...', 'Не двигайтесь 3.5 сек');
        }
      },
      onParry: () => {
        if (this.playerHero) this.triggerParry(this.playerHero);
      },
      onSlide: () => {
        if (this.playerHero) this.triggerSlide(this.playerHero);
      },
      onPlaceWard: () => {
        if (this.playerHero) this.placeWard(this.playerHero);
      },
      onUseActiveItem: (activeIdx) => {
        if (this.playerHero) this.useActiveItem(this.playerHero, activeIdx, true);
      },
      onChooseTalent: (branch) => {
        if (this.playerHero) this.chooseHeroTalent(this.playerHero, branch);
      },
      onBuyItem: (itemId) => {
        if (this.playerHero && this.buyItemForHero(this.playerHero, itemId)) {
          this.sound.playGoldCoin();
        }
      },
      onSendPing: (kind, worldPos) => this.sendTacticalPing(kind, worldPos),
      onToggleTouchHUD: () => {
        this.input.isTouchMode = !this.input.isTouchMode;
        if (this.input.isTouchMode) this.input.releasePointerLock();
        this.hud.setTouchModeUI(this.input.isTouchMode);
      },
      onToggleMute: () => {
        const nextMuted = !this.sound.isMuted();
        this.sound.setMuted(nextMuted);
        return nextMuted;
      },
      onTouchMove: (x, z) => {
        this.input.touchMoveX = x;
        this.input.touchMoveZ = z;
      },
      onTouchLook: (dx, dy) => this.applyPlayerLookDelta(dx, dy),
      onTouchPrimaryFire: (pressed) => {
        this.input.primaryFireHeld = pressed;
      },
      onSandboxCommand: (cmd) => this.executeSandboxCommand(cmd),
    });

    this.input = new InputController(this.canvas, {
      onCastAbility: (slot) => {
        if (this.state === 'playing' && this.playerHero) {
          this.castHeroAbility(this.playerHero, slot);
        }
      },
      onUpgradeAbility: (slot) => {
        if (this.state === 'playing' && this.playerHero) {
          this.upgradeHeroAbility(this.playerHero, slot);
        }
      },
      onCastBattleSpell: () => {
        if (this.state === 'playing' && this.playerHero) {
          this.castBattleSpell(this.playerHero);
        }
      },
      onStartRecall: () => {
        if (this.state === 'playing' && this.playerHero && this.playerHero.alive) {
          this.playerHero.isRecalling = true;
          this.playerHero.recallTimer = 3.5;
          this.hud.showAnnouncer('ВОЗВРАТ К ФОНТАНУ...', '3.5 сек до телепорта');
        }
      },
      onQuickBuySlot: (idx) => {
        if (this.state !== 'playing' || !this.playerHero) return;
        const candidates = this.playerHero.heroDef.recommendedBuild.filter(
          (id) => !this.playerHero!.items.some((owned) => owned.id === id)
        );
        const targetId = candidates[idx];
        if (targetId && this.buyItemForHero(this.playerHero, targetId)) {
          this.sound.playGoldCoin();
        }
      },
      onUseActiveItemSlot: (activeIndex) => {
        if (this.state === 'playing' && this.playerHero) {
          this.useActiveItem(this.playerHero, activeIndex, false);
        }
      },
      onParry: () => {
        if (this.state === 'playing' && this.playerHero) {
          this.triggerParry(this.playerHero);
        }
      },
      onSlide: () => {
        if (this.state === 'playing' && this.playerHero) {
          this.triggerSlide(this.playerHero);
        }
      },
      onPlaceWard: () => {
        if (this.state === 'playing' && this.playerHero) {
          this.placeWard(this.playerHero);
        }
      },
      onChooseTalentBranch: (branch) => {
        if (this.state === 'playing' && this.playerHero) {
          this.chooseHeroTalent(this.playerHero, branch);
        }
      },
      onToggleShop: () => {
        if (this.state !== 'playing') return;
        const open = this.hud.toggleShopModal();
        if (open) this.input.releasePointerLock();
      },
      onToggleScoreboard: (visible) => {
        if (this.state === 'playing') this.hud.toggleScoreModal(visible);
      },
      onLookDelta: (dx, dy) => this.applyPlayerLookDelta(dx, dy),
      onJump: () => {
        if (this.state === 'playing' && this.playerHero?.alive && this.playerHero.position.y <= 0.05) {
          this.playerJumpVelY = 7.6;
        }
      },
    });

    window.addEventListener('resize', () => this.onResize());
    this.hud.showLobby();
  }

  private setupLightingAndAtmosphere(): void {
    this.scene.fog = new THREE.FogExp2(0x0d1826, 0.005);

    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d0, 1.85);
    this.sunLight.position.set(-48, 78, 42);
    this.sunLight.castShadow = true;
    const shadowRes = this.isMobileDevice ? 1024 : 2048;
    this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 220;
    const d = 115;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
  }

  private setupPostProcessing(quality: GraphicsQuality): void {
    this.quality = quality;
    if (quality === 'performance') {
      this.composer = null;
      this.bloomPass = null;
      this.renderer.shadowMap.enabled = false;
      return;
    }

    this.renderer.shadowMap.enabled = true;
    try {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));

      if (quality === 'ultra' && !this.isMobileDevice) {
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.36,
          0.55,
          0.82
        );
        this.bloomPass = bloom;
        composer.addPass(bloom);
      } else {
        this.bloomPass = null;
      }

      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch {
      // Запасной прямой рендер для мобильных чипов без поддержки HalfFloat RT
      this.composer = null;
      this.bloomPass = null;
    }
  }

  private onResize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(w / h);
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  private setLobbyPreviewHero(heroId: HeroArchetypeId): void {
    this.lobbyStageGroup.clear();
    const def = HERO_DEFINITIONS[heroId];
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.5, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 })
    );
    pedestal.position.set(0, 0.22, 0);
    const previewMesh = createHeroThirdPersonMesh(heroId, 'radiant', def.accentColor);
    previewMesh.position.set(0, 0.45, 0);
    previewMesh.scale.setScalar(1.25);
    this.lobbyStageGroup.add(pedestal, previewMesh);
  }

  public start(): void {
    const boot = document.getElementById('boot-screen');
    boot?.classList.add('is-hidden');
    this.lastFrameTime = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.idCounter++}`;
  }

  private hasTalent(hero: HeroRuntime, talentId: TalentMutationId): boolean {
    return Object.values(hero.chosenTalents).includes(talentId);
  }

  private clearActiveMatchEntities(): void {
    for (const h of this.heroes) this.scene.remove(h.mesh);
    for (const c of this.creeps) this.scene.remove(c.mesh);
    for (const t of this.towers) this.scene.remove(t.mesh);
    for (const m of this.monsters) this.scene.remove(m.mesh);
    for (const r of this.runes) this.scene.remove(r.mesh);
    for (const w of this.wards) this.scene.remove(w.mesh);
    for (const o of this.outposts) this.scene.remove(o.mesh);
    for (const d of this.destructibles) this.scene.remove(d.mesh);
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      if (p.chainLine) this.scene.remove(p.chainLine);
    }
    for (const z of this.groundZones) this.scene.remove(z.mesh);

    this.heroes = [];
    this.playerHero = null;
    this.creeps = [];
    this.towers = [];
    this.monsters = [];
    this.runes = [];
    this.wards = [];
    this.outposts = [];
    this.destructibles = [];
    this.projectiles = [];
    this.groundZones = [];
    this.pings = [];
    setDynamicDestructibleColliders([]);
    this.vfx.clearAll();
    this.physics.clearAll();
  }

  private returnToLobby(): void {
    this.input.releasePointerLock();
    this.clearActiveMatchEntities();
    this.lobbyStageGroup.visible = true;
    this.state = 'lobby';
    this.hud.showLobby();
  }

  private startMatch(cfg: LobbyStartConfig): void {
    this.sound.unlock();
    this.setupPostProcessing(cfg.quality);
    this.physics.setQualityBudget(cfg.quality, this.input.isTouchMode || this.isMobileDevice);
    this.clearActiveMatchEntities();
    this.lobbyStageGroup.visible = false;

    this.matchMode = cfg.mode;
    this.elapsedTime = 0;
    this.dayNightOffset = 0;
    this.isNightTime = false;
    this.waveTimer = 19.5;
    this.waveCounter = 0;
    this.radiantEmpoweredTimer = 0;
    this.direEmpoweredTimer = 0;
    this.radiantKills = 0;
    this.direKills = 0;
    this.firstBloodClaimed = false;
    this.sniperZoomTimer = 0;

    // 1. Башни и Древние Троны с поддержкой стадий раскалывания
    this.spawnAllTowers();

    // 2. Лесные лагеря, Титан Разлома, Черепаха Стихий, Руны и Аванпосты
    this.spawnJungleRunesAndOutposts();

    // 3. Тактические разрушаемые деревья и рунические каменные преграды
    this.spawnDestructibleProps();

    // 4. 10 героев на арене (или Полигон с физикой и соперником)
    this.spawnMatchHeroes(cfg);

    this.viewModel.setHeroArchetype(cfg.heroId);
    this.viewModel.resize(window.innerWidth / Math.max(1, window.innerHeight));

    this.state = 'playing';
    this.hud.mountBattleHUD(this.playerHero!, this.input.isTouchMode, cfg.mode);
    this.hud.showAnnouncer(
      cfg.mode === 'sandbox' ? 'ПОЛИГОН ФИЗИКИ И ТАЛАНТОВ АКТИВЕН' : 'БИТВА ДРЕВНИХ НАЧАЛАСЬ!',
      'Взрывайте преграды, парируйте удары и сокрушите Древний Трон!'
    );
    this.sound.playKillFanfare(2);

    if (!this.input.isTouchMode) {
      this.input.requestPointerLock();
    }
  }

  private spawnDestructibleProps(): void {
    for (const dp of DESTRUCTIBLE_PLACEMENTS) {
      this.destructibles.push(this.physics.createDestructibleProp(dp));
    }
    this.refreshDestructibleColliders();
  }

  private refreshDestructibleColliders(): void {
    const active = this.destructibles
      .filter((d) => d.alive)
      .map((d) => ({ x: d.position.x, z: d.position.z, radius: d.radius }));
    setDynamicDestructibleColliders(active);
  }

  private spawnAllTowers(): void {
    for (const tp of TOWER_PLACEMENTS) {
      const isAncient = tp.tier === 4;
      const maxHp = isAncient ? 4800 : tp.tier === 3 ? 2900 : tp.tier === 2 ? 2300 : 1850;
      const attackDamage = isAncient ? 155 : tp.tier === 3 ? 145 : tp.tier === 2 ? 125 : 108;
      const attackRange = isAncient ? 15.5 : 14.5;

      const built = createTowerOrAncientMesh(tp.team, tp.tier, attackRange);
      built.group.position.set(tp.x, 0, tp.z);
      this.scene.add(built.group);

      this.towers.push({
        id: tp.id,
        entityKind: isAncient ? 'ancient' : 'tower',
        team: tp.team,
        lane: tp.lane,
        tier: tp.tier,
        name: tp.name,
        position: new THREE.Vector3(tp.x, 0, tp.z),
        radius: isAncient ? 4.4 : 2.1,
        hp: maxHp,
        maxHp,
        armor: isAncient ? 35 : 28,
        attackDamage,
        attackRange,
        attackCooldown: 0,
        disabledTimer: 0,
        damageStage: 0,
        currentTargetId: null,
        consecutiveHits: 0,
        alive: true,
        mesh: built.group,
        crystalMesh: built.crystal,
        laserLine: built.laserLine,
      });
    }
  }

  private spawnJungleRunesAndOutposts(): void {
    for (const camp of JUNGLE_CAMPS) {
      const isTitan = camp.campType === 'titan_boss';
      const isTurtle = camp.campType === 'elemental_turtle';
      const maxHp = isTitan
        ? 4600
        : isTurtle
          ? 2900
          : camp.campType === 'wolf_camp'
            ? 760
            : 1280;
      const dmg = isTitan ? 135 : isTurtle ? 95 : camp.campType === 'wolf_camp' ? 42 : 64;
      const mesh = createJungleMonsterMesh(camp.campType);
      mesh.position.set(camp.x, 0, camp.z);
      this.scene.add(mesh);

      this.monsters.push({
        id: camp.id,
        entityKind: 'monster',
        campType: camp.campType,
        name: camp.name,
        homePosition: new THREE.Vector3(camp.x, 0, camp.z),
        position: new THREE.Vector3(camp.x, 0, camp.z),
        yaw: 0,
        radius: isTitan ? 2.4 : isTurtle ? 1.95 : 1.3,
        hp: maxHp,
        maxHp,
        attackDamage: dmg,
        armor: isTitan ? 26 : isTurtle ? 20 : 12,
        attackRange: isTitan ? 4.4 : 3.4,
        attackCooldown: 0,
        moveSpeed: 6.4,
        alive: true,
        respawnTimer: 0,
        respawnDuration: isTitan ? 75 : isTurtle ? 65 : 42,
        statuses: [],
        mesh,
        animTime: 0,
      });
    }

    for (const spot of RUNE_SPOTS) {
      const group = new THREE.Group();
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xfacc15,
          emissiveIntensity: 1.2,
        })
      );
      gem.position.y = 1.25;
      group.add(gem);
      group.position.set(spot.x, 0, spot.z);
      this.scene.add(group);

      this.runes.push({
        id: spot.id,
        position: new THREE.Vector3(spot.x, 0, spot.z),
        runeType: spot.id === 'rune_north' ? 'damage' : 'haste',
        active: true,
        respawnTimer: 0,
        mesh: group,
      });
    }

    for (const op of OUTPOST_SPOTS) {
      const built = createOutpostMesh();
      built.group.position.set(op.x, 0, op.z);
      this.scene.add(built.group);
      this.outposts.push({
        id: op.id,
        name: op.name,
        position: new THREE.Vector3(op.x, 0, op.z),
        captureRadius: 6.0,
        owner: 'neutral',
        captureProgress: 0,
        rewardTimer: 30,
        mesh: built.group,
        beaconMesh: built.beacon,
      });
    }
  }

  private spawnMatchHeroes(cfg: LobbyStartConfig): void {
    const allIds = HERO_LIST.map((h) => h.id);
    const allyLanes: LaneId[] = ['top', 'mid', 'bot', 'bot', 'top'];
    const playerHeroObj = this.createHeroEntity(
      cfg.heroId,
      'radiant',
      true,
      cfg.lane,
      'Вы (Герой Света)',
      cfg.battleSpell,
      0
    );
    this.heroes.push(playerHeroObj);
    this.playerHero = playerHeroObj;

    if (cfg.mode === 'sandbox') {
      const rivalId = allIds.find((id) => id !== cfg.heroId) ?? 'berserker';
      const rival = this.createHeroEntity(
        rivalId,
        'dire',
        false,
        'mid',
        'Страж-Соперник',
        'heal',
        0
      );
      this.heroes.push(rival);
      return;
    }

    const remainingAllyPool = allIds.filter((id) => id !== cfg.heroId);
    const botAllyNames = ['Авангард', 'Валькирия', 'Эгида', 'Север'];
    for (let i = 0; i < 4; i++) {
      const hId = remainingAllyPool[i % remainingAllyPool.length];
      const lane = allyLanes[(i + 1) % allyLanes.length];
      const spell = i % 2 === 0 ? 'heal' : 'flicker';
      this.heroes.push(
        this.createHeroEntity(hId, 'radiant', false, lane, botAllyNames[i], spell, i + 1)
      );
    }

    const direNames = ['Жнец Пепла', 'Мордред', 'Калипсо', 'Тартар', 'Оникс'];
    const direLanes: LaneId[] = ['mid', 'top', 'bot', 'bot', 'top'];
    for (let i = 0; i < 5; i++) {
      const hId = allIds[(i + 1) % allIds.length];
      const spell = i % 2 === 0 ? 'flicker' : 'heal';
      this.heroes.push(
        this.createHeroEntity(hId, 'dire', false, direLanes[i], direNames[i], spell, i)
      );
    }
  }

  private createHeroEntity(
    archetype: HeroArchetypeId,
    team: 'radiant' | 'dire',
    isPlayer: boolean,
    lane: LaneId,
    displayName: string,
    battleSpell: HeroRuntime['battleSpell'],
    slotOffset: number
  ): HeroRuntime {
    const def = HERO_DEFINITIONS[archetype];
    const baseFountain = team === 'radiant' ? FOUNTAIN_POS.radiant : FOUNTAIN_POS.dire;
    const angle = (slotOffset / 5) * Math.PI * 2;
    const spawnPos = new THREE.Vector3(
      baseFountain.x + Math.cos(angle) * 3.8,
      0,
      baseFountain.z + Math.sin(angle) * 3.8
    );

    const initialYaw = Math.atan2(spawnPos.x, spawnPos.z);

    const mesh = createHeroThirdPersonMesh(archetype, team, def.accentColor);
    mesh.position.copy(spawnPos);
    if (isPlayer) {
      mesh.visible = false;
    }
    this.scene.add(mesh);

    const initialStats = computeHeroStats(def, 1, [], [], 0, 1, {}, false);

    return {
      id: this.nextId('hero'),
      entityKind: 'hero',
      heroDef: def,
      team,
      isPlayer,
      assignedLane: lane,
      displayName,
      position: spawnPos,
      velocity: new THREE.Vector3(),
      impulseVelocity: new THREE.Vector3(),
      yaw: initialYaw,
      pitch: 0,
      radius: 0.95,
      level: 1,
      xp: 0,
      skillPoints: 1,
      gold: 600,
      hp: initialStats.maxHp,
      mana: initialStats.maxMana,
      shield: 0,
      alive: true,
      respawnTimer: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      creepScore: 0,
      denies: 0,
      multiKillCount: 0,
      multiKillWindow: 0,
      fleshHeapStacks: 0,
      passiveHitCounter: 0,
      elementalResonance: 0,
      abilityRanks: { Q: 0, W: 0, E: 0, R: 0 },
      abilityCooldowns: { Q: 0, W: 0, E: 0, R: 0 },
      battleSpell,
      battleSpellCooldown: 0,
      attackCooldown: 0,
      recallTimer: 0,
      isRecalling: false,
      items: [],
      itemCooldowns: new Map(),
      immortalityCooldown: 0,
      chosenTalents: {},
      parryWindow: 0,
      parryCooldown: 0,
      slideTimer: 0,
      slideCooldown: 0,
      slideDirection: new THREE.Vector3(),
      inBrush: false,
      brushRevealTimer: 0,
      wardCharges: 2,
      wardRechargeTimer: 50,
      statuses: [],
      recentDamagers: new Map(),
      mesh,
      animTime: 0,
      swingAnim: 0,
      stats: initialStats,
    };
  }

  private applyPlayerLookDelta(dx: number, dy: number): void {
    if (this.state !== 'playing' || !this.playerHero) return;
    const zoomFactor = this.sniperZoomTimer > 0 ? 0.45 : 1.0;
    this.playerHero.yaw -= dx * zoomFactor;
    this.playerHero.pitch = THREE.MathUtils.clamp(
      this.playerHero.pitch - dy * zoomFactor,
      -1.26,
      1.26
    );
    this.viewModel.addLookDelta(dx, dy);
  }

  private executeSandboxCommand(
    cmd:
      | 'levelup'
      | 'gold'
      | 'cooldowns'
      | 'dummy'
      | 'heal'
      | 'daynight'
      | 'spawnlord'
      | 'cataclysm'
  ): void {
    const p = this.playerHero;
    if (!p) return;
    if (cmd === 'levelup' && p.level < MAX_HERO_LEVEL) {
      this.grantExperience(p, xpRequiredForNextLevel(p.level));
    } else if (cmd === 'gold') {
      p.gold += 2000;
      this.sound.playGoldCoin();
    } else if (cmd === 'cooldowns') {
      p.abilityCooldowns = { Q: 0, W: 0, E: 0, R: 0 };
      p.battleSpellCooldown = 0;
      p.immortalityCooldown = 0;
      p.parryCooldown = 0;
      p.slideCooldown = 0;
      p.wardCharges = 2;
      p.itemCooldowns.clear();
    } else if (cmd === 'heal') {
      p.hp = p.stats.maxHp;
      p.mana = p.stats.maxMana;
    } else if (cmd === 'daynight') {
      this.dayNightOffset += 75;
    } else if (cmd === 'spawnlord') {
      this.spawnMarchingLord(p.team);
      this.hud.showAnnouncer('ШТУРМОВОЙ ЛОРД-ТИТАН ПРИЗВАН!', 'Марширует по центральной линии!');
    } else if (cmd === 'cataclysm') {
      const center = this.getGroundAimPoint(p, 22);
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3;
        const pt = center
          .clone()
          .add(new THREE.Vector3(Math.cos(ang) * (i === 0 ? 0 : 4.2), 0, Math.sin(ang) * (i === 0 ? 0 : 4.2)));
        this.spawnGroundZone(
          'meteor_fire',
          p,
          pt,
          5.6,
          3.2,
          0.25 + i * 0.14,
          120,
          620,
          'magical',
          0.35
        );
      }
      this.sound.playSpellCast('fire');
      this.hud.showAnnouncer('МЕТЕОРИТНЫЙ КАТАКЛИЗМ!', 'Тест Ragdoll, ударной волны и разрушений');
    } else if (cmd === 'dummy') {
      const fwd = this.getHeroForward2D(p);
      const dummy = this.createHeroEntity(
        'butcher',
        'dire',
        false,
        'mid',
        'Манекен Бездны',
        'heal',
        0
      );
      dummy.position.copy(p.position).addScaledVector(fwd, 7);
      resolveArenaCollisions(dummy.position, dummy.radius);
      dummy.mesh.position.copy(dummy.position);
      this.heroes.push(dummy);
    }
  }

  // ==================== ТУМАН КУСТОВ ЗАСАДЫ И ИСТИННОЕ ЗРЕНИЕ (WARDS / TOWERS) ====================

  public isHeroHiddenFromTeam(hero: HeroRuntime, viewerTeam: 'radiant' | 'dire'): boolean {
    if (!hero.alive || hero.team === viewerTeam) return false;

    const isStealthed = hero.statuses.some((s) => s.type === 'stealth');
    const isBrushMasked = hero.inBrush && hero.brushRevealTimer <= 0;
    if (!isStealthed && !isBrushMasked) return false;

    // 1. Раскрытие при близком контакте с вражеским героем
    for (const viewer of this.heroes) {
      if (!viewer.alive || viewer.team !== viewerTeam) continue;
      if (viewer.position.distanceTo(hero.position) <= 4.4) return false;
    }

    // 2. Истинное зрение вражеских Башен и Древнего Трона
    for (const tw of this.towers) {
      if (!tw.alive || tw.team !== viewerTeam) continue;
      if (tw.position.distanceTo(hero.position) <= tw.attackRange) return false;
    }

    // 3. Тотемы Обзора (Vision Wards) раскрывают кусты и невидимость!
    for (const w of this.wards) {
      if (w.team !== viewerTeam || w.remaining <= 0) continue;
      if (w.position.distanceTo(hero.position) <= w.visionRadius) return false;
    }

    // 4. Захваченные Аванпосты дают обзор вокруг себя
    for (const op of this.outposts) {
      if (op.owner !== viewerTeam) continue;
      if (op.position.distanceTo(hero.position) <= 13.5) return false;
    }

    return true;
  }

  // ==================== НОВЫЕ БОЕВЫЕ МЕХАНИКИ ОТ ПЕРВОГО ЛИЦА ====================

  public triggerParry(hero: HeroRuntime): void {
    if (!hero.alive || hero.parryCooldown > 0) return;
    if (hero.statuses.some((s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln')) {
      return;
    }
    hero.parryWindow = 0.48;
    hero.parryCooldown = 6.5;
    hero.isRecalling = false;
    if (hero.isPlayer) {
      this.sound.playMeleeSwing();
    }
  }

  public triggerSlide(hero: HeroRuntime): void {
    if (!hero.alive || hero.slideCooldown > 0 || hero.slideTimer > 0) return;
    if (hero.statuses.some((s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln')) {
      return;
    }

    const fwd = this.getHeroForward2D(hero);
    let dir = fwd.clone();
    if (hero.isPlayer) {
      const { forward, strafe } = this.input.getMoveAxes();
      if (Math.abs(forward) > 0.05 || Math.abs(strafe) > 0.05) {
        const right = new THREE.Vector3(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw));
        dir = new THREE.Vector3().addScaledVector(fwd, forward).addScaledVector(right, strafe).normalize();
      }
    }

    hero.slideDirection.copy(dir);
    hero.slideTimer = 0.68;
    hero.slideCooldown = 3.2;
    hero.isRecalling = false;
    if (hero.isPlayer) {
      this.sound.playSlideWhoosh();
    }
  }

  public placeWard(hero: HeroRuntime): void {
    if (!hero.alive || hero.wardCharges <= 0) return;
    hero.wardCharges -= 1;
    const fwd = this.getHeroForward2D(hero);
    const pos = hero.position.clone().addScaledVector(fwd, 3.2);
    resolveArenaCollisions(pos, 0.5);

    const mesh = createWardMesh(hero.team);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.wards.push({
      id: this.nextId('ward'),
      team: hero.team,
      ownerId: hero.id,
      position: pos,
      visionRadius: 14.0,
      hitsRemaining: 3,
      remaining: 75,
      mesh,
    });

    if (hero.isPlayer) {
      this.sound.playWardPlace();
      this.hud.spawnFloatingNumber(pos, 'ТОТЕМ ОБЗОРА', '#2dd4bf');
    }
  }

  public chooseHeroTalent(hero: HeroRuntime, branch: 'left' | 'right'): boolean {
    const choice = getAvailableTalentChoices(hero.heroDef.id, hero.level, hero.chosenTalents);
    if (!choice) return false;
    const selected = branch === 'left' ? choice.left : choice.right;
    hero.chosenTalents[choice.tier] = selected.id;

    const prevMax = hero.stats.maxHp;
    hero.stats = computeHeroStats(
      hero.heroDef,
      hero.level,
      hero.items,
      hero.statuses,
      hero.fleshHeapStacks,
      hero.hp / Math.max(1, prevMax),
      hero.chosenTalents,
      this.isNightTime
    );
    const gainedHp = Math.max(0, hero.stats.maxHp - prevMax);
    if (hero.alive && gainedHp > 0) {
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + gainedHp);
    }

    if (hero.isPlayer) {
      this.sound.playKillFanfare(2);
      this.hud.showAnnouncer(`ТАЛАНТ ${choice.tier} УР.: ${selected.title}`, selected.description);
    }
    return true;
  }

  public useActiveItem(hero: HeroRuntime, index: number, isDirectSlotClick = false): void {
    if (!hero.alive) return;
    if (hero.statuses.some((s) => s.type === 'cyclone_invuln')) return;

    let item = isDirectSlotClick ? hero.items[index] : undefined;
    if (!isDirectSlotClick) {
      const activeItems = hero.items.filter((it) => Boolean(it.activeEffect));
      item = activeItems[index];
    }
    if (!item || !item.activeEffect) return;

    const cd = hero.itemCooldowns.get(item.id) ?? 0;
    if (cd > 0) return;

    // BKB можно нажать даже для снятия замедления/безмолвия; остальные активки блокируются станом
    if (
      item.activeEffect !== 'bkb_avatar' &&
      hero.statuses.some((s) => s.type === 'stun' || s.type === 'knockup')
    ) {
      return;
    }

    const baseCd = (item.activeCooldown ?? 25) * (1 - hero.stats.cooldownReduction * 0.5);
    hero.itemCooldowns.set(item.id, baseCd);
    hero.isRecalling = false;
    const fwd2d = this.getHeroForward2D(hero);

    if (item.activeEffect === 'bkb_avatar') {
      hero.statuses = hero.statuses.filter(
        (s) => s.type !== 'stun' && s.type !== 'knockup' && s.type !== 'slow' && s.type !== 'silence'
      );
      this.addStatus(hero.statuses, 'bkb_immune', 5.0, 1, hero.id);
      this.vfx.spawnShockwave(hero.position, 5.5, 0xfacc15, 0.5);
      if (hero.isPlayer) {
        this.sound.playBkbRoar();
        this.hud.showAnnouncer('ПОСОХ КОРОЛЯ ОБЕЗЬЯН (BKB)!', '5 сек иммунитета к магии и контролю!');
      }
    } else if (item.activeEffect === 'blink_dagger') {
      this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x38bdf8, 16, 8);
      hero.position.addScaledVector(fwd2d, 15.0);
      resolveArenaCollisions(hero.position, hero.radius);
      this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x38bdf8, 16, 8);
      if (hero.isPlayer) this.sound.playSpellCast('shadow');
    } else if (item.activeEffect === 'euls_cyclone') {
      const targetEnemy = this.findClosestEnemyHeroInCone(hero, 16, 0.72);
      if (targetEnemy && !targetEnemy.statuses.some((s) => s.type === 'bkb_immune')) {
        this.addStatus(targetEnemy.statuses, 'knockup', 2.2, 1, hero.id);
        targetEnemy.position.y = 3.4;
        this.dealDamageToHero(targetEnemy, 145, 'magical', hero, false);
        this.vfx.spawnSkyPillar(targetEnemy.position, 1.3, 0x7dd3fc);
      } else {
        hero.statuses = hero.statuses.filter(
          (s) => s.type !== 'burn' && s.type !== 'slow' && s.type !== 'silence'
        );
        this.addStatus(hero.statuses, 'cyclone_invuln', 2.2, 1, hero.id);
        hero.position.y = 3.2;
        this.vfx.spawnSkyPillar(hero.position, 1.3, 0x7dd3fc);
      }
      if (hero.isPlayer) this.sound.playSpellCast('ice');
    } else if (item.activeEffect === 'dagon_beam') {
      const targetEnemy = this.findClosestEnemyHeroInCone(hero, 18, 0.65);
      const start = hero.position.clone().setY(1.65);
      const end = targetEnemy
        ? targetEnemy.position.clone().setY(1.4)
        : start.clone().addScaledVector(this.getHeroForward3D(hero), 16);

      this.vfx.spawnBeam(start, end, 0xef4444, 0.24, 0.38);
      // Багровый луч Дагона пробивает и валит деревья на своей линии!
      this.damageDestructiblesInRadius(end, 3.0, 350, hero.position, true);

      if (targetEnemy) {
        const dagonDmg = 420 + hero.stats.spellPower * 0.85;
        this.setImpactImpulseFromPoints(hero.position, targetEnemy.position, 14, 6.5);
        const dealt = this.dealDamageToHero(targetEnemy, dagonDmg, 'magical', hero, true);
        hero.hp = Math.min(hero.stats.maxHp, hero.hp + dealt * 0.35);
        this.vfx.spawnBurst(end, 0xef4444, 18, 9);
      }
      if (hero.isPlayer) this.sound.playSpellCast('fire');
    }
  }

  private spawnMarchingLord(team: 'radiant' | 'dire'): void {
    const pts = LANE_WAYPOINTS.mid;
    const startPt = team === 'radiant' ? pts[0] : pts[pts.length - 1];
    const nextIdx = team === 'radiant' ? 1 : pts.length - 2;
    const pos = startPt.clone();
    const mesh = createCreepMesh('lord_boss', team, true);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.creeps.push({
      id: this.nextId('lord'),
      entityKind: 'creep',
      creepType: 'lord_boss',
      team,
      lane: 'mid',
      waypointIndex: nextIdx,
      position: pos,
      impulseVelocity: new THREE.Vector3(),
      yaw: 0,
      radius: 2.1,
      hp: 5200,
      maxHp: 5200,
      attackDamage: 215,
      armor: 24,
      attackRange: 3.8,
      attackCooldown: 0,
      moveSpeed: 6.2,
      alive: true,
      isEmpowered: true,
      statuses: [],
      mesh,
      animTime: 0,
    });
  }

  // ==================== РАЗРУШАЕМОСТЬ КАРТЫ И ФИЗИЧЕСКИЕ ИМПУЛЬСЫ ====================

  private setImpactImpulseFromPoints(
    source: THREE.Vector3,
    target: THREE.Vector3,
    horizontalForce: number,
    upwardForce: number
  ): void {
    const dx = target.x - source.x;
    const dz = target.z - source.z;
    const len = Math.max(0.2, Math.hypot(dx, dz));
    this.lastHitImpulse.set(
      (dx / len) * horizontalForce,
      upwardForce,
      (dz / len) * horizontalForce
    );
  }

  private applyUnitKnockback(
    targetPos: THREE.Vector3,
    impulseVec: THREE.Vector3,
    sourcePos: THREE.Vector3,
    force: number
  ): void {
    const dx = targetPos.x - sourcePos.x;
    const dz = targetPos.z - sourcePos.z;
    const d = Math.max(0.25, Math.hypot(dx, dz));
    impulseVec.x += (dx / d) * force;
    impulseVec.z += (dz / d) * force;
  }

  private damageSingleDestructible(
    prop: DestructiblePropRuntime,
    damage: number,
    impactSource: THREE.Vector3
  ): void {
    if (!prop.alive) return;
    prop.hp -= damage;

    // Лёгкая каменная/древесная крошка при попадании
    if (prop.hp > 0) {
      this.physics.spawnFractureBurst(
        prop.position.clone().setY(1.4),
        prop.kind === 'tree' ? 'wood' : 'stone',
        3,
        undefined,
        prop.kind === 'tree' ? 0x6b4423 : 0x475569,
        0xf59e0b,
        0.65
      );
      return;
    }

    // Полное разрушение с физическим повалом дерева или взрывом скальной баррикады!
    prop.hp = 0;
    prop.alive = false;
    prop.respawnTimer = prop.respawnDuration;
    prop.intactGroup.visible = false;
    prop.ruinGroup.visible = true;
    this.refreshDestructibleColliders();

    if (prop.kind === 'tree') {
      this.physics.spawnFallingTree(prop.position, impactSource);
      this.sound.playTreeTimber();
    } else {
      const away = prop.position.clone().sub(impactSource).setY(0).normalize().multiplyScalar(8);
      this.physics.spawnFractureBurst(
        prop.position.clone().setY(2.0),
        'stone',
        15,
        away,
        0x334155,
        0xf59e0b,
        1.15
      );
      this.physics.spawnCrater(prop.position, 2.2, 0xf59e0b, 18);
      this.sound.playRockShatter(false);
    }
  }

  private damageDestructiblesInRadius(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    impactSource: THREE.Vector3,
    affectBarricades = true
  ): void {
    for (const prop of this.destructibles) {
      if (!prop.alive) continue;
      if (!affectBarricades && prop.kind === 'rock_barricade') continue;
      const dist = Math.hypot(prop.position.x - center.x, prop.position.z - center.z);
      if (dist <= radius + prop.radius) {
        this.damageSingleDestructible(prop, damage, impactSource);
      }
    }
  }

  private sendTacticalPing(kind: 'attack' | 'retreat' | 'gather', customPos?: THREE.Vector3): void {
    if (!this.playerHero) return;
    const pos = customPos
      ? customPos.clone()
      : this.playerHero.position.clone().addScaledVector(this.getHeroForward2D(this.playerHero), 12);

    const labels = {
      attack: 'В АТАКУ! Союзники стягиваются!',
      retreat: 'ОТСТУПАЕМ К БАШНЯМ!',
      gather: 'СБОР НА ТИТАНА РАЗЛОМА!',
    };
    this.pings.push({
      id: this.nextId('ping'),
      kind,
      label: labels[kind],
      position: pos,
      remaining: 5.5,
    });
    this.vfx.spawnShockwave(pos, 5.5, kind === 'retreat' ? 0xef4444 : 0xf2cb78, 0.6);
    this.hud.showAnnouncer(labels[kind]);
  }

  public upgradeHeroAbility(hero: HeroRuntime, slot: AbilitySlot): boolean {
    if (!canUpgradeAbility(slot, hero.abilityRanks[slot], hero.level, hero.skillPoints)) {
      return false;
    }
    hero.abilityRanks[slot] += 1;
    hero.skillPoints -= 1;
    return true;
  }

  public buyItemForHero(hero: HeroRuntime, itemId: string): boolean {
    if (hero.items.length >= 6) return false;
    if (hero.items.some((i) => i.id === itemId)) return false;
    const item = SHOP_ITEMS_BY_ID.get(itemId);
    if (!item || hero.gold < item.cost) return false;

    hero.gold -= item.cost;
    hero.items.push(item);
    const prevMaxHp = hero.stats.maxHp;
    hero.stats = computeHeroStats(
      hero.heroDef,
      hero.level,
      hero.items,
      hero.statuses,
      hero.fleshHeapStacks,
      hero.hp / Math.max(1, prevMaxHp),
      hero.chosenTalents,
      this.isNightTime
    );
    const gainedHp = Math.max(0, hero.stats.maxHp - prevMaxHp);
    if (hero.alive && gainedHp > 0) {
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + gainedHp);
    }
    return true;
  }

  private getHeroForward3D(hero: HeroRuntime): THREE.Vector3 {
    const cosPitch = Math.cos(hero.pitch);
    const raw = new THREE.Vector3(
      -Math.sin(hero.yaw) * cosPitch,
      Math.sin(hero.pitch),
      -Math.cos(hero.yaw) * cosPitch
    ).normalize();

    // Мягкий мобильный Aim-Assist (конус 14°) для комфортной стрельбы со смартфона!
    if (hero.isPlayer && this.input.isTouchMode) {
      const target = this.findClosestEnemyHeroInCone(hero, 24, 0.965);
      if (target) {
        const eye = hero.position.clone().setY(hero.position.y + 1.65);
        const desired = target.position.clone().setY(target.position.y + 1.35).sub(eye).normalize();
        raw.lerp(desired, 0.45).normalize();
      }
    }
    return raw;
  }

  private getHeroForward2D(hero: HeroRuntime): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(hero.yaw), 0, -Math.cos(hero.yaw)).normalize();
  }

  private getGroundAimPoint(hero: HeroRuntime, maxRange: number): THREE.Vector3 {
    const eye = new THREE.Vector3(hero.position.x, hero.position.y + 1.85, hero.position.z);
    const dir = this.getHeroForward3D(hero);
    if (dir.y < -0.06) {
      const t = Math.min(maxRange, -eye.y / dir.y);
      return new THREE.Vector3(eye.x + dir.x * t, 0, eye.z + dir.z * t);
    }
    const fwd2d = this.getHeroForward2D(hero);
    return new THREE.Vector3(
      hero.position.x + fwd2d.x * Math.min(maxRange, 16),
      0,
      hero.position.z + fwd2d.z * Math.min(maxRange, 16)
    );
  }

  private addStatus(
    statuses: HeroRuntime['statuses'],
    type: HeroRuntime['statuses'][number]['type'],
    duration: number,
    magnitude = 0,
    sourceId?: string
  ): void {
    const isNegativeCC =
      type === 'stun' || type === 'knockup' || type === 'slow' || type === 'silence';
    if (isNegativeCC && statuses.some((s) => s.type === 'bkb_immune' || s.type === 'cyclone_invuln')) {
      return;
    }

    const existing = statuses.find((s) => s.type === type);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.magnitude = Math.max(existing.magnitude, magnitude);
      if (sourceId) existing.sourceId = sourceId;
    } else {
      statuses.push({ type, remaining: duration, magnitude, sourceId });
    }
  }

  public performBasicAttack(hero: HeroRuntime): void {
    if (!hero.alive || hero.attackCooldown > 0) return;
    if (
      hero.statuses.some(
        (s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln'
      )
    ) {
      return;
    }

    hero.isRecalling = false;
    hero.brushRevealTimer = 1.6;
    hero.attackCooldown = 1 / Math.max(0.45, hero.stats.attackSpeed);
    hero.swingAnim = 1.0;

    if (hero.isPlayer) {
      this.viewModel.triggerPrimaryAttack();
    }

    let stealthBonusDamage = 0;
    let applyStealthSilence = false;
    const stealthIdx = hero.statuses.findIndex((s) => s.type === 'stealth');
    if (stealthIdx !== -1) {
      stealthBonusDamage = hero.statuses[stealthIdx].magnitude > 0.3 ? 115 + hero.level * 14 : 0;
      applyStealthSilence = true;
      hero.statuses.splice(stealthIdx, 1);
    }

    hero.passiveHitCounter += 1;

    if (hero.heroDef.isRanged) {
      if (hero.isPlayer) this.sound.playRangedShot(hero.heroDef.id === 'marksman');
      const fwd3d = this.getHeroForward3D(hero);
      const start = new THREE.Vector3(
        hero.position.x + fwd3d.x * 0.9,
        hero.position.y + 1.65,
        hero.position.z + fwd3d.z * 0.9
      );
      const projMesh = createProjectileMesh(hero.heroDef.projectileColor, 0.85);
      projMesh.position.copy(start);
      this.scene.add(projMesh);

      const isFourthShotCrit = hero.heroDef.id === 'marksman' && hero.passiveHitCounter % 4 === 0;
      const dmg =
        (hero.stats.attackDamage + stealthBonusDamage) * (isFourthShotCrit ? 1.55 : 1.0);

      this.projectiles.push({
        id: this.nextId('proj'),
        kind: 'basic_bolt',
        ownerId: hero.id,
        team: hero.team,
        position: start,
        startPosition: start.clone(),
        direction: fwd3d,
        speed: hero.heroDef.id === 'marksman' ? 46 : 34,
        maxDistance: hero.stats.attackRange + 1.5,
        traveled: 0,
        radius: 0.65,
        damage: dmg,
        damageType: 'physical',
        piercing: false,
        ricochetLeft: this.hasTalent(hero, 'marksman_10_ricochet') ? 2 : 0,
        hitIds: new Set(),
        isHeadshotCapable: hero.heroDef.id === 'marksman',
        mesh: projMesh,
      });
      return;
    }

    // Ближний бой от первого лица
    if (hero.isPlayer) this.sound.playMeleeSwing();
    const fwd2d = this.getHeroForward2D(hero);
    const reach = hero.stats.attackRange;
    let hitSomething = false;

    const tryMeleeHit = (
      targetPos: THREE.Vector3,
      targetRadius: number,
      onHit: () => void
    ): boolean => {
      const dx = targetPos.x - hero.position.x;
      const dz = targetPos.z - hero.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + targetRadius) return false;
      if (dist > 0.25) {
        const dot = (dx / dist) * fwd2d.x + (dz / dist) * fwd2d.z;
        if (dot < 0.22) return false;
      }
      onHit();
      return true;
    };

    // 1) Вражеские герои
    for (const enemy of this.heroes) {
      if (!enemy.alive || enemy.team === hero.team) continue;
      if (enemy.statuses.some((s) => s.type === 'cyclone_invuln')) continue;
      if (
        tryMeleeHit(enemy.position, enemy.radius, () => {
          let dmg = hero.stats.attackDamage + stealthBonusDamage;
          let isCrit = Math.random() < hero.stats.critChance;
          if (
            hero.heroDef.id === 'phantom' &&
            isBackstabAngle(
              hero.position.x,
              hero.position.z,
              enemy.position.x,
              enemy.position.z,
              enemy.yaw
            )
          ) {
            isCrit = true;
          }
          if (isCrit) dmg *= hero.stats.critMultiplier;
          if (applyStealthSilence) {
            this.addStatus(enemy.statuses, 'silence', 1.5, 1, hero.id);
          }
          if (hero.statuses.some((s) => s.type === 'berserk_fire')) {
            this.dealDamageToHero(enemy, 45 + hero.level * 6, 'true', hero, false);
          }
          this.setImpactImpulseFromPoints(hero.position, enemy.position, isCrit ? 12 : 8.5, 4.5);
          this.dealDamageToHero(enemy, dmg, 'physical', hero, isCrit, true);
          hitSomething = true;
        })
      ) {
        break;
      }
    }

    // 2) Вражеские крипы ИЛИ Денай союзных крипов при ХП < 45%!
    if (!hitSomething) {
      for (const c of this.creeps) {
        if (!c.alive) continue;
        const canDenyAlly =
          c.team === hero.team && c.creepType !== 'lord_boss' && c.hp / c.maxHp < 0.45;
        if (c.team === hero.team && !canDenyAlly) continue;

        if (
          tryMeleeHit(c.position, c.radius, () => {
            this.setImpactImpulseFromPoints(hero.position, c.position, 9.5, 4.2);
            this.dealDamageToCreep(c, hero.stats.attackDamage, 'physical', hero);
            hitSomething = true;
          })
        ) {
          break;
        }
      }
    }

    // 3) Разрушение вражеских Тотемов Обзора (Wards)
    if (!hitSomething) {
      for (const w of this.wards) {
        if (w.remaining <= 0 || w.team === hero.team) continue;
        if (
          tryMeleeHit(w.position, 0.9, () => {
            this.hitEnemyWard(w, hero);
            hitSomething = true;
          })
        ) {
          break;
        }
      }
    }

    // 4) Лесные монстры
    if (!hitSomething) {
      for (const m of this.monsters) {
        if (!m.alive) continue;
        if (
          tryMeleeHit(m.position, m.radius, () => {
            this.setImpactImpulseFromPoints(hero.position, m.position, 10, 4.8);
            this.dealDamageToMonster(m, hero.stats.attackDamage, 'physical', hero);
            hitSomething = true;
          })
        ) {
          break;
        }
      }
    }

    // 5) Вражеские башни
    if (!hitSomething) {
      for (const tw of this.towers) {
        if (!tw.alive || tw.team === hero.team) continue;
        if (
          tryMeleeHit(tw.position, tw.radius, () => {
            this.dealDamageToTower(tw, hero.stats.attackDamage, hero);
            hitSomething = true;
          })
        ) {
          break;
        }
      }
    }

    // 6) Рубка деревьев и проламывание каменных баррикад оружием!
    if (!hitSomething) {
      for (const prop of this.destructibles) {
        if (!prop.alive) continue;
        if (
          tryMeleeHit(prop.position, prop.radius, () => {
            this.damageSingleDestructible(prop, hero.stats.attackDamage, hero.position);
            if (hero.isPlayer) this.hud.flashHitmarker(false);
            hitSomething = true;
          })
        ) {
          break;
        }
      }
    }

    // Пассивка Стража Бастиона: каждый 4-й удар молотом вызывает ударную волну и валит деревья!
    if (hero.heroDef.id === 'warden' && hero.passiveHitCounter % 4 === 0) {
      this.vfx.spawnShockwave(hero.position, 4.5, 0xeab308, 0.32);
      this.physics.applyExplosionForce(hero.position, 5.5, 9);
      this.damageDestructiblesInRadius(hero.position, 4.2, 120, hero.position, true);
      this.damageEnemiesInRadius(hero, hero.position, 4.5, 55 + hero.level * 9, 'magical', 0, 5.5);
    }
  }

  private hitEnemyWard(ward: VisionWardRuntime, attacker: HeroRuntime): void {
    ward.hitsRemaining -= 1;
    this.vfx.spawnBurst(ward.position.clone().setY(1.2), 0xfacc15, 6, 4);
    if (ward.hitsRemaining <= 0) {
      ward.remaining = 0;
      this.scene.remove(ward.mesh);
      attacker.gold += 35;
      if (attacker.isPlayer) {
        this.sound.playGoldCoin();
        this.hud.spawnFloatingNumber(ward.position, '+35 З (ВАРД)', '#f2cb78');
      }
    }
  }

  public castBattleSpell(hero: HeroRuntime): void {
    if (!hero.alive || hero.battleSpellCooldown > 0) return;

    if (hero.battleSpell !== 'purify') {
      const stunned = hero.statuses.some(
        (s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln'
      );
      if (stunned) return;
    }

    hero.isRecalling = false;
    hero.brushRevealTimer = 1.6;
    const fwd = this.getHeroForward2D(hero);

    if (hero.battleSpell === 'flicker') {
      hero.battleSpellCooldown = 36;
      this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x38bdf8, 16, 8);
      hero.position.addScaledVector(fwd, 10.5);
      resolveArenaCollisions(hero.position, hero.radius);
      this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0xf2cb78, 16, 8);
      if (hero.isPlayer) this.sound.playSpellCast('shadow');
    } else if (hero.battleSpell === 'heal') {
      hero.battleSpellCooldown = 32;
      for (const ally of this.heroes) {
        if (!ally.alive || ally.team !== hero.team) continue;
        if (ally.position.distanceTo(hero.position) <= 10) {
          const healAmt = 190 + hero.level * 24;
          ally.hp = Math.min(ally.stats.maxHp, ally.hp + healAmt);
          this.addStatus(ally.statuses, 'haste', 2.5, 0.25, hero.id);
          if (hero.isPlayer) {
            this.hud.spawnFloatingNumber(ally.position, `+${healAmt} ХП`, '#22c55e');
          }
        }
      }
      this.vfx.spawnShockwave(hero.position, 9.5, 0x22c55e, 0.45);
      if (hero.isPlayer) this.sound.playSpellCast('ice');
    } else if (hero.battleSpell === 'retribution') {
      hero.battleSpellCooldown = 24;
      let targetMonster: JungleMonsterRuntime | null = null;
      let minDist = 9.5;
      for (const m of this.monsters) {
        if (!m.alive) continue;
        const d = m.position.distanceTo(hero.position);
        if (d < minDist) {
          minDist = d;
          targetMonster = m;
        }
      }
      if (targetMonster) {
        const smiteDmg = 560 + hero.level * 55;
        this.vfx.spawnSkyPillar(targetMonster.position, 1.8, 0xf97316);
        this.setImpactImpulseFromPoints(hero.position, targetMonster.position, 14, 7.5);
        this.dealDamageToMonster(targetMonster, smiteDmg, 'true', hero);
      } else {
        this.damageEnemiesInRadius(hero, hero.position, 7.5, 160 + hero.level * 18, 'true', 1.8, 6);
        this.vfx.spawnShockwave(hero.position, 7.5, 0xf97316, 0.35);
      }
      if (hero.isPlayer) this.sound.playSpellCast('fire');
    } else if (hero.battleSpell === 'purify') {
      hero.battleSpellCooldown = 38;
      hero.statuses = hero.statuses.filter(
        (s) => s.type !== 'stun' && s.type !== 'knockup' && s.type !== 'slow' && s.type !== 'silence'
      );
      hero.shield += 220 + hero.level * 22;
      this.addStatus(hero.statuses, 'haste', 2.8, 0.3, hero.id);
      this.vfx.spawnShockwave(hero.position, 4.5, 0xf8fafc, 0.4);
      if (hero.isPlayer) this.sound.playSpellCast('ice');
    }
  }

  public castHeroAbility(hero: HeroRuntime, slot: AbilitySlot): void {
    if (!hero.alive) return;
    const rank = hero.abilityRanks[slot];
    if (rank <= 0 || hero.abilityCooldowns[slot] > 0) return;

    const isDisabled = hero.statuses.some(
      (s) =>
        s.type === 'stun' ||
        s.type === 'knockup' ||
        s.type === 'silence' ||
        s.type === 'cyclone_invuln'
    );
    if (isDisabled) return;

    const ab = hero.heroDef.abilities[slot];
    const rIdx = Math.min(ab.manaCost.length - 1, rank - 1);
    const manaCost = ab.manaCost[rIdx];
    if (hero.mana < manaCost) return;

    hero.mana -= manaCost;
    hero.isRecalling = false;
    hero.brushRevealTimer = 1.6;
    const cdr = hero.stats.cooldownReduction;
    let cdDuration = ab.cooldown[rIdx] * (1 - cdr);
    if (slot === 'R' && this.hasTalent(hero, 'marksman_15_rapid_ult')) {
      cdDuration = Math.max(3, cdDuration - 6);
    }
    hero.abilityCooldowns[slot] = cdDuration;

    if (hero.isPlayer) {
      this.viewModel.triggerAbilityCast();
    }

    let resonanceMultiplier = 1.0;
    if (hero.heroDef.id === 'invoker') {
      hero.elementalResonance = Math.min(3, hero.elementalResonance + 1);
      resonanceMultiplier = 1 + hero.elementalResonance * 0.08;
      hero.mana = Math.min(hero.stats.maxMana, hero.mana + 18);
    }

    const baseVal = ab.baseDamage[rIdx];
    const scalingStat =
      ab.damageType === 'physical'
        ? hero.stats.attackDamage
        : hero.stats.spellPower + hero.stats.attackDamage * 0.35;
    const totalPower = (baseVal + scalingStat * ab.damageRatio) * resonanceMultiplier;

    const fwd3d = this.getHeroForward3D(hero);
    const fwd2d = this.getHeroForward2D(hero);
    const archetype = hero.heroDef.id;

    // ==================== 1. МОРГАН КРЮКОЛОВ (Pudge / Franco + Тройной Крюк) ====================
    if (archetype === 'butcher') {
      if (slot === 'Q') {
        if (hero.isPlayer) this.sound.playHookLaunch();
        const fastHook = this.hasTalent(hero, 'butcher_5_hook_spd');
        const tripleHook = this.hasTalent(hero, 'butcher_10_triple_hook');
        const angles = tripleHook ? [-0.18, 0, 0.18] : [0];

        for (const offsetAng of angles) {
          const dir = fwd2d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAng);
          const start = new THREE.Vector3(hero.position.x, hero.position.y + 1.5, hero.position.z);
          const hookMesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.42, 0.11, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 })
          );
          hookMesh.position.copy(start);
          this.scene.add(hookMesh);

          const chainGeo = new THREE.BufferGeometry().setFromPoints([start.clone(), start.clone()]);
          const chainLine = new THREE.Line(
            chainGeo,
            new THREE.LineBasicMaterial({ color: 0xd4a853 })
          );
          this.scene.add(chainLine);

          this.projectiles.push({
            id: this.nextId('hook'),
            kind: 'meat_hook',
            ownerId: hero.id,
            team: hero.team,
            position: start,
            startPosition: start.clone(),
            direction: dir,
            speed: fastHook ? 44 : 34,
            maxDistance: fastHook ? ab.range * 1.3 : ab.range,
            traveled: 0,
            radius: ab.radius,
            damage: totalPower,
            damageType: 'true',
            piercing: false,
            hitIds: new Set(),
            returningHookTargetId: null,
            isReturningHook: false,
            stunDuration: 1.1,
            mesh: hookMesh,
            chainLine,
          });
        }
      } else if (slot === 'W') {
        const rotMul = this.hasTalent(hero, 'butcher_10_rot_vamp') ? 1.45 : 1.0;
        this.addStatus(hero.statuses, 'rot_aura', 4.5, totalPower * rotMul, hero.id);
        this.vfx.spawnShockwave(hero.position, ab.radius, 0x84cc16, 0.45);
        if (hero.isPlayer) this.sound.playSpellCast('shadow');
      } else if (slot === 'E') {
        const slamDmg = totalPower + hero.stats.maxHp * 0.06;
        this.vfx.spawnShockwave(hero.position, ab.radius, 0xd97706, 0.4);
        this.vfx.addCameraShake(hero.isPlayer ? 0.26 : 0);
        this.physics.applyExplosionForce(hero.position, ab.radius + 1.5, 13);
        this.physics.spawnCrater(hero.position, ab.radius * 0.65, 0xd97706, 12);
        this.damageDestructiblesInRadius(hero.position, ab.radius, 220, hero.position, true);
        this.damageEnemiesInRadius(hero, hero.position, ab.radius, slamDmg, 'physical', 2.0, 9.5);
        if (hero.isPlayer) this.sound.playSpellCast('earth');
      } else if (slot === 'R') {
        const victim = this.findClosestEnemyHeroInCone(hero, ab.range, 0.2);
        if (victim) {
          this.addStatus(victim.statuses, 'stun', 1.8, 1, hero.id);
          this.setImpactImpulseFromPoints(hero.position, victim.position, 15, 7);
          const dealt = this.dealDamageToHero(victim, totalPower, 'magical', hero, true);
          hero.hp = Math.min(hero.stats.maxHp, hero.hp + dealt * 0.8);
          this.vfx.spawnBurst(victim.position.clone().setY(1.4), 0xef4444, 22, 9);
          this.vfx.addCameraShake(hero.isPlayer ? 0.32 : 0);
        } else {
          this.damageEnemiesInRadius(hero, hero.position, 4.5, totalPower * 0.7, 'magical', 0, 7);
        }
        if (hero.isPlayer) this.sound.playSpellCast('ult');
      }
      return;
    }

    // ==================== 2. КАЭЛЬ АРХИМАГ (Invoker + Двойной Метеор + Катаклизм) ====================
    if (archetype === 'invoker') {
      if (slot === 'Q') {
        const start = new THREE.Vector3(hero.position.x, hero.position.y + 1.6, hero.position.z);
        const mesh = createProjectileMesh(0x38bdf8, 1.25);
        mesh.position.copy(start);
        this.scene.add(mesh);
        this.projectiles.push({
          id: this.nextId('ice'),
          kind: 'ice_spike',
          ownerId: hero.id,
          team: hero.team,
          position: start,
          startPosition: start.clone(),
          direction: fwd3d,
          speed: 32,
          maxDistance: ab.range,
          traveled: 0,
          radius: ab.radius,
          damage: totalPower,
          damageType: 'magical',
          piercing: false,
          hitIds: new Set(),
          stunDuration: 1.35,
          mesh,
        });
        if (hero.isPlayer) this.sound.playSpellCast('ice');
      } else if (slot === 'W') {
        const wideTornado = this.hasTalent(hero, 'invoker_10_wide_tornado');
        if (wideTornado) {
          hero.abilityCooldowns.Q = Math.max(0, hero.abilityCooldowns.Q - 2);
          hero.abilityCooldowns.E = Math.max(0, hero.abilityCooldowns.E - 2);
        }
        const rad = wideTornado ? ab.radius * 1.65 : ab.radius;
        const start = new THREE.Vector3(hero.position.x, 0.1, hero.position.z);
        const tornadoGroup = new THREE.Group();
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(wideTornado ? 2.4 : 1.6, 5.2, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
          })
        );
        cone.rotation.x = Math.PI;
        cone.position.y = 2.6;
        tornadoGroup.add(cone);
        tornadoGroup.position.copy(start);
        this.scene.add(tornadoGroup);

        this.projectiles.push({
          id: this.nextId('tornado'),
          kind: 'tornado_wave',
          ownerId: hero.id,
          team: hero.team,
          position: start,
          startPosition: start.clone(),
          direction: fwd2d.clone(),
          speed: 22,
          maxDistance: ab.range,
          traveled: 0,
          radius: rad,
          damage: totalPower,
          damageType: 'magical',
          piercing: true,
          hitIds: new Set(),
          knockupDuration: 1.15,
          mesh: tornadoGroup,
        });
        if (hero.isPlayer) this.sound.playSpellCast('ice');
      } else if (slot === 'E') {
        const targetPt = this.getGroundAimPoint(hero, ab.range);
        const twinMeteor = this.hasTalent(hero, 'invoker_10_twin_meteor');
        const right = new THREE.Vector3(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw));
        const points = twinMeteor
          ? [targetPt.clone().addScaledVector(right, -2.4), targetPt.clone().addScaledVector(right, 2.4)]
          : [targetPt];

        points.forEach((pt, idx) => {
          this.spawnGroundZone(
            'meteor_fire',
            hero,
            pt,
            ab.radius,
            3.2,
            0.35 + idx * 0.16,
            totalPower * 0.55,
            totalPower * 0.9,
            'magical',
            0.25
          );
        });
        if (hero.isPlayer) this.sound.playSpellCast('fire');
      } else if (slot === 'R') {
        const targetPt = this.getGroundAimPoint(hero, ab.range);
        const isCataclysm = this.hasTalent(hero, 'invoker_15_cataclysm');
        const pts = isCataclysm
          ? [
              targetPt,
              targetPt.clone().add(new THREE.Vector3(3.4, 0, -2.2)),
              targetPt.clone().add(new THREE.Vector3(-3.4, 0, 2.2)),
            ]
          : [targetPt];

        pts.forEach((pt, idx) => {
          this.spawnGroundZone(
            'sun_strike',
            hero,
            pt,
            ab.radius,
            1.1,
            0.65 + idx * 0.12,
            0,
            totalPower,
            'true',
            0
          );
        });
        if (hero.isPlayer) this.sound.playSpellCast('ult');
      }
      return;
    }

    // ==================== 3. НИКС ФАНТОМ (Riki / PA + Веер 5 Кинжалов) ====================
    if (archetype === 'phantom') {
      if (slot === 'Q') {
        this.addStatus(hero.statuses, 'stealth', 4.5, 0.35, hero.id);
        this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x2dd4bf, 16, 6);
        if (hero.isPlayer) this.sound.playSpellCast('shadow');
      } else if (slot === 'W') {
        const fan = this.hasTalent(hero, 'phantom_10_fan_knives');
        const angles = fan ? [-0.26, -0.13, 0, 0.13, 0.26] : [0];
        for (const ang of angles) {
          const dir = fwd3d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).normalize();
          const start = new THREE.Vector3(hero.position.x, hero.position.y + 1.55, hero.position.z);
          const mesh = createProjectileMesh(0x2dd4bf, 0.95);
          mesh.position.copy(start);
          this.scene.add(mesh);
          this.projectiles.push({
            id: this.nextId('dagger'),
            kind: 'shuriken',
            ownerId: hero.id,
            team: hero.team,
            position: start,
            startPosition: start.clone(),
            direction: dir,
            speed: 40,
            maxDistance: ab.range,
            traveled: 0,
            radius: ab.radius,
            damage: totalPower,
            damageType: 'physical',
            piercing: false,
            hitIds: new Set(),
            slowDuration: 2.2,
            mesh,
          });
        }
        if (hero.isPlayer) this.sound.playSpellCast('shadow');
      } else if (slot === 'E') {
        const targetEnemy = this.findClosestEnemyHeroInCone(hero, ab.range, 0.55);
        this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x2dd4bf, 14, 7);
        if (targetEnemy) {
          const enemyFwd = this.getHeroForward2D(targetEnemy);
          hero.position.copy(targetEnemy.position).addScaledVector(enemyFwd, -1.9);
          resolveArenaCollisions(hero.position, hero.radius);
          hero.yaw = targetEnemy.yaw;
          this.setImpactImpulseFromPoints(hero.position, targetEnemy.position, 13, 5.5);
          this.dealDamageToHero(targetEnemy, totalPower, 'physical', hero, true);
        } else {
          hero.position.addScaledVector(fwd2d, 9.5);
          resolveArenaCollisions(hero.position, hero.radius);
        }
        this.vfx.spawnBurst(hero.position.clone().setY(1.2), 0x2dd4bf, 14, 7);
        if (hero.isPlayer) this.sound.playSpellCast('shadow');
      } else if (slot === 'R') {
        this.vfx.spawnShockwave(hero.position, ab.radius, 0x2dd4bf, 0.45);
        this.vfx.addCameraShake(hero.isPlayer ? 0.25 : 0);
        this.physics.applyExplosionForce(hero.position, ab.radius + 1, 11);
        this.damageEnemiesInRadius(hero, hero.position, ab.radius, totalPower, 'physical', 1.2, 8);
        this.addStatus(hero.statuses, 'haste', 3.0, 0.35, hero.id);
        hero.shield += 180 + hero.level * 20;
        if (hero.isPlayer) this.sound.playSpellCast('ult');
      }
      return;
    }

    // ==================== 4. ВЕРА СНАЙПЕР (Sniper / Lesley + Рикошет + Мега-Шрапнель) ====================
    if (archetype === 'marksman') {
      if (slot === 'Q') {
        const mega = this.hasTalent(hero, 'marksman_10_mega_shrapnel');
        const targetPt = this.getGroundAimPoint(hero, ab.range);
        this.spawnGroundZone(
          'shrapnel_rain',
          hero,
          targetPt,
          mega ? ab.radius * 1.45 : ab.radius,
          3.5,
          0.15,
          mega ? totalPower * 1.45 : totalPower,
          totalPower * 0.45,
          'magical',
          0.35
        );
        if (hero.isPlayer) this.sound.playSpellCast('fire');
      } else if (slot === 'W') {
        const axes = hero.isPlayer ? this.input.getMoveAxes() : { forward: -1, strafe: 0 };
        const right = new THREE.Vector3(Math.cos(hero.yaw), 0, -Math.sin(hero.yaw));
        const dashDir = new THREE.Vector3()
          .addScaledVector(fwd2d, axes.forward !== 0 || axes.strafe !== 0 ? axes.forward : -1)
          .addScaledVector(right, axes.strafe)
          .normalize();
        hero.position.addScaledVector(dashDir, ab.range);
        resolveArenaCollisions(hero.position, hero.radius);
        this.addStatus(hero.statuses, 'haste', 3.5, 0.32, hero.id);
        this.addStatus(hero.statuses, 'berserk_fire', 3.5, 0.25, hero.id);
        this.vfx.spawnBurst(hero.position.clone().setY(1.0), 0xfacc15, 12, 6);
        if (hero.isPlayer) this.sound.playSpellCast('shadow');
      } else if (slot === 'E') {
        const start = new THREE.Vector3(hero.position.x, hero.position.y + 1.6, hero.position.z);
        const mesh = createProjectileMesh(0xfacc15, 1.3);
        mesh.position.copy(start);
        this.scene.add(mesh);
        this.projectiles.push({
          id: this.nextId('rail'),
          kind: 'rail_shot',
          ownerId: hero.id,
          team: hero.team,
          position: start,
          startPosition: start.clone(),
          direction: fwd3d,
          speed: 52,
          maxDistance: ab.range,
          traveled: 0,
          radius: ab.radius,
          damage: totalPower,
          damageType: 'physical',
          piercing: true,
          hitIds: new Set(),
          stunDuration: 0.75,
          mesh,
        });
        if (hero.isPlayer) this.sound.playRangedShot(true);
      } else if (slot === 'R') {
        if (hero.isPlayer) {
          this.sniperZoomTimer = 0.55;
          this.sound.playRangedShot(true);
          this.vfx.addCameraShake(0.3);
        }
        const eye = new THREE.Vector3(hero.position.x, hero.position.y + 1.7, hero.position.z);
        const endPt = eye.clone().addScaledVector(fwd3d, ab.range);
        this.vfx.spawnBeam(eye, endPt, 0xfacc15, 0.22, 0.42);
        const pierceShield = this.hasTalent(hero, 'marksman_15_rapid_ult');

        for (const enemy of this.heroes) {
          if (!enemy.alive || enemy.team === hero.team) continue;
          if (enemy.statuses.some((s) => s.type === 'cyclone_invuln')) continue;
          const toEnemy = enemy.position.clone().setY(enemy.position.y + 1.3).sub(eye);
          const projLen = toEnemy.dot(fwd3d);
          if (projLen > 0 && projLen <= ab.range) {
            const perpSq = toEnemy.lengthSq() - projLen * projLen;
            if (perpSq <= (enemy.radius + 1.05) ** 2) {
              if (pierceShield) enemy.shield = 0;
              this.setImpactImpulseFromPoints(hero.position, enemy.position, 22, 8.5);
              this.dealDamageToHero(enemy, totalPower, 'physical', hero, true);
              this.vfx.spawnBurst(enemy.position.clone().setY(1.5), 0xfacc15, 22, 10);
            }
          }
        }
      }
      return;
    }

    // ==================== 5. РАГНАР БЕРСЕРК (Axe / Balmond + Вихревое Притяжение + Казнь) ====================
    if (archetype === 'berserker') {
      if (slot === 'Q') {
        const vortexMul = this.hasTalent(hero, 'berserker_10_vortex_spin') ? 1.4 : 1.0;
        this.addStatus(hero.statuses, 'blade_spin', 3.2, totalPower * vortexMul, hero.id);
        if (hero.isPlayer) this.sound.playSpellCast('fire');
      } else if (slot === 'W') {
        hero.position.addScaledVector(fwd2d, ab.range);
        resolveArenaCollisions(hero.position, hero.radius);
        hero.shield += 160 + hero.level * 22;
        this.vfx.spawnShockwave(hero.position, ab.radius, 0xef4444, 0.42);
        this.vfx.addCameraShake(hero.isPlayer ? 0.3 : 0);
        this.physics.applyExplosionForce(hero.position, ab.radius + 1.5, 14);
        this.physics.spawnCrater(hero.position, ab.radius * 0.7, 0xef4444, 12);
        this.damageDestructiblesInRadius(hero.position, ab.radius + 0.6, 280, hero.position, true);

        for (const enemy of this.heroes) {
          if (!enemy.alive || enemy.team === hero.team) continue;
          if (enemy.position.distanceTo(hero.position) <= ab.radius) {
            this.addStatus(enemy.statuses, 'knockup', 0.9, 1, hero.id);
            if (!enemy.statuses.some((s) => s.type === 'bkb_immune')) {
              enemy.position.y = 2.4;
            }
          }
        }
        this.damageEnemiesInRadius(hero, hero.position, ab.radius, totalPower, 'physical', 0, 9);
        if (hero.isPlayer) this.sound.playSpellCast('earth');
      } else if (slot === 'E') {
        this.addStatus(hero.statuses, 'berserk_fire', 5.0, totalPower, hero.id);
        this.vfx.spawnBurst(hero.position.clone().setY(1.4), 0xef4444, 18, 7);
        if (hero.isPlayer) this.sound.playSpellCast('fire');
      } else if (slot === 'R') {
        const cullThreshold = this.hasTalent(hero, 'berserker_10_high_cull') ? 0.42 : 0.32;
        const victim = this.findClosestEnemyHeroInCone(hero, ab.range, 0.15);
        if (victim) {
          const hpRatio = victim.hp / Math.max(1, victim.stats.maxHp);
          this.vfx.spawnSkyPillar(victim.position, 1.6, 0xef4444);
          this.vfx.addCameraShake(hero.isPlayer ? 0.45 : 0);
          this.physics.spawnCrater(victim.position, 2.8, 0xef4444, 15);
          this.physics.applyExplosionForce(victim.position, 7, 16);
          this.setImpactImpulseFromPoints(hero.position, victim.position, 20, 9.5);

          if (hpRatio <= cullThreshold) {
            victim.shield = 0;
            this.dealDamageToHero(victim, victim.hp + 999, 'true', hero, true);
            hero.abilityCooldowns.R = 0;
            if (this.hasTalent(hero, 'berserker_10_high_cull')) {
              hero.hp = Math.min(hero.stats.maxHp, hero.hp + 350);
            }
            for (const ally of this.heroes) {
              if (
                ally.alive &&
                ally.team === hero.team &&
                ally.position.distanceTo(hero.position) < 16
              ) {
                this.addStatus(ally.statuses, 'haste', 4.0, 0.35, hero.id);
              }
            }
          } else {
            this.dealDamageToHero(victim, totalPower, 'true', hero, true);
          }
        } else {
          this.vfx.spawnShockwave(hero.position, 4.0, 0xef4444, 0.35);
          this.damageDestructiblesInRadius(hero.position, 4.0, 300, hero.position, true);
          this.damageEnemiesInRadius(hero, hero.position, 4.0, totalPower * 0.75, 'true', 0, 10);
        }
        if (hero.isPlayer) this.sound.playSpellCast('ult');
      }
      return;
    }

    // ==================== 6. АТЛАС БАСТИОН (Earthshaker + Тройной Раскол + Echo Slam) ====================
    if (archetype === 'warden') {
      if (slot === 'Q') {
        const triFissure = this.hasTalent(hero, 'warden_10_tri_fissure');
        const angles = triFissure ? [-0.24, 0, 0.24] : [0];
        for (const ang of angles) {
          const dir = fwd2d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
          const start = new THREE.Vector3(hero.position.x, 0.2, hero.position.z);
          const rock = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 1.4, 2.2),
            new THREE.MeshStandardMaterial({ color: 0xd4a853, roughness: 0.5 })
          );
          rock.position.copy(start);
          this.scene.add(rock);
          this.projectiles.push({
            id: this.nextId('fissure'),
            kind: 'fissure_wave',
            ownerId: hero.id,
            team: hero.team,
            position: start,
            startPosition: start.clone(),
            direction: dir,
            speed: 28,
            maxDistance: ab.range,
            traveled: 0,
            radius: ab.radius,
            damage: totalPower,
            damageType: 'magical',
            piercing: true,
            hitIds: new Set(),
            stunDuration: 1.4,
            mesh: rock,
          });
        }
        this.vfx.addCameraShake(hero.isPlayer ? 0.26 : 0);
        if (hero.isPlayer) this.sound.playSpellCast('earth');
      } else if (slot === 'W') {
        const steps = 6;
        const stepDist = ab.range / steps;
        for (let s = 0; s < steps; s++) {
          hero.position.addScaledVector(fwd2d, stepDist);
          this.damageDestructiblesInRadius(hero.position, ab.radius + 0.5, 320, hero.position, true);
          resolveArenaCollisions(hero.position, hero.radius);
          for (const enemy of this.heroes) {
            if (!enemy.alive || enemy.team === hero.team) continue;
            if (enemy.statuses.some((st) => st.type === 'bkb_immune')) continue;
            if (enemy.position.distanceTo(hero.position) <= ab.radius) {
              enemy.position.addScaledVector(fwd2d, stepDist * 0.95);
              resolveArenaCollisions(enemy.position, enemy.radius);
            }
          }
        }
        for (const enemy of this.heroes) {
          if (!enemy.alive || enemy.team === hero.team) continue;
          if (enemy.position.distanceTo(hero.position) <= ab.radius + 0.8) {
            this.addStatus(enemy.statuses, 'knockup', 1.0, 1, hero.id);
            if (!enemy.statuses.some((st) => st.type === 'bkb_immune')) {
              enemy.position.y = 2.4;
            }
          }
        }
        this.vfx.spawnShockwave(hero.position, ab.radius + 1, 0xeab308, 0.4);
        this.physics.applyExplosionForce(hero.position, ab.radius + 2, 13);
        this.damageEnemiesInRadius(hero, hero.position, ab.radius + 0.8, totalPower, 'physical', 0, 9);
        if (hero.isPlayer) this.sound.playSpellCast('earth');
      } else if (slot === 'E') {
        const fortress = this.hasTalent(hero, 'warden_10_fortress_shield');
        const shieldAmt = fortress ? totalPower * 1.65 : totalPower;
        for (const ally of this.heroes) {
          if (!ally.alive || ally.team !== hero.team) continue;
          if (ally.position.distanceTo(hero.position) <= ab.radius) {
            ally.shield = Math.max(ally.shield, shieldAmt);
            this.addStatus(ally.statuses, 'haste', 3.5, 0.22, hero.id);
          }
        }
        if (fortress) {
          this.damageEnemiesInRadius(hero, hero.position, ab.radius * 0.75, 180, 'magical', 1.2, 8);
          this.physics.applyExplosionForce(hero.position, ab.radius * 0.8, 10);
        }
        this.vfx.spawnShockwave(hero.position, ab.radius, 0xfacc15, 0.48);
        if (hero.isPlayer) this.sound.playSpellCast('ice');
      } else if (slot === 'R') {
        const echoMaster = this.hasTalent(hero, 'warden_15_echo_master');
        const ultRadius = echoMaster ? ab.radius + 3.5 : ab.radius;
        const ultBase = echoMaster ? totalPower + 250 : totalPower;
        let caughtHeroes = 0;

        for (const enemy of this.heroes) {
          if (!enemy.alive || enemy.team === hero.team) continue;
          if (enemy.position.distanceTo(hero.position) <= ultRadius) {
            caughtHeroes++;
            if (!enemy.statuses.some((st) => st.type === 'bkb_immune')) {
              const pullTarget = hero.position.clone().addScaledVector(fwd2d, 2.2);
              enemy.position.lerp(pullTarget, 0.82);
              resolveArenaCollisions(enemy.position, enemy.radius);
            }
            this.addStatus(enemy.statuses, 'stun', 1.8, 1, hero.id);
          }
        }

        const echoBonus = 1 + caughtHeroes * 0.18;
        this.vfx.spawnShockwave(hero.position, ultRadius, 0xf2cb78, 0.55);
        this.vfx.spawnSkyPillar(hero.position, 3.2, 0xeab308);
        this.vfx.addCameraShake(hero.isPlayer ? 0.5 : 0);
        this.physics.spawnCrater(hero.position, ultRadius * 0.58, 0xf2cb78, 20);
        this.physics.applyExplosionForce(hero.position, ultRadius + 2, 18);
        this.damageDestructiblesInRadius(hero.position, ultRadius, 600, hero.position, true);

        this.damageEnemiesInRadius(
          hero,
          hero.position,
          ultRadius,
          ultBase * echoBonus,
          'magical',
          0,
          14
        );
        if (hero.isPlayer) this.sound.playSpellCast('ult');
      }
    }
  }

  private findClosestEnemyHeroInCone(
    caster: HeroRuntime,
    range: number,
    minDot: number
  ): HeroRuntime | null {
    const fwd = this.getHeroForward2D(caster);
    let best: HeroRuntime | null = null;
    let bestDist = range;
    for (const h of this.heroes) {
      if (!h.alive || h.team === caster.team) continue;
      if (h.statuses.some((s) => s.type === 'cyclone_invuln')) continue;
      if (this.isHeroHiddenFromTeam(h, caster.team)) continue;
      const dx = h.position.x - caster.position.x;
      const dz = h.position.z - caster.position.z;
      const d = Math.hypot(dx, dz);
      if (d > bestDist) continue;
      if (d > 0.3) {
        const dot = (dx / d) * fwd.x + (dz / d) * fwd.z;
        if (dot < minDot) continue;
      }
      bestDist = d;
      best = h;
    }
    return best;
  }

  private spawnGroundZone(
    kind: GroundZoneEffect['kind'],
    owner: HeroRuntime,
    pos: THREE.Vector3,
    radius: number,
    duration: number,
    delay: number,
    dps: number,
    burstDamage: number,
    damageType: GroundZoneEffect['damageType'],
    slowMagnitude: number
  ): void {
    const group = new THREE.Group();
    const color =
      kind === 'meteor_fire'
        ? 0xf97316
        : kind === 'sun_strike'
          ? 0xfef08a
          : 0x38bdf8;
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.4, radius, 32),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.52,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.09;
    group.add(disc);

    if (kind === 'meteor_fire') {
      const meteorRock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.35, 0),
        new THREE.MeshStandardMaterial({
          color: 0x7c2d12,
          emissive: 0xf97316,
          emissiveIntensity: 1.3,
        })
      );
      meteorRock.position.y = 14;
      meteorRock.name = 'fallingMeteor';
      group.add(meteorRock);
    }

    group.position.copy(pos);
    this.scene.add(group);

    this.groundZones.push({
      id: this.nextId('zone'),
      kind,
      ownerId: owner.id,
      team: owner.team,
      position: pos.clone(),
      radius,
      remaining: duration,
      delayRemaining: delay,
      tickTimer: 0,
      damagePerSecond: dps,
      burstDamage,
      damageType,
      slowMagnitude,
      mesh: group,
    });
  }

  private damageEnemiesInRadius(
    attacker: HeroRuntime,
    center: THREE.Vector3,
    radius: number,
    rawDamage: number,
    damageType: 'physical' | 'magical' | 'true',
    slowSec = 0,
    knockbackForce = 0
  ): void {
    for (const h of this.heroes) {
      if (!h.alive || h.team === attacker.team) continue;
      if (h.position.distanceTo(center) <= radius + h.radius) {
        if (slowSec > 0) this.addStatus(h.statuses, 'slow', slowSec, 0.35, attacker.id);
        if (knockbackForce > 0 && !h.statuses.some((s) => s.type === 'bkb_immune')) {
          this.applyUnitKnockback(h.position, h.impulseVelocity, center, knockbackForce);
          this.setImpactImpulseFromPoints(center, h.position, knockbackForce * 1.35, 6.5);
        }
        this.dealDamageToHero(h, rawDamage, damageType, attacker, false);
      }
    }
    for (const c of this.creeps) {
      if (!c.alive || c.team === attacker.team) continue;
      if (c.position.distanceTo(center) <= radius + c.radius) {
        if (knockbackForce > 0 && c.creepType !== 'lord_boss') {
          this.applyUnitKnockback(c.position, c.impulseVelocity, center, knockbackForce * 1.15);
        }
        this.setImpactImpulseFromPoints(center, c.position, Math.max(8, knockbackForce * 1.35), 6);
        this.dealDamageToCreep(c, rawDamage, damageType, attacker);
      }
    }
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (m.position.distanceTo(center) <= radius + m.radius) {
        this.setImpactImpulseFromPoints(center, m.position, Math.max(8, knockbackForce * 1.2), 6);
        this.dealDamageToMonster(m, rawDamage, damageType, attacker);
      }
    }
  }

  private dealDamageToHero(
    victim: HeroRuntime,
    rawAmount: number,
    damageType: 'physical' | 'magical' | 'true',
    attacker?: HeroRuntime,
    isCrit = false,
    isBasicAttack = false
  ): number {
    if (!victim.alive) return 0;
    if (victim.statuses.some((s) => s.type === 'cyclone_invuln')) return 0;

    // ИДЕАЛЬНОЕ ПАРИРОВАНИЕ ОТ 1-ГО ЛИЦА!
    if (victim.parryWindow > 0 && attacker && attacker.team !== victim.team) {
      victim.parryWindow = 0;
      victim.parryCooldown = 1.5; // Мгновенный сброс кулдауна за идеальный тайминг!
      victim.mana = Math.min(victim.stats.maxMana, victim.mana + 40);
      this.addStatus(victim.statuses, 'haste', 2.0, 0.3, victim.id);
      this.vfx.spawnShockwave(victim.position, 3.8, 0xfacc15, 0.35);
      this.vfx.spawnBurst(victim.position.clone().setY(1.4), 0xfef08a, 16, 9);

      if (attacker.position.distanceTo(victim.position) <= 5.5) {
        this.addStatus(attacker.statuses, 'stun', 1.15, 1, victim.id);
        this.applyUnitKnockback(attacker.position, attacker.impulseVelocity, victim.position, 11);
      }

      if (victim.isPlayer || attacker.isPlayer) {
        this.sound.playParryClang();
        this.hud.spawnFloatingNumber(victim.position, '🛡 ПАРИРОВАНИЕ!', '#facc15');
      }
      return 0;
    }

    // BKB Золотой Аватар полностью блокирует магический урон!
    if (damageType === 'magical' && victim.statuses.some((s) => s.type === 'bkb_immune')) {
      if (attacker?.isPlayer) {
        this.hud.spawnFloatingNumber(victim.position, 'BKB ИММУН', '#facc15');
      }
      return 0;
    }

    let amount = rawAmount;
    if (attacker) {
      if (
        attacker.items.some((i) => i.uniquePassive === 'despair_exec') &&
        victim.hp / Math.max(1, victim.stats.maxHp) < 0.5
      ) {
        amount *= 1.25;
      }
      if (isBasicAttack && attacker.items.some((i) => i.uniquePassive === 'titan_slayer')) {
        amount += victim.hp * 0.05;
      }
      if (!isBasicAttack && attacker.items.some((i) => i.uniquePassive === 'lightning_burst')) {
        amount += 90;
      }
      if (attacker.items.some((i) => i.uniquePassive === 'frost_slow')) {
        this.addStatus(victim.statuses, 'slow', 1.6, 0.25, attacker.id);
      }
      if (isBasicAttack && attacker.statuses.some((s) => s.type === 'red_buff')) {
        this.addStatus(victim.statuses, 'slow', 1.5, 0.22, attacker.id);
        amount += 28;
      }

      for (const tw of this.towers) {
        if (
          tw.alive &&
          tw.team === victim.team &&
          attacker.position.distanceTo(tw.position) <= tw.attackRange
        ) {
          tw.currentTargetId = attacker.id;
        }
      }
    }

    if (victim.heroDef.id === 'warden') {
      amount *= 0.88;
    }

    let finalDmg = mitigateDamage(
      amount,
      damageType,
      victim.stats.armor,
      victim.stats.magicResist
    );

    victim.isRecalling = false;
    if (attacker && attacker.team !== victim.team) {
      victim.recentDamagers.set(attacker.id, this.elapsedTime);
    }

    if (
      isBasicAttack &&
      attacker &&
      attacker.id !== victim.id &&
      victim.items.some((i) => i.uniquePassive === 'thorn_reflect')
    ) {
      const reflected = mitigateDamage(
        rawAmount * 0.22,
        'magical',
        attacker.stats.armor,
        attacker.stats.magicResist
      );
      attacker.hp = Math.max(1, attacker.hp - reflected);
    }

    if (victim.shield > 0 && damageType !== 'true') {
      const absorbed = Math.min(victim.shield, finalDmg);
      victim.shield -= absorbed;
      finalDmg -= absorbed;
    }

    victim.hp -= finalDmg;

    if (attacker && attacker.alive && finalDmg > 0 && attacker.stats.lifesteal > 0) {
      attacker.hp = Math.min(
        attacker.stats.maxHp,
        attacker.hp + finalDmg * attacker.stats.lifesteal
      );
    }

    if (attacker?.isPlayer && finalDmg > 0) {
      this.hud.flashHitmarker(isCrit);
      this.sound.playHitConfirm(isCrit);
      this.hud.spawnFloatingNumber(
        victim.position,
        `${isCrit ? '⚡' : ''}${Math.round(finalDmg)}`,
        isCrit ? '#facc15' : '#f8fafc'
      );
    }
    if (victim.isPlayer && finalDmg > 2) {
      this.hud.flashDamageVignette();
    }

    if (victim.hp <= 0) {
      this.handleHeroDeath(victim, attacker);
    }

    return finalDmg;
  }

  private handleHeroDeath(victim: HeroRuntime, killer?: HeroRuntime): void {
    const hasTitanBlessing = victim.statuses.some((s) => s.type === 'titan_blessing');
    const hasImmortalityItem =
      victim.items.some((i) => i.uniquePassive === 'immortality_rebirth') &&
      victim.immortalityCooldown <= 0;

    if (hasTitanBlessing || hasImmortalityItem) {
      if (hasTitanBlessing) {
        victim.statuses = victim.statuses.filter((s) => s.type !== 'titan_blessing');
      } else {
        victim.immortalityCooldown = 90;
      }
      victim.hp = victim.stats.maxHp * 0.42;
      victim.mana = victim.stats.maxMana * 0.42;
      this.vfx.spawnSkyPillar(victim.position, 2.2, 0xf2cb78);
      if (victim.isPlayer || killer?.isPlayer) {
        this.hud.showAnnouncer('ВОСКРЕШЕНИЕ ЭГИДЫ!', `${victim.displayName} восстаёт из пепла!`);
      }
      return;
    }

    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    victim.respawnTimer = Math.min(26, 5 + victim.level * 1.45);
    victim.statuses = [];
    victim.shield = 0;
    victim.impulseVelocity.set(0, 0, 0);
    victim.mesh.visible = false;

    // СПАВН ШАРНИРНОГО 3D RAGDOLL ТЕЛА ГЕРОЯ С РЕАЛЬНЫМ ИМПУЛЬСОМ СМЕРТИ!
    if (killer && this.lastHitImpulse.lengthSq() < 1) {
      this.setImpactImpulseFromPoints(killer.position, victim.position, 13, 6.2);
    }
    this.physics.spawnHumanoidRagdoll({
      origin: victim.position,
      yaw: victim.yaw,
      impulse: this.lastHitImpulse.clone(),
      scale:
        victim.heroDef.id === 'butcher' || victim.heroDef.id === 'warden' ? 1.15 : 1.0,
      armorHex: victim.team === 'radiant' ? 0x1e3a4c : 0x3b1d24,
      accentHex: new THREE.Color(victim.heroDef.accentColor).getHex(),
    });
    this.lastHitImpulse.set(0, 4.5, 0);

    this.vfx.spawnBurst(victim.position.clone().setY(1.2), 0xef4444, 24, 9);

    if (victim.team === 'radiant') this.direKills += 1;
    else this.radiantKills += 1;

    let actualKiller = killer;
    if (!actualKiller) {
      let latestTime = -999;
      for (const [hId, t] of victim.recentDamagers.entries()) {
        if (this.elapsedTime - t <= 10 && t > latestTime) {
          const found = this.heroes.find((h) => h.id === hId);
          if (found) {
            latestTime = t;
            actualKiller = found;
          }
        }
      }
    }

    if (actualKiller) {
      actualKiller.kills += 1;
      const bounty = 220 + victim.level * 25 + (!this.firstBloodClaimed ? 120 : 0);
      actualKiller.gold += bounty;
      this.grantExperience(actualKiller, 165 + victim.level * 35);

      if (actualKiller.heroDef.id === 'butcher') {
        actualKiller.fleshHeapStacks += 1;
      }
      // Мутация 10 ур. Фантома: убийство мгновенно сбрасывает Q (Тень) и E (Шаг сквозь Тень)!
      if (this.hasTalent(actualKiller, 'phantom_10_reset_stealth')) {
        actualKiller.abilityCooldowns.Q = 0;
        actualKiller.abilityCooldowns.E = 0;
      }

      if (actualKiller.multiKillWindow > 0) {
        actualKiller.multiKillCount += 1;
      } else {
        actualKiller.multiKillCount = 1;
      }
      actualKiller.multiKillWindow = 12;

      if (actualKiller.isPlayer) {
        this.sound.playGoldCoin();
        this.hud.spawnFloatingNumber(victim.position, `+${bounty} ЗОЛ.`, '#f2cb78');
      }

      for (const ally of this.heroes) {
        if (ally.team !== actualKiller.team || ally.id === actualKiller.id) continue;
        const helped =
          (victim.recentDamagers.get(ally.id) ?? -999) > this.elapsedTime - 10 ||
          (ally.alive && ally.position.distanceTo(victim.position) < 22);
        if (helped) {
          ally.assists += 1;
          ally.gold += 95;
          this.grantExperience(ally, 95);
          if (ally.heroDef.id === 'butcher') ally.fleshHeapStacks += 1;
        }
      }

      this.hud.pushKillFeed(
        actualKiller.displayName,
        victim.displayName,
        actualKiller.team === 'radiant'
      );

      if (!this.firstBloodClaimed) {
        this.firstBloodClaimed = true;
        this.hud.showAnnouncer(
          'ПЕРВАЯ КРОВЬ!',
          `${actualKiller.displayName} сокрушает ${victim.displayName}!`
        );
        this.sound.playKillFanfare(2);
      } else if (actualKiller.multiKillCount >= 2) {
        const streakTitles: Record<number, string> = {
          2: 'ДВОЙНОЕ УБИЙСТВО!',
          3: 'ТРОЙНОЕ УБИЙСТВО!',
          4: 'УЛЬТРА-УБИЙСТВО!',
        };
        const bannerTitle =
          actualKiller.multiKillCount >= 5
            ? 'БУЙСТВО! RAMPAGE / SAVAGE!'
            : streakTitles[actualKiller.multiKillCount];
        this.hud.showAnnouncer(bannerTitle, actualKiller.displayName);
        this.sound.playKillFanfare(actualKiller.multiKillCount);
      }
    } else {
      this.hud.pushKillFeed(
        victim.team === 'radiant' ? 'Силы Пепла' : 'Силы Света',
        victim.displayName,
        victim.team === 'dire'
      );
    }

    victim.recentDamagers.clear();
  }

  private dealDamageToCreep(
    creep: CreepRuntime,
    rawAmount: number,
    damageType: 'physical' | 'magical' | 'true',
    attacker?: HeroRuntime
  ): void {
    if (!creep.alive) return;
    const dmg = mitigateDamage(rawAmount, damageType, creep.armor, 10);
    creep.hp -= dmg;
    if (attacker?.isPlayer) {
      this.hud.flashHitmarker(false);
    }

    if (creep.hp <= 0) {
      creep.alive = false;
      this.scene.remove(creep.mesh);

      // Физика разлёта осадной машины или шарнирный 3D Ragdoll крипа / Лорда!
      const teamColor = creep.team === 'radiant' ? 0x2dd4bf : 0xef4444;
      const bodyHex = creep.team === 'radiant' ? 0x1d4d4f : 0x4f1d24;
      if (creep.creepType === 'siege') {
        this.physics.spawnFractureBurst(
          creep.position.clone().setY(0.9),
          'stone',
          10,
          this.lastHitImpulse,
          bodyHex,
          teamColor,
          0.95
        );
      } else {
        this.physics.spawnHumanoidRagdoll({
          origin: creep.position,
          yaw: creep.yaw,
          impulse: this.lastHitImpulse.clone(),
          scale: creep.creepType === 'lord_boss' ? 1.85 : creep.isEmpowered ? 1.05 : 0.78,
          armorHex: bodyHex,
          accentHex: creep.creepType === 'lord_boss' ? 0xf2cb78 : teamColor,
          skinHex: bodyHex,
        });
      }
      this.lastHitImpulse.set(0, 4.0, 0);

      // ДЕНАЙ СОЮЗНОГО КРИПА (как в Dota 2!)
      if (attacker && attacker.team === creep.team) {
        attacker.denies += 1;
        attacker.gold += 15;
        attacker.mana = Math.min(attacker.stats.maxMana, attacker.mana + 22);
        if (attacker.isPlayer) {
          this.sound.playDenySound();
          this.hud.spawnFloatingNumber(creep.position, '! ДЕНАЙ (+15 З)', '#fbbf24');
        }
        // Враги получают лишь 30% опыта и 0 золота!
        for (const h of this.heroes) {
          if (h.alive && h.team !== creep.team && h.position.distanceTo(creep.position) <= 22) {
            this.grantExperience(h, 15);
          }
        }
        return;
      }

      const lastHitGold =
        creep.creepType === 'lord_boss'
          ? 240
          : creep.creepType === 'siege'
            ? 88
            : creep.creepType === 'melee'
              ? 48
              : 54;
      if (attacker && attacker.team !== creep.team) {
        attacker.gold += lastHitGold;
        attacker.creepScore += 1;
        if (attacker.isPlayer) {
          this.sound.playGoldCoin();
          this.hud.spawnFloatingNumber(creep.position, `+${lastHitGold} З`, '#f2cb78');
        }
      }
      for (const h of this.heroes) {
        if (h.alive && h.team !== creep.team && h.position.distanceTo(creep.position) <= 22) {
          this.grantExperience(h, creep.creepType === 'siege' ? 78 : 48);
          if (h.id !== attacker?.id) h.gold += 16;
        }
      }
    }
  }

  private dealDamageToMonster(
    monster: JungleMonsterRuntime,
    rawAmount: number,
    damageType: 'physical' | 'magical' | 'true',
    attacker: HeroRuntime
  ): void {
    if (!monster.alive) return;
    const dmg = mitigateDamage(rawAmount, damageType, monster.armor, 15);
    monster.hp -= dmg;
    if (attacker.isPlayer) {
      this.hud.flashHitmarker(false);
    }

    if (monster.hp <= 0) {
      monster.alive = false;
      monster.respawnTimer = monster.respawnDuration;
      monster.mesh.visible = false;

      // Ragdoll и физические осколки лесных чудовищ и Боссов!
      if (monster.campType === 'elemental_turtle') {
        this.physics.spawnFractureBurst(
          monster.position.clone().setY(1.2),
          'crystal',
          14,
          this.lastHitImpulse,
          0x0f766e,
          0x5eead4,
          1.1
        );
      } else {
        this.physics.spawnHumanoidRagdoll({
          origin: monster.position,
          yaw: monster.yaw,
          impulse: this.lastHitImpulse.clone(),
          scale: monster.campType === 'titan_boss' ? 1.95 : monster.campType === 'wolf_camp' ? 0.85 : 1.2,
          armorHex: monster.campType === 'titan_boss' ? 0x282119 : 0x262e38,
          accentHex:
            monster.campType === 'titan_boss'
              ? 0xf2cb78
              : monster.campType === 'red_buff'
                ? 0xf97316
                : 0x38bdf8,
        });
      }
      this.lastHitImpulse.set(0, 4.5, 0);
      this.vfx.spawnBurst(monster.position.clone().setY(1.5), 0xf2cb78, 22, 9);

      if (monster.campType === 'titan_boss') {
        if (attacker.team === 'radiant') this.radiantEmpoweredTimer = 65;
        else this.direEmpoweredTimer = 65;

        this.addStatus(attacker.statuses, 'titan_blessing', 65, 1, attacker.id);
        attacker.shield += 550;
        this.spawnMarchingLord(attacker.team);

        for (const ally of this.heroes) {
          if (ally.team === attacker.team) {
            ally.gold += 300;
            this.grantExperience(ally, 240);
          }
        }
        this.hud.showAnnouncer(
          'ТИТАН РАЗЛОМА ПОВЕРЖЕН!',
          `${attacker.team === 'radiant' ? 'Орден Света' : 'Легион Пепла'} ведёт Штурмового Лорда-Титана!`
        );
        this.sound.playKillFanfare(4);
      } else if (monster.campType === 'elemental_turtle') {
        for (const ally of this.heroes) {
          if (ally.team === attacker.team) {
            ally.gold += 180;
            ally.shield = Math.max(ally.shield, 380);
            this.grantExperience(ally, 165);
          }
        }
        this.hud.showAnnouncer(
          'ЧЕРЕПАХА СТИХИЙ ПОВЕРЖЕНА!',
          'Вся команда получает энергетический щит и золото!'
        );
        this.sound.playKillFanfare(3);
      } else {
        const nightBonus = this.isNightTime ? 1.25 : 1.0;
        const gold = Math.round((monster.campType === 'wolf_camp' ? 85 : 130) * nightBonus);
        attacker.gold += gold;
        attacker.creepScore += 1;
        this.grantExperience(attacker, Math.round(125 * nightBonus));
        if (monster.campType === 'red_buff') {
          this.addStatus(attacker.statuses, 'red_buff', 50, 1, attacker.id);
        } else if (monster.campType === 'blue_buff') {
          this.addStatus(attacker.statuses, 'blue_buff', 50, 1, attacker.id);
        }
        if (attacker.isPlayer) {
          this.sound.playGoldCoin();
          this.hud.spawnFloatingNumber(monster.position, `+${gold} З`, '#f2cb78');
        }
      }
    }
  }

  private isTowerVulnerable(tower: TowerRuntime): boolean {
    if (tower.tier === 1) return true;
    if (tower.tier === 2) {
      return !this.towers.some(
        (t) => t.alive && t.team === tower.team && t.lane === tower.lane && t.tier === 1
      );
    }
    if (tower.tier === 3) {
      const aliveT2Count = this.towers.filter(
        (t) => t.alive && t.team === tower.team && t.tier === 2
      ).length;
      return aliveT2Count < 3;
    }
    return !this.towers.some((t) => t.alive && t.team === tower.team && t.tier === 3);
  }

  private dealDamageToTower(
    tower: TowerRuntime,
    rawAmount: number,
    attackerHero?: HeroRuntime
  ): void {
    if (!tower.alive) return;
    if (!this.isTowerVulnerable(tower)) {
      if (attackerHero?.isPlayer) {
        this.hud.spawnFloatingNumber(tower.position, 'НЕУЯЗВИМА', '#94a3b8');
      }
      return;
    }

    const enemyTeam = tower.team === 'radiant' ? 'dire' : 'radiant';
    const hasAttackingCreeps = this.creeps.some(
      (c) => c.alive && c.team === enemyTeam && c.position.distanceTo(tower.position) < 16
    );
    const backdoorFactor = hasAttackingCreeps ? 1.0 : 0.45;
    const dmg = mitigateDamage(rawAmount * backdoorFactor, 'physical', tower.armor, 0);
    tower.hp -= dmg;

    if (attackerHero?.isPlayer) {
      this.hud.flashHitmarker(false);
    }

    // Поэтапное осыпание и раскалывание башен на 66% и 33% ХП!
    const hpRatio = tower.hp / tower.maxHp;
    const stoneColor = tower.team === 'radiant' ? 0x28394d : 0x382026;
    const crystalColor = tower.team === 'radiant' ? 0x2dd4bf : 0xef4444;

    if (tower.hp > 0 && hpRatio <= 0.66 && tower.damageStage === 0) {
      tower.damageStage = 1;
      tower.mesh.rotation.z = 0.035;
      this.physics.spawnFractureBurst(
        tower.position.clone().setY(4.8),
        'stone',
        11,
        undefined,
        stoneColor,
        crystalColor,
        1.0
      );
      this.sound.playRockShatter(false);
    } else if (tower.hp > 0 && hpRatio <= 0.33 && tower.damageStage < 2) {
      tower.damageStage = 2;
      tower.mesh.rotation.z = -0.065;
      this.physics.spawnFractureBurst(
        tower.position.clone().setY(3.6),
        'crystal',
        14,
        undefined,
        stoneColor,
        crystalColor,
        1.15
      );
      this.sound.playRockShatter(false);
    }

    if (tower.hp <= 0) {
      tower.hp = 0;
      tower.alive = false;
      this.scene.remove(tower.mesh);

      // Эпическое физическое обрушение башни или Древнего Трона на десятки 3D-глыб!
      this.physics.spawnStructureCollapse(tower.position, tower.tier === 4, tower.team);
      this.sound.playRockShatter(true);
      this.vfx.spawnBurst(tower.position.clone().setY(3.5), 0xf97316, 32, 12);
      this.vfx.spawnShockwave(tower.position, 9, 0xf2cb78, 0.65);
      if (this.playerHero && this.playerHero.position.distanceTo(tower.position) < 28) {
        this.vfx.addCameraShake(0.45);
      }

      for (const h of this.heroes) {
        if (h.team !== tower.team) {
          h.gold += 200;
          this.grantExperience(h, 140);
        }
      }

      if (tower.tier === 4) {
        this.state = 'ended';
        this.input.releasePointerLock();
        const radiantWon = tower.team === 'dire';
        this.sound.playKillFanfare(5);
        this.hud.showMatchVictoryScreen(radiantWon, this.heroes, this.elapsedTime);
      } else {
        this.hud.showAnnouncer('БАШНЯ РАЗРУШЕНА!', tower.name);
        this.sound.playKillFanfare(2);
      }
    }
  }

  private grantExperience(hero: HeroRuntime, amount: number): void {
    if (hero.level >= MAX_HERO_LEVEL) return;
    hero.xp += amount;
    while (hero.level < MAX_HERO_LEVEL && hero.xp >= xpRequiredForNextLevel(hero.level)) {
      hero.xp -= xpRequiredForNextLevel(hero.level);
      hero.level += 1;
      hero.skillPoints += 1;
      const oldMax = hero.stats.maxHp;
      hero.stats = computeHeroStats(
        hero.heroDef,
        hero.level,
        hero.items,
        hero.statuses,
        hero.fleshHeapStacks,
        hero.hp / Math.max(1, oldMax),
        hero.chosenTalents,
        this.isNightTime
      );
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + (hero.stats.maxHp - oldMax) + 85);
      hero.mana = Math.min(hero.stats.maxMana, hero.mana + 55);
      this.vfx.spawnShockwave(hero.position, 3.4, 0xf2cb78, 0.45);
    }
  }

  private spawnCreepWave(): void {
    this.waveCounter += 1;
    const includeSiege = this.waveCounter % 3 === 0;

    for (const team of ['radiant', 'dire'] as const) {
      const empowered =
        team === 'radiant' ? this.radiantEmpoweredTimer > 0 : this.direEmpoweredTimer > 0;

      for (const lane of ['top', 'mid', 'bot'] as const) {
        const pts = LANE_WAYPOINTS[lane];
        const startPt = team === 'radiant' ? pts[0] : pts[pts.length - 1];
        const nextIdx = team === 'radiant' ? 1 : pts.length - 2;

        const types: ('melee' | 'ranged' | 'siege')[] = ['melee', 'melee', 'melee', 'ranged'];
        if (includeSiege) types.push('siege');

        types.forEach((cType, idx) => {
          const offsetAngle = (idx / types.length) * Math.PI * 2;
          const pos = new THREE.Vector3(
            startPt.x + Math.cos(offsetAngle) * 1.9,
            0,
            startPt.z + Math.sin(offsetAngle) * 1.9
          );
          const mult = empowered ? 1.55 : 1.0 + Math.min(0.6, this.elapsedTime / 600);
          const maxHp = Math.round(
            (cType === 'siege' ? 680 : cType === 'melee' ? 420 : 300) * mult
          );
          const dmg = Math.round((cType === 'siege' ? 58 : cType === 'melee' ? 28 : 36) * mult);
          const mesh = createCreepMesh(cType, team, empowered);
          mesh.position.copy(pos);
          this.scene.add(mesh);

          this.creeps.push({
            id: this.nextId('creep'),
            entityKind: 'creep',
            creepType: cType,
            team,
            lane,
            waypointIndex: nextIdx,
            position: pos,
            impulseVelocity: new THREE.Vector3(),
            yaw: 0,
            radius: cType === 'siege' ? 1.1 : 0.65,
            hp: maxHp,
            maxHp,
            attackDamage: dmg,
            armor: cType === 'siege' ? 16 : 6,
            attackRange: cType === 'melee' ? 2.6 : 11.5,
            attackCooldown: 0,
            moveSpeed: 6.6,
            alive: true,
            isEmpowered: empowered,
            statuses: [],
            mesh,
            animTime: 0,
          });
        });
      }
    }
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.arenaVisuals.riverTexture.offset.y -= dt * 0.14;

    if (this.state === 'lobby') {
      this.lobbyOrbitAngle += dt * 0.38;
      this.camera.position.set(
        Math.sin(this.lobbyOrbitAngle) * 7.2,
        2.85,
        Math.cos(this.lobbyOrbitAngle) * 7.2
      );
      this.camera.lookAt(0, 1.85, 0);
      this.renderFrame();
      return;
    }

    if (this.state === 'playing') {
      this.updateSimulation(dt);
    } else if (this.state === 'ended') {
      // В финале матча продолжаем просчитывать полёт каменных глыб Древнего Трона!
      this.physics.update(dt);
      this.vfx.update(dt);
    }

    this.renderFrame();
  }

  private updateDayNightAndOutposts(dt: number): void {
    const cyclePhase = Math.floor((this.elapsedTime + this.dayNightOffset) / 75) % 2;
    const nextNight = cyclePhase === 1;
    if (nextNight !== this.isNightTime) {
      this.isNightTime = nextNight;
      this.hud.showAnnouncer(
        nextNight ? '☾ НАСТУПИЛА ТЁМНАЯ НОЧЬ!' : '☀ РАССВЕТ НАД РАЗЛОМОМ!',
        nextNight ? 'Охотники быстрее, награда в лесу +25%!' : 'Дневной свет озаряет арену!'
      );
    }

    const skyTarget = this.isNightTime ? this.nightSkyColor : this.daySkyColor;
    const fogTarget = this.isNightTime ? this.nightFogColor : this.dayFogColor;
    this.arenaVisuals.skyMaterial.color.lerp(skyTarget, Math.min(1, dt * 1.8));
    (this.scene.fog as THREE.FogExp2).color.lerp(fogTarget, Math.min(1, dt * 1.8));
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      this.isNightTime ? 0.82 : 1.85,
      Math.min(1, dt * 1.8)
    );
    this.hemiLight.intensity = THREE.MathUtils.lerp(
      this.hemiLight.intensity,
      this.isNightTime ? 0.55 : 0.95,
      Math.min(1, dt * 1.8)
    );

    // Захват и награды Лесных Аванпостов (Outposts)
    for (const op of this.outposts) {
      op.beaconMesh.rotation.y += dt * 1.8;
      let radCount = 0;
      let direCount = 0;
      for (const h of this.heroes) {
        if (!h.alive) continue;
        if (h.position.distanceTo(op.position) <= op.captureRadius) {
          if (h.team === 'radiant') radCount++;
          else direCount++;
        }
      }

      if (radCount > 0 && direCount === 0 && op.owner !== 'radiant') {
        op.captureProgress = Math.min(1, op.captureProgress + dt * 0.28);
        if (op.captureProgress >= 1) {
          op.owner = 'radiant';
          const mat = op.beaconMesh.material as THREE.MeshStandardMaterial;
          mat.color.setHex(0x2dd4bf);
          mat.emissive.setHex(0x2dd4bf);
          this.hud.showAnnouncer('АВАНПОСТ ЗАХВАЧЕН!', `${op.name} под контролем Света`);
        }
      } else if (direCount > 0 && radCount === 0 && op.owner !== 'dire') {
        op.captureProgress = Math.max(-1, op.captureProgress - dt * 0.28);
        if (op.captureProgress <= -1) {
          op.owner = 'dire';
          const mat = op.beaconMesh.material as THREE.MeshStandardMaterial;
          mat.color.setHex(0xef4444);
          mat.emissive.setHex(0xef4444);
          this.hud.showAnnouncer('ВРАГ ЗАХВАТИЛ АВАНПОСТ!', op.name);
        }
      }

      if (op.owner !== 'neutral') {
        op.rewardTimer -= dt;
        if (op.rewardTimer <= 0) {
          op.rewardTimer = 30;
          for (const h of this.heroes) {
            if (h.team === op.owner) {
              h.gold += 65;
              this.grantExperience(h, 75);
            }
          }
        }
      }
    }
  }

  private updateWardsAndDestructibles(dt: number): void {
    for (let i = this.wards.length - 1; i >= 0; i--) {
      const w = this.wards[i];
      w.remaining -= dt;
      w.mesh.rotation.y += dt * 1.1;
      if (w.remaining <= 0) {
        this.scene.remove(w.mesh);
        this.wards.splice(i, 1);
      }
    }

    let colliderChanged = false;
    for (const d of this.destructibles) {
      if (d.alive) {
        const core = d.intactGroup.getObjectByName('fractureCore');
        if (core) core.rotation.y += dt * 1.5;
        continue;
      }
      d.respawnTimer -= dt;
      if (d.respawnTimer <= 0) {
        const blockedByHero = this.heroes.some(
          (h) => h.alive && h.position.distanceTo(d.position) < d.radius + h.radius + 0.6
        );
        if (!blockedByHero) {
          d.alive = true;
          d.hp = d.maxHp;
          d.intactGroup.visible = true;
          d.ruinGroup.visible = false;
          colliderChanged = true;
        }
      }
    }
    if (colliderChanged) {
      this.refreshDestructibleColliders();
    }
  }

  private updateSimulation(dt: number): void {
    this.elapsedTime += dt;
    if (this.radiantEmpoweredTimer > 0) this.radiantEmpoweredTimer -= dt;
    if (this.direEmpoweredTimer > 0) this.direEmpoweredTimer -= dt;
    if (this.sniperZoomTimer > 0) this.sniperZoomTimer = Math.max(0, this.sniperZoomTimer - dt);

    this.updateDayNightAndOutposts(dt);
    this.updateWardsAndDestructibles(dt);

    this.waveTimer += dt;
    if (this.waveTimer >= 22) {
      this.waveTimer = 0;
      this.spawnCreepWave();
    }

    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].remaining -= dt;
      if (this.pings[i].remaining <= 0) this.pings.splice(i, 1);
    }

    for (const r of this.runes) {
      if (r.active) {
        r.mesh.rotation.y += dt * 2.2;
        for (const h of this.heroes) {
          if (!h.alive) continue;
          if (h.position.distanceTo(r.position) < 2.4) {
            r.active = false;
            r.respawnTimer = 45;
            r.mesh.visible = false;
            if (r.runeType === 'damage') {
              this.addStatus(h.statuses, 'red_buff', 30, 1, h.id);
              if (h.isPlayer) this.hud.showAnnouncer('РУНА МОГУЩЕСТВА!', '+Урон и замедление');
            } else {
              this.addStatus(h.statuses, 'haste', 22, 0.38, h.id);
              h.hp = Math.min(h.stats.maxHp, h.hp + 260);
              h.mana = Math.min(h.stats.maxMana, h.mana + 180);
              if (h.isPlayer) this.hud.showAnnouncer('РУНА СТРЕМИТЕЛЬНОСТИ!', '+Скорость и исцеление');
            }
            break;
          }
        }
      } else {
        r.respawnTimer -= dt;
        if (r.respawnTimer <= 0) {
          r.active = true;
          r.mesh.visible = true;
        }
      }
    }

    for (const hero of this.heroes) {
      this.updateHeroState(hero, dt);
    }

    if (this.playerHero) {
      this.updatePlayerMovementAndActions(this.playerHero, dt);
    }

    const aiWorld = {
      heroes: this.heroes,
      creeps: this.creeps,
      towers: this.towers,
      monsters: this.monsters,
      outposts: this.outposts,
      activePings: this.pings,
      isHeroHiddenFromTeam: (h: HeroRuntime, viewerTeam: 'radiant' | 'dire') =>
        this.isHeroHiddenFromTeam(h, viewerTeam),
      performBasicAttack: (h: HeroRuntime) => this.performBasicAttack(h),
      castAbility: (h: HeroRuntime, s: AbilitySlot) => this.castHeroAbility(h, s),
      castBattleSpell: (h: HeroRuntime) => this.castBattleSpell(h),
      upgradeAbility: (h: HeroRuntime, s: AbilitySlot) => this.upgradeHeroAbility(h, s),
      chooseTalent: (h: HeroRuntime, b: 'left' | 'right') => {
        this.chooseHeroTalent(h, b);
      },
      useActiveItem: (h: HeroRuntime, idx: number) => this.useActiveItem(h, idx, false),
      placeWard: (h: HeroRuntime) => this.placeWard(h),
      triggerParry: (h: HeroRuntime) => this.triggerParry(h),
      buyItem: (h: HeroRuntime, id: string) => this.buyItemForHero(h, id),
    };

    for (const hero of this.heroes) {
      if (!hero.isPlayer) {
        this.ai.updateBot(hero, dt, aiWorld);
      }
    }

    this.updateCreeps(dt);
    this.updateMonsters(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateGroundZones(dt);
    this.physics.update(dt);
    this.vfx.update(dt);

    if (this.playerHero) {
      this.syncPlayerFirstPersonCamera(this.playerHero, dt);
      const enemyAim = this.findClosestEnemyHeroInCone(this.playerHero, 32, 0.96) !== null;
      this.hud.updateHUD(
        dt,
        this.playerHero,
        this.heroes,
        this.creeps,
        this.towers,
        this.monsters,
        this.wards,
        this.outposts,
        this.pings,
        this.camera,
        this.elapsedTime,
        this.isNightTime,
        this.radiantKills,
        this.direKills,
        this.input.isPointerLocked,
        this.input.isTouchMode,
        enemyAim,
        this.sniperZoomTimer > 0,
        (h, viewerTeam) => this.isHeroHiddenFromTeam(h, viewerTeam)
      );
    }
  }

  private updateHeroState(hero: HeroRuntime, dt: number): void {
    hero.gold += 5.5 * dt;
    if (hero.immortalityCooldown > 0) {
      hero.immortalityCooldown = Math.max(0, hero.immortalityCooldown - dt);
    }
    if (hero.parryWindow > 0) hero.parryWindow = Math.max(0, hero.parryWindow - dt);
    if (hero.parryCooldown > 0) hero.parryCooldown = Math.max(0, hero.parryCooldown - dt);
    if (hero.slideTimer > 0) hero.slideTimer = Math.max(0, hero.slideTimer - dt);
    if (hero.slideCooldown > 0) hero.slideCooldown = Math.max(0, hero.slideCooldown - dt);
    if (hero.brushRevealTimer > 0) hero.brushRevealTimer = Math.max(0, hero.brushRevealTimer - dt);

    if (hero.wardCharges < 2) {
      hero.wardRechargeTimer -= dt;
      if (hero.wardRechargeTimer <= 0) {
        hero.wardCharges += 1;
        hero.wardRechargeTimer = 50;
      }
    }

    for (const [itemId, cd] of hero.itemCooldowns.entries()) {
      if (cd <= dt) hero.itemCooldowns.delete(itemId);
      else hero.itemCooldowns.set(itemId, cd - dt);
    }

    if (hero.multiKillWindow > 0) {
      hero.multiKillWindow -= dt;
      if (hero.multiKillWindow <= 0) hero.multiKillCount = 0;
    }

    if (!hero.alive) {
      hero.respawnTimer -= dt;
      if (hero.respawnTimer <= 0) {
        const fountain = hero.team === 'radiant' ? FOUNTAIN_POS.radiant : FOUNTAIN_POS.dire;
        hero.position.set(
          fountain.x + (Math.random() - 0.5) * 3,
          0,
          fountain.z + (Math.random() - 0.5) * 3
        );
        hero.alive = true;
        hero.hp = hero.stats.maxHp;
        hero.mana = hero.stats.maxMana;
        hero.mesh.visible = !hero.isPlayer;
        this.vfx.spawnShockwave(hero.position, 3.2, 0x2dd4bf, 0.45);
      }
      return;
    }

    // Применение физических импульсов отбрасывания к живым героям
    if (hero.impulseVelocity.lengthSq() > 0.04) {
      hero.position.x += hero.impulseVelocity.x * dt;
      hero.position.z += hero.impulseVelocity.z * dt;
      resolveArenaCollisions(hero.position, hero.radius);
      hero.impulseVelocity.multiplyScalar(Math.max(0, 1 - 6.5 * dt));
    } else {
      hero.impulseVelocity.set(0, 0, 0);
    }

    // Движение в тактическом подкате (Slide)
    if (hero.slideTimer > 0) {
      const slideSpd = hero.stats.moveSpeed * 1.58;
      hero.position.x += hero.slideDirection.x * slideSpd * dt;
      hero.position.z += hero.slideDirection.z * slideSpd * dt;
      resolveArenaCollisions(hero.position, hero.radius);
    }

    hero.inBrush = isPositionInBrush(hero.position);

    if (hero.attackCooldown > 0) hero.attackCooldown = Math.max(0, hero.attackCooldown - dt);
    if (hero.battleSpellCooldown > 0) {
      hero.battleSpellCooldown = Math.max(0, hero.battleSpellCooldown - dt);
    }
    for (const s of ['Q', 'W', 'E', 'R'] as const) {
      if (hero.abilityCooldowns[s] > 0) {
        hero.abilityCooldowns[s] = Math.max(0, hero.abilityCooldowns[s] - dt);
      }
    }

    for (let i = hero.statuses.length - 1; i >= 0; i--) {
      const st = hero.statuses[i];
      st.remaining -= dt;
      if (st.type === 'rot_aura') {
        this.damageEnemiesInRadius(hero, hero.position, 5.2, st.magnitude * dt, 'magical', 0.4);
        if (this.hasTalent(hero, 'butcher_10_rot_vamp')) {
          hero.hp = Math.min(hero.stats.maxHp, hero.hp + st.magnitude * 0.22 * dt);
        }
      } else if (st.type === 'blade_spin') {
        // Вихрь секиры Рагнара рубит деревья вокруг него!
        this.damageDestructiblesInRadius(hero.position, 4.4, 220 * dt, hero.position, false);
        this.damageEnemiesInRadius(hero, hero.position, 4.8, st.magnitude * 1.15 * dt, 'physical');
        if (this.hasTalent(hero, 'berserker_10_vortex_spin')) {
          for (const enemy of this.heroes) {
            if (!enemy.alive || enemy.team === hero.team) continue;
            if (enemy.statuses.some((eSt) => eSt.type === 'bkb_immune')) continue;
            const d = enemy.position.distanceTo(hero.position);
            if (d > 1.8 && d <= 6.2) {
              const pull = hero.position.clone().sub(enemy.position).setY(0).normalize();
              enemy.position.addScaledVector(pull, 3.2 * dt);
              resolveArenaCollisions(enemy.position, enemy.radius);
            }
          }
        }
      }
      if (st.remaining <= 0) {
        hero.statuses.splice(i, 1);
      }
    }

    hero.stats = computeHeroStats(
      hero.heroDef,
      hero.level,
      hero.items,
      hero.statuses,
      hero.fleshHeapStacks,
      hero.hp / Math.max(1, hero.stats.maxHp),
      hero.chosenTalents,
      this.isNightTime
    );

    const ownFountain = hero.team === 'radiant' ? FOUNTAIN_POS.radiant : FOUNTAIN_POS.dire;
    const inFountain = hero.position.distanceTo(ownFountain) < 9.5;
    const hpReg = hero.stats.hpRegen + (inFountain ? hero.stats.maxHp * 0.16 : 0);
    const mpReg = hero.stats.manaRegen + (inFountain ? hero.stats.maxMana * 0.2 : 0);

    hero.hp = Math.min(hero.stats.maxHp, hero.hp + hpReg * dt);
    hero.mana = Math.min(hero.stats.maxMana, hero.mana + mpReg * dt);

    if (hero.shield > 0) {
      hero.shield = Math.max(0, hero.shield - 28 * dt);
    }

    if (hero.isRecalling) {
      hero.recallTimer -= dt;
      if (hero.recallTimer <= 0) {
        hero.isRecalling = false;
        hero.position.set(ownFountain.x, 0, ownFountain.z);
        this.vfx.spawnSkyPillar(hero.position, 2.0, 0x2dd4bf);
      }
    }

    const inCyclone = hero.statuses.some((s) => s.type === 'cyclone_invuln');
    if (inCyclone) {
      hero.position.y = 3.2;
    } else if (!hero.isPlayer && hero.position.y > 0) {
      hero.position.y = Math.max(0, hero.position.y - 7.5 * dt);
    }

    if (hero.swingAnim > 0) hero.swingAnim = Math.max(0, hero.swingAnim - dt * 3.8);
    if (!hero.isPlayer) {
      hero.mesh.position.copy(hero.position);
      hero.mesh.rotation.y = hero.yaw;
      const isStealthed =
        hero.statuses.some((s) => s.type === 'stealth') ||
        (hero.inBrush && hero.brushRevealTimer <= 0);
      const isBkb = hero.statuses.some((s) => s.type === 'bkb_immune');
      animateHeroMesh(hero.mesh, dt, hero.velocity.length(), hero.swingAnim, isStealthed, isBkb);
      if (this.playerHero && hero.team !== this.playerHero.team) {
        hero.mesh.visible = !this.isHeroHiddenFromTeam(hero, this.playerHero.team);
      }
    }
  }

  private updatePlayerMovementAndActions(player: HeroRuntime, dt: number): void {
    if (!player.alive) {
      player.velocity.set(0, 0, 0);
      return;
    }

    const isHardCC = player.statuses.some(
      (s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln'
    );
    if (!isHardCC) {
      if (player.slideTimer <= 0) {
        const { forward, strafe } = this.input.getMoveAxes();
        if (Math.abs(forward) > 0.02 || Math.abs(strafe) > 0.02) {
          player.isRecalling = false;
          const fwd = this.getHeroForward2D(player);
          const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
          const moveVec = new THREE.Vector3()
            .addScaledVector(fwd, forward)
            .addScaledVector(right, strafe);
          if (moveVec.lengthSq() > 1) moveVec.normalize();

          const spd = player.stats.moveSpeed;
          player.velocity.set(moveVec.x * spd, 0, moveVec.z * spd);
          player.position.x += player.velocity.x * dt;
          player.position.z += player.velocity.z * dt;
          resolveArenaCollisions(player.position, player.radius);
        } else {
          player.velocity.set(0, 0, 0);
        }
      }

      if (this.input.primaryFireHeld) {
        this.performBasicAttack(player);
      }
    }

    const inCyclone = player.statuses.some((s) => s.type === 'cyclone_invuln');
    if (!inCyclone && (this.playerJumpVelY !== 0 || player.position.y > 0)) {
      player.position.y += this.playerJumpVelY * dt;
      this.playerJumpVelY -= 21 * dt;
      if (player.position.y <= 0) {
        player.position.y = 0;
        this.playerJumpVelY = 0;
      }
    }
  }

  private syncPlayerFirstPersonCamera(player: HeroRuntime, dt: number): void {
    const targetFov = this.sniperZoomTimer > 0 ? 34 : player.slideTimer > 0 ? 79 : 73;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 14));
      this.camera.updateProjectionMatrix();
    }

    const baseEye = player.heroDef.id === 'butcher' || player.heroDef.id === 'warden' ? 2.15 : 1.92;
    const eyeHeight = player.slideTimer > 0 ? baseEye - 0.75 : baseEye;
    const shakeX = (Math.random() - 0.5) * this.vfx.shakeAmount;
    const shakeY = (Math.random() - 0.5) * this.vfx.shakeAmount;

    this.camera.position.set(
      player.position.x + shakeX,
      player.position.y + eyeHeight + shakeY,
      player.position.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;

    const moveRatio = Math.min(1, player.velocity.length() / 9.5);
    const isStealthed =
      player.statuses.some((s) => s.type === 'stealth') ||
      (player.inBrush && player.brushRevealTimer <= 0);
    const isSpinning = player.statuses.some((s) => s.type === 'blade_spin');
    this.viewModel.update(
      dt,
      moveRatio,
      isStealthed,
      isSpinning,
      this.sniperZoomTimer > 0,
      player.parryWindow > 0,
      player.slideTimer > 0
    );
  }

  private updateCreeps(dt: number): void {
    for (let i = this.creeps.length - 1; i >= 0; i--) {
      const c = this.creeps[i];
      if (!c.alive) {
        this.creeps.splice(i, 1);
        continue;
      }

      if (c.attackCooldown > 0) c.attackCooldown -= dt;

      if (c.impulseVelocity.lengthSq() > 0.04) {
        c.position.x += c.impulseVelocity.x * dt;
        c.position.z += c.impulseVelocity.z * dt;
        resolveArenaCollisions(c.position, c.radius);
        c.impulseVelocity.multiplyScalar(Math.max(0, 1 - 6.5 * dt));
      } else {
        c.impulseVelocity.set(0, 0, 0);
      }

      // Штурмовой Лорд-Титан ломает деревья и баррикады прямо на своём пути!
      if (c.creepType === 'lord_boss') {
        this.damageDestructiblesInRadius(c.position, c.radius + 1.5, 500, c.position, true);
      }

      let targetPos: THREE.Vector3 | null = null;
      let targetRadius = 0.8;
      let executeHit: (() => void) | null = null;
      let bestDist = 14.5;

      for (const other of this.creeps) {
        if (!other.alive || other.team === c.team) continue;
        const d = c.position.distanceTo(other.position);
        if (d < bestDist) {
          bestDist = d;
          targetPos = other.position;
          targetRadius = other.radius;
          executeHit = () => {
            this.setImpactImpulseFromPoints(c.position, other.position, 8, 4);
            this.dealDamageToCreep(other, c.attackDamage, 'physical');
          };
        }
      }

      if (!targetPos) {
        for (const tw of this.towers) {
          if (!tw.alive || tw.team === c.team) continue;
          const d = c.position.distanceTo(tw.position);
          if (d < 15.5) {
            bestDist = d;
            targetPos = tw.position;
            targetRadius = tw.radius;
            executeHit = () => {
              // Штурмовой Лорд-Титан отключает вражеские башни электрическим тараном!
              if (c.creepType === 'lord_boss') {
                tw.disabledTimer = 2.6;
                this.vfx.spawnShockwave(tw.position, 5.2, 0xf2cb78, 0.35);
              }
              this.dealDamageToTower(tw, c.attackDamage);
            };
            break;
          }
        }
      }

      if (!targetPos) {
        for (const h of this.heroes) {
          if (!h.alive || h.team === c.team) continue;
          if (this.isHeroHiddenFromTeam(h, c.team)) continue;
          const d = c.position.distanceTo(h.position);
          if (d < 11) {
            bestDist = d;
            targetPos = h.position;
            targetRadius = h.radius;
            executeHit = () => this.dealDamageToHero(h, c.attackDamage, 'physical');
            break;
          }
        }
      }

      if (targetPos && executeHit) {
        const dx = targetPos.x - c.position.x;
        const dz = targetPos.z - c.position.z;
        c.yaw = Math.atan2(-dx, -dz);
        if (bestDist <= c.attackRange + targetRadius) {
          if (c.attackCooldown <= 0) {
            c.attackCooldown = 1.15;
            executeHit();
          }
        } else {
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          c.position.addScaledVector(dir, c.moveSpeed * dt);
        }
      } else {
        const pts = LANE_WAYPOINTS[c.lane];
        const wp = pts[c.waypointIndex];
        const dist = c.position.distanceTo(wp);
        if (dist < 2.5) {
          if (c.team === 'radiant' && c.waypointIndex < pts.length - 1) c.waypointIndex += 1;
          else if (c.team === 'dire' && c.waypointIndex > 0) c.waypointIndex -= 1;
        }
        const goal = pts[c.waypointIndex];
        const dir = new THREE.Vector3(goal.x - c.position.x, 0, goal.z - c.position.z);
        if (dir.lengthSq() > 0.05) {
          dir.normalize();
          c.yaw = Math.atan2(-dir.x, -dir.z);
          c.position.addScaledVector(dir, c.moveSpeed * dt);
        }
      }

      c.mesh.position.copy(c.position);
      c.mesh.rotation.y = c.yaw;
    }
  }

  private updateMonsters(dt: number): void {
    for (const m of this.monsters) {
      if (!m.alive) {
        m.respawnTimer -= dt;
        if (m.respawnTimer <= 0) {
          m.alive = true;
          m.hp = m.maxHp;
          m.position.copy(m.homePosition);
          m.mesh.position.copy(m.position);
          m.mesh.visible = true;
        }
        continue;
      }

      if (m.attackCooldown > 0) m.attackCooldown -= dt;

      let targetHero: HeroRuntime | null = null;
      let minDist = m.hp < m.maxHp ? 14 : 5.2;
      for (const h of this.heroes) {
        if (!h.alive) continue;
        const d = h.position.distanceTo(m.position);
        if (d < minDist && m.homePosition.distanceTo(h.position) < 16) {
          minDist = d;
          targetHero = h;
        }
      }

      if (targetHero) {
        const dx = targetHero.position.x - m.position.x;
        const dz = targetHero.position.z - m.position.z;
        m.yaw = Math.atan2(-dx, -dz);
        if (minDist <= m.attackRange + targetHero.radius) {
          if (m.attackCooldown <= 0) {
            m.attackCooldown = 1.35;
            this.dealDamageToHero(targetHero, m.attackDamage, 'physical');
          }
        } else {
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          m.position.addScaledVector(dir, m.moveSpeed * dt);
        }
      } else if (m.position.distanceTo(m.homePosition) > 0.4) {
        const dir = m.homePosition.clone().sub(m.position).setY(0).normalize();
        m.position.addScaledVector(dir, m.moveSpeed * dt);
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.12 * dt);
      }

      m.mesh.position.copy(m.position);
      m.mesh.rotation.y = m.yaw;
    }
  }

  private updateTowers(dt: number): void {
    for (const tw of this.towers) {
      if (!tw.alive) continue;

      if (tw.disabledTimer > 0) {
        tw.disabledTimer = Math.max(0, tw.disabledTimer - dt);
        if (tw.laserLine) tw.laserLine.visible = false;
        continue;
      }

      if (tw.crystalMesh) {
        tw.crystalMesh.rotation.y += dt * (tw.damageStage > 0 ? 3.2 : 1.4);
      }
      if (tw.attackCooldown > 0) tw.attackCooldown -= dt;

      let chosenHero: HeroRuntime | null = null;
      let chosenCreep: CreepRuntime | null = null;

      if (tw.currentTargetId) {
        const lockedHero = this.heroes.find(
          (h) =>
            h.id === tw.currentTargetId &&
            h.alive &&
            !h.statuses.some((s) => s.type === 'cyclone_invuln') &&
            h.position.distanceTo(tw.position) <= tw.attackRange
        );
        if (lockedHero) {
          chosenHero = lockedHero;
        } else {
          tw.currentTargetId = null;
          tw.consecutiveHits = 0;
        }
      }

      if (!chosenHero) {
        let minCreepD = tw.attackRange;
        for (const c of this.creeps) {
          if (!c.alive || c.team === tw.team) continue;
          const d = c.position.distanceTo(tw.position);
          if (d <= minCreepD) {
            minCreepD = d;
            chosenCreep = c;
          }
        }
      }

      if (!chosenHero && !chosenCreep) {
        let minHeroD = tw.attackRange;
        for (const h of this.heroes) {
          if (!h.alive || h.team === tw.team) continue;
          if (h.statuses.some((s) => s.type === 'cyclone_invuln')) continue;
          const d = h.position.distanceTo(tw.position);
          if (d <= minHeroD) {
            minHeroD = d;
            chosenHero = h;
          }
        }
        if (chosenHero) {
          if (chosenHero.isPlayer && tw.currentTargetId !== chosenHero.id) {
            this.sound.playTowerWarning();
          }
          tw.currentTargetId = chosenHero.id;
        }
      }

      const targetPos = chosenHero ? chosenHero.position : chosenCreep ? chosenCreep.position : null;
      if (tw.laserLine) {
        if (targetPos) {
          tw.laserLine.visible = true;
          const topY = tw.tier === 4 ? 5.6 : 7.3;
          const localTarget = targetPos.clone().sub(tw.position);
          localTarget.y += 1.3;
          const posAttr = tw.laserLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          posAttr.setXYZ(0, 0, topY, 0);
          posAttr.setXYZ(1, localTarget.x, localTarget.y, localTarget.z);
          posAttr.needsUpdate = true;
        } else {
          tw.laserLine.visible = false;
        }
      }

      if (targetPos && tw.attackCooldown <= 0) {
        tw.attackCooldown = 1.05;
        const start = tw.position.clone().setY(tw.tier === 4 ? 5.6 : 7.3);
        const dir = targetPos.clone().setY(1.3).sub(start).normalize();
        const orb = createProjectileMesh(tw.team === 'radiant' ? 0x2dd4bf : 0xef4444, 1.35);
        orb.position.copy(start);
        this.scene.add(orb);

        const rampMultiplier = chosenHero ? 1 + Math.min(4, tw.consecutiveHits) * 0.2 : 1;
        if (chosenHero) tw.consecutiveHits += 1;

        this.projectiles.push({
          id: this.nextId('torb'),
          kind: 'tower_orb',
          ownerId: tw.id,
          team: tw.team,
          position: start,
          startPosition: start.clone(),
          direction: dir,
          speed: 30,
          maxDistance: tw.attackRange + 5,
          traveled: 0,
          radius: 0.9,
          damage: tw.attackDamage * rampMultiplier,
          damageType: 'physical',
          piercing: false,
          hitIds: new Set(),
          mesh: orb,
        });
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const ownerHero = this.heroes.find((h) => h.id === p.ownerId);

      if (p.kind === 'meat_hook' && p.isReturningHook) {
        const anchor = ownerHero
          ? ownerHero.position.clone().setY(1.45)
          : p.startPosition;
        const toOwner = anchor.clone().sub(p.position);
        const dist = toOwner.length();
        const step = 42 * dt;

        if (p.returningHookTargetId) {
          const hookedHero = this.heroes.find((h) => h.id === p.returningHookTargetId);
          if (
            hookedHero &&
            hookedHero.alive &&
            !hookedHero.statuses.some((s) => s.type === 'bkb_immune')
          ) {
            hookedHero.position.set(p.position.x, 0, p.position.z);
            resolveArenaCollisions(hookedHero.position, hookedHero.radius);
          }
        }

        if (dist <= step + 1.8) {
          this.removeProjectileAt(i);
          continue;
        }

        p.position.addScaledVector(toOwner.normalize(), step);
        p.mesh.position.copy(p.position);
        if (p.chainLine) {
          const attr = p.chainLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          attr.setXYZ(0, anchor.x, anchor.y, anchor.z);
          attr.setXYZ(1, p.position.x, p.position.y, p.position.z);
          attr.needsUpdate = true;
        }
        continue;
      }

      const prevX = p.position.x;
      const prevZ = p.position.z;
      const stepDist = p.speed * dt;
      p.position.addScaledVector(p.direction, stepDist);
      p.traveled += stepDist;
      p.mesh.position.copy(p.position);
      if (p.kind === 'tornado_wave') p.mesh.rotation.y += dt * 9;

      if (p.chainLine && ownerHero) {
        const attr = p.chainLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        attr.setXYZ(0, ownerHero.position.x, ownerHero.position.y + 1.45, ownerHero.position.z);
        attr.setXYZ(1, p.position.x, p.position.y, p.position.z);
        attr.needsUpdate = true;
      }

      // Способности-волны (Раскол Земли, Рельсотрон, Мясной Крюк) ломают деревья и баррикады на лету!
      if (p.kind === 'fissure_wave' || p.kind === 'rail_shot' || p.kind === 'meat_hook') {
        this.damageDestructiblesInRadius(
          p.position,
          p.radius + 0.5,
          p.kind === 'fissure_wave' ? 280 : 180,
          p.startPosition,
          p.kind !== 'meat_hook'
        );
      }

      // Попадание обычных выстрелов по разрушаемым преградам
      let hitDestructible = false;
      if (p.kind === 'basic_bolt') {
        for (const prop of this.destructibles) {
          if (!prop.alive) continue;
          if (Math.hypot(prop.position.x - p.position.x, prop.position.z - p.position.z) <= prop.radius + p.radius * 0.6) {
            this.damageSingleDestructible(prop, p.damage, p.startPosition);
            hitDestructible = true;
            break;
          }
        }
      }
      if (hitDestructible) {
        this.removeProjectileAt(i);
        continue;
      }

      if (
        p.kind !== 'tornado_wave' &&
        p.kind !== 'fissure_wave' &&
        segmentHitsObstacle(prevX, prevZ, p.position.x, p.position.z, 3)
      ) {
        if (p.kind === 'meat_hook') {
          p.isReturningHook = true;
          continue;
        }
        this.removeProjectileAt(i);
        continue;
      }

      let consumed = false;

      // Попадания по героям (включая ОТРАЖЕНИЕ СНАРЯДА Идеальным Парированием!)
      for (const h of this.heroes) {
        if (!h.alive || h.team === p.team || p.hitIds.has(h.id)) continue;
        if (h.statuses.some((s) => s.type === 'cyclone_invuln')) continue;

        const dx = h.position.x - p.position.x;
        const dz = h.position.z - p.position.z;
        const horizDist = Math.hypot(dx, dz);
        if (horizDist <= h.radius + p.radius) {
          // ИДЕАЛЬНОЕ ПАРИРОВАНИЕ ОТРАЖАЕТ СНАРЯД ОБРАТНО ВО ВРАГА!
          if (h.parryWindow > 0 && p.kind !== 'meat_hook') {
            h.parryWindow = 0;
            h.parryCooldown = 1.5;
            h.mana = Math.min(h.stats.maxMana, h.mana + 40);
            p.team = h.team;
            p.ownerId = h.id;
            p.direction.negate();
            p.traveled = 0;
            p.damage *= 1.35;
            p.hitIds.clear();
            this.vfx.spawnBurst(p.position, 0xfacc15, 16, 9);
            if (h.isPlayer || ownerHero?.isPlayer) {
              this.sound.playParryClang();
              this.hud.spawnFloatingNumber(h.position, '⚡ ОТРАЖЁН!', '#facc15');
            }
            break;
          }

          p.hitIds.add(h.id);
          const isHeadshot = p.isHeadshotCapable && p.position.y >= h.position.y + 1.85;
          const dmg = isHeadshot ? p.damage * 1.45 : p.damage;

          if (p.stunDuration) this.addStatus(h.statuses, 'stun', p.stunDuration, 1, p.ownerId);
          if (p.knockupDuration) {
            this.addStatus(h.statuses, 'knockup', p.knockupDuration, 1, p.ownerId);
            if (!h.statuses.some((s) => s.type === 'bkb_immune')) {
              h.position.y = 2.8;
            }
          }
          if (p.slowDuration) this.addStatus(h.statuses, 'slow', p.slowDuration, 0.45, p.ownerId);

          this.lastHitImpulse.copy(p.direction).multiplyScalar(14).setY(6.2);
          this.dealDamageToHero(
            h,
            dmg,
            p.damageType,
            ownerHero,
            isHeadshot,
            p.kind === 'basic_bolt'
          );
          this.vfx.spawnBurst(p.position, 0xfacc15, 8, 5);

          // Рикошет выстрела Веры (Талант 10 уровня!)
          if (p.ricochetLeft && p.ricochetLeft > 0) {
            const bounceTarget = this.heroes.find(
              (other) =>
                other.alive &&
                other.team !== p.team &&
                !p.hitIds.has(other.id) &&
                other.position.distanceTo(p.position) <= 9.5
            );
            if (bounceTarget) {
              p.ricochetLeft -= 1;
              p.damage *= 0.68;
              p.traveled = 0;
              p.direction
                .subVectors(bounceTarget.position.clone().setY(1.4), p.position)
                .normalize();
              break;
            }
          }

          if (p.kind === 'meat_hook') {
            p.isReturningHook = true;
            if (!h.statuses.some((s) => s.type === 'bkb_immune')) {
              p.returningHookTargetId = h.id;
            }
            consumed = false;
            break;
          }
          if (!p.piercing) {
            consumed = true;
            break;
          }
        }
      }

      if (consumed) {
        this.removeProjectileAt(i);
        continue;
      }
      if (p.kind === 'meat_hook' && p.isReturningHook) continue;

      // Попадания по крипам (включая ДЕНАЙ своих крипов выстрелом при < 45% ХП!)
      for (const c of this.creeps) {
        if (!c.alive || p.hitIds.has(c.id)) continue;
        const canDenyAlly =
          p.kind === 'basic_bolt' &&
          c.team === p.team &&
          c.creepType !== 'lord_boss' &&
          c.hp / c.maxHp < 0.45;
        if (c.team === p.team && !canDenyAlly) continue;

        if (Math.hypot(c.position.x - p.position.x, c.position.z - p.position.z) <= c.radius + p.radius) {
          p.hitIds.add(c.id);
          this.lastHitImpulse.copy(p.direction).multiplyScalar(11).setY(5.2);
          this.dealDamageToCreep(c, p.damage, p.damageType, ownerHero);
          if (p.kind === 'meat_hook') {
            p.isReturningHook = true;
            break;
          }
          if (!p.piercing) {
            consumed = true;
            break;
          }
        }
      }

      if (consumed) {
        this.removeProjectileAt(i);
        continue;
      }

      if (p.kind === 'basic_bolt' && ownerHero) {
        for (const w of this.wards) {
          if (w.remaining <= 0 || w.team === p.team) continue;
          if (Math.hypot(w.position.x - p.position.x, w.position.z - p.position.z) <= 0.9 + p.radius) {
            this.hitEnemyWard(w, ownerHero);
            consumed = true;
            break;
          }
        }
        if (!consumed) {
          for (const m of this.monsters) {
            if (!m.alive) continue;
            if (Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) <= m.radius + p.radius) {
              this.lastHitImpulse.copy(p.direction).multiplyScalar(11).setY(5.5);
              this.dealDamageToMonster(m, p.damage, 'physical', ownerHero);
              consumed = true;
              break;
            }
          }
        }
        if (!consumed) {
          for (const tw of this.towers) {
            if (!tw.alive || tw.team === p.team) continue;
            if (Math.hypot(tw.position.x - p.position.x, tw.position.z - p.position.z) <= tw.radius + p.radius) {
              this.dealDamageToTower(tw, p.damage, ownerHero);
              consumed = true;
              break;
            }
          }
        }
      }

      if (consumed) {
        this.removeProjectileAt(i);
        continue;
      }

      if (p.traveled >= p.maxDistance) {
        if (p.kind === 'meat_hook') {
          p.isReturningHook = true;
        } else {
          this.removeProjectileAt(i);
        }
      }
    }
  }

  private removeProjectileAt(idx: number): void {
    const p = this.projectiles[idx];
    this.scene.remove(p.mesh);
    if (p.chainLine) this.scene.remove(p.chainLine);
    this.projectiles.splice(idx, 1);
  }

  private updateGroundZones(dt: number): void {
    for (let i = this.groundZones.length - 1; i >= 0; i--) {
      const z = this.groundZones[i];
      const owner = this.heroes.find((h) => h.id === z.ownerId);

      if (z.delayRemaining > 0) {
        z.delayRemaining -= dt;
        const meteor = z.mesh.getObjectByName('fallingMeteor');
        if (meteor) {
          meteor.position.y = Math.max(0.8, z.delayRemaining * 36);
          meteor.rotation.x += dt * 5;
          meteor.rotation.z += dt * 4;
        }
        if (z.delayRemaining <= 0 && owner) {
          if (z.kind === 'sun_strike') {
            this.vfx.spawnSkyPillar(z.position, z.radius * 0.8, 0xfef08a);
            this.physics.spawnCrater(z.position, z.radius * 0.85, 0xfacc15, 16);
            this.physics.applyExplosionForce(z.position, z.radius + 3, 18);
            this.damageDestructiblesInRadius(z.position, z.radius + 1, 550, z.position, true);
            this.sound.playRockShatter(true);
          } else if (z.kind === 'meteor_fire') {
            if (meteor) meteor.visible = false;
            this.vfx.spawnBurst(z.position.clone().setY(1.0), 0xf97316, 26, 11);
            this.physics.spawnFractureBurst(
              z.position.clone().setY(0.9),
              'stone',
              12,
              undefined,
              0x7c2d12,
              0xf97316,
              1.1
            );
            this.physics.spawnCrater(z.position, z.radius * 0.85, 0xf97316, 16);
            this.physics.applyExplosionForce(z.position, z.radius + 3, 16);
            this.damageDestructiblesInRadius(z.position, z.radius + 1, 480, z.position, true);
            this.sound.playRockShatter(true);
            if (this.playerHero && this.playerHero.position.distanceTo(z.position) < 26) {
              this.vfx.addCameraShake(0.35);
            }
          }
          if (z.burstDamage > 0) {
            this.damageEnemiesInRadius(
              owner,
              z.position,
              z.radius,
              z.burstDamage,
              z.damageType,
              z.slowMagnitude > 0 ? 1.5 : 0,
              z.kind === 'meteor_fire' || z.kind === 'sun_strike' ? 13 : 0
            );
          }
        }
        continue;
      }

      z.remaining -= dt;
      z.tickTimer += dt;
      if (z.tickTimer >= 0.35 && z.damagePerSecond > 0 && owner) {
        z.tickTimer = 0;
        this.damageEnemiesInRadius(
          owner,
          z.position,
          z.radius,
          z.damagePerSecond * 0.35,
          z.damageType,
          z.slowMagnitude > 0 ? 0.6 : 0
        );
      }

      if (z.remaining <= 0) {
        this.scene.remove(z.mesh);
        this.groundZones.splice(i, 1);
      }
    }
  }

  private renderFrame(): void {
    this.renderer.clear();
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (
      this.state === 'playing' &&
      this.playerHero?.alive &&
      !this.playerHero.statuses.some((s) => s.type === 'cyclone_invuln')
    ) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.viewModel.camera);
    }
  }
}
