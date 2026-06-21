(function attachPumpStorage(global) {
  "use strict";

  const STORAGE_KEY = "pumpRules";
  const SOUND_SETTINGS_KEY = "pumpSoundSettings";
  const VISUAL_SETTINGS_KEY = "pumpVisualSettings";
  const OVERLAY_LAUNCH_COUNTER_KEY = "pumpOverlayLaunchCounter";
  const MAX_LIMIT_MINUTES = 1440;
  const MIN_LIMIT_MINUTES = 0.1;
  const MAX_GIF_URL_LENGTH = 2048;
  const DEFAULT_SOUND_SETTINGS = {
    enabled: true,
    volume: 0.35,
    fileName: "",
    audioMimeType: "",
    audioDataUrl: "",
    importedAt: 0
  };
  const DEFAULT_VISUAL_SETTINGS = {
    backgroundGifUrl: "",
    updatedAt: 0
  };

  function getChromeStorage() {
    return global.chrome && global.chrome.storage && global.chrome.storage.local
      ? global.chrome.storage.local
      : null;
  }

  function getChromeRuntimeError() {
    return global.chrome && global.chrome.runtime && global.chrome.runtime.lastError
      ? global.chrome.runtime.lastError
      : null;
  }

  function generateRuleId() {
    return `pump_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeLimitMinutes(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    const clamped = Math.min(MAX_LIMIT_MINUTES, Math.max(MIN_LIMIT_MINUTES, parsed));
    return Math.round(clamped * 100) / 100;
  }

  function normalizeVolume(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return DEFAULT_SOUND_SETTINGS.volume;
    }

    return Math.round(Math.min(1, Math.max(0, parsed)) * 100) / 100;
  }

  function normalizeBackgroundGifUrl(value) {
    const rawValue = String(value || "").trim();

    if (!rawValue) {
      return "";
    }

    if (rawValue.length > MAX_GIF_URL_LENGTH) {
      return "";
    }

    try {
      const parsed = new URL(rawValue);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return "";
      }

      return parsed.href;
    } catch (_error) {
      return "";
    }
  }

  function sanitizeSoundSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return { ...DEFAULT_SOUND_SETTINGS };
    }

    return {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume: normalizeVolume(settings.volume),
      fileName: typeof settings.fileName === "string" ? settings.fileName.slice(0, 180) : "",
      audioMimeType: typeof settings.audioMimeType === "string" ? settings.audioMimeType.slice(0, 80) : "",
      audioDataUrl: typeof settings.audioDataUrl === "string" && settings.audioDataUrl.startsWith("data:audio/")
        ? settings.audioDataUrl
        : "",
      importedAt: Number.isFinite(Number(settings.importedAt)) ? Number(settings.importedAt) : 0
    };
  }

  function sanitizeVisualSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return { ...DEFAULT_VISUAL_SETTINGS };
    }

    return {
      backgroundGifUrl: normalizeBackgroundGifUrl(settings.backgroundGifUrl),
      updatedAt: Number.isFinite(Number(settings.updatedAt)) ? Number(settings.updatedAt) : 0
    };
  }

  function sanitizeRule(rule) {
    if (!rule || typeof rule !== "object") {
      return null;
    }

    const hostname = global.PumpUrl ? global.PumpUrl.normalizeHostname(rule.hostname) : "";
    const limitMinutes = normalizeLimitMinutes(rule.limitMinutes);

    if (!hostname || limitMinutes === null) {
      return null;
    }

    return {
      id: typeof rule.id === "string" && rule.id ? rule.id : generateRuleId(),
      hostname,
      limitMinutes,
      enabled: rule.enabled !== false,
      createdAt: Number.isFinite(Number(rule.createdAt)) ? Number(rule.createdAt) : Date.now()
    };
  }

  function sortRules(rules) {
    return [...rules].sort((a, b) => a.hostname.localeCompare(b.hostname));
  }

  function readFromFallbackStorage(key, defaultValue) {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (_error) {
      return defaultValue;
    }
  }

  function writeToFallbackStorage(key, value) {
    if (!global.localStorage) {
      return;
    }

    global.localStorage.setItem(key, JSON.stringify(value));
  }

  function readStoredValue(key, defaultValue) {
    const storage = getChromeStorage();

    if (!storage) {
      return Promise.resolve(readFromFallbackStorage(key, defaultValue));
    }

    return new Promise((resolve, reject) => {
      storage.get({ [key]: defaultValue }, (items) => {
        const error = getChromeRuntimeError();

        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(items[key]);
      });
    });
  }

  function writeStoredValue(key, value) {
    const storage = getChromeStorage();

    if (!storage) {
      writeToFallbackStorage(key, value);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      storage.set({ [key]: value }, () => {
        const error = getChromeRuntimeError();

        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  async function getRules() {
    const rawRules = await readStoredValue(STORAGE_KEY, []);
    const cleanRules = Array.isArray(rawRules)
      ? rawRules.map(sanitizeRule).filter(Boolean)
      : [];

    return sortRules(cleanRules);
  }

  async function saveRules(rules) {
    const cleanRules = Array.isArray(rules)
      ? rules.map(sanitizeRule).filter(Boolean)
      : [];

    await writeStoredValue(STORAGE_KEY, sortRules(cleanRules));
    return sortRules(cleanRules);
  }

  async function getSoundSettings() {
    const rawSettings = await readStoredValue(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
    return sanitizeSoundSettings(rawSettings);
  }

  async function saveSoundSettings(settings) {
    const cleanSettings = sanitizeSoundSettings(settings);
    await writeStoredValue(SOUND_SETTINGS_KEY, cleanSettings);
    return cleanSettings;
  }

  async function updateSoundSettings(patch) {
    const currentSettings = await getSoundSettings();
    return saveSoundSettings({ ...currentSettings, ...patch });
  }

  async function getVisualSettings() {
    const rawSettings = await readStoredValue(VISUAL_SETTINGS_KEY, DEFAULT_VISUAL_SETTINGS);
    return sanitizeVisualSettings(rawSettings);
  }

  async function saveVisualSettings(settings) {
    const cleanSettings = sanitizeVisualSettings(settings);
    await writeStoredValue(VISUAL_SETTINGS_KEY, cleanSettings);
    return cleanSettings;
  }

  async function updateVisualSettings(patch) {
    const currentSettings = await getVisualSettings();
    return saveVisualSettings({ ...currentSettings, ...patch, updatedAt: Date.now() });
  }

  async function nextOverlayLaunchIndex() {
    const currentValue = Number(await readStoredValue(OVERLAY_LAUNCH_COUNTER_KEY, 0));
    const nextValue = Number.isFinite(currentValue) ? currentValue + 1 : 1;

    await writeStoredValue(OVERLAY_LAUNCH_COUNTER_KEY, nextValue);
    return nextValue;
  }

  async function upsertRuleFromInput(input, limitMinutes) {
    const hostname = global.PumpUrl ? global.PumpUrl.normalizeHostname(input) : "";
    const normalizedLimit = normalizeLimitMinutes(limitMinutes);

    if (!hostname) {
      throw new Error("Enter a valid website, like instagram.com or reddit.com/r/popular.");
    }

    if (normalizedLimit === null) {
      throw new Error("Enter a time limit in minutes.");
    }

    const rules = await getRules();
    const existingRule = rules.find((rule) => rule.hostname === hostname);
    const nextRule = existingRule
      ? { ...existingRule, limitMinutes: normalizedLimit, enabled: true }
      : {
          id: generateRuleId(),
          hostname,
          limitMinutes: normalizedLimit,
          enabled: true,
          createdAt: Date.now()
        };

    const nextRules = existingRule
      ? rules.map((rule) => (rule.id === existingRule.id ? nextRule : rule))
      : [...rules, nextRule];

    await saveRules(nextRules);

    return {
      rule: nextRule,
      rules: sortRules(nextRules),
      updatedExisting: Boolean(existingRule)
    };
  }

  async function updateRule(id, patch) {
    const rules = await getRules();
    let found = false;

    const nextRules = rules.map((rule) => {
      if (rule.id !== id) {
        return rule;
      }

      found = true;
      const updatedRule = { ...rule, ...patch };

      if (patch && Object.prototype.hasOwnProperty.call(patch, "hostname")) {
        updatedRule.hostname = global.PumpUrl.normalizeHostname(patch.hostname);
      }

      if (patch && Object.prototype.hasOwnProperty.call(patch, "limitMinutes")) {
        updatedRule.limitMinutes = normalizeLimitMinutes(patch.limitMinutes);
      }

      return updatedRule;
    });

    if (!found) {
      throw new Error("That Pump! rule no longer exists.");
    }

    return saveRules(nextRules);
  }

  async function deleteRule(id) {
    const rules = await getRules();
    const nextRules = rules.filter((rule) => rule.id !== id);
    return saveRules(nextRules);
  }

  function onRulesChanged(callback) {
    if (
      !global.chrome ||
      !global.chrome.storage ||
      !global.chrome.storage.onChanged ||
      typeof callback !== "function"
    ) {
      return function noop() {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }

      const newValue = changes[STORAGE_KEY].newValue || [];
      const cleanRules = Array.isArray(newValue)
        ? newValue.map(sanitizeRule).filter(Boolean)
        : [];

      callback(sortRules(cleanRules));
    };

    global.chrome.storage.onChanged.addListener(listener);

    return () => {
      global.chrome.storage.onChanged.removeListener(listener);
    };
  }

  function onSoundSettingsChanged(callback) {
    if (
      !global.chrome ||
      !global.chrome.storage ||
      !global.chrome.storage.onChanged ||
      typeof callback !== "function"
    ) {
      return function noop() {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[SOUND_SETTINGS_KEY]) {
        return;
      }

      callback(sanitizeSoundSettings(changes[SOUND_SETTINGS_KEY].newValue));
    };

    global.chrome.storage.onChanged.addListener(listener);

    return () => {
      global.chrome.storage.onChanged.removeListener(listener);
    };
  }

  function onVisualSettingsChanged(callback) {
    if (
      !global.chrome ||
      !global.chrome.storage ||
      !global.chrome.storage.onChanged ||
      typeof callback !== "function"
    ) {
      return function noop() {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[VISUAL_SETTINGS_KEY]) {
        return;
      }

      callback(sanitizeVisualSettings(changes[VISUAL_SETTINGS_KEY].newValue));
    };

    global.chrome.storage.onChanged.addListener(listener);

    return () => {
      global.chrome.storage.onChanged.removeListener(listener);
    };
  }

  global.PumpStorage = {
    STORAGE_KEY,
    SOUND_SETTINGS_KEY,
    VISUAL_SETTINGS_KEY,
    OVERLAY_LAUNCH_COUNTER_KEY,
    getRules,
    saveRules,
    getSoundSettings,
    saveSoundSettings,
    updateSoundSettings,
    getVisualSettings,
    saveVisualSettings,
    updateVisualSettings,
    nextOverlayLaunchIndex,
    upsertRuleFromInput,
    updateRule,
    deleteRule,
    onRulesChanged,
    onSoundSettingsChanged,
    onVisualSettingsChanged,
    normalizeVolume,
    normalizeLimitMinutes,
    normalizeBackgroundGifUrl
  };
})(globalThis);
