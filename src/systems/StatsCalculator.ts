import type {
  AbilitySlot,
  ActiveStatusEffect,
  ComputedStats,
  HeroDefinition,
  ShopItem,
  TalentMutationId,
  TalentTier,
} from '../types/game';

export const MAX_HERO_LEVEL = 15;

export function xpRequiredForNextLevel(level: number): number {
  if (level >= MAX_HERO_LEVEL) return Infinity;
  return 180 + (level - 1) * 95;
}

export function computeHeroStats(
  heroDef: HeroDefinition,
  level: number,
  items: ShopItem[],
  statuses: ActiveStatusEffect[],
  fleshHeapStacks: number,
  currentHpRatio: number,
  chosenTalents: Partial<Record<TalentTier, TalentMutationId>> = {},
  isNightTime = false
): ComputedStats {
  const lvlBonus = Math.max(0, level - 1);

  let maxHp = heroDef.baseStats.maxHp + heroDef.growthPerLevel.hp * lvlBonus + fleshHeapStacks * 45;
  let hpRegen = heroDef.baseStats.hpRegen + lvlBonus * 0.65;
  let maxMana = heroDef.baseStats.maxMana + heroDef.growthPerLevel.mana * lvlBonus;
  let manaRegen = heroDef.baseStats.manaRegen + lvlBonus * 0.4;
  let attackDamage = heroDef.baseStats.attackDamage + heroDef.growthPerLevel.attackDamage * lvlBonus;
  let spellPower = heroDef.baseStats.spellPower + lvlBonus * 3.5;
  let armor = heroDef.baseStats.armor + heroDef.growthPerLevel.armor * lvlBonus;
  let magicResist = heroDef.baseStats.magicResist + lvlBonus * 1.2 + fleshHeapStacks * 2;
  let attackSpeed = heroDef.baseStats.attackSpeed + heroDef.growthPerLevel.attackSpeed * lvlBonus;
  let attackRange = heroDef.baseStats.attackRange;
  let moveSpeed = heroDef.baseStats.moveSpeed;
  let critChance = 0.05;
  const critMultiplier = 1.85;
  let lifesteal = 0;
  let cooldownReduction = 0;

  let bootsCount = 0;
  for (const item of items) {
    const b = item.bonuses;
    if (b.maxHp) maxHp += b.maxHp;
    if (b.maxMana) maxMana += b.maxMana;
    if (b.hpRegen) hpRegen += b.hpRegen;
    if (b.manaRegen) manaRegen += b.manaRegen;
    if (b.attackDamage) attackDamage += b.attackDamage;
    if (b.spellPower) spellPower += b.spellPower;
    if (b.armor) armor += b.armor;
    if (b.magicResist) magicResist += b.magicResist;
    if (b.attackSpeed) attackSpeed += b.attackSpeed;
    if (b.moveSpeed) {
      if (item.category === 'boots') {
        if (bootsCount === 0) {
          moveSpeed += b.moveSpeed;
          bootsCount++;
        }
      } else {
        moveSpeed += b.moveSpeed;
      }
    }
    if (b.critChance) critChance += b.critChance;
    if (b.lifesteal) lifesteal += b.lifesteal;
    if (b.cooldownReduction) cooldownReduction += b.cooldownReduction;
  }

  // Применение бонусов Древа Талантов 5 / 10 / 15 уровня!
  const activeTalents = Object.values(chosenTalents);
  for (const tid of activeTalents) {
    switch (tid) {
      case 'butcher_5_hp':
        maxHp += 320;
        hpRegen += 8;
        break;
      case 'butcher_15_colossus':
        maxHp += 900;
        armor += 35;
        break;
      case 'butcher_15_cdr':
        cooldownReduction += 0.25;
        break;
      case 'invoker_5_mana':
        maxMana += 280;
        manaRegen += 10;
        break;
      case 'invoker_5_spell':
        spellPower += 45;
        break;
      case 'invoker_15_cdr':
        spellPower += 110;
        cooldownReduction += 0.2;
        break;
      case 'phantom_5_spd':
        moveSpeed += 1.2;
        break;
      case 'phantom_5_atk':
        attackDamage += 32;
        break;
      case 'phantom_15_lethal_crit':
        critChance += 0.35;
        attackDamage += 45;
        break;
      case 'phantom_15_evasion_shield':
        maxHp += 500;
        lifesteal += 0.25;
        break;
      case 'marksman_5_range':
        attackRange += 4.5;
        break;
      case 'marksman_5_aspd':
        attackSpeed += 0.36;
        break;
      case 'marksman_15_caliber':
        attackDamage += 85;
        break;
      case 'berserker_5_lifesteal':
        lifesteal += 0.16;
        attackDamage += 20;
        break;
      case 'berserker_5_armor':
        armor += 22;
        maxHp += 240;
        break;
      case 'berserker_15_warlord':
        attackDamage += 70;
        attackSpeed += 0.48;
        break;
      case 'berserker_15_unstoppable':
        maxHp += 800;
        hpRegen += 35;
        break;
      case 'warden_5_armor':
        armor += 24;
        magicResist += 24;
        break;
      case 'warden_5_hp':
        maxHp += 340;
        moveSpeed += 1.0;
        break;
      case 'warden_15_titan_body':
        maxHp += 950;
        cooldownReduction += 0.25;
        break;
    }
  }

  // Пассивка Берсерка: ускорение рубки и вампиризм при потере здоровья
  if (heroDef.id === 'berserker') {
    const missingRatio = Math.max(0, Math.min(1, 1 - currentHpRatio));
    attackSpeed *= 1 + missingRatio * 0.85;
    lifesteal += missingRatio * 0.24;
  }

  let speedMultiplier = 1;
  // Ночной бонус охоты (Смена Дня и Ночи!)
  if (isNightTime && (heroDef.id === 'phantom' || heroDef.id === 'butcher' || heroDef.id === 'berserker')) {
    speedMultiplier += 0.1;
  }

  for (const st of statuses) {
    if (st.type === 'haste' || st.type === 'stealth') {
      speedMultiplier += st.magnitude;
    } else if (st.type === 'slow') {
      speedMultiplier -= st.magnitude;
    } else if (st.type === 'berserk_fire') {
      attackSpeed += 0.35;
      lifesteal += 0.16;
    } else if (st.type === 'blue_buff') {
      manaRegen += 16;
      cooldownReduction += 0.2;
    } else if (st.type === 'red_buff') {
      attackDamage += 22;
    } else if (st.type === 'titan_blessing') {
      attackDamage *= 1.22;
      spellPower *= 1.22;
      hpRegen += 24;
    } else if (st.type === 'bkb_immune') {
      magicResist += 300;
      speedMultiplier += 0.12;
    }
  }

  speedMultiplier = Math.max(0.38, Math.min(1.85, speedMultiplier));
  moveSpeed *= speedMultiplier;
  critChance = Math.min(0.95, critChance);
  cooldownReduction = Math.min(0.5, cooldownReduction);
  attackSpeed = Math.min(3.4, Math.max(0.45, attackSpeed));

  return {
    maxHp: Math.round(maxHp),
    hpRegen,
    maxMana: Math.round(maxMana),
    manaRegen,
    attackDamage: Math.round(attackDamage),
    spellPower: Math.round(spellPower),
    armor: Math.round(armor),
    magicResist: Math.round(magicResist),
    attackSpeed,
    attackRange,
    moveSpeed,
    critChance,
    critMultiplier,
    lifesteal,
    cooldownReduction,
  };
}

export function mitigateDamage(
  rawDamage: number,
  damageType: 'physical' | 'magical' | 'true',
  armor: number,
  magicResist: number
): number {
  if (rawDamage <= 0) return 0;
  if (damageType === 'true') return rawDamage;
  const def = damageType === 'physical' ? Math.max(-30, armor) : Math.max(-30, magicResist);
  const multiplier = def >= 0 ? 100 / (100 + def) : 2 - 100 / (100 - def);
  return Math.max(1, rawDamage * multiplier);
}

export function canUpgradeAbility(
  slot: AbilitySlot,
  currentRank: number,
  heroLevel: number,
  skillPoints: number
): boolean {
  if (skillPoints <= 0) return false;
  if (slot === 'R') {
    if (currentRank >= 3) return false;
    const reqLevel = currentRank === 0 ? 4 : currentRank === 1 ? 8 : 12;
    return heroLevel >= reqLevel;
  }
  if (currentRank >= 4) return false;
  const minHeroLevelForRank = currentRank * 2 + 1;
  return heroLevel >= minHeroLevelForRank;
}

export function isBackstabAngle(
  attackerX: number,
  attackerZ: number,
  targetX: number,
  targetZ: number,
  targetYaw: number
): boolean {
  const targetFwdX = -Math.sin(targetYaw);
  const targetFwdZ = -Math.cos(targetYaw);
  const dx = targetX - attackerX;
  const dz = targetZ - attackerZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) return false;
  const dot = (dx / len) * targetFwdX + (dz / len) * targetFwdZ;
  return dot > 0.35;
}
