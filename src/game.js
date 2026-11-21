import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  FOREST_LEDGE,
  getZoneAt,
  groundHeightAt,
  LAKE_CENTER,
  OBS_SUMMIT,
  WATER_LEVEL,
} from './world/terrain.js';
import { buildIslandEnvironment } from './world/environment.js';
import {
  createAnimeCharacter,
  createEchoSpirit,
  updateCharacterAnimation,
} from './world/character.js';
import { formatText, TEXTS } from './texts.ru.js';

// Переиспользуемые векторы без аллокаций внутри игрового цикла
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

function detectSoftwareGl() {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class GameEngine {
  constructor(mountEl, options = {}) {
    this.mountEl = mountEl;
    this.cb = options.callbacks || {};
    this.sound = options.sound;
    this.isSoftwareGl = detectSoftwareGl();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.15,
      360
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mountEl.appendChild(this.renderer.domElement);

    // Пост-обработка (Bloom) только на GPU в среднем/высоком качестве
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5)),
      0.34,
      0.45,
      0.86
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Мир острова
    this.env = buildIslandEnvironment(this.scene, this.renderer, this.isSoftwareGl);

    // Игровое состояние
    this.mode = 'title'; // 'title' | 'customizer' | 'playing' | 'paused' | 'photo'
    this.networkMode = 'solo'; // 'solo' | 'host' | 'guest'
    this.timeOfDay = 0.72; // Старт на тёплом закате
    this.dayCycleSpeed = 1.0;

    this.qualitySetting = 'auto';
    this.effectiveQuality = this.isSoftwareGl ? 'low' : 'high';
    this.sensitivity = 1.0;
    this.frameTimeAccum = 0;
    this.frameTimeSamples = 0;

    // Прогресс мира
    this.progress = options.initialProgress;
    this.boostOfferTime = 0;
    this.remoteBoostOffer = false;
    this.crystalATimer = 0;
    this.crystalBTimer = 0;
    this.spiritTarget = null;
    this.spiritHoldTimer = 0;

    // Локальный игрок
    this.localAppearance = options.initialAppearance;
    this.localRig = createAnimeCharacter(
      this.localAppearance,
      this.env.gradientMap,
      this.env.contactShadowTex,
      true
    );
    this.scene.add(this.localRig.root);

    this.player = {
      x: 0,
      y: groundHeightAt(0, 44, this.progress),
      z: 44,
      vy: 0,
      rotY: Math.PI,
      grounded: true,
      coyoteTime: 0,
      anim: 'idle',
      waveTimer: 0,
      joyTimer: 0,
      sittingBench: null,
      sittingSeatIdx: 0,
      stargazing: false,
      speed: 0,
    };
    this.localRig.root.position.set(this.player.x, this.player.y, this.player.z);

    // Удалённый игрок (напарник)
    this.remoteAppearance = {
      hairStyle: 'twintails',
      hairColor: '#d66d67',
      eyeColor: '#c87d2e',
      outfitStyle: 'tunic',
      outfitColor: '#e07a5f',
      accessory: 'beret',
    };
    this.remoteRig = createAnimeCharacter(
      this.remoteAppearance,
      this.env.gradientMap,
      this.env.contactShadowTex,
      false
    );
    this.remoteRig.root.visible = false;
    this.scene.add(this.remoteRig.root);

    this.remoteTarget = {
      x: 1.8,
      y: groundHeightAt(1.8, 44, this.progress),
      z: 44,
      rotY: Math.PI,
      anim: 'idle',
      active: false,
    };

    // Спутник Эхо-огонёк (для одиночного режима)
    this.echoSpirit = createEchoSpirit(this.env.glowTex);
    this.echoSpirit.group.position.set(-1.5, this.player.y + 0.5, 45);
    this.scene.add(this.echoSpirit.group);

    // Камера
    this.camYaw = Math.PI;
    this.camPitch = 0.34;
    this.camDist = 8.4;
    this.camLookCurrent = new THREE.Vector3(0, 3, 44);
    this.camPosCurrent = new THREE.Vector3(-4, 7, 56);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frameId = 0;
    this.netSendAccum = 0;
    this.lastZone = getZoneAt(this.player.x, this.player.z);
    this.currentPrompt = null;

    this.applyQualityPreset(this.effectiveQuality);
    this.syncWorldVisualsFromProgress(true);
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  getCanvas() {
    return this.renderer.domElement;
  }

  bindEvents() {
    this._onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stopLoop();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.startLoop();
    });
  }

  setSettings(settings) {
    this.sensitivity = settings.sensitivity ?? 1.0;
    this.dayCycleSpeed = settings.dayCycleSpeed ?? 1.0;
    this.qualitySetting = settings.quality ?? 'auto';
    if (this.qualitySetting !== 'auto') {
      this.applyQualityPreset(this.qualitySetting);
    }
  }

  applyQualityPreset(level) {
    const target = this.isSoftwareGl ? 'low' : level;
    this.effectiveQuality = target;
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    if (target === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.env.sunLight.castShadow = false;
      this.env.grassMesh.count = Math.min(600, this.env.maxGrassCount);
      this.useBloom = false;
    } else if (target === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.25 : 1.5));
      this.renderer.shadowMap.enabled = true;
      this.env.sunLight.castShadow = true;
      this.env.grassMesh.count = Math.min(1400, this.env.maxGrassCount);
      this.useBloom = !isMobile;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
      this.renderer.shadowMap.enabled = true;
      this.env.sunLight.castShadow = true;
      this.env.grassMesh.count = this.env.maxGrassCount;
      this.useBloom = true;
    }
  }

  setMode(nextMode) {
    this.mode = nextMode;
    this.echoSpirit.group.visible = this.networkMode === 'solo' && nextMode !== 'title';
  }

  setNetworkMode(netMode) {
    this.networkMode = netMode;
    this.echoSpirit.group.visible = netMode === 'solo' && this.mode !== 'title';
  }

  updateLocalAppearance(app) {
    this.localAppearance = { ...app };
    this.localRig.applyAppearance(this.localAppearance);
  }

  setRemoteConnected(isConn, remoteApp = null) {
    this.remoteTarget.active = isConn;
    this.remoteRig.root.visible = isConn;
    if (remoteApp) {
      this.remoteAppearance = remoteApp;
      this.remoteRig.applyAppearance(remoteApp);
    }
    this.echoSpirit.group.visible = !isConn && this.networkMode === 'solo';
  }

  applyRemoteState(state) {
    if (!state) return;
    this.remoteTarget.x = Number(state.x ?? this.remoteTarget.x);
    this.remoteTarget.y = Number(state.y ?? this.remoteTarget.y);
    this.remoteTarget.z = Number(state.z ?? this.remoteTarget.z);
    this.remoteTarget.rotY = Number(state.rotY ?? 0);
    this.remoteTarget.anim = state.anim || 'idle';
    this.remoteBoostOffer = Boolean(state.boostReady);
  }

  showRemoteBubble(text) {
    if (this.remoteTarget.active) {
      this.remoteRig.showBubble(text, 3.2);
    }
  }

  showLocalBubble(text) {
    this.localRig.showBubble(text, 2.8);
  }

  rotatePreviewCharacter(dx) {
    this.localRig.root.rotation.y += dx * 0.012;
  }

  skipTimeOfDay() {
    this.timeOfDay = (this.timeOfDay + 0.18) % 1;
  }

  captureScreenshot() {
    if (this.useBloom && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return this.renderer.domElement.toDataURL('image/png');
  }

  syncWorldVisualsFromProgress(silent = false) {
    // Обновляем фонари
    for (const l of this.env.lanterns) {
      const lit = this.progress.litLanterns.includes(l.id);
      l.lit = lit;
      l.coreMat.color.setHex(lit ? 0xffe49c : 0x555b70);
      l.halo.material.opacity = lit ? 0.85 : 0;
      if (l.skyBeam) {
        l.skyBeam.material.opacity = lit ? 0.24 : 0;
      }
    }

    // Верёвка в лесу
    this.env.ropeMesh.visible = Boolean(this.progress.ropeDropped);

    // Мост у озера
    if (this.progress.lakeBridgeOpen) {
      this.env.lakeBridge.position.y = 0.65;
    }

    // Мост в руинах
    if (this.progress.ruinsBridgeOpen) {
      this.env.ruinsBridge.visible = true;
      this.env.ruinsBridgeMat.opacity = 0.68;
    }

    // Собранные осколки и ракушки
    for (const c of this.env.collectibles) {
      c.collected = this.progress.collectedIds.includes(c.id);
      c.group.visible = !c.collected;
    }

    if (!silent) {
      this.cb.onProgressChanged?.(this.progress);
    }
  }

  mergeRemoteProgress(remoteProgress) {
    if (!remoteProgress) return;
    const union = (a = [], b = []) => Array.from(new Set([...a, ...b]));
    this.progress.litLanterns = union(this.progress.litLanterns, remoteProgress.litLanterns);
    this.progress.completedQuests = union(this.progress.completedQuests, remoteProgress.completedQuests);
    this.progress.collectedIds = union(this.progress.collectedIds, remoteProgress.collectedIds);
    this.progress.talkedNpcs = union(this.progress.talkedNpcs, remoteProgress.talkedNpcs);
    this.progress.ropeDropped = this.progress.ropeDropped || remoteProgress.ropeDropped;
    this.progress.lakeBridgeOpen = this.progress.lakeBridgeOpen || remoteProgress.lakeBridgeOpen;
    this.progress.ruinsBridgeOpen = this.progress.ruinsBridgeOpen || remoteProgress.ruinsBridgeOpen;
    this.progress.satTogether = this.progress.satTogether || remoteProgress.satTogether;
    this.progress.wavedOnce = this.progress.wavedOnce || remoteProgress.wavedOnce;
    this.syncWorldVisualsFromProgress(false);
  }

  completeQuest(questId) {
    if (this.progress.completedQuests.includes(questId)) return;
    this.progress.completedQuests.push(questId);
    const q = TEXTS.quests.find((item) => item.id === questId);
    if (q) {
      this.cb.onToast?.(formatText(TEXTS.notifications.questComplete, { title: q.title }));
    }
    this.sound?.playQuestComplete();
    this.cb.onProgressChanged?.(this.progress);
  }

  lightLantern(id, fromRemote = false) {
    if (this.progress.litLanterns.includes(id)) return;
    this.progress.litLanterns.push(id);
    this.syncWorldVisualsFromProgress(false);
    this.sound?.playLanternLit();

    if (!fromRemote) {
      this.cb.onSendNet?.({ type: 'lantern_lit', id });
    }

    if (id === 'village') this.completeQuest('q1_village_meet');
    if (id === 'forest') this.completeQuest('q3_forest_boost');
    if (id === 'lake') this.completeQuest('q4_lake_plates');
    if (id === 'ruins') this.completeQuest('q5_ruins_bridge');
    if (id === 'observatory') {
      this.completeQuest('q8_sky_beacon');
      this.player.joyTimer = 2.6;
      this.cb.onEndingReached?.();
    }

    this.cb.onToast?.(TEXTS.notifications.lanternLit);
    this.cb.onToast?.(TEXTS.notifications.noteUnlocked);
  }

  triggerEmote(emoteObj, fromRemote = false) {
    this.sound?.playEmote();
    if (!fromRemote) {
      this.showLocalBubble(emoteObj.label);
      if (emoteObj.id === 'wave') {
        this.player.waveTimer = 1.6;
      } else if (emoteObj.id === 'joy' || emoteObj.id === 'heart') {
        this.player.joyTimer = 1.5;
      } else if (emoteObj.id === 'sit') {
        this.trySitNearestBench();
      }
      if (!this.progress.wavedOnce) {
        this.progress.wavedOnce = true;
        this.completeQuest('q2_bench_moment');
      }
      this.cb.onSendNet?.({ type: 'emote', emote: emoteObj });
    } else {
      this.showRemoteBubble(emoteObj.label);
    }
  }

  trySitNearestBench() {
    if (this.player.sittingBench) {
      this.player.sittingBench = null;
      this.player.stargazing = false;
      this.player.y = groundHeightAt(this.player.x, this.player.z, this.progress);
      return true;
    }
    for (const bench of this.env.benches) {
      const d = Math.hypot(this.player.x - bench.center.x, this.player.z - bench.center.z);
      if (d < 3.6) {
        let seatIdx = 0;
        if (this.remoteTarget.active) {
          const dRemoteSeat0 = Math.hypot(this.remoteTarget.x - bench.seats[0].x, this.remoteTarget.z - bench.seats[0].z);
          if (dRemoteSeat0 < 0.9) seatIdx = 1;
        }
        const seat = bench.seats[seatIdx];
        this.player.x = seat.x;
        this.player.y = seat.y;
        this.player.z = seat.z;
        this.player.rotY = bench.rotY;
        this.player.sittingBench = bench;
        this.player.sittingSeatIdx = seatIdx;
        this.player.stargazing = false;
        this.progress.satTogether = true;
        this.completeQuest('q2_bench_moment');
        return true;
      }
    }
    return false;
  }

  callEchoSpirit() {
    if (this.networkMode !== 'solo') return;
    // Выбираем полезную точку рядом с игроком (плита у озера, кристалл руин или подсадка в лесу)
    const dLake = Math.hypot(this.player.x - 20, this.player.z - 8);
    const dRuins = Math.hypot(this.player.x + 18, this.player.z + 33.5);
    const dBoost = Math.hypot(this.player.x - this.env.boostSpot.x, this.player.z - this.env.boostSpot.z);

    if (dLake < 15) {
      const dA = Math.hypot(this.player.x - this.env.lakePlateA.pos.x, this.player.z - this.env.lakePlateA.pos.z);
      this.spiritTarget = dA < 4 ? this.env.lakePlateB.pos.clone() : this.env.lakePlateA.pos.clone();
      this.spiritHoldTimer = 14;
      this.cb.onToast?.(TEXTS.notifications.spiritCalled);
    } else if (dRuins < 15) {
      const dA = Math.hypot(this.player.x - this.env.crystalA.pos.x, this.player.z - this.env.crystalA.pos.z);
      this.spiritTarget = dA < 5 ? this.env.crystalB.pos.clone() : this.env.crystalA.pos.clone();
      this.spiritHoldTimer = 14;
      this.cb.onToast?.(TEXTS.notifications.spiritCalled);
    } else if (dBoost < 8) {
      // В одиночном режиме дух подкидывает тебя на лесной уступ для теста
      this.player.x = FOREST_LEDGE.x + 2.0;
      this.player.z = FOREST_LEDGE.z;
      this.player.y = FOREST_LEDGE.topY + 0.3;
      this.player.vy = 2.5;
      this.player.grounded = false;
      this.sound?.playJump();
      this.cb.onToast?.(TEXTS.notifications.spiritCalled);
    } else {
      this.spiritTarget = null;
      this.spiritHoldTimer = 0;
      this.cb.onToast?.(TEXTS.notifications.spiritCalled);
    }
  }

  performContextInteract() {
    if (this.player.sittingBench) {
      if (this.player.sittingBench.isStargaze) {
        this.player.stargazing = !this.player.stargazing;
      } else {
        this.trySitNearestBench();
      }
      return;
    }

    const action = this.findNearestAction();
    if (!action) return;

    if (action.type === 'npc') {
      if (!this.progress.talkedNpcs.includes(action.npc.id)) {
        this.progress.talkedNpcs.push(action.npc.id);
      }
      if (action.npc.id === 'noa') {
        this.completeQuest('q7_observatory_climb');
      }
      this.cb.onOpenNpcDialogue?.(action.npc.id);
    } else if (action.type === 'lantern') {
      if (action.lantern.id === 'observatory') {
        const lowerLit = ['village', 'forest', 'lake', 'ruins'].filter((id) =>
          this.progress.litLanterns.includes(id)
        ).length;
        if (lowerLit < 4) {
          this.cb.onToast?.(formatText(TEXTS.prompts.needMoreLanterns, { lit: lowerLit }));
          return;
        }
      }
      this.lightLantern(action.lantern.id);
    } else if (action.type === 'bench') {
      this.trySitNearestBench();
    } else if (action.type === 'boost_help') {
      if (this.networkMode === 'solo') {
        this.callEchoSpirit();
      } else {
        this.boostOfferTime = 10;
        this.player.waveTimer = 1.4;
        this.showLocalBubble('Прыгай!');
        this.cb.onToast?.(TEXTS.notifications.boostReady);
      }
    } else if (action.type === 'boost_jump') {
      this.player.x = FOREST_LEDGE.x + 2.2;
      this.player.z = FOREST_LEDGE.z;
      this.player.y = FOREST_LEDGE.topY + 0.4;
      this.player.vy = 2.8;
      this.player.grounded = false;
      this.sound?.playJump();
    } else if (action.type === 'drop_rope') {
      this.progress.ropeDropped = true;
      this.syncWorldVisualsFromProgress(false);
      this.cb.onSendNet?.({ type: 'rope_dropped' });
      this.cb.onToast?.(TEXTS.notifications.ropeDropped);
    } else if (action.type === 'climb_rope') {
      this.player.x = this.env.ropeAnchor.x - 1.2;
      this.player.z = this.env.ropeAnchor.z;
      this.player.y = FOREST_LEDGE.topY + 0.1;
      this.sound?.playJump();
    } else if (action.type === 'crystalA') {
      this.crystalATimer = 12;
      this.sound?.playCollect();
      this.cb.onSendNet?.({ type: 'crystal_touch', crystal: 'A' });
      this.checkRuinsBridge();
    } else if (action.type === 'crystalB') {
      this.crystalBTimer = 12;
      this.sound?.playCollect();
      this.cb.onSendNet?.({ type: 'crystal_touch', crystal: 'B' });
      this.checkRuinsBridge();
    }
  }

  checkRuinsBridge(fromRemote = false) {
    if (this.progress.ruinsBridgeOpen) return;
    if (this.crystalATimer > 0 && this.crystalBTimer > 0) {
      this.progress.ruinsBridgeOpen = true;
      this.syncWorldVisualsFromProgress(false);
      this.sound?.playBridgeOpen();
      this.cb.onToast?.(TEXTS.notifications.bridgeActive);
      if (!fromRemote) {
        this.cb.onSendNet?.({ type: 'ruins_bridge' });
      }
    }
  }

  findNearestAction() {
    const px = this.player.x;
    const py = this.player.y;
    const pz = this.player.z;

    if (this.player.sittingBench) {
      return {
        type: 'bench_seated',
        label: this.player.sittingBench.isStargaze
          ? (this.player.stargazing ? TEXTS.prompts.stopStargaze : TEXTS.prompts.stargaze)
          : TEXTS.prompts.standUp,
      };
    }

    // 1. Фонари
    for (const l of this.env.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(px - l.x, pz - l.z) + Math.abs(py - l.y) * 0.8;
      if (d < 3.4) {
        return {
          type: 'lantern',
          lantern: l,
          label: l.isGrandBeacon ? TEXTS.prompts.observatoryFinish : TEXTS.prompts.lightLantern,
        };
      }
    }

    // 2. NPC
    for (const npc of this.env.npcs) {
      const d = Math.hypot(px - npc.x, pz - npc.z);
      if (d < 3.2 && Math.abs(py - npc.y) < 2.2) {
        const npcInfo = TEXTS.npcs[npc.id];
        return {
          type: 'npc',
          npc,
          label: formatText(TEXTS.prompts.talkNpc, { name: npcInfo.name }),
        };
      }
    }

    // 3. Подсадка на лесной уступ / верёвка
    const dBoost = Math.hypot(px - this.env.boostSpot.x, pz - this.env.boostSpot.z);
    if (dBoost < 2.8 && py < 5.0) {
      if (this.remoteBoostOffer) {
        return { type: 'boost_jump', label: TEXTS.prompts.boostJump };
      }
      return { type: 'boost_help', label: TEXTS.prompts.boostHelp };
    }

    const dRopeTop = Math.hypot(px - this.env.ropeAnchor.x, pz - this.env.ropeAnchor.z);
    if (!this.progress.ropeDropped && py > 5.8 && dRopeTop < 3.0) {
      return { type: 'drop_rope', label: TEXTS.prompts.dropRope };
    }
    if (this.progress.ropeDropped && py < 5.0 && dRopeTop < 3.0) {
      return { type: 'climb_rope', label: TEXTS.prompts.climbRope };
    }

    // 4. Кристаллы в руинах
    if (!this.progress.ruinsBridgeOpen) {
      if (Math.hypot(px - this.env.crystalA.pos.x, pz - this.env.crystalA.pos.z) < 2.6) {
        return { type: 'crystalA', label: TEXTS.prompts.crystalTouch };
      }
      if (Math.hypot(px - this.env.crystalB.pos.x, pz - this.env.crystalB.pos.z) < 2.6) {
        return { type: 'crystalB', label: TEXTS.prompts.crystalTouch };
      }
    }

    // 5. Скамейки
    for (const b of this.env.benches) {
      if (Math.hypot(px - b.center.x, pz - b.center.z) < 3.0) {
        return { type: 'bench', bench: b, label: TEXTS.prompts.sitBench };
      }
    }

    return null;
  }

  handleRemoteMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      this.setRemoteConnected(true, msg.appearance);
      if (msg.progress) {
        this.mergeRemoteProgress(msg.progress);
      }
      this.cb.onToast?.(TEXTS.network.partnerJoined);
    } else if (msg.type === 'lantern_lit') {
      this.lightLantern(msg.id, true);
    } else if (msg.type === 'rope_dropped') {
      this.progress.ropeDropped = true;
      this.syncWorldVisualsFromProgress(false);
      this.cb.onToast?.(TEXTS.notifications.ropeDropped);
    } else if (msg.type === 'lake_bridge') {
      this.progress.lakeBridgeOpen = true;
      this.syncWorldVisualsFromProgress(false);
      this.sound?.playBridgeOpen();
      this.cb.onToast?.(TEXTS.notifications.bridgeActive);
    } else if (msg.type === 'crystal_touch') {
      if (msg.crystal === 'A') this.crystalATimer = 12;
      if (msg.crystal === 'B') this.crystalBTimer = 12;
      this.checkRuinsBridge(true);
    } else if (msg.type === 'ruins_bridge') {
      this.progress.ruinsBridgeOpen = true;
      this.syncWorldVisualsFromProgress(false);
      this.sound?.playBridgeOpen();
    } else if (msg.type === 'collect') {
      if (!this.progress.collectedIds.includes(msg.id)) {
        this.progress.collectedIds.push(msg.id);
        this.syncWorldVisualsFromProgress(false);
      }
    } else if (msg.type === 'emote') {
      this.triggerEmote(msg.emote, true);
    } else if (msg.type === 'chat') {
      this.showRemoteBubble(msg.text);
      this.cb.onChatReceived?.(msg.text);
    }
  }

  startLoop() {
    this.stopLoop();
    this.clock.getDelta();
    const tick = () => {
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      this.update(dt);

      if (this.useBloom && !this.isSoftwareGl) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  afterDraw(cb) {
    const gl = this.renderer.getContext();
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  stopLoop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  update(dt) {
    this.elapsed += dt;

    // Автоподстройка качества под стабильные 60 FPS на мобильных
    if (this.qualitySetting === 'auto' && !this.isSoftwareGl && this.mode === 'playing') {
      this.frameTimeAccum += dt;
      this.frameTimeSamples += 1;
      if (this.frameTimeSamples >= 90) {
        const avg = this.frameTimeAccum / this.frameTimeSamples;
        if (avg > 0.028 && this.effectiveQuality === 'high') {
          this.applyQualityPreset('medium');
        } else if (avg > 0.032 && this.effectiveQuality === 'medium') {
          this.applyQualityPreset('low');
        }
        this.frameTimeAccum = 0;
        this.frameTimeSamples = 0;
      }
    }

    // 1. Цикл дня и ночи (на главном экране держим красивый тёплый закат)
    if (this.mode === 'playing' || this.mode === 'photo') {
      this.timeOfDay = (this.timeOfDay + dt * 0.0042 * this.dayCycleSpeed) % 1;
    } else if (this.mode === 'title') {
      this.timeOfDay = 0.72 + Math.sin(this.elapsed * 0.08) * 0.015;
    }
    const todInfo = this.env.updateTimeOfDay(this.timeOfDay);
    this.sound?.setNightMode(todInfo.isNight);

    // Свет теней следует за игроком для максимальной чёткости теней
    this.env.sunLight.position.set(
      this.player.x + todInfo.sunDirPos.x * 0.45,
      Math.max(18, todInfo.sunDirPos.y * 0.45),
      this.player.z + todInfo.sunDirPos.z * 0.45
    );
    this.env.sunLight.target.position.set(this.player.x, this.player.y, this.player.z);

    // 2. Анимация воды, травы, облаков, лодки, маяка и частиц
    this.env.waterMat.uniforms.uTime.value = this.elapsed;
    if (this.env.grassMat.userData.shader) {
      this.env.grassMat.userData.shader.uniforms.uTime.value = this.elapsed;
    }
    this.env.lhBeamPivot.rotation.y += dt * 0.45;
    this.env.boatGroup.position.y = 0.12 + Math.sin(this.elapsed * 1.6) * 0.07;
    this.env.boatGroup.rotation.z = Math.sin(this.elapsed * 1.2) * 0.04;

    for (const c of this.env.clouds) {
      c.userData.angle += dt * 0.012 * c.userData.speed;
      c.position.x = Math.cos(c.userData.angle) * c.userData.radius;
      c.position.z = Math.sin(c.userData.angle) * c.userData.radius;
    }

    // Светлячки
    const ffAttr = this.env.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.env.ffBase.length; i++) {
      const b = this.env.ffBase[i];
      ffAttr.setXYZ(
        i,
        b.x + Math.sin(this.elapsed * 0.9 + b.phase) * 0.9,
        b.y + Math.sin(this.elapsed * 1.4 + b.phase * 1.3) * 0.45,
        b.z + Math.cos(this.elapsed * 0.8 + b.phase) * 0.9
      );
    }
    ffAttr.needsUpdate = true;

    // Лепестки в лесу
    const petAttr = this.env.petals.geometry.attributes.position;
    for (let i = 0; i < this.env.petBase.length; i++) {
      const b = this.env.petBase[i];
      let py = b.y - ((this.elapsed * b.speed + b.phase) % 6.5);
      if (py < 2.2) py += 6.5;
      petAttr.setXYZ(
        i,
        b.x + Math.sin(this.elapsed + b.phase) * 0.7,
        py,
        b.z + Math.cos(this.elapsed * 0.8 + b.phase) * 0.7
      );
    }
    petAttr.needsUpdate = true;

    // Вращение коллекционных предметов
    for (const item of this.env.collectibles) {
      if (!item.collected) {
        item.group.rotation.y += dt * 1.8;
        item.group.position.y = item.baseY + Math.sin(this.elapsed * 2.5 + item.x) * 0.16;
      }
    }

    // 3. Режимы камеры и движения
    if (this.mode === 'title') {
      // Кинематографичный облёт маяка и причала на закате
      const angle = this.elapsed * 0.12;
      _camPos.set(-12 + Math.cos(angle) * 28, 12.5 + Math.sin(angle * 0.7) * 2.0, 52 + Math.sin(angle) * 22);
      _camTarget.set(-8, 5.2, 46);
      this.camera.position.lerp(_camPos, 1 - Math.exp(-3 * dt));
      this.camera.lookAt(_camTarget);
      updateCharacterAnimation(this.localRig, 'idle', dt, this.elapsed);
      return;
    }

    if (this.mode === 'customizer') {
      // Камера крупным планом перед персонажем
      this.localRig.root.position.set(this.player.x, this.player.y, this.player.z);
      _camTarget.set(this.player.x, this.player.y + 1.05, this.player.z);
      _camPos.set(this.player.x, this.player.y + 1.25, this.player.z + 2.85);
      this.camera.position.lerp(_camPos, 1 - Math.exp(-8 * dt));
      this.camera.lookAt(_camTarget);
      updateCharacterAnimation(this.localRig, 'idle', dt, this.elapsed);
      return;
    }

    // 4. Геймплей: физика и управление игроком
    if (this.mode === 'playing' || this.mode === 'photo') {
      this.updatePlayer(dt);
      this.updatePuzzlesAndSpirit(dt);
      this.updateCollectiblesAndZones();
      this.updateThirdPersonCamera(dt);
    }

    // Анимации персонажей и NPC
    updateCharacterAnimation(this.localRig, this.player.anim, dt, this.elapsed);

    if (this.remoteTarget.active) {
      const rk = 1 - Math.exp(-12 * dt);
      this.remoteRig.root.position.x = THREE.MathUtils.lerp(this.remoteRig.root.position.x, this.remoteTarget.x, rk);
      this.remoteRig.root.position.y = THREE.MathUtils.lerp(this.remoteRig.root.position.y, this.remoteTarget.y, rk);
      this.remoteRig.root.position.z = THREE.MathUtils.lerp(this.remoteRig.root.position.z, this.remoteTarget.z, rk);

      // Кратчайшая интерполяция угла поворота
      let diff = this.remoteTarget.rotY - this.remoteRig.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.remoteRig.root.rotation.y += diff * rk;

      updateCharacterAnimation(this.remoteRig, this.remoteTarget.anim, dt, this.elapsed);
    }

    for (const npc of this.env.npcs) {
      updateCharacterAnimation(npc.rig, 'idle', dt, this.elapsed + npc.x);
      npc.marker.rotation.y += dt * 2;
      npc.marker.position.y = 2.25 + Math.sin(this.elapsed * 3 + npc.z) * 0.08;
    }

    // Отправка состояния напарнику ~18 раз в секунду
    if (this.networkMode !== 'solo' && this.mode === 'playing') {
      this.netSendAccum += dt;
      if (this.netSendAccum >= 0.055) {
        this.netSendAccum = 0;
        this.cb.onSendState?.({
          x: Number(this.player.x.toFixed(2)),
          y: Number(this.player.y.toFixed(2)),
          z: Number(this.player.z.toFixed(2)),
          rotY: Number(this.player.rotY.toFixed(2)),
          anim: this.player.anim,
          boostReady: this.boostOfferTime > 0,
        });
      }
    }
  }

  updatePlayer(dt) {
    const input = this.input;
    if (!input) return;

    const look = input.consumeLookDelta();
    const sens = 0.0055 * this.sensitivity;
    this.camYaw -= look.dx * sens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.dy * sens, -0.25, 1.15);

    const zoom = input.consumeZoomDelta();
    if (zoom !== 0) {
      this.camDist = THREE.MathUtils.clamp(this.camDist + zoom * 0.5, 4.0, 14.5);
    }

    if (this.boostOfferTime > 0) this.boostOfferTime -= dt;
    if (this.player.waveTimer > 0) this.player.waveTimer -= dt;
    if (this.player.joyTimer > 0) this.player.joyTimer -= dt;

    const move = input.getMovementVector();

    // Если игрок сидит на скамейке, движение встаёт со скамейки
    if (this.player.sittingBench) {
      if (move.magnitude > 0.35 || input.consumeJumpBuffer(dt)) {
        this.player.sittingBench = null;
        this.player.stargazing = false;
        this.player.y = groundHeightAt(this.player.x, this.player.z, this.progress);
      } else {
        this.player.anim = 'sit';
        this.localRig.root.position.set(this.player.x, this.player.y, this.player.z);
        this.localRig.root.rotation.y = this.player.rotY;
        return;
      }
    }

    // Движение относительно направления камеры
    _forward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_right, move.x);
    _moveDir.addScaledVector(_forward, -move.y);
    const moveLen = _moveDir.length();
    if (moveLen > 0.001) _moveDir.divideScalar(moveLen);

    const maxSpeed = move.magnitude > 0.72 ? 7.6 : 4.6;
    const speed = moveLen > 0.05 ? maxSpeed * Math.min(1, move.magnitude) : 0;
    this.player.speed = speed;

    if (speed > 0.1) {
      const nextX = this.player.x + _moveDir.x * speed * dt;
      const nextZ = this.player.z + _moveDir.z * speed * dt;

      // Ограничение периметра острова (не уходим в глубокий океан)
      const distCenter = Math.hypot(nextX, nextZ);
      const nextGround = groundHeightAt(nextX, nextZ, this.progress);

      // Нельзя зашагнуть на высокий уступ без прыжка/помощи, и не уходим глубже груди в воду
      const stepDelta = nextGround - this.player.y;
      if (distCenter < 70 && nextGround > -0.65 && stepDelta < 1.15) {
        this.player.x = nextX;
        this.player.z = nextZ;
      } else if (distCenter < 70) {
        // Скольжение по осям вдоль препятствия
        const gxOnly = groundHeightAt(nextX, this.player.z, this.progress);
        if (gxOnly > -0.65 && gxOnly - this.player.y < 1.15) {
          this.player.x = nextX;
        }
        const gzOnly = groundHeightAt(this.player.x, nextZ, this.progress);
        if (gzOnly > -0.65 && gzOnly - this.player.y < 1.15) {
          this.player.z = nextZ;
        }
      }

      const targetRot = Math.atan2(_moveDir.x, _moveDir.z);
      let diff = targetRot - this.player.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.player.rotY += diff * (1 - Math.exp(-14 * dt));
    }

    // Гравитация, прыжок и время койота
    const groundY = Math.max(-0.55, groundHeightAt(this.player.x, this.player.z, this.progress));
    if (this.player.grounded) {
      this.player.coyoteTime = 0.14;
    } else {
      this.player.coyoteTime = Math.max(0, this.player.coyoteTime - dt);
    }

    if (this.player.coyoteTime > 0 && input.consumeJumpBuffer(dt)) {
      this.player.vy = 7.4;
      this.player.grounded = false;
      this.player.coyoteTime = 0;
      this.sound?.playJump();
    } else {
      input.consumeJumpBuffer(dt);
    }

    this.player.vy -= 18.5 * dt;
    this.player.y += this.player.vy * dt;

    if (this.player.y <= groundY) {
      this.player.y = groundY;
      this.player.vy = 0;
      this.player.grounded = true;
    } else {
      this.player.grounded = false;
    }

    // Шаги
    if (this.player.grounded) {
      this.sound?.playStep(dt, speed, groundY < WATER_LEVEL + 0.08);
    }

    // Выбор состояния анимации
    if (!this.player.grounded) {
      this.player.anim = 'jump';
    } else if (speed > 5.4) {
      this.player.anim = 'run';
    } else if (speed > 0.35) {
      this.player.anim = 'walk';
    } else if (this.player.waveTimer > 0) {
      this.player.anim = 'wave';
    } else if (this.player.joyTimer > 0) {
      this.player.anim = 'joy';
    } else {
      this.player.anim = 'idle';
    }

    this.localRig.root.position.set(this.player.x, this.player.y, this.player.z);
    this.localRig.root.rotation.y = this.player.rotY;
  }

  updatePuzzlesAndSpirit(dt) {
    // 1. Логика духа-спутника в одиночном режиме
    if (this.networkMode === 'solo') {
      if (this.spiritHoldTimer > 0 && this.spiritTarget) {
        this.spiritHoldTimer -= dt;
        this.echoSpirit.group.position.lerp(this.spiritTarget, 1 - Math.exp(-5 * dt));
      } else {
        this.spiritTarget = null;
        const followX = this.player.x - Math.sin(this.player.rotY + 0.7) * 1.7;
        const followZ = this.player.z - Math.cos(this.player.rotY + 0.7) * 1.7;
        const followY = this.player.y + 0.45 + Math.sin(this.elapsed * 2.8) * 0.18;
        this.echoSpirit.group.position.lerp(
          _camTarget.set(followX, followY, followZ),
          1 - Math.exp(-4.5 * dt)
        );
      }
      this.echoSpirit.core.position.y = 0.9 + Math.sin(this.elapsed * 3.4) * 0.12;
      this.echoSpirit.halo.position.y = this.echoSpirit.core.position.y;
    }

    // 2. Зеркальное озеро: 2 нажимные плиты
    const checkOnPlate = (plate) => {
      const dLocal = Math.hypot(this.player.x - plate.pos.x, this.player.z - plate.pos.z);
      const dRemote = this.remoteTarget.active
        ? Math.hypot(this.remoteTarget.x - plate.pos.x, this.remoteTarget.z - plate.pos.z)
        : 99;
      const dSpirit = this.networkMode === 'solo'
        ? Math.hypot(this.echoSpirit.group.position.x - plate.pos.x, this.echoSpirit.group.position.z - plate.pos.z)
        : 99;
      return dLocal < 1.55 || dRemote < 1.55 || dSpirit < 1.55;
    };

    const aPressed = checkOnPlate(this.env.lakePlateA);
    const bPressed = checkOnPlate(this.env.lakePlateB);
    this.env.lakePlateA.runeMat.color.setHex(aPressed || this.progress.lakeBridgeOpen ? 0xffe48f : 0x67d8ff);
    this.env.lakePlateB.runeMat.color.setHex(bPressed || this.progress.lakeBridgeOpen ? 0xffe48f : 0x67d8ff);

    if (aPressed && bPressed && !this.progress.lakeBridgeOpen) {
      this.progress.lakeBridgeOpen = true;
      this.syncWorldVisualsFromProgress(false);
      this.sound?.playBridgeOpen();
      this.cb.onSendNet?.({ type: 'lake_bridge' });
      this.cb.onToast?.(TEXTS.notifications.bridgeActive);
    }
    const targetBridgeY = this.progress.lakeBridgeOpen ? 0.65 : -0.75;
    this.env.lakeBridge.position.y = THREE.MathUtils.lerp(this.env.lakeBridge.position.y, targetBridgeY, 1 - Math.exp(-4 * dt));

    // 3. Руины: кристаллы и дух
    if (this.crystalATimer > 0) this.crystalATimer -= dt;
    if (this.crystalBTimer > 0) this.crystalBTimer -= dt;

    if (this.networkMode === 'solo' && !this.progress.ruinsBridgeOpen) {
      if (Math.hypot(this.echoSpirit.group.position.x - this.env.crystalA.pos.x, this.echoSpirit.group.position.z - this.env.crystalA.pos.z) < 1.5) {
        this.crystalATimer = 2;
      }
      if (Math.hypot(this.echoSpirit.group.position.x - this.env.crystalB.pos.x, this.echoSpirit.group.position.z - this.env.crystalB.pos.z) < 1.5) {
        this.crystalBTimer = 2;
      }
      this.checkRuinsBridge(false);
    }

    this.env.crystalA.gem.rotation.y += dt * 1.5;
    this.env.crystalB.gem.rotation.y -= dt * 1.5;
    this.env.crystalA.gemMat.color.setHex(this.crystalATimer > 0 || this.progress.ruinsBridgeOpen ? 0xffe48f : 0x64b5f6);
    this.env.crystalB.gemMat.color.setHex(this.crystalBTimer > 0 || this.progress.ruinsBridgeOpen ? 0xffe48f : 0x64b5f6);

    // 4. Пульсация кольца помощи у уступа
    this.env.boostSpot;
    if (this.remoteBoostOffer) {
      this.env.ropeMesh;
    }
  }

  updateCollectiblesAndZones() {
    // Проверка подбора осколков и ракушек
    for (const c of this.env.collectibles) {
      if (c.collected) continue;
      const d = Math.hypot(this.player.x - c.x, this.player.z - c.z);
      if (d < 1.5 && Math.abs(this.player.y + 0.8 - c.baseY) < 1.8) {
        c.collected = true;
        c.group.visible = false;
        this.progress.collectedIds.push(c.id);
        this.sound?.playCollect();
        this.cb.onSendNet?.({ type: 'collect', id: c.id });
        this.cb.onProgressChanged?.(this.progress);

        const totalShards = this.env.collectibles.filter((i) => i.kind === 'shard').length;
        const gotShards = this.env.collectibles.filter(
          (i) => i.kind === 'shard' && this.progress.collectedIds.includes(i.id)
        ).length;

        if (c.kind === 'shard') {
          this.cb.onToast?.(formatText(TEXTS.notifications.shardFound, { got: gotShards, total: totalShards }));
          if (gotShards >= 6) {
            this.completeQuest('q6_collect_shards');
          }
        } else {
          this.cb.onToast?.(TEXTS.notifications.shellFound);
        }
      }
    }

    // Проверка зоны и контекстной подсказки
    const zone = getZoneAt(this.player.x, this.player.z);
    if (zone !== this.lastZone) {
      this.lastZone = zone;
      this.cb.onZoneChange?.(zone);
    }
    if (zone === 'observatory' && Math.hypot(this.player.x - OBS_SUMMIT.x, this.player.z - OBS_SUMMIT.z) < 11) {
      // Открываем квест пути, когда дошли до обсерватории и пообщались (либо уже на месте)
    }

    const action = this.findNearestAction();
    const nextLabel = action ? action.label : null;
    if (nextLabel !== this.currentPrompt) {
      this.currentPrompt = nextLabel;
      this.cb.onPromptChange?.(nextLabel, action?.type || null);
    }
  }

  updateThirdPersonCamera(dt) {
    if (this.player.stargazing && this.player.sittingBench) {
      // Режим любования звёздами: плавный наклон вверх к небу
      _camPos.set(
        this.player.x + Math.sin(this.player.rotY) * 1.2,
        this.player.y + 1.2,
        this.player.z + Math.cos(this.player.rotY) * 1.2
      );
      _camTarget.set(
        this.player.x - Math.sin(this.player.rotY) * 12,
        this.player.y + 14,
        this.player.z - Math.cos(this.player.rotY) * 12
      );
    } else {
      _camTarget.set(this.player.x, this.player.y + 1.35, this.player.z);
      const horiz = Math.cos(this.camPitch) * this.camDist;
      const vert = Math.sin(this.camPitch) * this.camDist;
      const desiredX = _camTarget.x + Math.sin(this.camYaw) * horiz;
      const desiredZ = _camTarget.z + Math.cos(this.camYaw) * horiz;
      const groundAtCam = groundHeightAt(desiredX, desiredZ, this.progress);
      const desiredY = Math.max(groundAtCam + 0.85, _camTarget.y + vert);
      _camPos.set(desiredX, desiredY, desiredZ);
    }

    const k = 1 - Math.exp(-10 * dt);
    this.camPosCurrent.lerp(_camPos, k);
    this.camLookCurrent.lerp(_camTarget, k);
    this.camera.position.copy(this.camPosCurrent);
    this.camera.lookAt(this.camLookCurrent);
  }

  dispose() {
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
