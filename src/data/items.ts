import type { ShopItem } from '../types/game';

export const SHOP_ITEMS: ShopItem[] = [
  // Обувь
  {
    id: 'swift_boots',
    name: 'Сапоги Стремительности',
    shortName: 'Сапоги Скор.',
    category: 'boots',
    cost: 550,
    description: '+1.55 к скорости передвижения и +14% к скорости атаки.',
    bonuses: {
      moveSpeed: 1.55,
      attackSpeed: 0.14,
    },
  },
  {
    id: 'arcane_boots',
    name: 'Аркановые Ботфорты',
    shortName: 'Аркан. Сапоги',
    category: 'boots',
    cost: 550,
    description: '+1.5 к скорости передвижения, +220 маны и +10% сокращения перезарядки.',
    bonuses: {
      moveSpeed: 1.5,
      maxMana: 220,
      manaRegen: 4,
      cooldownReduction: 0.1,
    },
  },
  {
    id: 'warrior_boots',
    name: 'Кованые Поножи Бастиона',
    shortName: 'Броне-сапоги',
    category: 'boots',
    cost: 580,
    description: '+1.45 к скорости передвижения, +22 брони и +180 здоровья.',
    bonuses: {
      moveSpeed: 1.45,
      armor: 22,
      maxHp: 180,
    },
  },

  // АКТИВНЫЕ АРТЕФАКТЫ DOTA 2 [Клавиши 5 / 6]
  {
    id: 'black_king_bar',
    name: 'Посох Чёрного Короля (BKB)',
    shortName: '⚡ BKB Аватар',
    category: 'active',
    cost: 1550,
    description:
      'АКТИВНЫЙ [5/6]: Золотой Аватар на 5 сек — снимает дебаффы и даёт 100% иммунитет к магии и контролю! (+380 ХП, +32 атаки).',
    bonuses: {
      maxHp: 380,
      attackDamage: 32,
      magicResist: 18,
    },
    activeEffect: 'bkb_avatar',
    activeCooldown: 34,
  },
  {
    id: 'blink_dagger_relic',
    name: 'Кинжал Мгновенного Скачка',
    shortName: '⚡ Блинк',
    category: 'active',
    cost: 1150,
    description:
      'АКТИВНЫЙ [5/6]: Мгновенная телепортация на 15 метров по взгляду для молниеносной инициации! (КД 12 сек, +0.6 скорости).',
    bonuses: {
      moveSpeed: 0.6,
      cooldownReduction: 0.08,
    },
    activeEffect: 'blink_dagger',
    activeCooldown: 12,
  },
  {
    id: 'euls_cyclone_scepter',
    name: 'Скипетр Ветров (Еул)',
    shortName: '⚡ Ветра Еула',
    category: 'active',
    cost: 1320,
    description:
      'АКТИВНЫЙ [5/6]: Поднимает врага в прицеле в смерч на 2.2с (или вас самих в неуязвимость, если врага нет!). (+55 силы магии, +8 регена маны).',
    bonuses: {
      spellPower: 55,
      maxMana: 240,
      manaRegen: 8,
      moveSpeed: 0.55,
    },
    activeEffect: 'euls_cyclone',
    activeCooldown: 20,
  },
  {
    id: 'crimson_dagon',
    name: 'Багровый Посох Дагона',
    shortName: '⚡ Дагон',
    category: 'active',
    cost: 1450,
    description:
      'АКТИВНЫЙ [5/6]: Бьёт мгновенным алым лучом молнии во врага в прицеле на 420 + 80% силы магии урона и лечит вас! (+72 магии).',
    bonuses: {
      spellPower: 72,
      maxHp: 220,
      lifesteal: 0.12,
    },
    activeEffect: 'dagon_beam',
    activeCooldown: 16,
  },

  // Атака
  {
    id: 'blade_of_despair',
    name: 'Клинок Отчаяния',
    shortName: 'Клинок Отч.',
    category: 'attack',
    cost: 1650,
    description:
      '+75 к силе атаки, +0.5 скорости бега. Пассивка: +25% урона по врагам со здоровьем ниже 50%.',
    bonuses: {
      attackDamage: 75,
      moveSpeed: 0.5,
    },
    uniquePassive: 'despair_exec',
  },
  {
    id: 'berserker_fury',
    name: 'Ярость Берсерка (Дедал)',
    shortName: 'Дедал',
    category: 'attack',
    cost: 1450,
    description: '+52 к силе атаки и +30% к шансу критического удара.',
    bonuses: {
      attackDamage: 52,
      critChance: 0.3,
    },
  },
  {
    id: 'blood_claws',
    name: 'Когти Крови (Сатаник)',
    shortName: 'Когти Крови',
    category: 'attack',
    cost: 1350,
    description: '+42 к силе атаки, +22% физического вампиризма и +250 здоровья.',
    bonuses: {
      attackDamage: 42,
      lifesteal: 0.22,
      maxHp: 250,
    },
  },
  {
    id: 'titan_hunter',
    name: 'Меч Охотника на Титанов',
    shortName: 'Меч Титанов',
    category: 'attack',
    cost: 1400,
    description:
      '+38 к атаке, +30% скорости атаки. Наносит дополнительно 5% от текущего ХП цели при ударе.',
    bonuses: {
      attackDamage: 38,
      attackSpeed: 0.34,
    },
    uniquePassive: 'titan_slayer',
  },
  {
    id: 'phantom_halberd',
    name: 'Алебарда Бури',
    shortName: 'Алебарда',
    category: 'attack',
    cost: 1280,
    description: '+45 к атаке, +25% скорости атаки и +10% сокращения перезарядки.',
    bonuses: {
      attackDamage: 45,
      attackSpeed: 0.28,
      cooldownReduction: 0.1,
    },
  },

  // Магия
  {
    id: 'holy_crystal',
    name: 'Священный Кристалл Аганима',
    shortName: 'Кристалл Маг.',
    category: 'magic',
    cost: 1500,
    description: '+95 к силе заклинаний, +300 здоровья и +250 маны.',
    bonuses: {
      spellPower: 95,
      maxHp: 300,
      maxMana: 250,
    },
  },
  {
    id: 'lightning_scepter',
    name: 'Жезл Громовержца',
    shortName: 'Жезл Молний',
    category: 'magic',
    cost: 1380,
    description:
      '+68 к силе магии, +10% CDR. Способности вызывают разряд молнии на +90 маг. урона.',
    bonuses: {
      spellPower: 68,
      maxMana: 200,
      cooldownReduction: 0.1,
    },
    uniquePassive: 'lightning_burst',
  },
  {
    id: 'frost_queen_wand',
    name: 'Ледяное Око Скади',
    shortName: 'Око Скади',
    category: 'magic',
    cost: 1420,
    description:
      '+60 силы магии, +350 здоровья, +12% вампиризма. Умения и атаки замедляют врагов.',
    bonuses: {
      spellPower: 60,
      maxHp: 350,
      lifesteal: 0.12,
    },
    uniquePassive: 'frost_slow',
  },
  {
    id: 'blood_wings',
    name: 'Корона Архимага',
    shortName: 'Корона Мага',
    category: 'magic',
    cost: 1700,
    description: '+125 к силе заклинаний, +420 здоровья и +8 регенерации маны.',
    bonuses: {
      spellPower: 125,
      maxHp: 420,
      manaRegen: 8,
    },
  },

  // Защита
  {
    id: 'ancient_cuirass',
    name: 'Кираса Древних',
    shortName: 'Кираса',
    category: 'defense',
    cost: 1320,
    description: '+620 здоровья, +48 брони и +12 регенерации здоровья в секунду.',
    bonuses: {
      maxHp: 620,
      armor: 48,
      hpRegen: 12,
    },
  },
  {
    id: 'athena_aegis',
    name: 'Покров Афины',
    shortName: 'Покров Афины',
    category: 'defense',
    cost: 1300,
    description: '+580 здоровья, +46 магического сопротивления и +10% сокращения перезарядки.',
    bonuses: {
      maxHp: 580,
      magicResist: 46,
      cooldownReduction: 0.1,
    },
  },
  {
    id: 'thornmail_plate',
    name: 'Шипованный Доспех (Обратка)',
    shortName: 'Шипы Брони',
    category: 'defense',
    cost: 1250,
    description: '+350 здоровья и +58 брони. Возвращает 22% физического урона атакующему.',
    bonuses: {
      maxHp: 350,
      armor: 58,
    },
    uniquePassive: 'thorn_reflect',
  },
  {
    id: 'heart_of_tarrasque',
    name: 'Сердце Тарраска',
    shortName: 'Сердце Титана',
    category: 'defense',
    cost: 1680,
    description: '+1100 здоровья и +32 к регенерации ХП в секунду.',
    bonuses: {
      maxHp: 1100,
      hpRegen: 32,
    },
  },
  {
    id: 'immortality_relic',
    name: 'Реликвия Бессмертия',
    shortName: 'Бессмертие',
    category: 'defense',
    cost: 1550,
    description:
      '+520 здоровья, +30 брони. Воскрешает героя на месте гибели с 42% ХП (перезарядка 90 сек).',
    bonuses: {
      maxHp: 520,
      armor: 30,
    },
    uniquePassive: 'immortality_rebirth',
  },
];

export const SHOP_ITEMS_BY_ID: Map<string, ShopItem> = new Map(
  SHOP_ITEMS.map((item) => [item.id, item])
);
