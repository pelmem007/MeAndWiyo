import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from './config.js';

const STORAGE_KEYS = {
  appearance: 'island_lights_appearance_v1',
  settings: 'island_lights_settings_v1',
  progress: 'island_lights_progress_v1',
};

export function createInitialProgress() {
  return {
    litLanterns: [],
    completedQuests: [],
    collectedIds: [],
    satTogether: false,
    wavedOnce: false,
    talkedNpcs: [],
    ropeDropped: false,
    lakeBridgeOpen: false,
    ruinsBridgeOpen: false,
    creditsSeen: false,
  };
}

export function loadAppearance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.appearance);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(appearance) {
  try {
    localStorage.setItem(STORAGE_KEYS.appearance, JSON.stringify(appearance));
  } catch {
    // Игнорируем ошибку, если хранилище переполнено или закрыто
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch {
    // Игнорируем ошибку
  }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.progress);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    return { ...createInitialProgress(), ...parsed };
  } catch {
    return createInitialProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
  } catch {
    // Игнорируем ошибку
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEYS.progress);
  } catch {
    // Игнорируем ошибку
  }
  return createInitialProgress();
}
