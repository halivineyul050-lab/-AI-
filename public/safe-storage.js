(() => {
  "use strict";

  function createSafeStorage(name) {
    const memory = new Map();
    let storage = null;
    try {
      storage = window[name];
      const probe = `__nike_storage_probe_${Math.random().toString(36).slice(2)}`;
      storage.setItem(probe, "1");
      storage.removeItem(probe);
    } catch {
      storage = null;
    }
    return {
      getItem(key) {
        try { return storage ? storage.getItem(key) : memory.get(String(key)) ?? null; }
        catch { return memory.get(String(key)) ?? null; }
      },
      setItem(key, value) {
        const normalizedKey = String(key), normalizedValue = String(value);
        try { if (storage) { storage.setItem(normalizedKey, normalizedValue); return; } } catch { storage = null; }
        memory.set(normalizedKey, normalizedValue);
      },
      removeItem(key) {
        const normalizedKey = String(key);
        try { if (storage) { storage.removeItem(normalizedKey); return; } } catch { storage = null; }
        memory.delete(normalizedKey);
      }
    };
  }

  window.nikaiStorage = {
    local: createSafeStorage("localStorage"),
    session: createSafeStorage("sessionStorage")
  };
})();
