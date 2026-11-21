import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { SoundEngine } from './audio.js';
import { InputController } from './controls.js';
import { GameEngine } from './game.js';
import { NetworkManager } from './network.js';
import {
  clearProgress,
  loadAppearance,
  loadProgress,
  loadSettings,
  saveAppearance,
  saveProgress,
  saveSettings,
} from './storage.js';
import { TEXTS } from './texts.ru.js';
import { GameUI } from './ui.js';

// Регистрируем Service Worker для офлайн-работы и установки PWA
registerSW({ immediate: true });

const rootEl = document.getElementById('game-root');
let appearance = loadAppearance();
let settings = loadSettings();
let progress = loadProgress();

const sound = new SoundEngine();
sound.setVolumes(settings.soundVolume, settings.musicVolume);

const network = new NetworkManager();

let game = null;
let input = null;

const ui = new GameUI(rootEl, {
  onCreateRoom() {
    sound.playClick();
    const code = network.createRoom(appearance, progress);
    ui.showRoomCreatedPanel(code, network.isFirebaseConfigured());
  },
  onCreateRoomFirebase() {
    sound.playClick();
    network.startFirebaseRoom(true, '', appearance, progress);
    if (network.roomCode) {
      ui.showRoomCreatedPanel(network.roomCode, true);
    }
  },
  onCancelRoom() {
    sound.playClick();
    network.startSolo();
  },
  onJoinRoom(code) {
    sound.playClick();
    network.joinRoom(code, appearance);
  },
  onJoinRoomFirebase(code) {
    sound.playClick();
    const ok = network.startFirebaseRoom(false, code, appearance, progress);
    if (ok) {
      enterGameplay('guest');
    }
  },
  onEnterPlaying() {
    sound.playClick();
    enterGameplay(network.mode);
  },
  onStartSolo() {
    sound.playClick();
    network.startSolo();
    enterGameplay('solo');
  },
  onOpenCustomizer() {
    sound.playClick();
    game.setMode('customizer');
    ui.openCustomizer(
      appearance,
      (draft) => {
        appearance = { ...draft };
        game.updateLocalAppearance(appearance);
      },
      (finalApp) => {
        sound.playClick();
        appearance = { ...finalApp };
        saveAppearance(appearance);
        game.updateLocalAppearance(appearance);
        game.setMode('title');
        ui.showTitleScreen();
      }
    );
  },
  onOpenSettings(isInGame) {
    sound.playClick();
    if (isInGame) input.setEnabled(false);
    ui.openSettingsModal(
      settings,
      isInGame,
      (nextSettings) => {
        settings = { ...nextSettings };
        saveSettings(settings);
        sound.setVolumes(settings.soundVolume, settings.musicVolume);
        game.setSettings(settings);
      },
      (action) => {
        if (action === 'skipTime') {
          sound.playClick();
          game.skipTimeOfDay();
        } else if (action === 'resetSave') {
          sound.playClick();
          progress = clearProgress();
          game.progress = progress;
          game.syncWorldVisualsFromProgress(false);
          ui.updateHudProgress(progress, game.env.collectibles);
        } else if (action === 'exitToMenu') {
          sound.playClick();
          network.startSolo();
          game.setRemoteConnected(false);
          game.setMode('title');
          input.setEnabled(false);
          ui.showTitleScreen();
        } else if (action === 'resume') {
          if (isInGame && game.mode === 'playing') {
            input.setEnabled(true);
          }
        }
      }
    );
  },
  onOpenJournal() {
    sound.playClick();
    ui.openJournal(progress, game.env.collectibles);
  },
  onEnterPhotoMode() {
    sound.playClick();
    game.setMode('photo');
    ui.showPhotoMode();
  },
  onExitPhotoMode() {
    sound.playClick();
    game.setMode('playing');
    ui.showHUD(network.mode === 'solo');
  },
  onTakePhoto() {
    sound.playCollect();
    const dataUrl = game.captureScreenshot();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ostrov-foto-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    ui.showToast(TEXTS.photo.savedToast);
  },
  onJump() {
    sound.unlock();
    input?.triggerJump();
  },
  onInteract() {
    sound.unlock();
    game?.performContextInteract();
  },
  onSit() {
    sound.unlock();
    game?.trySitNearestBench();
  },
  onCallSpirit() {
    sound.unlock();
    game?.callEchoSpirit();
  },
  onEmote(em) {
    sound.unlock();
    game?.triggerEmote(em, false);
  },
  onSendChat(text) {
    sound.playClick();
    ui.appendChatMessage(TEXTS.chat.you, text);
    game?.showLocalBubble(text);
    network.sendReliable({ type: 'chat', text });
  },
});

function enterGameplay(netMode) {
  sound.unlock();
  game.setNetworkMode(netMode);
  game.setMode('playing');
  input.setEnabled(true);
  ui.showHUD(netMode === 'solo');
  ui.updateHudProgress(progress, game.env.collectibles);
  ui.updateHudZone(game.lastZone);
  ui.updateHudNetwork(
    netMode === 'solo' ? TEXTS.network.soloLabel : TEXTS.network.connected,
    network.pingMs,
    network.roomCode
  );
}

// Запускаем прогресс загрузки и инициализируем 3D сцену
ui.setLoadingProgress(30, 0);
window.setTimeout(() => {
  ui.setLoadingProgress(65, 1);
  game = new GameEngine(ui.canvasMount, {
    initialAppearance: appearance,
    initialProgress: progress,
    sound,
    callbacks: {
      onProgressChanged(nextProg) {
        progress = nextProg;
        saveProgress(progress);
        ui.updateHudProgress(progress, game.env.collectibles);
      },
      onZoneChange(zoneId) {
        ui.updateHudZone(zoneId);
      },
      onPromptChange(label) {
        ui.updateContextPrompt(label);
      },
      onOpenNpcDialogue(npcId) {
        ui.openDialogue(npcId, progress);
      },
      onToast(msg) {
        ui.showToast(msg);
      },
      onChatReceived(text) {
        ui.appendChatMessage(TEXTS.chat.partner, text);
      },
      onEndingReached() {
        ui.openCredits(progress, game.env.collectibles);
      },
      onSendState(state) {
        network.sendState(state);
      },
      onSendNet(msg) {
        network.sendReliable(msg);
      },
    },
  });

  game.setSettings(settings);

  const joyZone = ui.hud.querySelector('#joystick-zone');
  const joyKnob = ui.hud.querySelector('#joystick-knob');
  input = new InputController(game.getCanvas(), joyZone, joyKnob, (action) => {
    if (action === 'interact') game.performContextInteract();
    else if (action === 'wave') game.triggerEmote(TEXTS.emotes[0], false);
    else if (action === 'sit') game.trySitNearestBench();
    else if (action === 'journal') ui.openJournal(progress, game.env.collectibles);
    else if (action === 'photo') {
      game.setMode('photo');
      ui.showPhotoMode();
    } else if (action === 'pause') {
      ui.h.onOpenSettings(true);
    }
  });
  game.input = input;

  network.setCallbacks({
    onRoomReady(code) {
      ui.showRoomCreatedPanel(code, network.isFirebaseConfigured());
    },
    onPartnerJoined() {
      if (game.mode === 'title') {
        enterGameplay(network.mode);
      }
      ui.updateHudNetwork(TEXTS.network.connected, network.pingMs, network.roomCode);
    },
    onStatusChange(state, text) {
      ui.updateHudNetwork(text, network.pingMs, network.roomCode);
      const waitEl = ui.titleScreen.querySelector('#room-wait-status');
      if (waitEl && state === 'waiting') {
        waitEl.textContent = text;
      }
    },
    onPing(ms) {
      ui.updateHudNetwork(TEXTS.network.connected, ms, network.roomCode);
    },
    onRemoteState(state) {
      game.applyRemoteState(state);
    },
    onMessage(msg) {
      game.handleRemoteMessage(msg);
    },
    onPartnerLeft() {
      game.setRemoteConnected(false);
      ui.updateHudNetwork(TEXTS.network.reconnecting, 0, network.roomCode);
      ui.showSimpleNotice(TEXTS.network.partnerLeftTitle, TEXTS.network.partnerLeftBody);
    },
    onError(msg) {
      ui.showJoinError(msg);
    },
  });

  // Предварительная разблокировка звука на первом касании экрана
  window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

  ui.setLoadingProgress(100, 3);
  game.startLoop();
  ui.showTitleScreen();
  window.setTimeout(() => ui.hideLoading(), 260);
}, 80);

// Поворот персонажа свайпом в экране кастомизации
let custDragId = null;
let custLastX = 0;
ui.canvasMount.addEventListener('pointerdown', (e) => {
  if (game?.mode === 'customizer') {
    custDragId = e.pointerId;
    custLastX = e.clientX;
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId === custDragId && game?.mode === 'customizer') {
    const dx = e.clientX - custLastX;
    custLastX = e.clientX;
    game.rotatePreviewCharacter(dx);
  }
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerId === custDragId) custDragId = null;
});
