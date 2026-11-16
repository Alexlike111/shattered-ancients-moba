import * as THREE from 'three';
import { FOUNTAIN_POS, LANE_WAYPOINTS, resolveArenaCollisions } from '../world/ArenaData';
import { SHOP_ITEMS_BY_ID } from '../data/items';
import { getAvailableTalentChoices } from '../data/talents';
import { canUpgradeAbility } from './StatsCalculator';
import type {
  AbilitySlot,
  CreepRuntime,
  HeroRuntime,
  JungleMonsterRuntime,
  OutpostRuntime,
  TacticalPing,
  TowerRuntime,
} from '../types/game';

export interface AIWorldHooks {
  heroes: HeroRuntime[];
  creeps: CreepRuntime[];
  towers: TowerRuntime[];
  monsters: JungleMonsterRuntime[];
  outposts: OutpostRuntime[];
  activePings: TacticalPing[];
  isHeroHiddenFromTeam: (hero: HeroRuntime, viewerTeam: 'radiant' | 'dire') => boolean;
  performBasicAttack: (hero: HeroRuntime) => void;
  castAbility: (hero: HeroRuntime, slot: AbilitySlot) => void;
  castBattleSpell: (hero: HeroRuntime) => void;
  upgradeAbility: (hero: HeroRuntime, slot: AbilitySlot) => void;
  chooseTalent: (hero: HeroRuntime, branch: 'left' | 'right') => void;
  useActiveItem: (hero: HeroRuntime, activeSlotIdx: number) => void;
  placeWard: (hero: HeroRuntime) => void;
  triggerParry: (hero: HeroRuntime) => void;
  buyItem: (hero: HeroRuntime, itemId: string) => boolean;
}

export class AIController {
  public updateBot(bot: HeroRuntime, dt: number, world: AIWorldHooks): void {
    if (!bot.alive) return;

    // 1. Авто-выбор ветви Древа Талантов на 5, 10 и 15 уровнях
    const pendingTalent = getAvailableTalentChoices(bot.heroDef.id, bot.level, bot.chosenTalents);
    if (pendingTalent) {
      world.chooseTalent(bot, Math.random() < 0.6 ? 'left' : 'right');
    }

    // 2. Авто-прокачка способностей
    if (bot.skillPoints > 0) {
      const priority: AbilitySlot[] = ['R', 'Q', 'W', 'E'];
      for (const slot of priority) {
        if (canUpgradeAbility(slot, bot.abilityRanks[slot], bot.level, bot.skillPoints)) {
          world.upgradeAbility(bot, slot);
          break;
        }
      }
    }

    // 3. Авто-покупка предметов (включая активные предметы на поздней стадии)
    if (bot.items.length < 6) {
      const nextItemId = bot.heroDef.recommendedBuild.find(
        (id) => !bot.items.some((owned) => owned.id === id)
      );
      if (nextItemId) {
        const item = SHOP_ITEMS_BY_ID.get(nextItemId);
        if (item && bot.gold >= item.cost) {
          world.buyItem(bot, nextItemId);
        }
      }
    }

    // Установка бесплатного Тотема Обзора (Ward) возле реки
    if (bot.wardCharges > 0 && Math.abs(bot.position.x + bot.position.z) < 18 && Math.random() < 0.015) {
      world.placeWard(bot);
    }

    const isHardCC = bot.statuses.some(
      (s) => s.type === 'stun' || s.type === 'knockup' || s.type === 'cyclone_invuln'
    );
    if (isHardCC) return;

    const hpRatio = bot.hp / Math.max(1, bot.stats.maxHp);
    const ownFountain = bot.team === 'radiant' ? FOUNTAIN_POS.radiant : FOUNTAIN_POS.dire;

    // 4. Контроль агрессии башен
    let underDangerousTower: TowerRuntime | null = null;
    for (const tw of world.towers) {
      if (!tw.alive || tw.team === bot.team) continue;
      const dist = bot.position.distanceTo(tw.position);
      if (dist < tw.attackRange + 1.2) {
        const allyCreepsUnderTower = world.creeps.some(
          (c) =>
            c.alive && c.team === bot.team && c.position.distanceTo(tw.position) < tw.attackRange - 1
        );
        if (!allyCreepsUnderTower || tw.currentTargetId === bot.id) {
          underDangerousTower = tw;
          break;
        }
      }
    }

    if (hpRatio < 0.35 && bot.battleSpellCooldown <= 0 && bot.battleSpell === 'heal') {
      world.castBattleSpell(bot);
    }

    if (hpRatio < 0.25 || (underDangerousTower && hpRatio < 0.65)) {
      this.steerTowards(bot, ownFountain, dt, 1.0);
      if (hpRatio < 0.22 && bot.battleSpellCooldown <= 0 && bot.battleSpell === 'flicker') {
        bot.yaw = Math.atan2(-(ownFountain.x - bot.position.x), -(ownFountain.z - bot.position.z));
        world.castBattleSpell(bot);
      }
      return;
    }

    if (bot.position.distanceTo(ownFountain) < 9.5 && hpRatio < 0.92) {
      return;
    }

    // 5. Реакция на тактические пинги игрока
    if (bot.team === 'radiant' && world.activePings.length > 0) {
      const latestPing = world.activePings[world.activePings.length - 1];
      if (latestPing.kind === 'retreat') {
        this.steerTowards(bot, ownFountain, dt, 1.0);
        return;
      }
      if (
        (latestPing.kind === 'gather' || latestPing.kind === 'attack') &&
        bot.position.distanceTo(latestPing.position) > 10 &&
        bot.position.distanceTo(latestPing.position) < 68
      ) {
        this.steerTowards(bot, latestPing.position, dt, 1.0);
      }
    }

    // 6. Поиск видимого вражеского героя (с учётом невидимости и кустов засады!)
    let bestEnemyHero: HeroRuntime | null = null;
    let bestHeroDist = 26;

    for (const h of world.heroes) {
      if (!h.alive || h.team === bot.team) continue;
      if (world.isHeroHiddenFromTeam(h, bot.team)) continue;

      const d = bot.position.distanceTo(h.position);
      const targetUnderEnemyTower = world.towers.some(
        (t) => t.alive && t.team === h.team && h.position.distanceTo(t.position) < t.attackRange - 1.5
      );
      if (targetUnderEnemyTower && h.hp / h.stats.maxHp > 0.28) continue;

      if (d < bestHeroDist) {
        bestHeroDist = d;
        bestEnemyHero = h;
      }
    }

    if (bestEnemyHero) {
      this.engageHeroTarget(bot, bestEnemyHero, bestHeroDist, dt, world);
      return;
    }

    // 7. Захват свободного или вражеского Аванпоста в джунглях поблизости!
    for (const op of world.outposts) {
      if (op.owner !== bot.team && bot.position.distanceTo(op.position) < 20) {
        this.steerTowards(bot, op.position, dt, 0.95);
        return;
      }
    }

    // 8. Добивание вражеских крипов (и Денай своих раненых крипов!)
    let bestCreepTarget: CreepRuntime | null = null;
    let bestCreepDist = 22;
    for (const c of world.creeps) {
      if (!c.alive) continue;
      const isEnemyCreep = c.team !== bot.team;
      const isDeniableAlly = c.team === bot.team && c.creepType !== 'lord_boss' && c.hp / c.maxHp < 0.35;
      if (!isEnemyCreep && !isDeniableAlly) continue;

      const d = bot.position.distanceTo(c.position);
      if (d < bestCreepDist) {
        bestCreepDist = d;
        bestCreepTarget = c;
      }
    }

    if (bestCreepTarget) {
      this.aimAtPoint(bot, bestCreepTarget.position);
      const desiredRange = bot.heroDef.isRanged
        ? bot.stats.attackRange * 0.78
        : bot.stats.attackRange * 0.82;
      if (bestCreepDist > desiredRange) {
        this.steerTowards(bot, bestCreepTarget.position, dt, 1.0);
      }
      if (bestCreepDist <= bot.stats.attackRange + bestCreepTarget.radius) {
        world.performBasicAttack(bot);
      }
      return;
    }

    // 9. Штурм башен
    for (const tw of world.towers) {
      if (!tw.alive || tw.team === bot.team) continue;
      const d = bot.position.distanceTo(tw.position);
      if (d < 24) {
        const hasCreepCover = world.creeps.some(
          (c) =>
            c.alive && c.team === bot.team && c.position.distanceTo(tw.position) < tw.attackRange - 0.5
        );
        if (hasCreepCover || tw.tier === 4) {
          this.aimAtPoint(bot, tw.position);
          const stopDist = bot.heroDef.isRanged
            ? Math.min(bot.stats.attackRange - 1, 14)
            : tw.radius + 2.4;
          if (d > stopDist) {
            this.steerTowards(bot, tw.position, dt, 1.0);
          } else {
            world.performBasicAttack(bot);
          }
          return;
        }
      }
    }

    // 10. Марш по линии
    const laneKey = bot.assignedLane === 'jungle' ? 'mid' : bot.assignedLane;
    const waypoints = LANE_WAYPOINTS[laneKey];
    const orderedPts = bot.team === 'radiant' ? waypoints : [...waypoints].reverse();

    let closestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < orderedPts.length; i++) {
      const d = bot.position.distanceTo(orderedPts[i]);
      if (d < minD) {
        minD = d;
        closestIdx = i;
      }
    }
    const nextIdx = Math.min(orderedPts.length - 1, closestIdx + (minD < 8 ? 1 : 0));
    this.steerTowards(bot, orderedPts[nextIdx], dt, 0.92);
  }

  private engageHeroTarget(
    bot: HeroRuntime,
    target: HeroRuntime,
    dist: number,
    dt: number,
    world: AIWorldHooks
  ): void {
    const leadPos = target.position.clone().addScaledVector(target.velocity, 0.22);
    this.aimAtPoint(bot, leadPos);

    // Реактивное парирование ИИ в ближнем бою!
    if (dist < 5.5 && bot.parryCooldown <= 0 && Math.random() < 0.04) {
      world.triggerParry(bot);
    }

    // Использование активных артефактов ботом
    world.useActiveItem(bot, 0);

    const idealDist = bot.heroDef.isRanged ? bot.stats.attackRange * 0.72 : 2.6;
    if (dist > idealDist) {
      this.steerTowards(bot, target.position, dt, 1.0);
    } else if (bot.heroDef.isRanged && dist < 6.5) {
      const away = bot.position.clone().sub(target.position).setY(0).normalize();
      const kiteGoal = bot.position.clone().addScaledVector(away, 6);
      this.steerTowards(bot, kiteGoal, dt, 0.85, false);
    }

    const isSilenced = bot.statuses.some((s) => s.type === 'silence');
    if (!isSilenced) {
      const targetHpRatio = target.hp / Math.max(1, target.stats.maxHp);
      const cullThreshold = bot.chosenTalents[10] === 'berserker_10_high_cull' ? 0.42 : 0.34;

      if (bot.abilityRanks.R > 0 && bot.abilityCooldowns.R <= 0) {
        const rRange = bot.heroDef.abilities.R.range;
        if (
          (bot.heroDef.id === 'berserker' && targetHpRatio <= cullThreshold && dist <= rRange) ||
          (bot.heroDef.id !== 'berserker' && (targetHpRatio < 0.65 || dist < 8) && dist <= rRange)
        ) {
          world.castAbility(bot, 'R');
        }
      }

      for (const slot of ['Q', 'W', 'E'] as const) {
        if (bot.abilityRanks[slot] <= 0 || bot.abilityCooldowns[slot] > 0) continue;
        const ab = bot.heroDef.abilities[slot];
        const effectiveRange = ab.range > 0 ? ab.range : 5.2;
        if (dist <= effectiveRange) {
          world.castAbility(bot, slot);
          break;
        }
      }
    }

    if (dist <= bot.stats.attackRange + target.radius + 0.4) {
      world.performBasicAttack(bot);
    }
  }

  private aimAtPoint(bot: HeroRuntime, targetPos: THREE.Vector3): void {
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    bot.yaw = Math.atan2(-dx, -dz);
    const horiz = Math.hypot(dx, dz);
    const dy = targetPos.y - bot.position.y;
    bot.pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.max(0.5, horiz)), -0.7, 0.7);
  }

  private steerTowards(
    bot: HeroRuntime,
    goal: THREE.Vector3,
    dt: number,
    speedFactor: number,
    faceMovement = true
  ): void {
    const dir = new THREE.Vector3(goal.x - bot.position.x, 0, goal.z - bot.position.z);
    const len = dir.length();
    if (len < 0.25) return;
    dir.divideScalar(len);

    const step = bot.stats.moveSpeed * speedFactor * dt;
    const candidate = bot.position.clone().addScaledVector(dir, step);
    const beforeProbe = candidate.clone();
    resolveArenaCollisions(candidate, bot.radius);

    if (candidate.distanceToSquared(beforeProbe) > 1e-4) {
      const tangent = new THREE.Vector3(-dir.z, 0, dir.x);
      candidate.copy(bot.position).addScaledVector(tangent, step);
      resolveArenaCollisions(candidate, bot.radius);
    }

    bot.velocity.set(
      (candidate.x - bot.position.x) / Math.max(dt, 0.001),
      0,
      (candidate.z - bot.position.z) / Math.max(dt, 0.001)
    );
    bot.position.x = candidate.x;
    bot.position.z = candidate.z;

    if (faceMovement) {
      bot.yaw = Math.atan2(-dir.x, -dir.z);
    }
  }
}
