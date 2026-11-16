import type { HeroArchetypeId, TalentOption, TalentTier } from '../types/game';

export const HERO_TALENT_TREES: Record<HeroArchetypeId, TalentOption[]> = {
  butcher: [
    {
      id: 'butcher_5_hp',
      tier: 5,
      branch: 'left',
      title: '+320 Здоровья и +8 Регена',
      description: 'Укрепляет плоть Мясника на ранней стадии линии.',
    },
    {
      id: 'butcher_5_hook_spd',
      tier: 5,
      branch: 'right',
      title: '+30% Скорости и дальности Крюка',
      description: 'Кровавый Крюк летит значительно быстрее и дальше.',
    },
    {
      id: 'butcher_10_triple_hook',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Тройной Крюк Бездны',
      description: 'Q выбрасывает сразу 3 цепных гарпуна веером!',
    },
    {
      id: 'butcher_10_rot_vamp',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Пир Чумного Облака',
      description: 'W наносит на 45% больше урона и исцеляет Моргана в бою.',
    },
    {
      id: 'butcher_15_colossus',
      tier: 15,
      branch: 'left',
      title: '+900 Здоровья и +35 Брони',
      description: 'Превращает Крюколова в несокрушимого титана передовой.',
    },
    {
      id: 'butcher_15_cdr',
      tier: 15,
      branch: 'right',
      title: '+25% Сокращения перезарядок',
      description: 'Крюк и Пожирание откатываются почти непрерывно.',
    },
  ],

  invoker: [
    {
      id: 'invoker_5_mana',
      tier: 5,
      branch: 'left',
      title: '+280 Маны и +10 Регена Маны',
      description: 'Неиссякаемый запас эфира для серий заклинаний.',
    },
    {
      id: 'invoker_5_spell',
      tier: 5,
      branch: 'right',
      title: '+45 Силы Заклинаний',
      description: 'Усиливает взрывной урон всех стихийных сфер.',
    },
    {
      id: 'invoker_10_twin_meteor',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Двойной Метеор Хаоса',
      description: 'E обрушивает с небес сразу 2 пылающих метеорита рядом!',
    },
    {
      id: 'invoker_10_wide_tornado',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Великий Ураган',
      description: 'Торнадо W на 65% шире и сокращает откат остальных умений на 2с.',
    },
    {
      id: 'invoker_15_cataclysm',
      tier: 15,
      branch: 'left',
      title: 'КАТАКЛИЗМ: Тройной Солнечный Удар',
      description: 'Ульта R вызывает сразу 3 столба плазмы вокруг точки прицела!',
    },
    {
      id: 'invoker_15_cdr',
      tier: 15,
      branch: 'right',
      title: '+110 Силы Магии и +20% CDR',
      description: 'Абсолютное могущество Верховного Мага.',
    },
  ],

  phantom: [
    {
      id: 'phantom_5_spd',
      tier: 5,
      branch: 'left',
      title: '+1.2 Скорости Бега',
      description: 'Молниеносные ротации между линиями и кустами засады.',
    },
    {
      id: 'phantom_5_atk',
      tier: 5,
      branch: 'right',
      title: '+32 Силы Атаки',
      description: 'Повышает взрывной урон с первого удара из тени.',
    },
    {
      id: 'phantom_10_fan_knives',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Веер Пяти Клинков',
      description: 'W метает сразу 5 теневых кинжалов широким веером!',
    },
    {
      id: 'phantom_10_reset_stealth',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Жнец Теней',
      description: 'Убийство вражеского героя мгновенно сбрасывает откат Q и E!',
    },
    {
      id: 'phantom_15_lethal_crit',
      tier: 15,
      branch: 'left',
      title: '+35% Шанса Крита и +45 Атаки',
      description: 'Сокрушительные удары клинками с любого ракурса.',
    },
    {
      id: 'phantom_15_evasion_shield',
      tier: 15,
      branch: 'right',
      title: '+500 ХП и +25% Вампиризма',
      description: 'Позволяет выживать в самом центре командного боя.',
    },
  ],

  marksman: [
    {
      id: 'marksman_5_range',
      tier: 5,
      branch: 'left',
      title: '+4.5 Дальности Стрельбы',
      description: 'Позволяет расстреливать врагов и башни с безопасной дистанции.',
    },
    {
      id: 'marksman_5_aspd',
      tier: 5,
      branch: 'right',
      title: '+32% Скорости Стрельбы',
      description: 'Ускоряет накопление каждого 4-го крит-выстрела.',
    },
    {
      id: 'marksman_10_ricochet',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Рикошет «Зари»',
      description: 'Базовые выстрелы рикошетят в 2 соседних врагов на 65% урона!',
    },
    {
      id: 'marksman_10_mega_shrapnel',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Ковровая Шрапнель',
      description: 'Радиус и урон Шрапнели Q увеличены на 45%.',
    },
    {
      id: 'marksman_15_caliber',
      tier: 15,
      branch: 'left',
      title: '+85 Силы Атаки',
      description: 'Крупнокалиберная мощь каждого попадания.',
    },
    {
      id: 'marksman_15_rapid_ult',
      tier: 15,
      branch: 'right',
      title: 'Ликвидация R: -6с перезарядки + пробитие щитов',
      description: 'Позволяет открывать и закрывать каждый бой снайперским выстрелом.',
    },
  ],

  berserker: [
    {
      id: 'berserker_5_lifesteal',
      tier: 5,
      branch: 'left',
      title: '+16% Вампиризма и +20 Атаки',
      description: 'Поддерживает жизнь Берсерка в затяжных рубках.',
    },
    {
      id: 'berserker_5_armor',
      tier: 5,
      branch: 'right',
      title: '+22 Брони и +240 Здоровья',
      description: 'Защищает при врыве под вражеский огонь.',
    },
    {
      id: 'berserker_10_vortex_spin',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Вихрь Притяжения',
      description: 'Вихрь Стали Q стягивает врагов к Рагнару и наносит +40% урона!',
    },
    {
      id: 'berserker_10_high_cull',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Приговор Вождя (42% ХП)',
      description: 'Казнь R срабатывает уже при < 42% ХП врага и лечит Рагнара на 350 ХП!',
    },
    {
      id: 'berserker_15_warlord',
      tier: 15,
      branch: 'left',
      title: '+70 Атаки и +45% Скорости Рубки',
      description: 'Неудержимая ярость двуручной секиры.',
    },
    {
      id: 'berserker_15_unstoppable',
      tier: 15,
      branch: 'right',
      title: '+800 Здоровья и +35 Регена ХП',
      description: 'Сверхживучесть в командных сражениях.',
    },
  ],

  warden: [
    {
      id: 'warden_5_armor',
      tier: 5,
      branch: 'left',
      title: '+24 Брони и Маг. Сопротивления',
      description: 'Каменная защита против любого типа урона.',
    },
    {
      id: 'warden_5_hp',
      tier: 5,
      branch: 'right',
      title: '+340 Здоровья и +1.0 Скорости',
      description: 'Помогает быстрее сближаться для инициации.',
    },
    {
      id: 'warden_10_tri_fissure',
      tier: 10,
      branch: 'left',
      title: 'МУТАЦИЯ: Тройной Разлом Земли',
      description: 'Удар Q пускает сразу 3 сейсмические каменные борозды конусом!',
    },
    {
      id: 'warden_10_fortress_shield',
      tier: 10,
      branch: 'right',
      title: 'МУТАЦИЯ: Цитадель Света',
      description: 'Щит Эгиды E на 65% прочнее и взрывается волной урона вокруг.',
    },
    {
      id: 'warden_15_echo_master',
      tier: 15,
      branch: 'left',
      title: 'Схлопывание Миров R: +3.5м радиус и +250 урона',
      description: 'Накрывает всю вражескую команду одним сокрушительным врывом.',
    },
    {
      id: 'warden_15_titan_body',
      tier: 15,
      branch: 'right',
      title: '+950 Здоровья и +25% CDR',
      description: 'Вечный несокрушимый страж команды.',
    },
  ],
};

export function getAvailableTalentChoices(
  heroId: HeroArchetypeId,
  level: number,
  chosen: Partial<Record<TalentTier, string>>
): { tier: TalentTier; left: TalentOption; right: TalentOption } | null {
  const tiers: TalentTier[] = [5, 10, 15];
  for (const tier of tiers) {
    if (level >= tier && !chosen[tier]) {
      const list = HERO_TALENT_TREES[heroId].filter((t) => t.tier === tier);
      const left = list.find((t) => t.branch === 'left')!;
      const right = list.find((t) => t.branch === 'right')!;
      return { tier, left, right };
    }
  }
  return null;
}
