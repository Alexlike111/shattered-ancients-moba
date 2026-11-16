import * as THREE from 'three';
import { HERO_LIST } from '../data/heroes';
import { SHOP_ITEMS, SHOP_ITEMS_BY_ID } from '../data/items';
import { getAvailableTalentChoices } from '../data/talents';
import { AMBUSH_BRUSHES, ARENA_HALF_SIZE, LANE_WAYPOINTS } from '../world/ArenaData';
import { detectMobileOrTouchDevice } from '../input/InputController';
import { canUpgradeAbility } from '../systems/StatsCalculator';
import type {
  AbilitySlot,
  BattleSpellId,
  CreepRuntime,
  GraphicsQuality,
  HeroArchetypeId,
  HeroRuntime,
  JungleMonsterRuntime,
  LaneId,
  MatchMode,
  OutpostRuntime,
  TacticalPing,
  TowerRuntime,
  VisionWardRuntime,
} from '../types/game';

export interface LobbyStartConfig {
  heroId: HeroArchetypeId;
  lane: LaneId;
  battleSpell: BattleSpellId;
  quality: GraphicsQuality;
  mode: MatchMode;
}

export interface UIActions {
  onSelectLobbyHero: (heroId: HeroArchetypeId) => void;
  onStartMatch: (cfg: LobbyStartConfig) => void;
  onReturnToLobby: () => void;
  onCastAbility: (slot: AbilitySlot) => void;
  onUpgradeAbility: (slot: AbilitySlot) => void;
  onCastBattleSpell: () => void;
  onRecall: () => void;
  onParry: () => void;
  onSlide: () => void;
  onPlaceWard: () => void;
  onUseActiveItem: (activeIdx: number) => void;
  onChooseTalent: (branch: 'left' | 'right') => void;
  onBuyItem: (itemId: string) => void;
  onSendPing: (kind: 'attack' | 'retreat' | 'gather', worldPos?: THREE.Vector3) => void;
  onToggleTouchHUD: () => void;
  onToggleMute: () => boolean;
  onTouchMove: (x: number, z: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchPrimaryFire: (pressed: boolean) => void;
  onSandboxCommand: (
    cmd:
      | 'levelup'
      | 'gold'
      | 'cooldowns'
      | 'dummy'
      | 'heal'
      | 'daynight'
      | 'spawnlord'
      | 'cataclysm'
  ) => void;
}

interface FloatingDamageEntry {
  el: HTMLDivElement;
  worldPos: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class HUDManager {
  private hudRoot: HTMLElement;
  private menuRoot: HTMLElement;
  private markersRoot: HTMLElement;
  private actions: UIActions;

  private selectedHero: HeroArchetypeId = 'butcher';
  private selectedLane: LaneId = 'mid';
  private selectedSpell: BattleSpellId = 'flicker';
  private selectedQuality: GraphicsQuality;
  private selectedMode: MatchMode = '5v5';

  private minimapCtx: CanvasRenderingContext2D | null = null;
  private announcerTimeout: number | null = null;
  private hitmarkerTimeout: number | null = null;
  private damageFlashTimeout: number | null = null;

  private unitTagMap = new Map<string, HTMLDivElement>();
  private floatingDamages: FloatingDamageEntry[] = [];
  private projVec = new THREE.Vector3();

  private shopModalEl: HTMLElement | null = null;
  private scoreModalEl: HTMLElement | null = null;
  private endModalEl: HTMLElement | null = null;
  private isShopOpen = false;
  private renderedTalentTier: number | null = null;

  constructor(actions: UIActions) {
    this.hudRoot = document.getElementById('hud-root')!;
    this.menuRoot = document.getElementById('menu-root')!;
    this.markersRoot = document.getElementById('world-markers-layer')!;
    this.actions = actions;
    this.selectedQuality = detectMobileOrTouchDevice() ? 'high' : 'ultra';
  }

  public showLobby(): void {
    this.hudRoot.innerHTML = '';
    this.clearWorldMarkers();
    this.renderLobbyMarkup();
  }

  private triggerMatchLaunch(): void {
    this.actions.onStartMatch({
      heroId: this.selectedHero,
      lane: this.selectedLane,
      battleSpell: this.selectedSpell,
      quality: this.selectedQuality,
      mode: this.selectedMode,
    });
  }

  private renderLobbyMarkup(): void {
    const hero = HERO_LIST.find((h) => h.id === this.selectedHero) ?? HERO_LIST[0];

    this.menuRoot.innerHTML = `
      <section class="lobby-overlay" id="lobby-screen">
        <header class="lobby-header">
          <div class="brand-block">
            <h1>РАСКОЛ ДРЕВНИХ: ПЕРВОЕ ЛИЦО</h1>
            <div class="brand-tagline">3D MOBA 5v5 • Шарнирный Ragdoll • Разрушаемость • Таланты • Парирование • BKB</div>
          </div>
          <div class="lobby-mode-switch">
            <button id="mode-5v5-btn" type="button" class="mode-btn ${this.selectedMode === '5v5' ? 'is-active' : ''}">5 НА 5</button>
            <button id="mode-sandbox-btn" type="button" class="mode-btn ${this.selectedMode === 'sandbox' ? 'is-active' : ''}">ПОЛИГОН</button>
            <button id="header-launch-btn" type="button" class="mobile-quick-start-btn">▶ В БОЙ</button>
          </div>
        </header>

        <div class="lobby-body">
          <aside class="hero-roster-panel">
            <h2 class="panel-heading">Выберите Героя (6 архетипов)</h2>
            <div class="hero-grid">
              ${HERO_LIST.map(
                (h) => `
                <button type="button" class="hero-card ${h.id === hero.id ? 'is-selected' : ''}" data-hero-id="${h.id}" id="pick-hero-${h.id}">
                  <div class="hero-card-top">
                    <span class="hero-emblem-badge" style="background:${h.accentColor}">${h.badgeText}</span>
                    <span class="hero-role-tag">${h.isRanged ? 'Дальний' : 'Ближний'}</span>
                  </div>
                  <div class="hero-card-name">${h.name}</div>
                  <div class="hero-card-title">${h.role}</div>
                </button>
              `
              ).join('')}
            </div>

            <div class="lobby-loadout-row">
              <div class="loadout-select-group">
                <label for="lane-select">Линия назначения</label>
                <select id="lane-select" class="loadout-select">
                  <option value="mid" ${this.selectedLane === 'mid' ? 'selected' : ''}>Центр (МИД)</option>
                  <option value="top" ${this.selectedLane === 'top' ? 'selected' : ''}>Верх (ТОП)</option>
                  <option value="bot" ${this.selectedLane === 'bot' ? 'selected' : ''}>Низ (БОТ)</option>
                  <option value="jungle" ${this.selectedLane === 'jungle' ? 'selected' : ''}>Джунгли / Ганг</option>
                </select>
              </div>
              <div class="loadout-select-group">
                <label for="spell-select">Заклинание [F]</label>
                <select id="spell-select" class="loadout-select">
                  <option value="flicker" ${this.selectedSpell === 'flicker' ? 'selected' : ''}>Скачок (Блинк)</option>
                  <option value="heal" ${this.selectedSpell === 'heal' ? 'selected' : ''}>Исцеление</option>
                  <option value="retribution" ${this.selectedSpell === 'retribution' ? 'selected' : ''}>Кара Лесника</option>
                  <option value="purify" ${this.selectedSpell === 'purify' ? 'selected' : ''}>Очищение (БКБ)</option>
                </select>
              </div>
            </div>

            <div class="lobby-loadout-row">
              <div class="loadout-select-group">
                <label for="quality-select">Качество 3D</label>
                <select id="quality-select" class="loadout-select">
                  <option value="ultra" ${this.selectedQuality === 'ultra' ? 'selected' : ''}>Ультра (HDR Bloom)</option>
                  <option value="high" ${this.selectedQuality === 'high' ? 'selected' : ''}>Высокое (Смартфоны)</option>
                  <option value="performance" ${this.selectedQuality === 'performance' ? 'selected' : ''}>Макс. FPS (60+)</option>
                </select>
              </div>
              <div class="loadout-select-group">
                <label>Новые механики</label>
                <div style="font-size:0.72rem;color:var(--gold-bright);padding-top:5px;">Парирование • Таланты • Варды</div>
              </div>
            </div>
          </aside>

          <div class="lobby-center-stage">
            <div class="stage-hero-banner">
              <div class="stage-hero-name">${hero.name}</div>
              <div class="stage-hero-weapon">Оружие от 1-го лица: ${hero.weaponLabel}</div>
            </div>
          </div>

          <aside class="hero-details-panel">
            <h2 class="panel-heading">Арсенал и Способности</h2>
            <div class="ability-preview-item" style="margin-bottom:7px;">
              <div class="ability-key-badge">ПАС</div>
              <div>
                <div class="ability-preview-title">${hero.passiveName}</div>
                <div class="ability-preview-desc">${hero.passiveDescription}</div>
              </div>
            </div>
            <div class="ability-preview-list">
              ${(['Q', 'W', 'E', 'R'] as const)
                .map((slot) => {
                  const ab = hero.abilities[slot];
                  const bindHint =
                    slot === 'Q'
                      ? '1 / Q'
                      : slot === 'W'
                        ? '2 / ПКМ'
                        : slot === 'E'
                          ? '3 / C'
                          : '4 / R';
                  return `
                  <div class="ability-preview-item">
                    <div class="ability-key-badge">${slot}</div>
                    <div>
                      <div class="ability-preview-title">${ab.name} <span style="color:var(--text-muted);font-weight:500;font-size:0.68rem;">[${bindHint}]</span></div>
                      <div class="ability-preview-desc">${ab.description}</div>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>
          </aside>
        </div>

        <footer class="lobby-footer">
          <div class="controls-hint-bar">
            <span><kbd>WASD</kbd> Бег</span>
            <span><kbd>Shift</kbd> Подкат</span>
            <span><kbd>V</kbd> Парирование</span>
            <span><kbd>X</kbd> Вард</span>
            <span><kbd>1-4</kbd> Умения</span>
            <span><kbd>5-6</kbd> Акт. Предметы</span>
            <span><kbd>G</kbd> Закуп</span>
            <span><kbd>B</kbd> Лавка</span>
          </div>
          <button id="launch-match-btn" type="button" class="launch-match-btn">ВСТУПИТЬ В БИТВУ</button>
        </footer>
      </section>
    `;

    this.menuRoot.querySelectorAll<HTMLButtonElement>('.hero-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.heroId as HeroArchetypeId;
        this.selectedHero = id;
        this.actions.onSelectLobbyHero(id);
        this.renderLobbyMarkup();
      });
    });

    document.getElementById('mode-5v5-btn')?.addEventListener('click', () => {
      this.selectedMode = '5v5';
      this.renderLobbyMarkup();
    });
    document.getElementById('mode-sandbox-btn')?.addEventListener('click', () => {
      this.selectedMode = 'sandbox';
      this.renderLobbyMarkup();
    });

    document.getElementById('lane-select')?.addEventListener('change', (e) => {
      this.selectedLane = (e.target as HTMLSelectElement).value as LaneId;
    });
    document.getElementById('spell-select')?.addEventListener('change', (e) => {
      this.selectedSpell = (e.target as HTMLSelectElement).value as BattleSpellId;
    });
    document.getElementById('quality-select')?.addEventListener('change', (e) => {
      this.selectedQuality = (e.target as HTMLSelectElement).value as GraphicsQuality;
    });

    document.getElementById('launch-match-btn')?.addEventListener('click', () => {
      this.triggerMatchLaunch();
    });
    document.getElementById('header-launch-btn')?.addEventListener('click', () => {
      this.triggerMatchLaunch();
    });
  }

  public mountBattleHUD(player: HeroRuntime, isTouchMode: boolean, mode: MatchMode): void {
    this.menuRoot.innerHTML = '';
    this.isShopOpen = false;
    this.renderedTalentTier = null;

    this.hudRoot.innerHTML = `
      <div class="hud-layer">
        <div id="damage-vignette" class="damage-vignette"></div>
        <div id="stealth-vignette" class="stealth-vignette"></div>
        <div id="sniper-scope-overlay" class="sniper-scope-overlay"></div>

        <!-- Миникарта -->
        <div class="minimap-container">
          <canvas id="minimap-canvas" width="174" height="174"></canvas>
          <div class="ping-row">
            <button type="button" class="ping-btn" id="ping-attack-btn">АТАКА!</button>
            <button type="button" class="ping-btn" id="ping-retreat-btn">ОТБОЙ!</button>
            <button type="button" class="ping-btn" id="ping-gather-btn">ТИТАН!</button>
          </div>
        </div>

        <!-- Панель Тренировочного Полигона -->
        <div id="sandbox-toolbar" class="sandbox-toolbar ${mode === 'sandbox' ? 'is-visible' : ''}">
          <div style="font-size:0.66rem;font-weight:800;color:var(--gold-bright);">ПОЛИГОН ТЕСТА</div>
          <button type="button" class="sandbox-btn" data-sb="levelup">+1 Уровень (Таланты)</button>
          <button type="button" class="sandbox-btn" data-sb="gold">+2000 Золота</button>
          <button type="button" class="sandbox-btn" data-sb="cooldowns">Сброс Перезарядок</button>
          <button type="button" class="sandbox-btn" data-sb="cataclysm">💥 Катаклизм (Физика)</button>
          <button type="button" class="sandbox-btn" data-sb="spawnlord">Призвать Лорда-Титана</button>
          <button type="button" class="sandbox-btn" data-sb="dummy">Призвать Врага</button>
          <button type="button" class="sandbox-btn" data-sb="daynight">День / Ночь</button>
        </div>

        <!-- Верхнее табло матча -->
        <div class="hud-top-bar">
          <div class="team-score-box">
            <span class="team-label radiant">Свет</span>
            <span id="score-radiant" class="team-kills radiant">0</span>
          </div>
          <div class="match-clock-box">
            <span id="match-clock" class="match-clock">☀ 00:00</span>
            <span id="titan-status-label" class="titan-status-label">ТИТАН ЖИВ • АВАНП: 0/0</span>
          </div>
          <div class="team-score-box">
            <span id="score-dire" class="team-kills dire">0</span>
            <span class="team-label dire">Пепел</span>
          </div>
        </div>

        <div id="tactical-status-pill" class="tactical-status-pill">🌿 В ЗАСАДЕ (НЕВИДИМ)</div>

        <!-- Правый верхний блок -->
        <div class="hud-top-right">
          <div class="hud-utility-btns">
            <button type="button" class="util-btn" id="hud-score-btn">Счёт</button>
            <button type="button" class="util-btn" id="hud-touch-btn">Тач</button>
            <button type="button" class="util-btn" id="hud-fs-btn">⛶</button>
            <button type="button" class="util-btn" id="hud-mute-btn">Звук</button>
            <button type="button" class="util-btn" id="hud-lobby-btn">Меню</button>
          </div>
          <div id="quickbuy-panel" class="quickbuy-panel"></div>
          <div id="killfeed-list" class="killfeed-list"></div>
        </div>

        <!-- Всплывающее Древо Талантов 5 / 10 / 15 уровня -->
        <div id="talent-choice-box" class="talent-choice-box"></div>

        <!-- Прицел от 1-го лица -->
        <div id="crosshair-wrap" class="crosshair-wrap">
          <div class="crosshair-reticle"></div>
          <div class="crosshair-dot"></div>
          <div id="crosshair-hitmarker" class="crosshair-hitmarker"></div>
        </div>

        <div id="tower-aggro-alert" class="tower-aggro-alert">ВНИМАНИЕ: БАШНЯ ВЗЯЛА ВАС В ПРИЦЕЛ!</div>

        <div id="announcer-banner" class="announcer-banner">
          <div id="announcer-title" class="announcer-title">ПЕРВАЯ КРОВЬ!</div>
          <div id="announcer-sub" class="announcer-sub"></div>
        </div>

        <div id="pointer-prompt" class="pointer-prompt" style="display:${isTouchMode ? 'none' : 'block'};">
          Кликните по арене для прицела от 1-го лица (ESC — курсор)
        </div>

        <div id="respawn-banner" class="respawn-banner">
          <div style="font-family:var(--font-display);font-weight:700;color:var(--text-main);">ГЕРОЙ ПАЛ В БОЮ</div>
          <div id="respawn-timer" class="respawn-timer">5.0</div>
        </div>

        <!-- Нижняя панель героя -->
        <div id="hud-bottom-bar" class="hud-bottom-bar ${isTouchMode ? 'touch-compact' : ''}">
          <div class="hero-vitals-box">
            <div class="hero-meta-line">
              <span>${player.heroDef.name}</span>
              <span id="hud-hero-lvl" class="hero-lvl-pill">УР. 1</span>
            </div>
            <div class="vital-bar">
              <div id="hud-hp-fill" class="vital-fill hp" style="width:100%"></div>
              <div id="hud-shield-fill" class="vital-shield-fill" style="width:0%"></div>
              <div id="hud-hp-text" class="vital-text">980 / 980</div>
            </div>
            <div class="vital-bar">
              <div id="hud-mana-fill" class="vital-fill mana" style="width:100%"></div>
              <div id="hud-mana-text" class="vital-text">360 / 360</div>
            </div>
            <div class="stats-mini-row">
              <span id="hud-stat-atk">АТК: 66</span>
              <span id="hud-stat-arm">БРН: 22</span>
              <span id="hud-stat-kda">0/0/0 • Д:0</span>
            </div>
          </div>

          <div class="abilities-slots-row">
            ${(['Q', 'W', 'E', 'R'] as const)
              .map((slot) => {
                const ab = player.heroDef.abilities[slot];
                const keyLabel =
                  slot === 'Q' ? '1/Q' : slot === 'W' ? '2/ПКМ' : slot === 'E' ? '3/C' : '4/R';
                return `
                <div class="ability-slot-wrap">
                  <button type="button" class="lvl-up-btn" id="lvlup-${slot}" data-up-slot="${slot}">+ ${slot}</button>
                  <div class="ability-slot ${slot === 'R' ? 'is-ult' : ''}" id="slot-${slot}" data-cast-slot="${slot}">
                    <span class="slot-key">${keyLabel}</span>
                    <span class="slot-title">${ab.name}</span>
                    <div class="slot-pips" id="pips-${slot}"></div>
                    <span class="slot-mana" id="mana-${slot}">${ab.manaCost[0]}</span>
                    <div class="slot-cd-overlay" id="cd-${slot}">0.0</div>
                  </div>
                </div>
              `;
              })
              .join('')}

            <div class="ability-slot-wrap">
              <div class="ability-slot" id="slot-parry" style="width:46px;height:46px;border-color:#facc15;">
                <span class="slot-key">V</span>
                <span class="slot-title">Парир.</span>
                <div class="slot-cd-overlay" id="cd-parry">0</div>
              </div>
            </div>

            <div class="ability-slot-wrap">
              <div class="ability-slot" id="slot-ward" style="width:46px;height:46px;border-color:#2dd4bf;">
                <span class="slot-key">X</span>
                <span class="slot-title" id="ward-slot-title">Вард (2)</span>
              </div>
            </div>

            <div class="ability-slot-wrap">
              <div class="ability-slot" id="slot-spell" style="width:46px;height:46px;">
                <span class="slot-key">F</span>
                <span class="slot-title" id="spell-slot-title">Закл.</span>
                <div class="slot-cd-overlay" id="cd-spell">0</div>
              </div>
            </div>
          </div>

          <div class="inventory-box">
            <div id="hud-items-grid" class="items-grid-6">
              <div class="inv-slot" data-use-item="0">—</div>
              <div class="inv-slot" data-use-item="1">—</div>
              <div class="inv-slot" data-use-item="2">—</div>
              <div class="inv-slot" data-use-item="3">—</div>
              <div class="inv-slot" data-use-item="4">—</div>
              <div class="inv-slot" data-use-item="5">—</div>
            </div>
            <button type="button" id="open-shop-btn" class="gold-shop-btn">
              <span id="hud-gold-amount">600 З</span>
              <span>ЛАВКА [B]</span>
            </button>
          </div>
        </div>

        <!-- Мобильный тач-слой в стиле Mobile Legends -->
        <div id="mobile-controls-layer" class="mobile-controls-layer ${isTouchMode ? 'is-enabled' : ''}">
          <div id="touch-joystick-zone" class="touch-joystick-zone">
            <div id="joystick-base" class="joystick-base">
              <div id="joystick-stick" class="joystick-stick"></div>
            </div>
          </div>
          <div id="touch-look-zone" class="touch-look-zone"></div>
          <div class="mlbb-skill-cluster">
            <button type="button" id="mlbb-attack-btn" class="mlbb-attack-btn">УДАР</button>
            <button type="button" class="mlbb-skill-btn pos-q" data-touch-slot="Q">Q</button>
            <button type="button" class="mlbb-skill-btn pos-w" data-touch-slot="W">W</button>
            <button type="button" class="mlbb-skill-btn pos-e" data-touch-slot="E">E</button>
            <button type="button" class="mlbb-skill-btn pos-r" data-touch-slot="R">R</button>
            <button type="button" id="mlbb-spell-btn" class="mlbb-skill-btn pos-spell">F</button>
            <button type="button" id="mlbb-parry-btn" class="mlbb-skill-btn pos-parry">ПАРИР</button>
            <button type="button" id="mlbb-slide-btn" class="mlbb-skill-btn pos-slide">ПОДК</button>
            <button type="button" id="mlbb-ward-btn" class="mlbb-skill-btn pos-ward">ВАРД</button>
            <button type="button" id="mlbb-item-btn" class="mlbb-skill-btn pos-item">АРТ</button>
          </div>
        </div>

        <!-- Модальное окно Магазина -->
        <div id="shop-modal" class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <h2>ЛАВКА АРТЕФАКТОВ (Активные предметы: BKB, Еул, Дагон, Блинк!)</h2>
              <button type="button" class="close-modal-btn" id="close-shop-btn">Закрыть</button>
            </div>
            <div id="shop-items-grid" class="shop-grid"></div>
          </div>
        </div>

        <!-- Модальное окно Счёта -->
        <div id="score-modal" class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <h2>ТАКТИЧЕСКАЯ СВОДКА МАТЧА</h2>
              <button type="button" class="close-modal-btn" id="close-score-btn">Закрыть</button>
            </div>
            <div id="scoreboard-content"></div>
          </div>
        </div>

        <!-- Финальное окно -->
        <div id="end-modal" class="modal-backdrop">
          <div class="modal-window" style="text-align:center;">
            <h2 id="end-title" style="font-family:var(--font-display);font-size:1.85rem;color:var(--gold-bright);margin-bottom:8px;">ПОБЕДА!</h2>
            <p id="end-subtitle" style="color:var(--text-secondary);margin-bottom:16px;"></p>
            <div id="end-scoreboard-wrap" style="margin-bottom:18px;text-align:left;"></div>
            <button type="button" id="end-return-btn" class="launch-match-btn">В ДРАФТ-ЛОББИ</button>
          </div>
        </div>
      </div>
    `;

    const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
    this.minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
    this.shopModalEl = document.getElementById('shop-modal');
    this.scoreModalEl = document.getElementById('score-modal');
    this.endModalEl = document.getElementById('end-modal');

    this.bindBattleHUDEvents(minimapCanvas);
  }

  private bindBattleHUDEvents(minimapCanvas: HTMLCanvasElement | null): void {
    document.getElementById('ping-attack-btn')?.addEventListener('click', () => {
      this.actions.onSendPing('attack');
    });
    document.getElementById('ping-retreat-btn')?.addEventListener('click', () => {
      this.actions.onSendPing('retreat');
    });
    document.getElementById('ping-gather-btn')?.addEventListener('click', () => {
      this.actions.onSendPing('gather', new THREE.Vector3(-28, 0, 28));
    });

    minimapCanvas?.addEventListener('click', (e) => {
      const rect = minimapCanvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const wx = (nx * 2 - 1) * ARENA_HALF_SIZE;
      const wz = (ny * 2 - 1) * ARENA_HALF_SIZE;
      this.actions.onSendPing('attack', new THREE.Vector3(wx, 0, wz));
    });

    this.hudRoot.querySelectorAll<HTMLButtonElement>('[data-sb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.sb as
          | 'levelup'
          | 'gold'
          | 'cooldowns'
          | 'dummy'
          | 'heal'
          | 'daynight'
          | 'spawnlord'
          | 'cataclysm';
        this.actions.onSandboxCommand(cmd);
      });
    });

    this.hudRoot.querySelectorAll<HTMLButtonElement>('[data-up-slot]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.actions.onUpgradeAbility(btn.dataset.upSlot as AbilitySlot);
      });
    });

    this.hudRoot.querySelectorAll<HTMLElement>('[data-cast-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        this.actions.onCastAbility(el.dataset.castSlot as AbilitySlot);
      });
    });

    document.getElementById('slot-parry')?.addEventListener('click', () => this.actions.onParry());
    document.getElementById('slot-ward')?.addEventListener('click', () => this.actions.onPlaceWard());
    document.getElementById('slot-spell')?.addEventListener('click', () => {
      this.actions.onCastBattleSpell();
    });

    this.hudRoot.querySelectorAll<HTMLElement>('[data-use-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.useItem);
        this.actions.onUseActiveItem(idx);
      });
    });

    document.getElementById('open-shop-btn')?.addEventListener('click', () => {
      this.toggleShopModal();
    });
    document.getElementById('close-shop-btn')?.addEventListener('click', () => {
      this.toggleShopModal(false);
    });

    document.getElementById('hud-score-btn')?.addEventListener('click', () => {
      this.toggleScoreModal(!this.scoreModalEl?.classList.contains('is-open'));
    });
    document.getElementById('close-score-btn')?.addEventListener('click', () => {
      this.toggleScoreModal(false);
    });

    document.getElementById('hud-touch-btn')?.addEventListener('click', () => {
      this.actions.onToggleTouchHUD();
    });
    document.getElementById('hud-fs-btn')?.addEventListener('click', () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        void document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    });
    document.getElementById('hud-mute-btn')?.addEventListener('click', (e) => {
      const muted = this.actions.onToggleMute();
      (e.currentTarget as HTMLButtonElement).textContent = muted ? 'Тихо' : 'Звук';
    });
    document.getElementById('hud-lobby-btn')?.addEventListener('click', () => {
      this.actions.onReturnToLobby();
    });
    document.getElementById('end-return-btn')?.addEventListener('click', () => {
      this.actions.onReturnToLobby();
    });

    // Сенсорный джойстик
    const joyZone = document.getElementById('touch-joystick-zone');
    const joyStick = document.getElementById('joystick-stick');
    const joyBase = document.getElementById('joystick-base');
    let joyTouchId: number | null = null;
    let joyOriginX = 0;
    let joyOriginY = 0;

    joyZone?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        const rect = joyBase!.getBoundingClientRect();
        joyOriginX = rect.left + rect.width * 0.5;
        joyOriginY = rect.top + rect.height * 0.5;
      },
      { passive: false }
    );

    joyZone?.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === joyTouchId) {
            const dx = t.clientX - joyOriginX;
            const dy = t.clientY - joyOriginY;
            const maxR = 44;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(maxR, dist);
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 0;
            if (joyStick) {
              joyStick.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
            }
            this.actions.onTouchMove((nx * clamped) / maxR, (ny * clamped) / maxR);
          }
        }
      },
      { passive: false }
    );

    const resetJoy = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyTouchId) {
          joyTouchId = null;
          if (joyStick) joyStick.style.transform = 'translate(0px, 0px)';
          this.actions.onTouchMove(0, 0);
        }
      }
    };
    joyZone?.addEventListener('touchend', resetJoy);
    joyZone?.addEventListener('touchcancel', resetJoy);

    // Свайп обзора камеры правой рукой
    const lookZone = document.getElementById('touch-look-zone');
    let lookTouchId: number | null = null;
    let lastLookX = 0;
    let lastLookY = 0;

    lookZone?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        lookTouchId = t.identifier;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
      },
      { passive: false }
    );
    lookZone?.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === lookTouchId) {
            const dx = (t.clientX - lastLookX) * 0.006;
            const dy = (t.clientY - lastLookY) * 0.006;
            lastLookX = t.clientX;
            lastLookY = t.clientY;
            this.actions.onTouchLook(dx, dy);
          }
        }
      },
      { passive: false }
    );
    lookZone?.addEventListener('touchend', () => {
      lookTouchId = null;
    });

    // Мобильные кнопки Mobile Legends (pointerdown работает и на таче, и на стилусе, и при проверке мышью!)
    const atkBtn = document.getElementById('mlbb-attack-btn');
    atkBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onTouchPrimaryFire(true);
    });
    atkBtn?.addEventListener('pointerup', () => this.actions.onTouchPrimaryFire(false));
    atkBtn?.addEventListener('pointercancel', () => this.actions.onTouchPrimaryFire(false));

    this.hudRoot.querySelectorAll<HTMLButtonElement>('[data-touch-slot]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.actions.onCastAbility(btn.dataset.touchSlot as AbilitySlot);
      });
    });

    document.getElementById('mlbb-spell-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onCastBattleSpell();
    });
    document.getElementById('mlbb-parry-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onParry();
    });
    document.getElementById('mlbb-slide-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onSlide();
    });
    document.getElementById('mlbb-ward-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onPlaceWard();
    });
    document.getElementById('mlbb-item-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actions.onUseActiveItem(0);
    });
  }

  public setTouchModeUI(enabled: boolean): void {
    document.getElementById('mobile-controls-layer')?.classList.toggle('is-enabled', enabled);
    document.getElementById('hud-bottom-bar')?.classList.toggle('touch-compact', enabled);
    const prompt = document.getElementById('pointer-prompt');
    if (prompt) prompt.style.display = enabled ? 'none' : 'block';
  }

  public toggleShopModal(force?: boolean): boolean {
    this.isShopOpen = force !== undefined ? force : !this.isShopOpen;
    this.shopModalEl?.classList.toggle('is-open', this.isShopOpen);
    return this.isShopOpen;
  }

  public toggleScoreModal(visible: boolean): void {
    this.scoreModalEl?.classList.toggle('is-open', visible);
  }

  public showAnnouncer(title: string, subtitle = ''): void {
    const banner = document.getElementById('announcer-banner');
    const titleEl = document.getElementById('announcer-title');
    const subEl = document.getElementById('announcer-sub');
    if (!banner || !titleEl || !subEl) return;

    titleEl.textContent = title;
    subEl.textContent = subtitle;
    banner.classList.add('is-visible');

    if (this.announcerTimeout) window.clearTimeout(this.announcerTimeout);
    this.announcerTimeout = window.setTimeout(() => {
      banner.classList.remove('is-visible');
    }, 2600);
  }

  public pushKillFeed(killerName: string, victimName: string, isRadiantKiller: boolean): void {
    const list = document.getElementById('killfeed-list');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'killfeed-item';
    item.style.borderRightColor = isRadiantKiller ? 'var(--radiant-teal)' : 'var(--dire-crimson)';
    item.textContent = `${killerName} ⚔ ${victimName}`;
    list.prepend(item);
    while (list.children.length > 4) {
      list.lastElementChild?.remove();
    }
    window.setTimeout(() => item.remove(), 7500);
  }

  public flashHitmarker(isCrit: boolean): void {
    const hm = document.getElementById('crosshair-hitmarker');
    if (!hm) return;
    hm.style.borderColor = isCrit ? '#ef4444' : '#f2cb78';
    hm.classList.add('is-active');
    if (this.hitmarkerTimeout) window.clearTimeout(this.hitmarkerTimeout);
    this.hitmarkerTimeout = window.setTimeout(() => hm.classList.remove('is-active'), 115);
  }

  public flashDamageVignette(): void {
    const vig = document.getElementById('damage-vignette');
    if (!vig) return;
    vig.classList.add('is-hit');
    if (this.damageFlashTimeout) window.clearTimeout(this.damageFlashTimeout);
    this.damageFlashTimeout = window.setTimeout(() => vig.classList.remove('is-hit'), 210);
  }

  public spawnFloatingNumber(worldPos: THREE.Vector3, label: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'floating-dmg-text';
    el.style.color = color;
    el.textContent = label;
    this.markersRoot.appendChild(el);
    this.floatingDamages.push({
      el,
      worldPos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.2, 0)),
      life: 0.78,
      maxLife: 0.78,
    });
  }

  public showMatchVictoryScreen(
    radiantWon: boolean,
    heroes: HeroRuntime[],
    elapsedSec: number
  ): void {
    if (!this.endModalEl) return;
    const title = document.getElementById('end-title');
    const sub = document.getElementById('end-subtitle');
    const wrap = document.getElementById('end-scoreboard-wrap');
    if (title) {
      title.textContent = radiantWon ? 'ПОБЕДА ОРДЕНА СВЕТА!' : 'ПОРАЖЕНИЕ — ПАЛ ДРЕВНИЙ ТРОН';
      title.style.color = radiantWon ? 'var(--radiant-teal)' : 'var(--dire-crimson)';
    }
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    if (sub) sub.textContent = `Длительность битвы: ${mins} мин ${secs} сек`;
    if (wrap) wrap.innerHTML = this.buildScoreboardHTML(heroes);
    this.endModalEl.classList.add('is-open');
  }

  public updateHUD(
    dt: number,
    player: HeroRuntime,
    heroes: HeroRuntime[],
    creeps: CreepRuntime[],
    towers: TowerRuntime[],
    monsters: JungleMonsterRuntime[],
    wards: VisionWardRuntime[],
    outposts: OutpostRuntime[],
    pings: TacticalPing[],
    camera: THREE.PerspectiveCamera,
    elapsedTime: number,
    isNightTime: boolean,
    radiantKills: number,
    direKills: number,
    isPointerLocked: boolean,
    isTouchMode: boolean,
    enemyInCrosshair: boolean,
    isScoped: boolean,
    isHiddenFn: (h: HeroRuntime, viewerTeam: 'radiant' | 'dire') => boolean
  ): void {
    const radScoreEl = document.getElementById('score-radiant');
    const direScoreEl = document.getElementById('score-dire');
    const clockEl = document.getElementById('match-clock');
    const titanLabel = document.getElementById('titan-status-label');

    if (radScoreEl) radScoreEl.textContent = String(radiantKills);
    if (direScoreEl) direScoreEl.textContent = String(direKills);
    if (clockEl) {
      const m = String(Math.floor(elapsedTime / 60)).padStart(2, '0');
      const s = String(Math.floor(elapsedTime % 60)).padStart(2, '0');
      clockEl.textContent = `${isNightTime ? '☾ НОЧЬ' : '☀ ДЕНЬ'} ${m}:${s}`;
    }

    const titan = monsters.find((m) => m.campType === 'titan_boss');
    const radOutposts = outposts.filter((o) => o.owner === 'radiant').length;
    const direOutposts = outposts.filter((o) => o.owner === 'dire').length;
    if (titanLabel && titan) {
      const tStr = titan.alive ? 'ТИТАН ЖИВ' : `ТИТАН ${Math.ceil(titan.respawnTimer)}с`;
      titanLabel.textContent = `${tStr} • АВАНПОСТЫ ${radOutposts}:${direOutposts}`;
    }

    // Статус Засады в кустах / BKB / Парирования
    const statusPill = document.getElementById('tactical-status-pill');
    if (statusPill) {
      const isBkb = player.statuses.some((s) => s.type === 'bkb_immune');
      const isBrushHidden = player.inBrush && player.brushRevealTimer <= 0;
      if (isBkb) {
        statusPill.textContent = '⚡ ЗОЛОТОЙ АВАТАР BKB: ИММУНИТЕТ К МАГИИ!';
        statusPill.style.background = 'rgba(161, 98, 7, 0.92)';
        statusPill.classList.add('is-visible');
      } else if (player.parryWindow > 0) {
        statusPill.textContent = '🛡 СТОЙКА ИДЕАЛЬНОГО ПАРИРОВАНИЯ!';
        statusPill.style.background = 'rgba(180, 83, 9, 0.92)';
        statusPill.classList.add('is-visible');
      } else if (isBrushHidden) {
        statusPill.textContent = '🌿 В ТРАВЕ ЗАСАДЫ (НЕВИДИМ ДЛЯ ВРАГОВ)';
        statusPill.style.background = 'rgba(6, 78, 59, 0.92)';
        statusPill.classList.add('is-visible');
      } else {
        statusPill.classList.remove('is-visible');
      }
    }

    // Всплывающее Древо Талантов 5 / 10 / 15 уровня!
    const talentBox = document.getElementById('talent-choice-box');
    const availableTalent = getAvailableTalentChoices(
      player.heroDef.id,
      player.level,
      player.chosenTalents
    );
    if (talentBox) {
      if (availableTalent) {
        talentBox.classList.add('is-visible');
        if (this.renderedTalentTier !== availableTalent.tier) {
          this.renderedTalentTier = availableTalent.tier;
          talentBox.innerHTML = `
            <div style="font-family:var(--font-display);font-size:0.82rem;font-weight:800;color:var(--gold-bright);">
              ДРЕВО ТАЛАНТОВ (${availableTalent.tier} УРОВЕНЬ) — Выберите мутацию:
            </div>
            <div class="talent-branches-row">
              <button type="button" class="talent-branch-btn" id="pick-talent-left">
                <div style="font-weight:800;font-size:0.78rem;color:var(--gold-bright);">[ [ ] ${availableTalent.left.title}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${availableTalent.left.description}</div>
              </button>
              <button type="button" class="talent-branch-btn" id="pick-talent-right">
                <div style="font-weight:800;font-size:0.78rem;color:var(--gold-bright);">[ ] ] ${availableTalent.right.title}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${availableTalent.right.description}</div>
              </button>
            </div>
          `;
          document.getElementById('pick-talent-left')?.addEventListener('click', () => {
            this.actions.onChooseTalent('left');
          });
          document.getElementById('pick-talent-right')?.addEventListener('click', () => {
            this.actions.onChooseTalent('right');
          });
        }
      } else {
        talentBox.classList.remove('is-visible');
        this.renderedTalentTier = null;
      }
    }

    const prompt = document.getElementById('pointer-prompt');
    if (prompt) {
      prompt.style.display =
        !isTouchMode && !isPointerLocked && !this.isShopOpen && player.alive ? 'block' : 'none';
    }

    document.getElementById('crosshair-wrap')?.classList.toggle('is-enemy-aim', enemyInCrosshair);
    document.getElementById('sniper-scope-overlay')?.classList.toggle('is-active', isScoped);
    document
      .getElementById('stealth-vignette')
      ?.classList.toggle(
        'is-active',
        player.statuses.some((s) => s.type === 'stealth') ||
          (player.inBrush && player.brushRevealTimer <= 0)
      );

    const targetedByTower = towers.some(
      (t) => t.alive && t.team !== player.team && t.currentTargetId === player.id
    );
    document
      .getElementById('tower-aggro-alert')
      ?.classList.toggle('is-visible', targetedByTower && player.alive);

    const respawnBanner = document.getElementById('respawn-banner');
    const respawnTimerEl = document.getElementById('respawn-timer');
    if (respawnBanner && respawnTimerEl) {
      respawnBanner.classList.toggle('is-dead', !player.alive);
      if (!player.alive) respawnTimerEl.textContent = player.respawnTimer.toFixed(1);
    }

    // Полосы ХП и Маны
    const lvlEl = document.getElementById('hud-hero-lvl');
    if (lvlEl) lvlEl.textContent = `УР. ${player.level}`;

    const hpPct = Math.max(0, Math.min(100, (player.hp / Math.max(1, player.stats.maxHp)) * 100));
    const shieldPct = Math.max(
      0,
      Math.min(100, (player.shield / Math.max(1, player.stats.maxHp)) * 100)
    );
    const manaPct = Math.max(
      0,
      Math.min(100, (player.mana / Math.max(1, player.stats.maxMana)) * 100)
    );

    const hpFill = document.getElementById('hud-hp-fill');
    const shFill = document.getElementById('hud-shield-fill');
    const hpText = document.getElementById('hud-hp-text');
    const mnFill = document.getElementById('hud-mana-fill');
    const mnText = document.getElementById('hud-mana-text');

    if (hpFill) hpFill.style.width = `${hpPct}%`;
    if (shFill) shFill.style.width = `${shieldPct}%`;
    if (hpText) {
      const shLabel = player.shield > 1 ? ` (+${Math.round(player.shield)})` : '';
      hpText.textContent = `${Math.ceil(player.hp)} / ${player.stats.maxHp}${shLabel}`;
    }
    if (mnFill) mnFill.style.width = `${manaPct}%`;
    if (mnText) mnText.textContent = `${Math.floor(player.mana)} / ${player.stats.maxMana}`;

    const stAtk = document.getElementById('hud-stat-atk');
    const stArm = document.getElementById('hud-stat-arm');
    const stKda = document.getElementById('hud-stat-kda');
    if (stAtk) stAtk.textContent = `АТК: ${player.stats.attackDamage}`;
    if (stArm) stArm.textContent = `БРН: ${player.stats.armor}`;
    if (stKda) {
      stKda.textContent = `${player.kills}/${player.deaths}/${player.assists} • Д:${player.denies}`;
    }

    // Слоты Q/W/E/R
    for (const slot of ['Q', 'W', 'E', 'R'] as const) {
      const rank = player.abilityRanks[slot];
      const ab = player.heroDef.abilities[slot];
      const cd = player.abilityCooldowns[slot];
      const slotEl = document.getElementById(`slot-${slot}`);
      const cdEl = document.getElementById(`cd-${slot}`);
      const upBtn = document.getElementById(`lvlup-${slot}`);
      const pipsEl = document.getElementById(`pips-${slot}`);
      const manaEl = document.getElementById(`mana-${slot}`);

      if (slotEl) {
        slotEl.classList.toggle('is-locked', rank === 0);
        slotEl.classList.toggle('on-cooldown', cd > 0.05);
      }
      if (cdEl && cd > 0.05) {
        cdEl.textContent = cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1);
      }
      if (upBtn) {
        upBtn.classList.toggle(
          'is-available',
          canUpgradeAbility(slot, rank, player.level, player.skillPoints)
        );
      }
      if (manaEl) {
        manaEl.textContent = String(ab.manaCost[Math.max(0, rank - 1)] ?? ab.manaCost[0]);
      }
      if (pipsEl && pipsEl.childElementCount !== ab.maxRank) {
        pipsEl.innerHTML = Array.from({ length: ab.maxRank })
          .map(() => `<span class="slot-pip"></span>`)
          .join('');
      }
      if (pipsEl) {
        Array.from(pipsEl.children).forEach((pip, idx) => {
          pip.classList.toggle('filled', idx < rank);
        });
      }
    }

    // Слот Парирования и Вардов
    const parrySlot = document.getElementById('slot-parry');
    const parryCdEl = document.getElementById('cd-parry');
    if (parrySlot && parryCdEl) {
      parrySlot.classList.toggle('on-cooldown', player.parryCooldown > 0.05);
      if (player.parryCooldown > 0.05) parryCdEl.textContent = player.parryCooldown.toFixed(1);
    }

    const wardTitle = document.getElementById('ward-slot-title');
    if (wardTitle) wardTitle.textContent = `Вард (${player.wardCharges})`;

    // Слот Боевого Заклинания F
    const spellSlot = document.getElementById('slot-spell');
    const spellCdEl = document.getElementById('cd-spell');
    const spellTitle = document.getElementById('spell-slot-title');
    if (spellTitle) {
      const names: Record<BattleSpellId, string> = {
        flicker: 'Скачок',
        heal: 'Лечение',
        retribution: 'Кара',
        purify: 'БКБ',
      };
      spellTitle.textContent = names[player.battleSpell];
    }
    if (spellSlot && spellCdEl) {
      spellSlot.classList.toggle('on-cooldown', player.battleSpellCooldown > 0.05);
      if (player.battleSpellCooldown > 0.05) {
        spellCdEl.textContent = String(Math.ceil(player.battleSpellCooldown));
      }
    }

    // Инвентарь + Активные Предметы [5 / 6]
    const goldEl = document.getElementById('hud-gold-amount');
    if (goldEl) goldEl.textContent = `${Math.floor(player.gold)} З`;

    const invGrid = document.getElementById('hud-items-grid');
    if (invGrid) {
      let activeBadgeCounter = 0;
      Array.from(invGrid.children).forEach((cell, idx) => {
        const it = player.items[idx];
        const htmlCell = cell as HTMLElement;
        if (!it) {
          htmlCell.textContent = '—';
          htmlCell.classList.remove('is-active-item');
          return;
        }
        if (it.activeEffect) {
          const cd = player.itemCooldowns.get(it.id) ?? 0;
          const hk = activeBadgeCounter < 2 ? `[${5 + activeBadgeCounter}] ` : '';
          activeBadgeCounter++;
          htmlCell.classList.add('is-active-item');
          htmlCell.textContent = cd > 0.1 ? `${Math.ceil(cd)}с` : `${hk}${it.shortName}`;
        } else {
          htmlCell.classList.remove('is-active-item');
          htmlCell.textContent = it.shortName;
        }
      });
    }

    this.updateQuickBuyCards(player);

    if (this.isShopOpen) this.renderShopItems(player);
    if (this.scoreModalEl?.classList.contains('is-open')) {
      const scWrap = document.getElementById('scoreboard-content');
      if (scWrap) scWrap.innerHTML = this.buildScoreboardHTML(heroes);
    }

    this.renderMinimap(player, heroes, creeps, towers, monsters, wards, outposts, pings, isHiddenFn);
    this.updateWorldFloatingMarkers(
      dt,
      player,
      heroes,
      creeps,
      towers,
      monsters,
      camera,
      isHiddenFn
    );
  }

  private updateQuickBuyCards(player: HeroRuntime): void {
    const qbPanel = document.getElementById('quickbuy-panel');
    if (!qbPanel) return;

    if (player.items.length >= 6) {
      qbPanel.innerHTML = '';
      return;
    }

    const candidates = player.heroDef.recommendedBuild
      .filter((id) => !player.items.some((owned) => owned.id === id))
      .slice(0, 2);

    const keyHints = ['G', 'H'];
    qbPanel.innerHTML = candidates
      .map((itemId, idx) => {
        const item = SHOP_ITEMS_BY_ID.get(itemId);
        if (!item) return '';
        const canAfford = player.gold >= item.cost;
        return `
          <button type="button" class="quickbuy-card ${canAfford ? 'can-afford' : ''}" data-qb-item="${item.id}">
            <span class="quickbuy-name">[${keyHints[idx]}] ${item.shortName}</span>
            <span class="quickbuy-cost">${item.cost} З</span>
          </button>
        `;
      })
      .join('');

    qbPanel.querySelectorAll<HTMLButtonElement>('[data-qb-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.qbItem;
        if (id) this.actions.onBuyItem(id);
      });
    });
  }

  private renderShopItems(player: HeroRuntime): void {
    const grid = document.getElementById('shop-items-grid');
    if (!grid) return;
    grid.innerHTML = SHOP_ITEMS.map((item) => {
      const owned = player.items.some((i) => i.id === item.id);
      const affordable = !owned && player.gold >= item.cost && player.items.length < 6;
      return `
        <button type="button" class="shop-item-card ${affordable ? 'affordable' : ''} ${owned ? 'owned' : ''}" data-buy-id="${item.id}">
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:0.82rem;">
            <span>${item.name}</span>
            <span style="color:var(--gold-bright);font-family:var(--font-mono);">${owned ? 'КУПЛЕНО' : item.cost + ' З'}</span>
          </div>
          <div style="font-size:0.72rem;color:var(--text-secondary);line-height:1.3;">${item.description}</div>
        </button>
      `;
    }).join('');

    grid.querySelectorAll<HTMLButtonElement>('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.buyId;
        if (id) this.actions.onBuyItem(id);
      });
    });
  }

  private buildScoreboardHTML(heroes: HeroRuntime[]): string {
    const rows = heroes
      .map((h) => {
        const teamColor = h.team === 'radiant' ? 'var(--radiant-teal)' : 'var(--dire-crimson)';
        const itemsText = h.items.map((i) => i.shortName).join(', ') || 'Нет артефактов';
        return `
          <tr>
            <td style="color:${teamColor};font-weight:700;">${h.displayName} ${h.isPlayer ? '(ВЫ)' : ''}</td>
            <td>${h.heroDef.name}</td>
            <td>${h.level}</td>
            <td style="font-family:var(--font-mono);font-weight:700;">${h.kills}/${h.deaths}/${h.assists}</td>
            <td>${h.creepScore} / ${h.denies}!</td>
            <td style="color:var(--gold-bright);font-family:var(--font-mono);">${Math.floor(h.gold)}</td>
            <td style="font-size:0.7rem;color:var(--text-secondary);">${itemsText}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <table class="scoreboard-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th>Герой</th>
            <th>Ур.</th>
            <th>У/С/П</th>
            <th>Крипы/Денай</th>
            <th>Золото</th>
            <th>Артефакты</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private renderMinimap(
    player: HeroRuntime,
    heroes: HeroRuntime[],
    creeps: CreepRuntime[],
    towers: TowerRuntime[],
    monsters: JungleMonsterRuntime[],
    wards: VisionWardRuntime[],
    outposts: OutpostRuntime[],
    pings: TacticalPing[],
    isHiddenFn: (h: HeroRuntime, viewerTeam: 'radiant' | 'dire') => boolean
  ): void {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const size = 174;
    const toMap = (val: number) => ((val / ARENA_HALF_SIZE) * 0.5 + 0.5) * size;

    ctx.fillStyle = '#0c141c';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(20, 118, 144, 0.55)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(toMap(-96), toMap(96));
    ctx.lineTo(toMap(96), toMap(-96));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 4;
    for (const key of ['mid', 'top', 'bot'] as const) {
      const pts = LANE_WAYPOINTS[key];
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(toMap(p.x), toMap(p.z));
        else ctx.lineTo(toMap(p.x), toMap(p.z));
      });
      ctx.stroke();
    }

    // Кусты засады на миникарте
    ctx.fillStyle = 'rgba(34, 197, 94, 0.36)';
    for (const b of AMBUSH_BRUSHES) {
      ctx.beginPath();
      ctx.arc(toMap(b.position.x), toMap(b.position.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Захватываемые Аванпосты
    for (const op of outposts) {
      ctx.fillStyle =
        op.owner === 'radiant' ? '#2dd4bf' : op.owner === 'dire' ? '#ef4444' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(toMap(op.position.x), toMap(op.position.z), 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Союзные Тотемы Обзора (Wards)
    for (const w of wards) {
      if (w.team !== player.team) continue;
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(toMap(w.position.x), toMap(w.position.z), 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(toMap(w.position.x) - 1.5, toMap(w.position.z) - 1.5, 3, 3);
    }

    for (const m of monsters) {
      if (!m.alive) continue;
      ctx.fillStyle =
        m.campType === 'titan_boss'
          ? '#f2cb78'
          : m.campType === 'elemental_turtle'
            ? '#2dd4bf'
            : '#eab308';
      const r = m.campType === 'titan_boss' || m.campType === 'elemental_turtle' ? 4.2 : 2.1;
      ctx.beginPath();
      ctx.arc(toMap(m.position.x), toMap(m.position.z), r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of creeps) {
      if (!c.alive) continue;
      ctx.fillStyle = c.team === 'radiant' ? '#2dd4bf' : '#ef4444';
      const s = c.creepType === 'lord_boss' ? 5.6 : 2.3;
      ctx.fillRect(toMap(c.position.x) - s * 0.5, toMap(c.position.z) - s * 0.5, s, s);
    }

    for (const t of towers) {
      if (!t.alive) continue;
      ctx.fillStyle = t.team === 'radiant' ? '#5eead4' : '#f87171';
      const s = t.tier === 4 ? 6.8 : 4.4;
      ctx.fillRect(toMap(t.position.x) - s * 0.5, toMap(t.position.z) - s * 0.5, s, s);
    }

    for (const h of heroes) {
      if (!h.alive) continue;
      if (h.team !== player.team && isHiddenFn(h, player.team)) continue;
      const mx = toMap(h.position.x);
      const mz = toMap(h.position.z);

      if (h.isPlayer) {
        const fwdAngle = Math.atan2(-Math.cos(h.yaw), -Math.sin(h.yaw));
        ctx.fillStyle = 'rgba(242, 203, 120, 0.22)';
        ctx.beginPath();
        ctx.moveTo(mx, mz);
        ctx.arc(mx, mz, 20, fwdAngle - 0.5, fwdAngle + 0.5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = h.isPlayer ? '#ffffff' : h.team === 'radiant' ? '#2dd4bf' : '#ef4444';
      ctx.beginPath();
      ctx.arc(mx, mz, h.isPlayer ? 4.2 : 3.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of pings) {
      const px = toMap(p.position.x);
      const pz = toMap(p.position.z);
      ctx.strokeStyle = p.kind === 'retreat' ? '#ef4444' : '#f2cb78';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, pz, 6 + Math.sin(performance.now() * 0.015) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private updateWorldFloatingMarkers(
    dt: number,
    player: HeroRuntime,
    heroes: HeroRuntime[],
    creeps: CreepRuntime[],
    towers: TowerRuntime[],
    monsters: JungleMonsterRuntime[],
    camera: THREE.PerspectiveCamera,
    isHiddenFn: (h: HeroRuntime, viewerTeam: 'radiant' | 'dire') => boolean
  ): void {
    const activeIds = new Set<string>();
    const w = window.innerWidth;
    const h = window.innerHeight;

    const projectAndRender = (
      id: string,
      worldX: number,
      worldY: number,
      worldZ: number,
      hp: number,
      maxHp: number,
      label: string,
      barStyle: 'ally' | 'enemy' | 'boss',
      sizeClass: 'hero' | 'creep' | 'boss',
      ccLabel = '',
      deniable = false
    ) => {
      const distSq = (worldX - player.position.x) ** 2 + (worldZ - player.position.z) ** 2;
      const maxDist = sizeClass === 'creep' ? 32 : 54;
      if (distSq > maxDist * maxDist) return;

      this.projVec.set(worldX, worldY, worldZ).project(camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) return;

      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;
      if (sx < -60 || sx > w + 60 || sy < -40 || sy > h + 40) return;

      activeIds.add(id);
      let tag = this.unitTagMap.get(id);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = `world-hp-tag ${sizeClass === 'creep' ? 'is-creep' : sizeClass === 'boss' ? 'is-boss' : ''}`;
        tag.innerHTML = `
          <span class="world-cc-badge" style="display:none;"></span>
          <span class="world-hp-name"></span>
          <div class="world-hp-track"><div class="world-hp-fill ${barStyle}"></div></div>
        `;
        this.markersRoot.appendChild(tag);
        this.unitTagMap.set(id, tag);
      }

      tag.classList.toggle('is-deniable', deniable);
      tag.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      const nameEl = tag.querySelector('.world-hp-name') as HTMLElement;
      const fillEl = tag.querySelector('.world-hp-fill') as HTMLElement;
      const ccEl = tag.querySelector('.world-cc-badge') as HTMLElement;

      if (nameEl) nameEl.textContent = label;
      if (fillEl) {
        const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
        fillEl.style.width = `${pct}%`;
      }
      if (ccEl) {
        if (ccLabel) {
          ccEl.style.display = 'block';
          ccEl.textContent = ccLabel;
        } else {
          ccEl.style.display = 'none';
        }
      }
    };

    for (const hero of heroes) {
      if (!hero.alive || hero.isPlayer) continue;
      if (hero.team !== player.team && isHiddenFn(hero, player.team)) continue;

      const cc = hero.statuses.some((s) => s.type === 'bkb_immune')
        ? 'BKB ИММУН'
        : hero.statuses.some((s) => s.type === 'cyclone_invuln')
          ? 'ВЕТРА'
          : hero.statuses.some((s) => s.type === 'stun' || s.type === 'knockup')
            ? 'ОГЛУШЁН'
            : hero.statuses.some((s) => s.type === 'silence')
              ? 'БЕЗМОЛВИЕ'
              : '';
      projectAndRender(
        hero.id,
        hero.position.x,
        hero.position.y + 2.85,
        hero.position.z,
        hero.hp,
        hero.stats.maxHp,
        `[${hero.level}] ${hero.heroDef.name}`,
        hero.team === player.team ? 'ally' : 'enemy',
        'hero',
        cc
      );
    }

    for (const c of creeps) {
      if (!c.alive) continue;
      if (c.creepType === 'lord_boss') {
        projectAndRender(
          c.id,
          c.position.x,
          5.6,
          c.position.z,
          c.hp,
          c.maxHp,
          '⚡ ШТУРМОВОЙ ЛОРД-ТИТАН',
          c.team === player.team ? 'ally' : 'enemy',
          'boss'
        );
        continue;
      }
      if (c.hp >= c.maxHp) continue;
      const canDeny = c.team === player.team && c.hp / c.maxHp < 0.45;
      projectAndRender(
        c.id,
        c.position.x,
        c.position.y + 2.0,
        c.position.z,
        c.hp,
        c.maxHp,
        canDeny ? '! ДЕНАЙ' : '',
        c.team === player.team ? 'ally' : 'enemy',
        'creep',
        '',
        canDeny
      );
    }

    for (const tw of towers) {
      if (!tw.alive) continue;
      projectAndRender(
        tw.id,
        tw.position.x,
        tw.tier === 4 ? 8.2 : 8.6,
        tw.position.z,
        tw.hp,
        tw.maxHp,
        tw.name,
        tw.team === player.team ? 'ally' : 'enemy',
        tw.tier === 4 ? 'boss' : 'hero',
        tw.disabledTimer > 0 ? 'ОГЛУШЕНА ЛОРДОМ' : ''
      );
    }

    for (const m of monsters) {
      if (!m.alive) continue;
      const isMajor = m.campType === 'titan_boss' || m.campType === 'elemental_turtle';
      projectAndRender(
        m.id,
        m.position.x,
        isMajor ? 5.6 : 3.4,
        m.position.z,
        m.hp,
        m.maxHp,
        m.name,
        'boss',
        isMajor ? 'boss' : 'hero'
      );
    }

    for (const [id, el] of this.unitTagMap.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.unitTagMap.delete(id);
      }
    }

    for (let i = this.floatingDamages.length - 1; i >= 0; i--) {
      const fd = this.floatingDamages[i];
      fd.life -= dt;
      if (fd.life <= 0) {
        fd.el.remove();
        this.floatingDamages.splice(i, 1);
        continue;
      }
      fd.worldPos.y += dt * 1.9;
      this.projVec.copy(fd.worldPos).project(camera);
      if (this.projVec.z > 1) {
        fd.el.style.opacity = '0';
        continue;
      }
      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;
      fd.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      fd.el.style.opacity = String(fd.life / fd.maxLife);
    }
  }

  public clearWorldMarkers(): void {
    this.unitTagMap.forEach((el) => el.remove());
    this.unitTagMap.clear();
    this.floatingDamages.forEach((fd) => fd.el.remove());
    this.floatingDamages = [];
  }
}
