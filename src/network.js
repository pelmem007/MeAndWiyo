import Peer from 'peerjs';
import {
  ICE_SERVERS,
  PEER_PREFIX,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './config.js';
import { FIREBASE_FALLBACK_CONFIG } from './firebaseConfig.js';
import { TEXTS } from './texts.ru.js';

export function generateRoomCode() {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    out += ROOM_CODE_ALPHABET[idx];
  }
  return out;
}

export class NetworkManager {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.mode = 'solo'; // 'solo' | 'host' | 'guest'
    this.transport = 'none'; // 'none' | 'peerjs' | 'firebase'
    this.roomCode = '';
    this.peer = null;
    this.conn = null;
    this.connected = false;
    this.pingMs = 0;

    this.pingTimer = null;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
    this.fbPollTimer = null;

    this.lastRemoteRxTime = 0;
    this.reconnectAttempts = 0;
    this.isDestroyed = false;

    // Состояние для Firebase fallback
    this.fbPlayerRole = 'host';
    this.fbSeenEventIds = new Set();
    this.fbLastSendTime = 0;
  }

  setCallbacks(callbacks) {
    this.cb = { ...this.cb, ...callbacks };
  }

  startSolo() {
    this.cleanup();
    this.mode = 'solo';
    this.transport = 'none';
    this.roomCode = '';
    this.connected = false;
    this.cb.onStatusChange?.('solo', TEXTS.network.soloLabel);
  }

  createRoom(localAppearance, localProgress) {
    this.cleanup();
    this.isDestroyed = false;
    this.mode = 'host';
    this.transport = 'peerjs';
    this.roomCode = generateRoomCode();
    this.localAppearance = localAppearance;
    this.localProgress = localProgress;
    this.reconnectAttempts = 0;

    this.openHostPeer();
    return this.roomCode;
  }

  openHostPeer() {
    if (this.isDestroyed) return;
    const peerId = `${PEER_PREFIX}${this.roomCode}`;

    try {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: { iceServers: ICE_SERVERS },
      });
    } catch (err) {
      this.cb.onError?.(TEXTS.network.roomError);
      return;
    }

    this.peer.on('open', () => {
      this.cb.onRoomReady?.(this.roomCode);
      this.cb.onStatusChange?.('waiting', TEXTS.titleScreen.roomWaiting);
    });

    this.peer.on('connection', (conn) => {
      // Принимаем нового гостя (если старый завис, заменяем)
      if (this.conn && this.conn !== conn) {
        try {
          this.conn.close();
        } catch {
          // Игнорируем ошибку
        }
      }
      this.attachConnection(conn);
    });

    this.peer.on('disconnected', () => {
      if (this.isDestroyed) return;
      this.cb.onStatusChange?.('reconnecting', TEXTS.network.reconnecting);
      try {
        this.peer?.reconnect();
      } catch {
        // Повторная попытка через таймер
      }
    });

    this.peer.on('error', (err) => {
      if (this.isDestroyed) return;
      if (err?.type === 'unavailable-id') {
        // Если такой код уже занят, перегенерируем другой
        this.roomCode = generateRoomCode();
        this.peer?.destroy();
        this.openHostPeer();
        return;
      }
      this.cb.onError?.(TEXTS.network.roomError);
    });
  }

  joinRoom(code, localAppearance) {
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== ROOM_CODE_LENGTH) {
      this.cb.onError?.(TEXTS.network.badCode);
      return false;
    }

    this.cleanup();
    this.isDestroyed = false;
    this.mode = 'guest';
    this.transport = 'peerjs';
    this.roomCode = clean;
    this.localAppearance = localAppearance;
    this.reconnectAttempts = 0;

    this.openGuestPeer();
    return true;
  }

  openGuestPeer() {
    if (this.isDestroyed) return;
    this.cb.onStatusChange?.('connecting', TEXTS.titleScreen.connecting);

    try {
      this.peer = new Peer(undefined, {
        debug: 1,
        config: { iceServers: ICE_SERVERS },
      });
    } catch {
      this.cb.onError?.(TEXTS.network.roomError);
      return;
    }

    const connectTimeout = window.setTimeout(() => {
      if (!this.connected && !this.isDestroyed && this.mode === 'guest') {
        this.cb.onError?.(TEXTS.network.roomError);
      }
    }, 10000);

    this.peer.on('open', () => {
      if (this.isDestroyed) return;
      const targetId = `${PEER_PREFIX}${this.roomCode}`;
      const conn = this.peer.connect(targetId, { reliable: true });
      this.attachConnection(conn, connectTimeout);
    });

    this.peer.on('disconnected', () => {
      if (this.isDestroyed) return;
      this.cb.onStatusChange?.('reconnecting', TEXTS.network.reconnecting);
      try {
        this.peer?.reconnect();
      } catch {
        // Игнорируем
      }
    });

    this.peer.on('error', () => {
      window.clearTimeout(connectTimeout);
      if (this.isDestroyed) return;
      if (!this.connected) {
        this.cb.onError?.(TEXTS.network.roomError);
      }
    });
  }

  attachConnection(conn, timeoutHandle = null) {
    this.conn = conn;

    conn.on('open', () => {
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastRemoteRxTime = performance.now();

      this.cb.onStatusChange?.('connected', TEXTS.network.connected);
      this.cb.onPartnerJoined?.();

      // Обмениваемся внешностью и состоянием мира
      this.sendReliable({
        type: 'hello',
        appearance: this.localAppearance,
        progress: this.mode === 'host' ? this.localProgress : null,
      });

      this.startHeartbeat();
    });

    conn.on('data', (data) => {
      this.lastRemoteRxTime = performance.now();
      this.handleIncomingData(data);
    });

    conn.on('close', () => {
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      this.handleConnectionLost();
    });

    conn.on('error', () => {
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      this.handleConnectionLost();
    });
  }

  handleConnectionLost() {
    if (this.isDestroyed || this.mode === 'solo') return;
    const wasConnected = this.connected;
    this.connected = false;
    this.stopHeartbeat();

    if (!wasConnected && this.mode === 'guest') {
      this.cb.onError?.(TEXTS.network.roomError);
      return;
    }

    this.cb.onStatusChange?.('reconnecting', TEXTS.network.reconnecting);

    if (this.mode === 'guest' && this.reconnectAttempts < 3) {
      this.reconnectAttempts += 1;
      const delay = 1400 * this.reconnectAttempts;
      this.reconnectTimer = window.setTimeout(() => {
        if (!this.isDestroyed && !this.connected && this.peer && !this.peer.destroyed) {
          const targetId = `${PEER_PREFIX}${this.roomCode}`;
          const nextConn = this.peer.connect(targetId, { reliable: true });
          this.attachConnection(nextConn);
        }
      }, delay);
    } else {
      this.cb.onPartnerLeft?.();
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (!this.connected) return;
      this.sendReliable({ type: 'ping', t: performance.now() });
    }, 2000);

    this.watchdogTimer = window.setInterval(() => {
      if (!this.connected) return;
      if (performance.now() - this.lastRemoteRxTime > 8500) {
        this.handleConnectionLost();
      }
    }, 2500);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  handleIncomingData(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') {
      this.sendReliable({ type: 'pong', t: msg.t });
      return;
    }
    if (msg.type === 'pong') {
      const rtt = Math.max(1, Math.round(performance.now() - Number(msg.t || 0)));
      this.pingMs = rtt;
      this.cb.onPing?.(rtt);
      return;
    }
    if (msg.type === 'state') {
      this.cb.onRemoteState?.(msg);
      return;
    }
    this.cb.onMessage?.(msg);
  }

  sendState(statePayload) {
    if (this.mode === 'solo') return;
    if (this.transport === 'peerjs') {
      if (this.conn && this.conn.open && this.connected) {
        this.conn.send({ type: 'state', ...statePayload });
      }
    } else if (this.transport === 'firebase') {
      const now = performance.now();
      if (now - this.fbLastSendTime < FIREBASE_FALLBACK_CONFIG.pollIntervalMs) return;
      this.fbLastSendTime = now;
      this.fbWriteState(statePayload);
    }
  }

  sendReliable(msg) {
    if (this.mode === 'solo') return;
    if (this.transport === 'peerjs') {
      if (this.conn && this.conn.open) {
        this.conn.send(msg);
      }
    } else if (this.transport === 'firebase') {
      this.fbPushEvent(msg);
    }
  }

  // Запасной режим через Firebase Realtime Database REST API (без тяжёлых библиотек)
  isFirebaseConfigured() {
    return Boolean(
      FIREBASE_FALLBACK_CONFIG.enabled &&
      FIREBASE_FALLBACK_CONFIG.databaseURL &&
      FIREBASE_FALLBACK_CONFIG.databaseURL.startsWith('https://'),
    );
  }

  startFirebaseRoom(isHost, roomCode, localAppearance, localProgress) {
    if (!this.isFirebaseConfigured()) {
      this.cb.onError?.(TEXTS.titleScreen.firebaseNotConfigured);
      return false;
    }
    this.cleanup();
    this.isDestroyed = false;
    this.mode = isHost ? 'host' : 'guest';
    this.transport = 'firebase';
    this.roomCode = isHost ? generateRoomCode() : String(roomCode).toUpperCase();
    this.fbPlayerRole = isHost ? 'host' : 'guest';
    this.localAppearance = localAppearance;
    this.localProgress = localProgress;

    const baseUrl = FIREBASE_FALLBACK_CONFIG.databaseURL.replace(/\/$/, '');
    const roomUrl = `${baseUrl}/rooms/${this.roomCode}.json`;

    const init = async () => {
      try {
        if (isHost) {
          await fetch(roomUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              createdAt: Date.now(),
              host: { appearance: localAppearance, updatedAt: Date.now() },
              progress: localProgress || null,
            }),
          });
          this.cb.onRoomReady?.(this.roomCode);
          this.cb.onStatusChange?.('waiting', TEXTS.titleScreen.roomWaiting);
        } else {
          const checkRes = await fetch(roomUrl);
          const data = await checkRes.json();
          if (!data) {
            this.cb.onError?.(TEXTS.network.roomError);
            return;
          }
          await fetch(`${baseUrl}/rooms/${this.roomCode}/guest.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appearance: localAppearance, updatedAt: Date.now() }),
          });
          this.connected = true;
          this.cb.onStatusChange?.('connected', TEXTS.network.fallbackActive);
          this.cb.onPartnerJoined?.();
          if (data.host?.appearance) {
            this.cb.onMessage?.({ type: 'hello', appearance: data.host.appearance, progress: data.progress });
          }
        }
        this.startFirebasePolling();
      } catch {
        this.cb.onError?.(TEXTS.network.roomError);
      }
    };

    init();
    return true;
  }

  startFirebasePolling() {
    const baseUrl = FIREBASE_FALLBACK_CONFIG.databaseURL.replace(/\/$/, '');
    const partnerKey = this.fbPlayerRole === 'host' ? 'guest' : 'host';

    this.fbPollTimer = window.setInterval(async () => {
      if (this.isDestroyed || this.transport !== 'firebase') return;
      try {
        const t0 = performance.now();
        const res = await fetch(`${baseUrl}/rooms/${this.roomCode}.json`);
        const data = await res.json();
        const rtt = Math.round(performance.now() - t0);
        this.pingMs = rtt;
        this.cb.onPing?.(rtt);

        if (!data) return;
        const partner = data[partnerKey];
        if (partner) {
          if (!this.connected) {
            this.connected = true;
            this.cb.onStatusChange?.('connected', TEXTS.network.fallbackActive);
            this.cb.onPartnerJoined?.();
            if (partner.appearance) {
              this.cb.onMessage?.({ type: 'hello', appearance: partner.appearance, progress: data.progress });
            }
          }
          if (partner.state) {
            this.cb.onRemoteState?.(partner.state);
          }
          if (Date.now() - (partner.updatedAt || 0) > 12000 && this.connected) {
            this.connected = false;
            this.cb.onPartnerLeft?.();
          }
        }

        if (data.events) {
          for (const [id, ev] of Object.entries(data.events)) {
            if (this.fbSeenEventIds.has(id)) continue;
            this.fbSeenEventIds.add(id);
            if (ev && ev.sender !== this.fbPlayerRole) {
              this.cb.onMessage?.(ev.payload);
            }
          }
        }
      } catch {
        // Тихо пробуем на следующем тике
      }
    }, Math.max(160, FIREBASE_FALLBACK_CONFIG.pollIntervalMs));
  }

  fbWriteState(statePayload) {
    const baseUrl = FIREBASE_FALLBACK_CONFIG.databaseURL.replace(/\/$/, '');
    fetch(`${baseUrl}/rooms/${this.roomCode}/${this.fbPlayerRole}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: statePayload,
        updatedAt: Date.now(),
      }),
    }).catch(() => {});
  }

  fbPushEvent(payload) {
    const baseUrl = FIREBASE_FALLBACK_CONFIG.databaseURL.replace(/\/$/, '');
    fetch(`${baseUrl}/rooms/${this.roomCode}/events.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: this.fbPlayerRole,
        payload,
        ts: Date.now(),
      }),
    }).catch(() => {});
  }

  cleanup() {
    this.isDestroyed = true;
    this.connected = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.fbPollTimer) {
      clearInterval(this.fbPollTimer);
      this.fbPollTimer = null;
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // Игнорируем
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Игнорируем
      }
      this.peer = null;
    }
  }
}
