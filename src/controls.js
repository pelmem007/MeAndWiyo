// Единый контроллер ввода: мобильный виртуальный джойстик + свайп камеры
// и десктопный WASD + мышь + горячие клавиши.

export class InputController {
  constructor(canvas, joystickZone, joystickKnob, onAction) {
    this.canvas = canvas;
    this.joystickZone = joystickZone;
    this.joystickKnob = joystickKnob;
    this.onAction = onAction;

    // Непрерывные оси движения (-1..1)
    this.moveX = 0;
    this.moveY = 0;
    this.keys = Object.create(null);

    // Поворот и зум камеры
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.zoomDelta = 0;

    // Edge-triggered нажатия (буфер прыжка и действия)
    this.jumpBuffer = 0;

    // Отслеживание мультитача по pointerId
    this.joyPointerId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.joyMaxRadius = 46;

    this.lookPointerId = null;
    this.lookLast = { x: 0, y: 0 };
    this.isMouseDragging = false;

    this.enabled = false;
    this.bindEvents();
  }

  setEnabled(val) {
    this.enabled = val;
    if (!val) {
      this.clearAll();
    }
  }

  clearAll() {
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
    this.moveX = 0;
    this.moveY = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.joyPointerId = null;
    this.lookPointerId = null;
    this.isMouseDragging = false;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }

  triggerJump() {
    this.jumpBuffer = 0.16;
  }

  consumeJumpBuffer(dt) {
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      return true;
    }
    return false;
  }

  consumeLookDelta() {
    const dx = this.lookDeltaX;
    const dy = this.lookDeltaY;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return { dx, dy };
  }

  consumeZoomDelta() {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  getMovementVector() {
    let x = this.moveX;
    let y = this.moveY;

    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, magnitude: Math.min(1, len) };
  }

  bindEvents() {
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      // Не перехватываем клавиши, если пользователь печатает в поле ввода
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerJump();
      } else if (e.code === 'KeyE') {
        this.onAction('interact');
      } else if (e.code === 'KeyF') {
        this.onAction('wave');
      } else if (e.code === 'KeyC') {
        this.onAction('sit');
      } else if (e.code === 'KeyJ') {
        this.onAction('journal');
      } else if (e.code === 'KeyP') {
        this.onAction('photo');
      } else if (e.code === 'Escape') {
        this.onAction('pause');
      }
    };

    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this._onBlur = () => {
      this.clearAll();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    // Виртуальный джойстик (левая зона)
    if (this.joystickZone) {
      this.joystickZone.addEventListener('pointerdown', (e) => {
        if (!this.enabled || this.joyPointerId !== null) return;
        e.preventDefault();
        this.joyPointerId = e.pointerId;
        const rect = this.joystickZone.getBoundingClientRect();
        this.joyCenter.x = rect.left + rect.width * 0.5;
        this.joyCenter.y = rect.top + rect.height * 0.5;
        this.updateJoystick(e.clientX, e.clientY);
      });
    }

    // Поворот камеры свайпом/мышью на канвасе
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.lookPointerId === null && e.pointerId !== this.joyPointerId) {
        this.lookPointerId = e.pointerId;
        this.lookLast.x = e.clientX;
        this.lookLast.y = e.clientY;
        this.isMouseDragging = true;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (e.pointerId === this.joyPointerId) {
        this.updateJoystick(e.clientX, e.clientY);
      } else if (e.pointerId === this.lookPointerId) {
        const dx = e.clientX - this.lookLast.x;
        const dy = e.clientY - this.lookLast.y;
        this.lookLast.x = e.clientX;
        this.lookLast.y = e.clientY;
        this.lookDeltaX += dx;
        this.lookDeltaY += dy;
      }
    });

    const endPointer = (e) => {
      if (e.pointerId === this.joyPointerId) {
        this.joyPointerId = null;
        this.moveX = 0;
        this.moveY = 0;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0)';
        }
      }
      if (e.pointerId === this.lookPointerId) {
        this.lookPointerId = null;
        this.isMouseDragging = false;
      }
    };

    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    // Колёсико мыши для зума на ПК
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.zoomDelta += e.deltaY * 0.01;
      },
      { passive: false }
    );
  }

  updateJoystick(px, py) {
    let dx = px - this.joyCenter.x;
    let dy = py - this.joyCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.joyMaxRadius) {
      dx = (dx / dist) * this.joyMaxRadius;
      dy = (dy / dist) * this.joyMaxRadius;
    }
    this.moveX = dx / this.joyMaxRadius;
    this.moveY = dy / this.joyMaxRadius;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }
  }
}
