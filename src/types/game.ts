import type * as THREE from 'three';

export type TeamId = 'radiant' | 'dire' | 'neutral';
export type LaneId = 'top' | 'mid' | 'bot' | 'jungle';
export type HeroArchetypeId =
  | 'butcher'
  | 'invoker'
  | 'phantom'
  | 'marksman'
  | 'berserker'
  | 'warden';

export type AbilitySlot = 'Q' | 'W' | 'E' | 'R';
export type BattleSpellId = 'flicker' | 'heal' | 'retribution' | 'purify';
export type GraphicsQuality = 'ultra' | 'high' | 'performance';
export type MatchMode = '5v5' | 'sandbox';
export type TalentTier = 5 | 10 | 15;

export type TalentMutationId =
  | 'butcher_5_hp'
  | 'butcher_5_hook_spd'
  | 'butcher_10_triple_hook'
  | 'butcher_10_rot_vamp'
  | 'butcher_15_colossus'
  | 'butcher_15_cdr'
  | 'invoker_5_mana'
  | 'invoker_5_spell'
  | 'invoker_10_twin_meteor'
  | 'invoker_10_wide_tornado'
  | 'invoker_15_cataclysm'
  | 'invoker_15_cdr'
  | 'phantom_5_spd'
  | 'phantom_5_atk'
  | 'phantom_10_fan_knives'
  | 'phantom_10_reset_stealth'
  | 'phantom_15_lethal_crit'
  | 'phantom_15_evasion_shield'
  | 'marksman_5_range'
  | 'marksman_5_aspd'
  | 'marksman_10_ricochet'
  | 'marksman_10_mega_shrapnel'
  | 'marksman_15_caliber'
  | 'marksman_15_rapid_ult'
  | 'berserker_5_lifesteal'
  | 'berserker_5_armor'
  | 'berserker_10_vortex_spin'
  | 'berserker_10_high_cull'
  | 'berserker_15_warlord'
  | 'berserker_15_unstoppable'
  | 'warden_5_armor'
  | 'warden_5_hp'
  | 'warden_10_tri_fissure'
  | 'warden_10_fortress_shield'
  | 'warden_15_echo_master'
  | 'warden_15_titan_body';

export interface TalentOption {
  id: TalentMutationId;
  tier: TalentTier;
  branch: 'left' | 'right';
  title: string;
  description: string;
}

export interface Vec3Like {
  x: number;
  y: number;
}

export interface AbilityDefinition {
  slot: AbilitySlot;
  name: string;
  description: string;
  maxRank: number;
  manaCost: number[];
  cooldown: number[];
  baseDamage: number[];
  damageRatio: number;
  damageType: 'physical' | 'magical' | 'true';
  range: number;
  radius: number;
  castType: 'skillshot' | 'aoe' | 'self' | 'dash' | 'cone' | 'snipe';
}

export interface HeroDefinition {
  id: HeroArchetypeId;
  name: string;
  title: string;
  role: string;
  weaponLabel: string;
  badgeText: string;
  accentColor: string;
  isRanged: boolean;
  projectileColor: number;
  passiveName: string;
  passiveDescription: string;
  baseStats: {
    maxHp: number;
    hpRegen: number;
    maxMana: number;
    manaRegen: number;
    attackDamage: number;
    spellPower: number;
    armor: number;
    magicResist: number;
    attackSpeed: number;
    attackRange: number;
    moveSpeed: number;
  };
  growthPerLevel: {
    hp: number;
    mana: number;
    attackDamage: number;
    armor: number;
    attackSpeed: number;
  };
  abilities: Record<AbilitySlot, AbilityDefinition>;
  recommendedBuild: string[];
}

export type ActiveItemKind = 'bkb_avatar' | 'euls_cyclone' | 'dagon_beam' | 'blink_dagger';

export interface ShopItem {
  id: string;
  name: string;
  shortName: string;
  category: 'boots' | 'attack' | 'magic' | 'defense' | 'active';
  cost: number;
  description: string;
  bonuses: {
    maxHp?: number;
    maxMana?: number;
    hpRegen?: number;
    manaRegen?: number;
    attackDamage?: number;
    spellPower?: number;
    armor?: number;
    magicResist?: number;
    attackSpeed?: number;
    moveSpeed?: number;
    critChance?: number;
    lifesteal?: number;
    cooldownReduction?: number;
  };
  uniquePassive?:
    | 'despair_exec'
    | 'titan_slayer'
    | 'lightning_burst'
    | 'frost_slow'
    | 'thorn_reflect'
    | 'immortality_rebirth';
  activeEffect?: ActiveItemKind;
  activeCooldown?: number;
}

export type StatusEffectType =
  | 'stun'
  | 'knockup'
  | 'slow'
  | 'silence'
  | 'burn'
  | 'stealth'
  | 'shield'
  | 'haste'
  | 'berserk_fire'
  | 'rot_aura'
  | 'blade_spin'
  | 'red_buff'
  | 'blue_buff'
  | 'titan_blessing'
  | 'bkb_immune'
  | 'cyclone_invuln';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  remaining: number;
  magnitude: number;
  sourceId?: string;
}

export interface ComputedStats {
  maxHp: number;
  hpRegen: number;
  maxMana: number;
  manaRegen: number;
  attackDamage: number;
  spellPower: number;
  armor: number;
  magicResist: number;
  attackSpeed: number;
  attackRange: number;
  moveSpeed: number;
  critChance: number;
  critMultiplier: number;
  lifesteal: number;
  cooldownReduction: number;
}

export interface HeroRuntime {
  id: string;
  entityKind: 'hero';
  heroDef: HeroDefinition;
  team: 'radiant' | 'dire';
  isPlayer: boolean;
  assignedLane: LaneId;
  displayName: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  radius: number;
  level: number;
  xp: number;
  skillPoints: number;
  gold: number;
  hp: number;
  mana: number;
  shield: number;
  alive: boolean;
  respawnTimer: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  denies: number;
  multiKillCount: number;
  multiKillWindow: number;
  fleshHeapStacks: number;
  passiveHitCounter: number;
  elementalResonance: number;
  abilityRanks: Record<AbilitySlot, number>;
  abilityCooldowns: Record<AbilitySlot, number>;
  battleSpell: BattleSpellId;
  battleSpellCooldown: number;
  attackCooldown: number;
  recallTimer: number;
  isRecalling: boolean;
  items: ShopItem[];
  itemCooldowns: Map<string, number>;
  immortalityCooldown: number;
  chosenTalents: Partial<Record<TalentTier, TalentMutationId>>;
  parryWindow: number;
  parryCooldown: number;
  slideTimer: number;
  slideCooldown: number;
  slideDirection: THREE.Vector3;
  inBrush: boolean;
  brushRevealTimer: number;
  wardCharges: number;
  wardRechargeTimer: number;
  statuses: ActiveStatusEffect[];
  recentDamagers: Map<string, number>;
  impulseVelocity: THREE.Vector3;
  mesh: THREE.Group;
  animTime: number;
  swingAnim: number;
  stats: ComputedStats;
}

export interface CreepRuntime {
  id: string;
  entityKind: 'creep';
  creepType: 'melee' | 'ranged' | 'siege' | 'lord_boss';
  team: 'radiant' | 'dire';
  lane: 'top' | 'mid' | 'bot';
  waypointIndex: number;
  position: THREE.Vector3;
  impulseVelocity: THREE.Vector3;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  attackDamage: number;
  armor: number;
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;
  alive: boolean;
  isEmpowered: boolean;
  statuses: ActiveStatusEffect[];
  mesh: THREE.Group;
  animTime: number;
}

export interface TowerRuntime {
  id: string;
  entityKind: 'tower' | 'ancient';
  team: 'radiant' | 'dire';
  lane: 'top' | 'mid' | 'bot' | 'base';
  tier: 1 | 2 | 3 | 4;
  name: string;
  position: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  armor: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  disabledTimer: number;
  damageStage: 0 | 1 | 2;
  currentTargetId: string | null;
  consecutiveHits: number;
  alive: boolean;
  mesh: THREE.Group;
  crystalMesh?: THREE.Mesh;
  laserLine?: THREE.Line;
}

export type DestructiblePropKind = 'tree' | 'rock_barricade';

export interface DestructiblePropRuntime {
  id: string;
  kind: DestructiblePropKind;
  name: string;
  position: THREE.Vector3;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer: number;
  respawnDuration: number;
  mesh: THREE.Group;
  intactGroup: THREE.Group;
  ruinGroup: THREE.Group;
}

export interface JungleMonsterRuntime {
  id: string;
  entityKind: 'monster';
  campType: 'red_buff' | 'blue_buff' | 'wolf_camp' | 'titan_boss' | 'elemental_turtle';
  name: string;
  homePosition: THREE.Vector3;
  position: THREE.Vector3;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  attackDamage: number;
  armor: number;
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;
  alive: boolean;
  respawnTimer: number;
  respawnDuration: number;
  statuses: ActiveStatusEffect[];
  mesh: THREE.Group;
  animTime: number;
}

export interface RiverRuneRuntime {
  id: string;
  position: THREE.Vector3;
  runeType: 'haste' | 'damage' | 'regen';
  active: boolean;
  respawnTimer: number;
  mesh: THREE.Group;
}

export interface AmbushBrushZone {
  id: string;
  position: THREE.Vector3;
  radius: number;
}

export interface VisionWardRuntime {
  id: string;
  team: 'radiant' | 'dire';
  ownerId: string;
  position: THREE.Vector3;
  visionRadius: number;
  hitsRemaining: number;
  remaining: number;
  mesh: THREE.Group;
}

export interface OutpostRuntime {
  id: string;
  name: string;
  position: THREE.Vector3;
  captureRadius: number;
  owner: TeamId;
  captureProgress: number; // -1.0 (dire) ... 0 ... +1.0 (radiant)
  rewardTimer: number;
  mesh: THREE.Group;
  beaconMesh: THREE.Mesh;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface ActiveProjectile {
  id: string;
  kind:
    | 'basic_bolt'
    | 'meat_hook'
    | 'ice_spike'
    | 'tornado_wave'
    | 'shuriken'
    | 'rail_shot'
    | 'fissure_wave'
    | 'tower_orb';
  ownerId: string;
  team: TeamId;
  position: THREE.Vector3;
  startPosition: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  maxDistance: number;
  traveled: number;
  radius: number;
  damage: number;
  damageType: 'physical' | 'magical' | 'true';
  piercing: boolean;
  ricochetLeft?: number;
  hitIds: Set<string>;
  returningHookTargetId?: string | null;
  isReturningHook?: boolean;
  stunDuration?: number;
  knockupDuration?: number;
  slowDuration?: number;
  armorShred?: boolean;
  isHeadshotCapable?: boolean;
  mesh: THREE.Object3D;
  chainLine?: THREE.Line;
}

export interface GroundZoneEffect {
  id: string;
  kind: 'meteor_fire' | 'shrapnel_rain' | 'sun_strike' | 'echo_ring';
  ownerId: string;
  team: TeamId;
  position: THREE.Vector3;
  direction?: THREE.Vector3;
  radius: number;
  remaining: number;
  delayRemaining: number;
  tickTimer: number;
  damagePerSecond: number;
  burstDamage: number;
  damageType: 'physical' | 'magical' | 'true';
  slowMagnitude: number;
  mesh: THREE.Group;
}

export interface TacticalPing {
  id: string;
  kind: 'attack' | 'retreat' | 'gather';
  label: string;
  position: THREE.Vector3;
  remaining: number;
}
