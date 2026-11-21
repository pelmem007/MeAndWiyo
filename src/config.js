// Главный файл настроек игры.
// Чтобы поменять имена, просто измени CREATOR_NAME и FRIEND_NAME в кавычках.

export const CREATOR_NAME = 'Xyven';
export const FRIEND_NAME = 'Wiyo';

export const GAME_VERSION = '1.0';

// Префикс для комнат в PeerJS, чтобы наши 4-значные коды не пересекались с чужими
export const PEER_PREFIX = 'ostrova-ogney-v1-';

// Бесплатные публичные STUN-серверы для связи двух телефонов через мобильный интернет
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Символы для короткого кода комнаты (без похожих вроде 0/O и 1/I)
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

// Координаты пяти зон острова (центр и примерный радиус каждой зоны)
export const ISLAND_ZONES = [
  { id: 'village', x: 0, z: 36, radius: 26 },
  { id: 'forest', x: -34, z: 4, radius: 28 },
  { id: 'lake', x: 34, z: 6, radius: 28 },
  { id: 'ruins', x: -18, z: -34, radius: 26 },
  { id: 'observatory', x: 18, z: -42, radius: 28 },
];

// Пресеты кастомизации персонажа
export const CUSTOMIZATION_OPTIONS = {
  hairStyles: [
    { id: 'short', label: 'Короткая' },
    { id: 'bob', label: 'Каре' },
    { id: 'twintails', label: 'Хвостики' },
    { id: 'ponytail', label: 'Хвост сзади' },
  ],
  hairColors: [
    { id: 'chestnut', hex: '#4a352a' },
    { id: 'ink', hex: '#25293d' },
    { id: 'honey', hex: '#d89b52' },
    { id: 'coral', hex: '#d66d67' },
    { id: 'sky', hex: '#71a8d8' },
    { id: 'silver', hex: '#dce2ec' },
  ],
  eyeColors: [
    { id: 'amber', hex: '#c87d2e' },
    { id: 'ocean', hex: '#3876b8' },
    { id: 'emerald', hex: '#3b8c66' },
    { id: 'violet', hex: '#7557a8' },
    { id: 'graphite', hex: '#3a404f' },
  ],
  outfitStyles: [
    { id: 'tunic', label: 'Туника' },
    { id: 'hoodie', label: 'Толстовка' },
    { id: 'cloak', label: 'Плащ путника' },
  ],
  outfitColors: [
    { id: 'sunset', hex: '#e07a5f' },
    { id: 'sea', hex: '#3d7c98' },
    { id: 'moss', hex: '#528065' },
    { id: 'berry', hex: '#945276' },
    { id: 'cream', hex: '#ddd3c0' },
  ],
  accessories: [
    { id: 'none', label: 'Без всего' },
    { id: 'scarf', label: 'Тёплый шарф' },
    { id: 'beret', label: 'Берет' },
    { id: 'backpack', label: 'Рюкзачок' },
    { id: 'flower', label: 'Цветок у уха' },
  ],
};

export const DEFAULT_APPEARANCE = {
  hairStyle: 'short',
  hairColor: '#4a352a',
  eyeColor: '#3876b8',
  outfitStyle: 'hoodie',
  outfitColor: '#3d7c98',
  accessory: 'scarf',
};

export const DEFAULT_SETTINGS = {
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  sensitivity: 1.0,
  soundVolume: 0.75,
  musicVolume: 0.55,
  dayCycleSpeed: 1.0,
};
