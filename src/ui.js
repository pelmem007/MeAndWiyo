import {
  CREATOR_NAME,
  CUSTOMIZATION_OPTIONS,
  FRIEND_NAME,
} from './config.js';
import { formatText, sanitizeText, TEXTS } from './texts.ru.js';

// Хелпер для безопасного создания DOM-элементов с очисткой текста от запрещённых тире
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = sanitizeText(text);
  return node;
}

export class GameUI {
  constructor(rootEl, handlers) {
    this.root = rootEl;
    this.h = handlers;

    this.deferredInstallPrompt = null;
    this.isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    this.isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    this.chatMessages = [];
    this.dialogueState = null;
    this.confirmReset = false;

    this.buildDOM();
    this.bindPWAEVents();
    this.bindUIEvents();
  }

  buildDOM() {
    this.root.innerHTML = '';

    // 1. Контейнер под 3D WebGL холст (изолирован от перерисовок UI)
    this.canvasMount = el('div', 'absolute inset-0 w-full h-full z-0');
    this.root.appendChild(this.canvasMount);

    // 2. Экран загрузки
    this.loadingScreen = el(
      'div',
      'absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#181d34] px-6 text-center transition-opacity duration-300'
    );
    this.loadingScreen.innerHTML = `
      <div class="w-full max-w-md space-y-4">
        <div class="font-display text-2xl sm:text-3xl font-extrabold text-[#ffe6b8]">${sanitizeText(TEXTS.loading.title)}</div>
        <div id="loading-step" class="text-sm text-slate-300">${sanitizeText(TEXTS.loading.steps[0])}</div>
        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/10">
          <div id="loading-bar" class="h-full bg-[#ebb05c] transition-all duration-200" style="width: 15%"></div>
        </div>
        <div class="text-xs text-slate-400 pt-2">${sanitizeText(TEXTS.loading.tip)}</div>
      </div>
    `;
    this.root.appendChild(this.loadingScreen);

    // 3. Стартовый экран (Title Screen поверх заката у маяка)
    this.titleScreen = el(
      'div',
      'hidden absolute inset-0 z-30 safe-pad flex flex-col justify-between pointer-events-none'
    );
    const dedication = formatText(TEXTS.titleScreen.dedication, {
      creator: CREATOR_NAME,
      friend: FRIEND_NAME,
    });
    this.titleScreen.innerHTML = `
      <div class="flex items-start justify-between gap-4 pointer-events-auto">
        <div class="max-w-lg">
          <svg viewBox="0 0 420 68" class="w-72 sm:w-96 h-auto drop-shadow-[0_3px_10px_rgba(12,14,28,0.75)]" aria-label="${sanitizeText(TEXTS.titleScreen.gameTitle)}">
            <defs>
              <linearGradient id="titleGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#fff8e8"/>
                <stop offset="100%" stop-color="#ffd089"/>
              </linearGradient>
            </defs>
            <text x="0" y="42" fill="url(#titleGrad)" font-family="Nunito, sans-serif" font-weight="900" font-size="33" letter-spacing="-0.5">${sanitizeText(TEXTS.titleScreen.gameTitle)}</text>
            <rect x="0" y="54" width="76" height="3.5" rx="2" fill="#ebb05c"/>
          </svg>
          <p class="mt-1 text-sm sm:text-base font-semibold text-[#ffe8c2] drop-shadow">${dedication}</p>
          <p class="mt-0.5 text-[11px] sm:text-sm text-slate-200/90 max-w-md drop-shadow leading-snug">${sanitizeText(TEXTS.titleScreen.subtitle)}</p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button id="btn-install-pwa" class="hidden touch-target px-3.5 py-2 rounded-xl ui-btn-secondary text-xs sm:text-sm font-semibold whitespace-nowrap"></button>
          <button id="btn-title-settings" class="touch-target px-3.5 py-2 rounded-xl ui-btn-secondary text-xs sm:text-sm font-semibold whitespace-nowrap">${sanitizeText(TEXTS.titleScreen.btnSettings)}</button>
        </div>
      </div>

      <div id="title-main-actions" class="pointer-events-auto flex flex-col gap-2 max-w-xl">
        <div class="flex flex-wrap items-center gap-2">
          <button id="btn-create-room" class="touch-target px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl ui-btn-primary text-xs sm:text-base font-extrabold whitespace-nowrap shadow-lg">${sanitizeText(TEXTS.titleScreen.btnCreateRoom)}</button>
          <button id="btn-join-room" class="touch-target px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl ui-btn-secondary text-xs sm:text-base font-bold whitespace-nowrap">${sanitizeText(TEXTS.titleScreen.btnJoinRoom)}</button>
          <button id="btn-solo" class="touch-target px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl ui-btn-secondary text-xs sm:text-base font-semibold whitespace-nowrap">${sanitizeText(TEXTS.titleScreen.btnSolo)}</button>
          <button id="btn-customize" class="touch-target px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl ui-btn-secondary text-xs sm:text-base font-semibold whitespace-nowrap">${sanitizeText(TEXTS.titleScreen.btnCustomize)}</button>
        </div>
        <div class="text-[11px] sm:text-xs text-slate-200/80 drop-shadow">${sanitizeText(TEXTS.titleScreen.controlsHint)}</div>
      </div>

      <div id="title-room-panel" class="hidden pointer-events-auto ui-panel rounded-2xl p-4 sm:p-5 max-w-md max-h-[75vh] overflow-y-auto scroll-thin shadow-2xl space-y-3"></div>
    `;
    this.root.appendChild(this.titleScreen);

    // 4. Игровой HUD (не менее 85% чистого обзора)
    this.hud = el('div', 'hidden absolute inset-0 z-20 safe-pad pointer-events-none flex flex-col justify-between');
    this.hud.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="ui-panel rounded-xl px-3.5 py-2 pointer-events-auto max-w-[60vw]">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs sm:text-sm">
            <span id="hud-zone" class="font-display font-extrabold text-[#ffe4b5] whitespace-nowrap"></span>
            <span class="text-slate-400">/</span>
            <span id="hud-lanterns" class="font-tabular text-xs text-slate-200 whitespace-nowrap"></span>
            <span class="text-slate-400">/</span>
            <span id="hud-shards" class="font-tabular text-xs text-slate-200 whitespace-nowrap"></span>
          </div>
          <div id="hud-quest-line" class="text-[11px] sm:text-xs text-slate-300 truncate mt-0.5"></div>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          <div id="hud-net-badge" class="ui-panel rounded-xl px-2.5 py-2 text-[11px] sm:text-xs text-slate-200 font-tabular whitespace-nowrap"></div>
          <button id="btn-hud-journal" class="touch-target px-3 py-2 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnJournal)}</button>
          <button id="btn-hud-chat" class="touch-target px-3 py-2 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">Чат</button>
          <button id="btn-hud-photo" class="touch-target px-3 py-2 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnPhoto)}</button>
          <button id="btn-hud-pause" class="touch-target px-3 py-2 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnPause)}</button>
        </div>
      </div>

      <div class="flex flex-col items-center gap-2 mb-2">
        <div id="hud-interact-banner" class="hidden ui-panel rounded-xl px-4 py-1.5 text-xs sm:text-sm font-bold text-[#ffe4b5] shadow-lg"></div>
      </div>

      <div class="flex items-end justify-between w-full">
        <div id="joystick-zone" class="pointer-events-auto relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-900/45 border-2 border-white/20 flex items-center justify-center">
          <div id="joystick-knob" class="w-12 h-12 rounded-full bg-[#ebb05c]/85 border-2 border-[#fff3db] shadow-lg"></div>
        </div>

        <div class="pointer-events-auto flex flex-col items-end gap-2">
          <div id="emote-bar" class="hidden ui-panel rounded-xl p-1.5 flex items-center gap-1.5"></div>
          <div class="flex items-center gap-2">
            <button id="btn-act-spirit" class="hidden touch-target px-3.5 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnCallSpirit)}</button>
            <button id="btn-act-sit" class="touch-target px-3.5 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnSit)}</button>
            <button id="btn-act-wave" class="touch-target px-3.5 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnWave)}</button>
            <button id="btn-act-interact" class="touch-target px-4 py-3 rounded-xl ui-btn-secondary text-xs sm:text-sm font-extrabold whitespace-nowrap">${sanitizeText(TEXTS.hud.btnInteract)}</button>
            <button id="btn-act-jump" class="touch-target w-14 h-14 rounded-full ui-btn-primary text-xs font-black shadow-lg">${sanitizeText(TEXTS.hud.btnJump)}</button>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(this.hud);

    // 5. Рамка фоторежима
    this.photoOverlay = el('div', 'hidden absolute inset-0 z-30 safe-pad pointer-events-none flex flex-col justify-between');
    this.photoOverlay.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="w-8 h-8 border-t-4 border-l-4 border-white/80 rounded-tl-lg"></div>
        <div class="ui-panel rounded-xl px-4 py-1.5 text-xs text-slate-200">${sanitizeText(TEXTS.photo.hint)}</div>
        <div class="w-8 h-8 border-t-4 border-r-4 border-white/80 rounded-tr-lg"></div>
      </div>
      <div class="flex justify-between items-end">
        <div class="w-8 h-8 border-b-4 border-l-4 border-white/80 rounded-bl-lg"></div>
        <div class="flex items-center gap-2.5 pointer-events-auto">
          <button id="btn-photo-snap" class="touch-target px-5 py-3 rounded-xl ui-btn-primary text-sm font-extrabold">${sanitizeText(TEXTS.photo.takeShot)}</button>
          <button id="btn-photo-exit" class="touch-target px-4 py-3 rounded-xl ui-btn-secondary text-sm font-bold">${sanitizeText(TEXTS.photo.exit)}</button>
        </div>
        <div class="w-8 h-8 border-b-4 border-r-4 border-white/80 rounded-br-lg"></div>
      </div>
    `;
    this.root.appendChild(this.photoOverlay);

    // 6. Окно диалогов NPC
    this.dialogueOverlay = el('div', 'hidden absolute inset-x-0 bottom-4 z-40 px-4 flex justify-center pointer-events-none');
    this.dialogueOverlay.innerHTML = `
      <div class="pointer-events-auto ui-panel-solid rounded-2xl p-4 sm:p-5 w-full max-w-xl shadow-2xl space-y-3">
        <div class="flex items-center justify-between">
          <span id="dlg-name" class="font-display font-extrabold text-base sm:text-lg text-[#ffd894]"></span>
          <span id="dlg-step" class="font-tabular text-xs text-slate-400"></span>
        </div>
        <p id="dlg-text" class="text-sm sm:text-base text-slate-100 leading-relaxed"></p>
        <div class="flex justify-end gap-2">
          <button id="btn-dlg-next" class="touch-target px-5 py-2 rounded-xl ui-btn-primary text-sm font-extrabold">Дальше</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.dialogueOverlay);

    // 7. Контейнер всплывающих уведомлений и офлайн-баннера
    this.toastBox = el('div', 'absolute top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5 pointer-events-none');
    this.root.appendChild(this.toastBox);

    this.offlineBanner = el('div', 'hidden absolute bottom-3 left-3 z-50 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg', TEXTS.network.offlineBanner);
    this.root.appendChild(this.offlineBanner);

    // 8. Общий модальный слой (Кастомизация, Дневник, Чат, Настройки/Пауза, Титры, Отключение напарника, iOS гайд)
    this.modalLayer = el('div', 'hidden absolute inset-0 z-40 bg-black/55 safe-pad flex items-center justify-center');
    this.modalCard = el('div', 'ui-panel-solid rounded-2xl p-4 sm:p-6 w-full max-w-xl max-h-[88vh] overflow-y-auto scroll-thin shadow-2xl');
    this.modalLayer.appendChild(this.modalCard);
    this.root.appendChild(this.modalLayer);

    // Боковая панель кастомизации (чтобы слева/справа был виден 3D персонаж!)
    this.customizerPanel = el('div', 'hidden absolute right-3 top-3 bottom-3 z-40 w-72 sm:w-80 ui-panel-solid rounded-2xl p-4 flex flex-col justify-between shadow-2xl');
    this.root.appendChild(this.customizerPanel);
  }

  bindPWAEVents() {
    const updateInstallBtn = () => {
      const btn = this.titleScreen.querySelector('#btn-install-pwa');
      if (!btn) return;
      if (this.isStandalone) {
        btn.classList.add('hidden');
        return;
      }
      if (this.deferredInstallPrompt) {
        btn.textContent = sanitizeText(TEXTS.titleScreen.btnInstallPwa);
        btn.classList.remove('hidden');
      } else if (this.isIOS) {
        btn.textContent = sanitizeText(TEXTS.titleScreen.btnInstallIos);
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    };

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      updateInstallBtn();
    });

    window.addEventListener('appinstalled', () => {
      this.isStandalone = true;
      this.deferredInstallPrompt = null;
      updateInstallBtn();
    });

    const syncOnline = () => {
      if (navigator.onLine) {
        this.offlineBanner.classList.add('hidden');
      } else {
        this.offlineBanner.classList.remove('hidden');
      }
    };
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    syncOnline();
    updateInstallBtn();
  }

  bindUIEvents() {
    this.titleScreen.querySelector('#btn-install-pwa').addEventListener('click', async () => {
      if (this.deferredInstallPrompt) {
        await this.deferredInstallPrompt.prompt();
        await this.deferredInstallPrompt.userChoice;
        this.deferredInstallPrompt = null;
        this.titleScreen.querySelector('#btn-install-pwa').classList.add('hidden');
      } else if (this.isIOS) {
        this.showSimpleNotice(TEXTS.titleScreen.iosGuideTitle, TEXTS.titleScreen.iosGuideBody);
      }
    });

    this.titleScreen.querySelector('#btn-create-room').addEventListener('click', () => {
      this.h.onCreateRoom?.();
    });
    this.titleScreen.querySelector('#btn-join-room').addEventListener('click', () => {
      this.showJoinRoomPanel();
    });
    this.titleScreen.querySelector('#btn-solo').addEventListener('click', () => {
      this.h.onStartSolo?.();
    });
    this.titleScreen.querySelector('#btn-customize').addEventListener('click', () => {
      this.h.onOpenCustomizer?.();
    });
    this.titleScreen.querySelector('#btn-title-settings').addEventListener('click', () => {
      this.h.onOpenSettings?.(false);
    });

    // HUD кнопки
    this.hud.querySelector('#btn-hud-journal').addEventListener('click', () => this.h.onOpenJournal?.());
    this.hud.querySelector('#btn-hud-chat').addEventListener('click', () => this.openChatModal());
    this.hud.querySelector('#btn-hud-photo').addEventListener('click', () => this.h.onEnterPhotoMode?.());
    this.hud.querySelector('#btn-hud-pause').addEventListener('click', () => this.h.onOpenSettings?.(true));

    this.hud.querySelector('#btn-act-jump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.h.onJump?.();
    });
    this.hud.querySelector('#btn-act-interact').addEventListener('click', () => this.h.onInteract?.());
    this.hud.querySelector('#btn-act-sit').addEventListener('click', () => this.h.onSit?.());
    this.hud.querySelector('#btn-act-spirit').addEventListener('click', () => this.h.onCallSpirit?.());

    const emoteBar = this.hud.querySelector('#emote-bar');
    TEXTS.emotes.forEach((em) => {
      const b = el('button', 'touch-target px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-100 whitespace-nowrap', em.label);
      b.addEventListener('click', () => {
        emoteBar.classList.add('hidden');
        this.h.onEmote?.(em);
      });
      emoteBar.appendChild(b);
    });
    this.hud.querySelector('#btn-act-wave').addEventListener('click', () => {
      emoteBar.classList.toggle('hidden');
    });

    // Фоторежим
    this.photoOverlay.querySelector('#btn-photo-snap').addEventListener('click', () => this.h.onTakePhoto?.());
    this.photoOverlay.querySelector('#btn-photo-exit').addEventListener('click', () => this.h.onExitPhotoMode?.());

    // Диалоги
    this.dialogueOverlay.querySelector('#btn-dlg-next').addEventListener('click', () => this.advanceDialogue());
  }

  setLoadingProgress(pct, stepIndex = 0) {
    const bar = this.loadingScreen.querySelector('#loading-bar');
    const step = this.loadingScreen.querySelector('#loading-step');
    if (bar) bar.style.width = `${pct}%`;
    if (step) step.textContent = sanitizeText(TEXTS.loading.steps[stepIndex] || TEXTS.loading.steps[0]);
  }

  hideLoading() {
    this.loadingScreen.classList.add('opacity-0', 'pointer-events-none');
    window.setTimeout(() => {
      this.loadingScreen.classList.add('hidden');
    }, 320);
  }

  showTitleScreen() {
    this.titleScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.photoOverlay.classList.add('hidden');
    this.closeAllModals();
    this.resetTitlePanels();
  }

  resetTitlePanels() {
    this.titleScreen.querySelector('#title-main-actions').classList.remove('hidden');
    this.titleScreen.querySelector('#title-room-panel').classList.add('hidden');
  }

  showRoomCreatedPanel(code, firebaseAvailable = false) {
    const main = this.titleScreen.querySelector('#title-main-actions');
    const panel = this.titleScreen.querySelector('#title-room-panel');
    main.classList.add('hidden');
    panel.classList.remove('hidden');

    panel.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="font-display text-lg font-extrabold text-[#ffe4b5]">${sanitizeText(TEXTS.titleScreen.roomCreatedTitle)}</h2>
        <button id="btn-room-cancel" class="text-xs text-slate-300 underline">${sanitizeText(TEXTS.titleScreen.btnCancelRoom)}</button>
      </div>
      <div class="text-xs text-slate-300">${sanitizeText(TEXTS.titleScreen.roomCodeLabel)}</div>
      <div class="flex items-center justify-between gap-3 bg-slate-900/90 border border-white/15 rounded-xl px-4 py-3">
        <span class="font-tabular text-3xl font-bold tracking-[0.25em] text-[#ffd484]">${sanitizeText(code)}</span>
        <button id="btn-copy-code" class="touch-target px-3.5 py-2 rounded-lg ui-btn-secondary text-xs font-bold whitespace-nowrap">${sanitizeText(TEXTS.titleScreen.btnCopyCode)}</button>
      </div>
      <p id="room-wait-status" class="text-xs text-amber-200 font-semibold">${sanitizeText(TEXTS.titleScreen.roomWaiting)}</p>
      <p class="text-xs text-slate-400">${sanitizeText(TEXTS.titleScreen.roomWaitHint)}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button id="btn-enter-while-waiting" class="touch-target flex-1 px-4 py-2.5 rounded-xl ui-btn-primary text-xs sm:text-sm font-extrabold">${sanitizeText(TEXTS.titleScreen.btnStartAloneFirst)}</button>
        ${firebaseAvailable ? `<button id="btn-fb-host" class="touch-target px-3.5 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.titleScreen.useFirebaseFallback)}</button>` : ''}
      </div>
    `;

    panel.querySelector('#btn-copy-code').addEventListener('click', (e) => {
      navigator.clipboard?.writeText(code).catch(() => {});
      e.target.textContent = sanitizeText(TEXTS.titleScreen.copied);
    });
    panel.querySelector('#btn-room-cancel').addEventListener('click', () => {
      this.h.onCancelRoom?.();
      this.resetTitlePanels();
    });
    panel.querySelector('#btn-enter-while-waiting').addEventListener('click', () => {
      this.h.onEnterPlaying?.();
    });
    panel.querySelector('#btn-fb-host')?.addEventListener('click', () => {
      this.h.onCreateRoomFirebase?.();
    });
  }

  showJoinRoomPanel() {
    const main = this.titleScreen.querySelector('#title-main-actions');
    const panel = this.titleScreen.querySelector('#title-room-panel');
    main.classList.add('hidden');
    panel.classList.remove('hidden');

    panel.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="font-display text-lg font-extrabold text-[#ffe4b5]">${sanitizeText(TEXTS.titleScreen.joinTitle)}</h2>
        <button id="btn-join-cancel" class="text-xs text-slate-300 underline">${sanitizeText(TEXTS.titleScreen.btnCancelRoom)}</button>
      </div>
      <input id="input-room-code" maxlength="4" placeholder="${sanitizeText(TEXTS.titleScreen.joinPlaceholder)}"
        class="w-full rounded-xl bg-slate-900 border border-white/20 px-4 py-3 text-center font-tabular text-2xl font-bold tracking-[0.25em] uppercase text-[#ffd484] outline-none focus:border-[#ebb05c]" />
      <p id="join-error-msg" class="hidden text-xs text-rose-300 font-semibold"></p>
      <div class="flex flex-wrap gap-2">
        <button id="btn-join-submit" class="touch-target flex-1 px-4 py-2.5 rounded-xl ui-btn-primary text-sm font-extrabold">${sanitizeText(TEXTS.titleScreen.btnConnect)}</button>
        <button id="btn-join-fb" class="touch-target px-3.5 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.titleScreen.useFirebaseFallback)}</button>
      </div>
    `;

    const input = panel.querySelector('#input-room-code');
    const errEl = panel.querySelector('#join-error-msg');
    input.focus();

    panel.querySelector('#btn-join-cancel').addEventListener('click', () => this.resetTitlePanels());
    panel.querySelector('#btn-join-submit').addEventListener('click', () => {
      errEl.classList.add('hidden');
      this.h.onJoinRoom?.(input.value);
    });
    panel.querySelector('#btn-join-fb').addEventListener('click', () => {
      errEl.classList.add('hidden');
      this.h.onJoinRoomFirebase?.(input.value);
    });
  }

  showJoinError(msg) {
    const errEl = this.titleScreen.querySelector('#join-error-msg');
    if (errEl) {
      errEl.textContent = sanitizeText(msg);
      errEl.classList.remove('hidden');
    } else {
      this.showToast(msg);
    }
  }

  showHUD(isSolo) {
    this.titleScreen.classList.add('hidden');
    this.photoOverlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.closeAllModals();

    const spiritBtn = this.hud.querySelector('#btn-act-spirit');
    if (isSolo) spiritBtn.classList.remove('hidden');
    else spiritBtn.classList.add('hidden');
  }

  showPhotoMode() {
    this.hud.classList.add('hidden');
    this.photoOverlay.classList.remove('hidden');
  }

  updateHudProgress(progress, totalCollectibles) {
    const lit = progress.litLanterns.length;
    const shardsGot = progress.collectedIds.filter((id) => id.startsWith('shard_')).length;
    const totalShards = totalCollectibles.filter((c) => c.kind === 'shard').length;

    this.hud.querySelector('#hud-lanterns').textContent = formatText(TEXTS.hud.lanternsCount, { lit, total: 5 });
    this.hud.querySelector('#hud-shards').textContent = formatText(TEXTS.hud.shardsCount, { got: shardsGot, total: totalShards });

    const activeQuest = TEXTS.quests.find((q) => !progress.completedQuests.includes(q.id));
    const qLine = activeQuest
      ? `${TEXTS.hud.questPrefix} ${activeQuest.title}`
      : TEXTS.hud.allDoneHint;
    this.hud.querySelector('#hud-quest-line').textContent = sanitizeText(qLine);
  }

  updateHudZone(zoneId) {
    const label = TEXTS.zones[zoneId] || zoneId;
    this.hud.querySelector('#hud-zone').textContent = sanitizeText(label);
  }

  updateHudNetwork(statusText, pingMs = 0, roomCode = '') {
    const badge = this.hud.querySelector('#hud-net-badge');
    const parts = [sanitizeText(statusText)];
    if (roomCode) parts.push(`#${sanitizeText(roomCode)}`);
    if (pingMs > 0) parts.push(formatText(TEXTS.network.pingMs, { ms: pingMs }));
    badge.textContent = parts.join(' · ');
  }

  updateContextPrompt(label) {
    const banner = this.hud.querySelector('#hud-interact-banner');
    const btn = this.hud.querySelector('#btn-act-interact');
    if (label) {
      banner.textContent = sanitizeText(label);
      banner.classList.remove('hidden');
      btn.classList.remove('ui-btn-secondary');
      btn.classList.add('ui-btn-primary');
    } else {
      banner.classList.add('hidden');
      btn.classList.add('ui-btn-secondary');
      btn.classList.remove('ui-btn-primary');
    }
  }

  openDialogue(npcId, progress) {
    const npc = TEXTS.npcs[npcId];
    if (!npc) return;
    const lanternDone =
      (npcId === 'miro' && progress.litLanterns.includes('village')) ||
      (npcId === 'lina' && progress.litLanterns.includes('forest')) ||
      (npcId === 'tim' && progress.litLanterns.includes('lake')) ||
      (npcId === 'sen' && progress.litLanterns.includes('ruins')) ||
      (npcId === 'noa' && progress.litLanterns.includes('observatory'));

    const lines = lanternDone ? npc.linesAfter : npc.linesBefore;
    this.dialogueState = { name: npc.name, lines, idx: 0 };
    this.renderDialogue();
    this.dialogueOverlay.classList.remove('hidden');
  }

  renderDialogue() {
    if (!this.dialogueState) return;
    const { name, lines, idx } = this.dialogueState;
    this.dialogueOverlay.querySelector('#dlg-name').textContent = sanitizeText(name);
    this.dialogueOverlay.querySelector('#dlg-step').textContent = `${idx + 1}/${lines.length}`;
    this.dialogueOverlay.querySelector('#dlg-text').textContent = sanitizeText(lines[idx]);
    const btn = this.dialogueOverlay.querySelector('#btn-dlg-next');
    btn.textContent = idx + 1 >= lines.length ? 'Понятно' : 'Дальше';
  }

  advanceDialogue() {
    if (!this.dialogueState) return;
    this.dialogueState.idx += 1;
    if (this.dialogueState.idx >= this.dialogueState.lines.length) {
      this.dialogueState = null;
      this.dialogueOverlay.classList.add('hidden');
    } else {
      this.renderDialogue();
    }
  }

  openCustomizer(appearance, onChange, onDone) {
    this.titleScreen.classList.add('hidden');
    this.customizerPanel.classList.remove('hidden');

    const draft = { ...appearance };
    const render = () => {
      this.customizerPanel.innerHTML = `
        <div class="space-y-3 overflow-y-auto scroll-thin pr-1">
          <div>
            <h2 class="font-display text-lg font-extrabold text-[#ffe4b5]">${sanitizeText(TEXTS.customizer.title)}</h2>
            <p class="text-xs text-slate-400">${sanitizeText(TEXTS.customizer.hint)}</p>
          </div>
          <div id="cust-controls" class="space-y-3 text-xs"></div>
        </div>
        <button id="btn-cust-save" class="touch-target w-full mt-3 py-2.5 rounded-xl ui-btn-primary text-sm font-extrabold">${sanitizeText(TEXTS.customizer.save)}</button>
      `;

      const container = this.customizerPanel.querySelector('#cust-controls');

      const addChoiceRow = (label, items, key) => {
        const wrap = el('div', 'space-y-1');
        wrap.appendChild(el('div', 'font-bold text-slate-300', label));
        const row = el('div', 'flex flex-wrap gap-1.5');
        items.forEach((it) => {
          const active = draft[key] === it.id;
          const b = el(
            'button',
            `px-2.5 py-1.5 rounded-lg text-xs font-semibold ${active ? 'bg-[#ebb05c] text-[#1c1824]' : 'bg-slate-800 text-slate-200'}`,
            it.label
          );
          b.addEventListener('click', () => {
            draft[key] = it.id;
            onChange(draft);
            render();
          });
          row.appendChild(b);
        });
        wrap.appendChild(row);
        container.appendChild(wrap);
      };

      const addColorRow = (label, items, key) => {
        const wrap = el('div', 'space-y-1');
        wrap.appendChild(el('div', 'font-bold text-slate-300', label));
        const row = el('div', 'flex flex-wrap gap-2');
        items.forEach((it) => {
          const active = draft[key] === it.hex;
          const b = el(
            'button',
            `w-8 h-8 rounded-full border-2 ${active ? 'border-white scale-110' : 'border-white/20'}`
          );
          b.style.backgroundColor = it.hex;
          b.addEventListener('click', () => {
            draft[key] = it.hex;
            onChange(draft);
            render();
          });
          row.appendChild(b);
        });
        wrap.appendChild(row);
        container.appendChild(wrap);
      };

      addChoiceRow(TEXTS.customizer.hairStyle, CUSTOMIZATION_OPTIONS.hairStyles, 'hairStyle');
      addColorRow(TEXTS.customizer.hairColor, CUSTOMIZATION_OPTIONS.hairColors, 'hairColor');
      addColorRow(TEXTS.customizer.eyeColor, CUSTOMIZATION_OPTIONS.eyeColors, 'eyeColor');
      addChoiceRow(TEXTS.customizer.outfitStyle, CUSTOMIZATION_OPTIONS.outfitStyles, 'outfitStyle');
      addColorRow(TEXTS.customizer.outfitColor, CUSTOMIZATION_OPTIONS.outfitColors, 'outfitColor');
      addChoiceRow(TEXTS.customizer.accessory, CUSTOMIZATION_OPTIONS.accessories, 'accessory');

      this.customizerPanel.querySelector('#btn-cust-save').addEventListener('click', () => {
        this.customizerPanel.classList.add('hidden');
        onDone(draft);
      });
    };

    render();
  }

  openJournal(progress, totalCollectibles) {
    let activeTab = 'quests';
    const zoneOrder = ['village', 'forest', 'lake', 'ruins', 'observatory'];

    const render = () => {
      this.modalCard.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-display text-xl font-extrabold text-[#ffe4b5]">${sanitizeText(TEXTS.journal.title)}</h2>
          <button id="btn-j-close" class="touch-target px-3 py-1.5 rounded-lg ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.journal.close)}</button>
        </div>
        <div class="flex gap-1.5 p-1 bg-slate-900 rounded-xl mb-4">
          <button data-tab="quests" class="flex-1 py-2 rounded-lg text-xs font-bold ${activeTab === 'quests' ? 'bg-[#ebb05c] text-[#1c1824]' : 'text-slate-300'}">${sanitizeText(TEXTS.journal.tabQuests)}</button>
          <button data-tab="island" class="flex-1 py-2 rounded-lg text-xs font-bold ${activeTab === 'island' ? 'bg-[#ebb05c] text-[#1c1824]' : 'text-slate-300'}">${sanitizeText(TEXTS.journal.tabIsland)}</button>
          <button data-tab="notes" class="flex-1 py-2 rounded-lg text-xs font-bold ${activeTab === 'notes' ? 'bg-[#ebb05c] text-[#1c1824]' : 'text-slate-300'}">${sanitizeText(TEXTS.journal.tabNotes)}</button>
        </div>
        <div id="j-body" class="space-y-2.5"></div>
      `;

      const body = this.modalCard.querySelector('#j-body');
      if (activeTab === 'quests') {
        TEXTS.quests.forEach((q) => {
          const done = progress.completedQuests.includes(q.id);
          const item = el('div', 'p-3 rounded-xl bg-slate-900/75 border border-white/10');
          item.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-sm ${done ? 'text-emerald-300' : 'text-[#ffe4b5]'}">${sanitizeText(q.title)}</span>
              <span class="text-[11px] font-bold ${done ? 'text-emerald-300' : 'text-slate-400'}">${sanitizeText(done ? TEXTS.journal.statusDone : TEXTS.journal.statusActive)}</span>
            </div>
            <p class="text-xs text-slate-300 mt-1">${sanitizeText(q.desc)}</p>
          `;
          body.appendChild(item);
        });
      } else if (activeTab === 'island') {
        zoneOrder.forEach((zId) => {
          const lit = progress.litLanterns.includes(zId);
          const row = el('div', 'flex items-center justify-between p-3 rounded-xl bg-slate-900/75 border border-white/10');
          row.innerHTML = `
            <span class="font-bold text-sm text-slate-100">${sanitizeText(TEXTS.zones[zId])}</span>
            <span class="text-xs font-bold ${lit ? 'text-amber-300' : 'text-slate-400'}">${lit ? 'Фонарь горит' : 'Пока темно'}</span>
          `;
          body.appendChild(row);
        });

        const shardsGot = progress.collectedIds.filter((i) => i.startsWith('shard_')).length;
        const shellsGot = progress.collectedIds.filter((i) => i.startsWith('shell_')).length;
        const totShards = totalCollectibles.filter((c) => c.kind === 'shard').length;
        const totShells = totalCollectibles.filter((c) => c.kind === 'shell').length;
        const stats = el('div', 'p-3 rounded-xl bg-slate-900/75 border border-white/10 text-xs text-slate-300 font-tabular');
        stats.textContent = `Осколки света: ${shardsGot}/${totShards}   Ракушки памяти: ${shellsGot}/${totShells}`;
        body.appendChild(stats);

        if (progress.litLanterns.includes('observatory')) {
          const btnCred = el('button', 'touch-target w-full py-2.5 rounded-xl ui-btn-primary text-xs font-extrabold', TEXTS.journal.replayCredits);
          btnCred.addEventListener('click', () => this.openCredits(progress, totalCollectibles));
          body.appendChild(btnCred);
        }
      } else {
        zoneOrder.forEach((zId, idx) => {
          const unlocked = progress.litLanterns.includes(zId);
          const customText = (TEXTS.personalMessages[idx] || '').trim();
          const card = el('div', 'p-3 rounded-xl bg-slate-900/75 border border-white/10 space-y-1');
          const title = TEXTS.personalMessageTitles[idx] || `Записка ${idx + 1}`;
          if (!unlocked) {
            card.innerHTML = `
              <div class="font-bold text-xs text-slate-400">${sanitizeText(title)}</div>
              <div class="text-xs text-slate-500">${sanitizeText(TEXTS.journal.noteLocked)}</div>
            `;
          } else {
            card.innerHTML = `
              <div class="font-bold text-sm text-[#ffd894]">${sanitizeText(title)}</div>
              <div class="text-xs sm:text-sm text-slate-100 leading-relaxed">${sanitizeText(customText || TEXTS.personalMessageEmptyHint)}</div>
            `;
          }
          body.appendChild(card);
        });
      }

      this.modalCard.querySelector('#btn-j-close').addEventListener('click', () => this.closeAllModals());
      this.modalCard.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeTab = btn.dataset.tab;
          render();
        });
      });
    };

    render();
    this.modalLayer.classList.remove('hidden');
  }

  appendChatMessage(senderLabel, text) {
    this.chatMessages.push({ senderLabel, text: sanitizeText(text) });
    if (this.chatMessages.length > 30) this.chatMessages.shift();
    const list = this.modalCard.querySelector('#chat-msg-list');
    if (list) this.renderChatList(list);
  }

  renderChatList(listEl) {
    listEl.innerHTML = '';
    if (this.chatMessages.length === 0) {
      listEl.appendChild(el('div', 'text-xs text-slate-400 text-center py-6', 'Пока сообщений нет. Напиши что нибудь или выбери быструю фразу.'));
      return;
    }
    this.chatMessages.forEach((m) => {
      const row = el('div', 'text-xs bg-slate-900/80 rounded-xl px-3 py-2 border border-white/10');
      row.innerHTML = `<span class="font-bold text-[#ffd894]">${sanitizeText(m.senderLabel)}:</span> <span class="text-slate-100">${sanitizeText(m.text)}</span>`;
      listEl.appendChild(row);
    });
    listEl.scrollTop = listEl.scrollHeight;
  }

  openChatModal() {
    this.modalCard.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-display text-lg font-extrabold text-[#ffe4b5]">${sanitizeText(TEXTS.chat.title)}</h2>
        <button id="btn-chat-close" class="touch-target px-3 py-1.5 rounded-lg ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.journal.close)}</button>
      </div>
      <div id="chat-msg-list" class="h-44 overflow-y-auto scroll-thin space-y-2 mb-3 pr-1"></div>
      <div class="flex flex-wrap gap-1.5 mb-3" id="chat-quick-row"></div>
      <div class="flex gap-2">
        <input id="chat-input" maxlength="80" placeholder="${sanitizeText(TEXTS.chat.placeholder)}"
          class="flex-1 rounded-xl bg-slate-900 border border-white/20 px-3 py-2 text-sm text-white outline-none focus:border-[#ebb05c]" />
        <button id="btn-chat-send" class="touch-target px-4 py-2 rounded-xl ui-btn-primary text-xs font-extrabold">${sanitizeText(TEXTS.chat.send)}</button>
      </div>
    `;

    const list = this.modalCard.querySelector('#chat-msg-list');
    this.renderChatList(list);

    const quickRow = this.modalCard.querySelector('#chat-quick-row');
    TEXTS.chat.quickPhrases.forEach((phrase) => {
      const b = el('button', 'px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 font-semibold', phrase);
      b.addEventListener('click', () => {
        this.h.onSendChat?.(phrase);
      });
      quickRow.appendChild(b);
    });

    const input = this.modalCard.querySelector('#chat-input');
    const send = () => {
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      this.h.onSendChat?.(val);
    };

    this.modalCard.querySelector('#btn-chat-send').addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
    this.modalCard.querySelector('#btn-chat-close').addEventListener('click', () => this.closeAllModals());
    this.modalLayer.classList.remove('hidden');
  }

  openSettingsModal(settings, isInGame, onUpdate, onExtra) {
    this.confirmReset = false;
    const draft = { ...settings };

    const render = () => {
      this.modalCard.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-xl font-extrabold text-[#ffe4b5]">${sanitizeText(isInGame ? TEXTS.pause.title : TEXTS.titleScreen.btnSettings)}</h2>
          <button id="btn-set-close" class="touch-target px-4 py-1.5 rounded-xl ui-btn-primary text-xs font-extrabold">${sanitizeText(isInGame ? TEXTS.pause.resume : TEXTS.journal.close)}</button>
        </div>
        <div class="space-y-4 text-xs sm:text-sm">
          <div>
            <div class="font-bold text-slate-300 mb-1.5">${sanitizeText(TEXTS.pause.qualityLabel)}</div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              ${Object.entries(TEXTS.pause.qualityOptions)
                .map(
                  ([k, label]) =>
                    `<button data-qual="${k}" class="touch-target px-2 py-2 rounded-xl font-bold text-xs ${draft.quality === k ? 'bg-[#ebb05c] text-[#1c1824]' : 'bg-slate-900 text-slate-200 border border-white/10'}">${sanitizeText(label)}</button>`
                )
                .join('')}
            </div>
          </div>

          <div>
            <div class="flex justify-between font-bold text-slate-300 mb-1">
              <span>${sanitizeText(TEXTS.pause.sensitivityLabel)}</span>
              <span class="font-tabular">${draft.sensitivity.toFixed(1)}x</span>
            </div>
            <input id="set-sens" type="range" min="0.4" max="2.2" step="0.1" value="${draft.sensitivity}" class="w-full accent-[#ebb05c]" />
          </div>

          <div>
            <div class="flex justify-between font-bold text-slate-300 mb-1">
              <span>${sanitizeText(TEXTS.pause.soundLabel)}</span>
              <span class="font-tabular">${Math.round(draft.soundVolume * 100)}%</span>
            </div>
            <input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${draft.soundVolume}" class="w-full accent-[#ebb05c]" />
          </div>

          <div>
            <div class="flex justify-between font-bold text-slate-300 mb-1">
              <span>${sanitizeText(TEXTS.pause.musicLabel)}</span>
              <span class="font-tabular">${Math.round(draft.musicVolume * 100)}%</span>
            </div>
            <input id="set-mus" type="range" min="0" max="1" step="0.05" value="${draft.musicVolume}" class="w-full accent-[#ebb05c]" />
          </div>

          ${
            isInGame
              ? `
            <div class="flex flex-wrap gap-2 pt-2 border-t border-white/10">
              <button id="btn-set-time" class="touch-target flex-1 px-3 py-2.5 rounded-xl ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.pause.timeSkipBtn)}</button>
              <button id="btn-set-reset" class="touch-target px-3 py-2.5 rounded-xl bg-rose-900/70 text-rose-100 border border-rose-400/30 text-xs font-bold">${sanitizeText(this.confirmReset ? TEXTS.pause.resetConfirmBtn : TEXTS.pause.resetSaveBtn)}</button>
            </div>
            <button id="btn-set-menu" class="touch-target w-full py-2.5 rounded-xl ui-btn-secondary text-xs font-bold">${sanitizeText(TEXTS.pause.exitToMenu)}</button>
          `
              : ''
          }
        </div>
      `;

      this.modalCard.querySelector('#btn-set-close').addEventListener('click', () => {
        this.closeAllModals();
        onExtra?.('resume');
      });
      this.modalCard.querySelectorAll('[data-qual]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.quality = b.dataset.qual;
          onUpdate(draft);
          render();
        });
      });
      this.modalCard.querySelector('#set-sens').addEventListener('input', (e) => {
        draft.sensitivity = parseFloat(e.target.value);
        onUpdate(draft);
      });
      this.modalCard.querySelector('#set-sfx').addEventListener('input', (e) => {
        draft.soundVolume = parseFloat(e.target.value);
        onUpdate(draft);
      });
      this.modalCard.querySelector('#set-mus').addEventListener('input', (e) => {
        draft.musicVolume = parseFloat(e.target.value);
        onUpdate(draft);
      });

      if (isInGame) {
        this.modalCard.querySelector('#btn-set-time').addEventListener('click', () => onExtra?.('skipTime'));
        this.modalCard.querySelector('#btn-set-reset').addEventListener('click', () => {
          if (!this.confirmReset) {
            this.confirmReset = true;
            render();
          } else {
            this.closeAllModals();
            onExtra?.('resetSave');
          }
        });
        this.modalCard.querySelector('#btn-set-menu').addEventListener('click', () => {
          this.closeAllModals();
          onExtra?.('exitToMenu');
        });
      }
    };

    render();
    this.modalLayer.classList.remove('hidden');
  }

  openCredits(progress, totalCollectibles) {
    const shardsGot = progress.collectedIds.filter((i) => i.startsWith('shard_')).length;
    const totalShards = totalCollectibles.filter((c) => c.kind === 'shard').length;
    const madeFor = formatText(TEXTS.credits.madeFor, {
      creator: CREATOR_NAME,
      friend: FRIEND_NAME,
    });
    const stats = formatText(TEXTS.credits.statsLine, {
      lit: progress.litLanterns.length,
      quests: progress.completedQuests.length,
      shards: shardsGot,
      totalShards,
    });

    this.modalCard.innerHTML = `
      <div class="text-center space-y-4 py-2">
        <div class="text-xs font-bold text-[#ffd894]">${sanitizeText(TEXTS.credits.badge)}</div>
        <h2 class="font-display text-2xl sm:text-3xl font-black text-white">${sanitizeText(TEXTS.credits.title)}</h2>
        <p class="text-sm sm:text-base font-bold text-[#ffd484]">${madeFor}</p>
        <div class="space-y-2 text-xs sm:text-sm text-slate-200 max-w-md mx-auto leading-relaxed">
          ${TEXTS.credits.storyLines.map((line) => `<p>${sanitizeText(line)}</p>`).join('')}
        </div>
        <div class="font-tabular text-xs text-slate-300 pt-2 border-t border-white/10">${sanitizeText(stats)}</div>
        <button id="btn-credits-keep" class="touch-target px-6 py-3 rounded-xl ui-btn-primary text-sm font-extrabold">${sanitizeText(TEXTS.credits.btnKeepPlaying)}</button>
      </div>
    `;

    this.modalCard.querySelector('#btn-credits-keep').addEventListener('click', () => this.closeAllModals());
    this.modalLayer.classList.remove('hidden');
  }

  showSimpleNotice(title, body) {
    this.modalCard.innerHTML = `
      <div class="space-y-3">
        <h2 class="font-display text-lg font-extrabold text-[#ffe4b5]">${sanitizeText(title)}</h2>
        <p class="text-sm text-slate-200 leading-relaxed">${sanitizeText(body)}</p>
        <div class="flex justify-end">
          <button id="btn-notice-ok" class="touch-target px-5 py-2 rounded-xl ui-btn-primary text-sm font-extrabold">${sanitizeText(TEXTS.titleScreen.close)}</button>
        </div>
      </div>
    `;
    this.modalCard.querySelector('#btn-notice-ok').addEventListener('click', () => this.closeAllModals());
    this.modalLayer.classList.remove('hidden');
  }

  closeAllModals() {
    this.modalLayer.classList.add('hidden');
    this.dialogueOverlay.classList.add('hidden');
    this.customizerPanel.classList.add('hidden');
  }

  showToast(text) {
    const t = el(
      'div',
      'ui-panel rounded-xl px-4 py-2 text-xs sm:text-sm font-bold text-[#ffe4b5] shadow-xl transition-opacity duration-300',
      text
    );
    this.toastBox.appendChild(t);
    window.setTimeout(() => {
      t.classList.add('opacity-0');
      window.setTimeout(() => t.remove(), 320);
    }, 3200);
  }
}
