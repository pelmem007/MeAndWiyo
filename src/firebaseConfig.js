// Запасной вариант мультиплеера через Firebase Realtime Database (бесплатный тариф Spark).
// Если мобильный интернет у одного из игроков блокирует прямой WebRTC,
// можно создать бесплатный проект в Firebase Console, включить Realtime Database
// в тестовом режиме и вставить ссылку сюда.

export const FIREBASE_FALLBACK_CONFIG = {
  // Поставь true, когда вставишь свою ссылку databaseURL ниже
  enabled: false,

  // Пример: 'https://my-island-game-default-rtdb.europe-west1.firebasedatabase.app'
  // Важно: без слэша в конце
  databaseURL: '',

  // Интервал обновления координат через базу (в миллисекундах)
  pollIntervalMs: 120,
};
