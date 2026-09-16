// medal_system.js —— 生涯击杀勋章、枪械专精勋章与挑战成就：状态与本地持久化
// 只处理数据，不依赖 HUD、Canvas 或小红书 SDK；界面和分享失败不能影响击杀进度。
(function (root) {
  'use strict';

  // v3：新增 challenges（挑战成就一次性解锁）；weaponKills 扩展为可记录全部武器。
  // v4：新增 bests（生涯高光：最长连杀/爆头数/守到波次），旧档迁移自动补 0。
  const SCHEMA_VERSION = 4;
  const MAX_WEAPON_KEYS = 16;

  function freshState() {
    return {
      version: SCHEMA_VERSION,
      careerKills: 0,
      announcedMedals: [],
      weaponKills: {},
      challenges: [],
      bests: { chain: 0, headshots: 0, wave: 0 },
    };
  }

  // 生涯高光清洗：只保留安全非负整数，缺字段/非法值补 0（兼容 v1~v3 旧档）。
  function normalizeBests(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const key of ['chain', 'headshots', 'wave']) {
      const value = Number(raw[key]);
      out[key] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }
    return out;
  }

  function normalizeMedals(input) {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .filter((medal) => medal && typeof medal.id === 'string' && medal.id &&
        Number.isSafeInteger(medal.kills) && medal.kills > 0 && !seen.has(medal.id) && seen.add(medal.id))
      .map((medal) => Object.freeze({ ...medal }))
      .sort((a, b) => a.kills - b.kills);
  }

  function normalizeWeaponMedals(input) {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .filter((medal) => medal && typeof medal.id === 'string' && medal.id &&
        typeof medal.weaponId === 'string' && medal.weaponId && !seen.has(medal.id) && seen.add(medal.id))
      .map((medal) => Object.freeze({ ...medal, type: 'weapon' }));
  }

  function normalizeChallenges(input) {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .filter((medal) => medal && typeof medal.id === 'string' && medal.id &&
        !seen.has(medal.id) && seen.add(medal.id))
      .map((medal) => Object.freeze({
        id: medal.id,
        type: 'challenge',
        title: typeof medal.title === 'string' ? medal.title : medal.id,
        desc: typeof medal.desc === 'string' ? medal.desc : '',
        accent: typeof medal.accent === 'string' ? medal.accent : '#3d8996',
      }));
  }

  function sanitizeState(value, medalIds, weaponMedalIds, challengeIds) {
    if (!value || typeof value !== 'object') return freshState();
    const rawKills = Number(value.careerKills);
    const careerKills = Number.isSafeInteger(rawKills) && rawKills >= 0 ? rawKills : 0;
    const announced = Array.isArray(value.announcedMedals) ? value.announcedMedals : [];
    const allIds = new Set([...medalIds, ...weaponMedalIds, ...challengeIds]);
    const validAnnounced = Array.from(new Set(announced.filter((id) => allIds.has(id))));
    // weaponKills：任意武器计数（近战/手雷挑战需要），只保留安全非负整数，键数封顶。
    const weaponKills = {};
    const rawWeaponKills = value.weaponKills && typeof value.weaponKills === 'object' ? value.weaponKills : {};
    for (const weaponId of Object.keys(rawWeaponKills)) {
      if (Object.keys(weaponKills).length >= MAX_WEAPON_KEYS) break;
      const kills = Number(rawWeaponKills[weaponId]);
      if (typeof weaponId === 'string' && weaponId &&
        Number.isSafeInteger(kills) && kills >= 0) {
        weaponKills[weaponId] = kills;
      }
    }
    // 兼容 v1/v2 旧档：为专精勋章的武器补零，保留可读的计数完整性。
    for (const weaponId of weaponMedalIds) {
      if (!(weaponId in weaponKills)) weaponKills[weaponId] = 0;
    }
    // challenges：旧档无此字段 → 空数组；只保留已注册挑战的解锁标记。
    const unlockedChallenges = Array.isArray(value.challenges) ? value.challenges : [];
    const validChallenges = Array.from(new Set(unlockedChallenges.filter((id) => challengeIds.has(id))));
    // bests：旧档（v1~v3）无此字段 → 全 0；非法值同样按 0 处理。
    const bests = normalizeBests(value.bests);
    return {
      version: SCHEMA_VERSION,
      careerKills,
      announcedMedals: validAnnounced,
      weaponKills,
      challenges: validChallenges,
      bests,
    };
  }

  class MedalSystem {
    constructor(options = {}) {
      this.medals = normalizeMedals(options.medals);
      if (!this.medals.length) throw new Error('MedalSystem requires at least one valid medal');
      this.weaponMedals = normalizeWeaponMedals(options.weaponMedals);
      this.challenges = normalizeChallenges(options.challenges);
      this.weaponMasteryKills = Math.max(1, Math.floor(Number(options.weaponMasteryKills) || 100));
      this.storageKey = options.storageKey || 'cs15_medals_v1';
      this._medalIds = new Set(this.medals.map((medal) => medal.id));
      this._weaponMedalIds = new Set(this.weaponMedals.map((medal) => medal.id));
      this._challengeIds = new Set(this.challenges.map((medal) => medal.id));
      this._medalByWeapon = new Map();
      for (const medal of this.weaponMedals) this._medalByWeapon.set(medal.weaponId, medal);
      this._storage = null;
      this.persistenceAvailable = true;
      try {
        this._storage = options.storage !== undefined ? options.storage : root.localStorage;
      } catch (error) {
        this.persistenceAvailable = false;
      }
      this.state = this._load();
    }

    _load() {
      if (!this._storage || typeof this._storage.getItem !== 'function') {
        this.persistenceAvailable = false;
        return freshState();
      }
      try {
        const raw = this._storage.getItem(this.storageKey);
        return raw
          ? sanitizeState(JSON.parse(raw), this._medalIds, this._weaponMedalIds, this._challengeIds)
          : freshState();
      } catch (error) {
        this.persistenceAvailable = false;
        return freshState();
      }
    }

    _save() {
      if (!this._storage || typeof this._storage.setItem !== 'function') {
        this.persistenceAvailable = false;
        return false;
      }
      try {
        this._storage.setItem(this.storageKey, JSON.stringify(this.state));
        this.persistenceAvailable = true;
        return true;
      } catch (error) {
        this.persistenceAvailable = false;
        return false;
      }
    }

    // metadata: { weaponId } 由武器系统的击杀回调传入；缺失时只累计生涯击杀。
    // weaponKills 记录任意武器（近战/手雷挑战需要），专精解锁判定仍只看注册过的武器。
    recordKill(metadata = {}) {
      const previousKills = this.state.careerKills;
      const nextKills = Math.min(Number.MAX_SAFE_INTEGER, previousKills + 1);
      this.state.careerKills = nextKills;
      const unlocked = this.medals.filter((medal) => previousKills < medal.kills && nextKills >= medal.kills);

      const weaponId = typeof metadata.weaponId === 'string' && metadata.weaponId ? metadata.weaponId : '';
      const weaponMedal = weaponId ? this._medalByWeapon.get(weaponId) : null;
      let unlockedWeapons = [];
      if (weaponId) {
        const previous = this.state.weaponKills[weaponId] || 0;
        const next = Math.min(Number.MAX_SAFE_INTEGER, previous + 1);
        this.state.weaponKills[weaponId] = next;
        if (weaponMedal && previous < this.weaponMasteryKills && next >= this.weaponMasteryKills) {
          unlockedWeapons = [weaponMedal];
        }
      }

      this._save();
      return {
        previousKills,
        careerKills: nextKills,
        unlocked,
        unlockedWeapons,
        metadata: { ...metadata },
        persisted: this.persistenceAvailable,
      };
    }

    // 挑战成就一次性解锁：已解锁返回 false，首次解锁写入存档并返回 true。
    recordChallenge(id) {
      if (!this._challengeIds.has(id) || this.state.challenges.includes(id)) return false;
      this.state.challenges.push(id);
      this._save();
      return true;
    }

    // V4 终局生涯高光：对 连杀/爆头/守到波次 各取生涯最大值并持久化（就地更新，不整体替换）。
    // 非法输入（负数/小数/缺失）逐字段忽略，不影响其他字段与其他存档数据。
    recordRunStats(stats) {
      const src = stats && typeof stats === 'object' ? stats : {};
      const bests = this.state.bests;
      let changed = false;
      for (const key of ['chain', 'headshots', 'wave']) {
        const value = Math.floor(Number(src[key]));
        if (!Number.isSafeInteger(value) || value < 0) continue;
        if (value > bests[key]) {
          bests[key] = value;
          changed = true;
        }
      }
      if (changed) this._save();
      return { bests: { ...bests }, changed, persisted: this.persistenceAvailable };
    }

    // 生涯高光读取接口（分享卡等外部展示用）；返回副本，调用方改动不影响存档。
    getBests() {
      return { ...this.state.bests };
    }

    isChallengeUnlocked(id) {
      return this.state.challenges.includes(id);
    }

    markAnnounced(id) {
      if ((!this._medalIds.has(id) && !this._weaponMedalIds.has(id) && !this._challengeIds.has(id)) ||
        this.state.announcedMedals.includes(id)) return false;
      this.state.announcedMedals.push(id);
      this._save();
      return true;
    }

    pendingAnnouncements() {
      const announced = new Set(this.state.announcedMedals);
      const pending = this.medals.filter((medal) => medal.kills <= this.state.careerKills && !announced.has(medal.id));
      for (const medal of this.weaponMedals) {
        if ((this.state.weaponKills[medal.weaponId] || 0) >= this.weaponMasteryKills && !announced.has(medal.id)) {
          pending.push(medal);
        }
      }
      for (const medal of this.challenges) {
        if (this.state.challenges.includes(medal.id) && !announced.has(medal.id)) pending.push(medal);
      }
      return pending;
    }

    getMedal(id) {
      return this.medals.find((medal) => medal.id === id) ||
        this.weaponMedals.find((medal) => medal.id === id) ||
        this.challenges.find((medal) => medal.id === id) || null;
    }

    getProgress() {
      const kills = this.state.careerKills;
      return this.medals.map((medal) => ({ ...medal, unlocked: kills >= medal.kills }));
    }

    getWeaponProgress() {
      return this.weaponMedals.map((medal) => {
        const kills = this.state.weaponKills[medal.weaponId] || 0;
        return { ...medal, kills, threshold: this.weaponMasteryKills, unlocked: kills >= this.weaponMasteryKills };
      });
    }

    getChallengeProgress() {
      return this.challenges.map((medal) => ({ ...medal, unlocked: this.state.challenges.includes(medal.id) }));
    }

    weaponKillsOf(weaponId) {
      return this.state.weaponKills[weaponId] || 0;
    }

    getNextMedal() {
      return this.medals.find((medal) => this.state.careerKills < medal.kills) || null;
    }

    snapshot() {
      return {
        version: SCHEMA_VERSION,
        careerKills: this.state.careerKills,
        announcedMedals: this.state.announcedMedals.slice(),
        weaponKills: { ...this.state.weaponKills },
        challenges: this.state.challenges.slice(),
        bests: { ...this.state.bests },
        persistenceAvailable: this.persistenceAvailable,
      };
    }
  }

  root.MedalSystem = MedalSystem;
  root.CS15MedalState = Object.freeze({ SCHEMA_VERSION, freshState, sanitizeState });
})(typeof window !== 'undefined' ? window : globalThis);
