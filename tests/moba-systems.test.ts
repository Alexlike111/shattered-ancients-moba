import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HERO_DEFINITIONS, HERO_LIST } from '../src/data/heroes';
import { SHOP_ITEMS, SHOP_ITEMS_BY_ID } from '../src/data/items';
import { HERO_TALENT_TREES, getAvailableTalentChoices } from '../src/data/talents';
import { DestructionPhysicsSystem } from '../src/physics/DestructionPhysicsSystem';
import {
  canUpgradeAbility,
  computeHeroStats,
  isBackstabAngle,
  mitigateDamage,
  xpRequiredForNextLevel,
} from '../src/systems/StatsCalculator';
import {
  AMBUSH_BRUSHES,
  ARENA_OBSTACLES,
  DESTRUCTIBLE_PLACEMENTS,
  LANE_WAYPOINTS,
  OUTPOST_SPOTS,
  TOWER_PLACEMENTS,
  isPositionInBrush,
  resolveArenaCollisions,
  segmentHitsObstacle,
  setDynamicDestructibleColliders,
} from '../src/world/ArenaData';

describe('Ростер 6 героев, таланты и активные артефакты', () => {
  it('содержит ровно 6 уникальных архетипов с валидными сборками и древами талантов', () => {
    expect(HERO_LIST).toHaveLength(6);
    for (const hero of HERO_LIST) {
      expect(hero.abilities.Q.maxRank).toBe(4);
      expect(hero.abilities.W.maxRank).toBe(4);
      expect(hero.abilities.E.maxRank).toBe(4);
      expect(hero.abilities.R.maxRank).toBe(3);
      expect(hero.recommendedBuild).toHaveLength(6);
      for (const itemId of hero.recommendedBuild) {
        expect(SHOP_ITEMS_BY_ID.has(itemId)).toBe(true);
      }

      const tree = HERO_TALENT_TREES[hero.id];
      expect(tree).toHaveLength(6);
      expect(getAvailableTalentChoices(hero.id, 4, {})).toBeNull();
      const lvl5Choice = getAvailableTalentChoices(hero.id, 5, {});
      expect(lvl5Choice?.tier).toBe(5);
    }
  });

  it('содержит активные предметы BKB, Блинк, Еул и Багровый Дагон', () => {
    const activeItems = SHOP_ITEMS.filter((i) => Boolean(i.activeEffect));
    expect(activeItems.length).toBeGreaterThanOrEqual(4);
    expect(SHOP_ITEMS_BY_ID.get('black_king_bar')?.activeEffect).toBe('bkb_avatar');
    expect(SHOP_ITEMS_BY_ID.get('euls_cyclone_scepter')?.activeEffect).toBe('euls_cyclone');
    expect(SHOP_ITEMS_BY_ID.get('crimson_dagon')?.activeEffect).toBe('dagon_beam');
    expect(SHOP_ITEMS_BY_ID.get('blink_dagger_relic')?.activeEffect).toBe('blink_dagger');
  });
});

describe('Математика боевых систем, талантов и цикла День/Ночь', () => {
  it('корректно масштабирует характеристики героя и не складывает скорость от двух сапогов', () => {
    const butcher = HERO_DEFINITIONS.butcher;
    const boots1 = SHOP_ITEMS_BY_ID.get('swift_boots')!;
    const boots2 = SHOP_ITEMS_BY_ID.get('warrior_boots')!;

    const base = computeHeroStats(butcher, 1, [], [], 0, 1);
    const oneBoot = computeHeroStats(butcher, 1, [boots1], [], 0, 1);
    const twoBoots = computeHeroStats(butcher, 1, [boots1, boots2], [], 0, 1);

    expect(oneBoot.moveSpeed).toBeGreaterThan(base.moveSpeed);
    expect(twoBoots.moveSpeed).toBeCloseTo(oneBoot.moveSpeed, 4);
    expect(twoBoots.armor).toBeGreaterThan(oneBoot.armor);
  });

  it('применяет таланты 5/15 уровня и ночной бонус скорости охотников', () => {
    const phantom = HERO_DEFINITIONS.phantom;
    const dayStats = computeHeroStats(phantom, 15, [], [], 0, 1.0, {}, false);
    const nightTalentStats = computeHeroStats(
      phantom,
      15,
      [],
      [],
      0,
      1.0,
      { 5: 'phantom_5_spd', 15: 'phantom_15_lethal_crit' },
      true
    );
    expect(nightTalentStats.moveSpeed).toBeGreaterThan(dayStats.moveSpeed + 1.2);
    expect(nightTalentStats.critChance).toBeGreaterThan(dayStats.critChance + 0.3);
  });

  it('усиливает скорость атаки и вампиризм Берсерка при падении здоровья', () => {
    const berserker = HERO_DEFINITIONS.berserker;
    const fullHp = computeHeroStats(berserker, 8, [], [], 0, 1.0);
    const lowHp = computeHeroStats(berserker, 8, [], [], 0, 0.15);

    expect(lowHp.attackSpeed).toBeGreaterThan(fullHp.attackSpeed * 1.5);
    expect(lowHp.lifesteal).toBeGreaterThan(0.15);
  });

  it('рассчитывает снижение физического, магического и чистого урона', () => {
    expect(mitigateDamage(200, 'physical', 100, 0)).toBeCloseTo(100, 2);
    expect(mitigateDamage(200, 'true', 250, 250)).toBe(200);
  });

  it('соблюдает уровни прокачки ультимейта R (4, 8, 12) и удар в спину', () => {
    expect(canUpgradeAbility('R', 0, 3, 1)).toBe(false);
    expect(canUpgradeAbility('R', 0, 4, 1)).toBe(true);
    expect(canUpgradeAbility('R', 1, 7, 1)).toBe(false);
    expect(canUpgradeAbility('R', 1, 8, 1)).toBe(true);
    expect(xpRequiredForNextLevel(15)).toBe(Infinity);
    expect(isBackstabAngle(0, 3, 0, 0, 0)).toBe(true);
    expect(isBackstabAngle(0, -3, 0, 0, 0)).toBe(false);
  });
});

describe('Топология 3D-арены, кусты, разрушаемость и 3D Ragdoll физика', () => {
  it('содержит симметричные башни, кусты засады, аванпосты и разрушаемые преграды', () => {
    const radiantTowers = TOWER_PLACEMENTS.filter((t) => t.team === 'radiant');
    const direTowers = TOWER_PLACEMENTS.filter((t) => t.team === 'dire');
    expect(radiantTowers).toHaveLength(8);
    expect(direTowers).toHaveLength(8);
    expect(AMBUSH_BRUSHES.length).toBeGreaterThanOrEqual(8);
    expect(OUTPOST_SPOTS).toHaveLength(2);
    expect(DESTRUCTIBLE_PLACEMENTS.length).toBeGreaterThanOrEqual(24);
    expect(LANE_WAYPOINTS.mid.length).toBeGreaterThanOrEqual(5);
    expect(isPositionInBrush(AMBUSH_BRUSHES[0].position)).toBe(true);
  });

  it('блокирует проход живыми разрушаемыми преградами и открывает его после сноса', () => {
    const sampleBox = ARENA_OBSTACLES[0];
    const cx = (sampleBox.minX + sampleBox.maxX) * 0.5;
    const pos = new THREE.Vector3(cx, 0, sampleBox.maxZ - 0.1);
    resolveArenaCollisions(pos, 1.0);
    expect(pos.z).toBeGreaterThanOrEqual(sampleBox.maxZ + 0.99);

    setDynamicDestructibleColliders([{ x: 0, z: 0, radius: 2.0 }]);
    expect(segmentHitsObstacle(-4, 0, 4, 0)).toBe(true);
    setDynamicDestructibleColliders([]);
    expect(segmentHitsObstacle(-4, 0, 4, 0)).toBe(false);
  });

  it('симулирует шарнирный 3D Ragdoll, осколки башен и падение деревьев в рамках мобильного бюджета', () => {
    const scene = new THREE.Scene();
    const physics = new DestructionPhysicsSystem(scene);
    physics.setQualityBudget('high', true);

    physics.spawnHumanoidRagdoll({
      origin: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      impulse: new THREE.Vector3(10, 6, -8),
      armorHex: 0x1e3a4c,
      accentHex: 0x2dd4bf,
    });
    physics.spawnStructureCollapse(new THREE.Vector3(10, 0, 10), false, 'dire');
    physics.spawnFallingTree(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(-8, 0, -5));

    const before = physics.getActiveCounts();
    expect(before.ragdolls).toBe(1);
    expect(before.debris).toBeGreaterThan(10);
    expect(before.debris).toBeLessThanOrEqual(90);
    expect(before.craters).toBeGreaterThanOrEqual(1);

    for (let step = 0; step < 30; step++) {
      physics.update(1 / 60);
    }

    expect(physics.getActiveCounts().ragdolls).toBe(1);
    physics.clearAll();
    expect(physics.getActiveCounts().ragdolls).toBe(0);
    expect(physics.getActiveCounts().debris).toBe(0);
  });
});
