// loadout.js —— 出战配置（武器携带勾选 + 首发选择）的存取、校验与背包清单
// 纯数据模块：不依赖 DOM/THREE，供启动菜单、WeaponSystem 和测试直接使用。
// 武器全集按 CONFIG.weapons[id].slot 动态生成，新增武器自动进入选择页。
// 经典脚本：config.js 之后、main.js 之前加载，经 window.CS15Loadout 暴露。
(function (root) {
  'use strict';

  function config() {
    return (root.CONFIG && root.CONFIG.loadout) || {};
  }

  function weapons() {
    return (root.CONFIG && root.CONFIG.weapons) || {};
  }

  // 全部武器按槽位升序（usp=1 … grenade=6），与数字键/HUD 槽位顺序一致。
  function allWeaponIds() {
    return Object.keys(weapons())
      .filter((id) => weapons()[id])
      .sort((a, b) => (weapons()[a].slot || 0) - (weapons()[b].slot || 0));
  }

  function isFirearm(id) {
    const w = weapons()[id];
    return !!w && (!w.kind || w.kind === 'firearm');
  }

  function bySlot(a, b) {
    return (weapons()[a].slot || 0) - (weapons()[b].slot || 0);
  }

  function defaults() {
    const all = allWeaponIds();
    return {
      carried: all.slice(),
      start: all.includes('usp') ? 'usp' : (all.find(isFirearm) || all[0] || ''),
    };
  }

  // 逐项校验：未知武器剔除、携带集保底非空（空则回退全带）、首发必须在携带集内
  // 且优先是把火器。损坏的 localStorage 不能阻断开局。
  function normalize(value) {
    const all = allWeaponIds();
    const source = value && typeof value === 'object' ? value : {};
    const seen = new Set();
    const carried = (Array.isArray(source.carried) ? source.carried : [])
      .filter((id) => id && all.indexOf(id) >= 0 && !seen.has(id) && seen.add(id))
      .sort(bySlot);
    const result = {
      carried: carried.length ? carried : all.slice(),
    };
    result.start = source.start && result.carried.indexOf(source.start) >= 0
      ? source.start
      : (result.carried.find(isFirearm) || result.carried[0] || '');
    return result;
  }

  function storageKey() {
    return config().storageKey || 'cs15_loadout_v1';
  }

  function load(storage) {
    let raw = null;
    try {
      const text = storage && typeof storage.getItem === 'function' ? storage.getItem(storageKey()) : null;
      raw = text ? JSON.parse(text) : null;
    } catch (error) {
      raw = null;
    }
    return normalize(raw);
  }

  function save(storage, value) {
    try {
      if (storage && typeof storage.setItem === 'function') {
        storage.setItem(storageKey(), JSON.stringify(normalize(value)));
        return true;
      }
    } catch (error) {
      // localStorage 不可用时只影响记忆选择，不影响本局。
    }
    return false;
  }

  // 本局携带清单（槽位升序）。数字键 N 与 HUD 槽位都使用这份顺序。
  function inventoryOf(value) {
    return normalize(value).carried.slice();
  }

  // 开局手持武器（必须在携带清单内）。
  function startingWeaponOf(value) {
    return normalize(value).start;
  }

  root.CS15Loadout = Object.freeze({
    allWeaponIds,
    defaults,
    normalize,
    load,
    save,
    inventoryOf,
    startingWeaponOf,
  });
})(typeof window !== 'undefined' ? window : globalThis);
