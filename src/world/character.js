import * as THREE from 'three';

// Создаёт составного аниме-персонажа (12+ отдельных частей в THREE.Group)
// с контурами, мягкой тенью на земле и настраиваемой внешностью.

const OUTLINE_COLOR = 0x221d36;

function makeOutlineMesh(geometry, scale = 1.045) {
  const mat = new THREE.MeshBasicMaterial({
    color: OUTLINE_COLOR,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.setScalar(scale);
  return mesh;
}

export function createAnimeCharacter(appearance, gradientMap, contactShadowTex, isLocal = true) {
  const root = new THREE.Group();

  // Мягкая контактная тень под ногами
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  // Основная группа тела (для приседания/прыжка)
  const rig = new THREE.Group();
  root.add(rig);

  // Материалы (храним ссылки, чтобы быстро обновлять цвета при кастомизации)
  const skinMat = new THREE.MeshToonMaterial({
    color: 0xffe0cc,
    gradientMap,
  });
  const hairMat = new THREE.MeshToonMaterial({
    color: appearance.hairColor || '#4a352a',
    gradientMap,
  });
  const outfitMat = new THREE.MeshToonMaterial({
    color: appearance.outfitColor || '#3d7c98',
    gradientMap,
  });
  const trimMat = new THREE.MeshToonMaterial({
    color: 0xf4ede2,
    gradientMap,
  });
  const pantsMat = new THREE.MeshToonMaterial({
    color: 0x343b52,
    gradientMap,
  });
  const bootMat = new THREE.MeshToonMaterial({
    color: 0x5c3e32,
    gradientMap,
  });
  const eyeMat = new THREE.MeshBasicMaterial({
    color: appearance.eyeColor || '#3876b8',
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1728 });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blushMat = new THREE.MeshBasicMaterial({
    color: 0xf59191,
    transparent: true,
    opacity: 0.65,
  });
  const accMat = new THREE.MeshToonMaterial({
    color: 0xf2b56b,
    gradientMap,
  });

  // 1. Ноги (шарниры на бёдрах)
  const makeLeg = (xOffset) => {
    const hip = new THREE.Group();
    hip.position.set(xOffset, 0.64, 0);

    const legGeo = new THREE.CapsuleGeometry(0.085, 0.28, 4, 10);
    const legMesh = new THREE.Mesh(legGeo, pantsMat);
    legMesh.position.y = -0.2;
    legMesh.castShadow = true;
    hip.add(legMesh);

    const bootGeo = new THREE.BoxGeometry(0.19, 0.2, 0.26);
    const bootMesh = new THREE.Mesh(bootGeo, bootMat);
    bootMesh.position.set(0, -0.52, 0.03);
    bootMesh.castShadow = true;
    hip.add(bootMesh);

    return hip;
  };

  const leftLeg = makeLeg(-0.13);
  const rightLeg = makeLeg(0.13);
  rig.add(leftLeg, rightLeg);

  // 2. Торс + одежда
  const torso = new THREE.Group();
  torso.position.y = 0.72;
  rig.add(torso);

  const bodyGeo = new THREE.CylinderGeometry(0.18, 0.23, 0.56, 12);
  const bodyMesh = new THREE.Mesh(bodyGeo, outfitMat);
  bodyMesh.position.y = 0.28;
  bodyMesh.castShadow = true;
  bodyMesh.add(makeOutlineMesh(bodyGeo, 1.05));
  torso.add(bodyMesh);

  // Деталь стиля одежды: капюшон толстовки / подол туники / плащ
  const outfitExtraGroup = new THREE.Group();
  torso.add(outfitExtraGroup);

  const tunicSkirt = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.34, 14, 1, true),
    outfitMat
  );
  tunicSkirt.position.y = 0.06;
  tunicSkirt.material = outfitMat.clone();
  tunicSkirt.material.side = THREE.DoubleSide;

  const hoodiePocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.12), trimMat);
  hoodiePocket.position.set(0, 0.16, 0.17);
  const hoodieCollar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 14), trimMat);
  hoodieCollar.rotation.x = Math.PI / 2;
  hoodieCollar.position.set(0, 0.54, -0.02);
  const hoodieGroup = new THREE.Group();
  hoodieGroup.add(hoodiePocket, hoodieCollar);

  const cloakCape = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.38, 0.66, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9),
    outfitMat.clone()
  );
  cloakCape.material.side = THREE.DoubleSide;
  cloakCape.position.set(0, 0.22, -0.04);

  outfitExtraGroup.add(tunicSkirt, hoodieGroup, cloakCape);

  // 3. Руки (шарниры в плечах)
  const makeArm = (xOffset) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(xOffset, 0.5, 0);

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.26, 4, 8), outfitMat);
    sleeve.position.y = -0.17;
    sleeve.castShadow = true;
    shoulder.add(sleeve);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), skinMat);
    hand.position.y = -0.35;
    shoulder.add(hand);

    return shoulder;
  };

  const leftArm = makeArm(-0.26);
  const rightArm = makeArm(0.26);
  torso.add(leftArm, rightArm);

  // 4. Голова и аниме-лицо
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  torso.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.31, 18, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.position.y = 0.24;
  headMesh.scale.set(1.0, 0.96, 0.95);
  headMesh.castShadow = true;
  headMesh.add(makeOutlineMesh(headGeo, 1.045));
  headGroup.add(headMesh);

  // Большие выразительные глаза + блики + румянец
  const makeEye = (xPos) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(xPos, 0.23, 0.27);
    eyeGroup.rotation.y = xPos > 0 ? 0.16 : -0.16;

    const sclera = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.12), whiteMat);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.044, 14), eyeMat);
    iris.position.z = 0.004;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), pupilMat);
    pupil.position.z = 0.008;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.013, 8), whiteMat);
    glint.position.set(0.015, 0.018, 0.011);

    eyeGroup.add(sclera, iris, pupil, glint);
    return eyeGroup;
  };
  headGroup.add(makeEye(-0.11), makeEye(0.11));

  const blushGeo = new THREE.CircleGeometry(0.04, 10);
  const blushL = new THREE.Mesh(blushGeo, blushMat);
  blushL.position.set(-0.17, 0.16, 0.25);
  blushL.rotation.y = -0.35;
  const blushR = new THREE.Mesh(blushGeo, blushMat);
  blushR.position.set(0.17, 0.16, 0.25);
  blushR.rotation.y = 0.35;
  headGroup.add(blushL, blushR);

  // 5. Причёски (шапочка волос + чёлка + 4 варианта)
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);

  const hairCapGeo = new THREE.SphereGeometry(0.325, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.y = 0.25;
  hairCap.rotation.x = -0.18;
  hairCap.castShadow = true;
  hairCap.add(makeOutlineMesh(hairCapGeo, 1.04));
  hairGroup.add(hairCap);

  // Чёлка из нескольких стилизованных прядей
  const bangGeo = new THREE.ConeGeometry(0.08, 0.22, 6);
  for (let i = -2; i <= 2; i++) {
    const bang = new THREE.Mesh(bangGeo, hairMat);
    bang.position.set(i * 0.075, 0.38 - Math.abs(i) * 0.018, 0.28 - Math.abs(i) * 0.025);
    bang.rotation.x = Math.PI * 0.92;
    bang.rotation.z = -i * 0.12;
    hairGroup.add(bang);
  }

  // Варианты причёсок
  const styleShort = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), hairMat);
    spike.position.set((i - 1.5) * 0.11, 0.42, -0.22);
    spike.rotation.x = -1.95;
    styleShort.add(spike);
  }

  const styleBob = new THREE.Group();
  const bobLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.24, 4, 8), hairMat);
  bobLeft.position.set(-0.27, 0.14, 0.0);
  const bobRight = bobLeft.clone();
  bobRight.position.x = 0.27;
  const bobBack = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.34, 12, 1, false, Math.PI * 0.6, Math.PI * 0.8), hairMat);
  bobBack.position.set(0, 0.14, -0.04);
  styleBob.add(bobLeft, bobRight, bobBack);

  const styleTwintails = new THREE.Group();
  const tailGeo = new THREE.ConeGeometry(0.11, 0.56, 8);
  const tailL = new THREE.Mesh(tailGeo, hairMat);
  tailL.position.set(-0.34, 0.14, -0.1);
  tailL.rotation.z = -0.35;
  tailL.rotation.x = 2.85;
  const tailR = tailL.clone();
  tailR.position.x = 0.34;
  tailR.rotation.z = 0.35;
  styleTwintails.add(tailL, tailR);

  const stylePonytail = new THREE.Group();
  const pony = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.58, 8), hairMat);
  pony.position.set(0, 0.16, -0.35);
  pony.rotation.x = -2.55;
  stylePonytail.add(pony);

  hairGroup.add(styleShort, styleBob, styleTwintails, stylePonytail);

  // 6. Аксессуары
  const accScarf = new THREE.Group();
  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 8, 16), accMat);
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.set(0, 0.56, 0);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.05), accMat);
  scarfTail.position.set(0.12, 0.38, 0.19);
  scarfTail.rotation.z = 0.22;
  accScarf.add(scarfRing, scarfTail);
  torso.add(accScarf);

  const accBeret = new THREE.Group();
  const beretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.11, 14), accMat);
  beretTop.position.set(0.04, 0.54, 0);
  beretTop.rotation.z = -0.18;
  const beretStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6), accMat);
  beretStem.position.set(0.05, 0.62, 0);
  accBeret.add(beretTop, beretStem);
  headGroup.add(accBeret);

  const accBackpack = new THREE.Group();
  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), accMat);
  packBody.position.set(0, 0.31, -0.25);
  const packFlap = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.1, 0.18), trimMat);
  packFlap.position.set(0, 0.44, -0.25);
  accBackpack.add(packBody, packFlap);
  torso.add(accBackpack);

  const accFlower = new THREE.Group();
  accFlower.position.set(-0.28, 0.36, 0.16);
  const flowerCenter = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  accFlower.add(flowerCenter);
  const petalMat = new THREE.MeshBasicMaterial({ color: 0xff9ebb });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), petalMat);
    const a = (i / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0);
    accFlower.add(p);
  }
  headGroup.add(accFlower);

  // Плавающий пузырь эмоций/текста над головой
  const emoteCanvas = document.createElement('canvas');
  emoteCanvas.width = 256;
  emoteCanvas.height = 96;
  const emoteTex = new THREE.CanvasTexture(emoteCanvas);
  emoteTex.colorSpace = THREE.SRGBColorSpace;
  const emoteSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: emoteTex, transparent: true, depthTest: false })
  );
  emoteSprite.position.set(0, 2.15, 0);
  emoteSprite.scale.set(1.5, 0.56, 1);
  emoteSprite.visible = false;
  root.add(emoteSprite);

  const rigState = {
    root,
    rig,
    torso,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    hairGroup,
    emoteSprite,
    emoteCanvas,
    emoteTex,
    emoteTimer: 0,
    isLocal,
    materials: { hairMat, eyeMat, outfitMat, accMat },
    parts: {
      styleShort,
      styleBob,
      styleTwintails,
      stylePonytail,
      tunicSkirt,
      hoodieGroup,
      cloakCape,
      accScarf,
      accBeret,
      accBackpack,
      accFlower,
    },
    applyAppearance(nextApp) {
      hairMat.color.set(nextApp.hairColor || '#4a352a');
      eyeMat.color.set(nextApp.eyeColor || '#3876b8');
      outfitMat.color.set(nextApp.outfitColor || '#3d7c98');
      tunicSkirt.material.color.set(nextApp.outfitColor || '#3d7c98');
      cloakCape.material.color.set(nextApp.outfitColor || '#3d7c98');

      styleShort.visible = nextApp.hairStyle === 'short';
      styleBob.visible = nextApp.hairStyle === 'bob';
      styleTwintails.visible = nextApp.hairStyle === 'twintails';
      stylePonytail.visible = nextApp.hairStyle === 'ponytail';

      tunicSkirt.visible = nextApp.outfitStyle === 'tunic';
      hoodieGroup.visible = nextApp.outfitStyle === 'hoodie';
      cloakCape.visible = nextApp.outfitStyle === 'cloak';

      accScarf.visible = nextApp.accessory === 'scarf';
      accBeret.visible = nextApp.accessory === 'beret';
      accBackpack.visible = nextApp.accessory === 'backpack';
      accFlower.visible = nextApp.accessory === 'flower';
    },
    showBubble(text, duration = 3.2) {
      const ctx = emoteCanvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 96);
      ctx.fillStyle = 'rgba(22, 27, 48, 0.9)';
      ctx.strokeStyle = 'rgba(255, 210, 128, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(10, 12, 236, 68, 22);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff8ec';
      ctx.font = '700 28px Nunito, Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const trimmed = text.length > 16 ? `${text.slice(0, 15)}...` : text;
      ctx.fillText(trimmed, 128, 46);
      emoteTex.needsUpdate = true;
      emoteSprite.visible = true;
      this.emoteTimer = duration;
    },
  };

  rigState.applyAppearance(appearance);
  return rigState;
}

// Плавные процедурные анимации: idle, walk, run, jump, wave, sit, joy
export function updateCharacterAnimation(charRig, animName, dt, elapsed) {
  const { rig, torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, hairGroup } = charRig;

  if (charRig.emoteTimer > 0) {
    charRig.emoteTimer -= dt;
    if (charRig.emoteTimer <= 0) {
      charRig.emoteSprite.visible = false;
    }
  }

  let targetRigY = 0;
  let targetTorsoX = 0;
  let targetL_LegX = 0;
  let targetR_LegX = 0;
  let targetL_ArmX = 0;
  let targetR_ArmX = 0;
  let targetL_ArmZ = 0.14;
  let targetR_ArmZ = -0.14;
  let targetHeadX = 0;
  let targetHeadZ = 0;

  if (animName === 'walk') {
    const s = Math.sin(elapsed * 8.5);
    targetRigY = Math.abs(s) * 0.05;
    targetTorsoX = 0.08;
    targetL_LegX = s * 0.58;
    targetR_LegX = -s * 0.58;
    targetL_ArmX = -s * 0.45;
    targetR_ArmX = s * 0.45;
  } else if (animName === 'run') {
    const s = Math.sin(elapsed * 13.5);
    targetRigY = Math.abs(s) * 0.09;
    targetTorsoX = 0.18;
    targetL_LegX = s * 0.85;
    targetR_LegX = -s * 0.85;
    targetL_ArmX = -s * 0.72;
    targetR_ArmX = s * 0.72;
  } else if (animName === 'jump') {
    targetRigY = 0.04;
    targetTorsoX = -0.06;
    targetL_LegX = -0.35;
    targetR_LegX = 0.25;
    targetL_ArmZ = 0.85;
    targetR_ArmZ = -0.85;
  } else if (animName === 'wave') {
    targetHeadZ = 0.1;
    targetR_ArmZ = -2.45 + Math.sin(elapsed * 11) * 0.35;
    targetR_ArmX = -0.2;
    targetL_ArmZ = 0.18;
  } else if (animName === 'sit') {
    targetRigY = -0.38;
    targetL_LegX = -1.42;
    targetR_LegX = -1.42;
    targetTorsoX = -0.05;
    targetL_ArmX = -0.35;
    targetR_ArmX = -0.35;
    targetHeadX = Math.sin(elapsed * 1.4) * 0.04;
  } else if (animName === 'joy') {
    const hop = Math.abs(Math.sin(elapsed * 7.5));
    targetRigY = hop * 0.22;
    targetL_ArmZ = 2.3 + Math.sin(elapsed * 10) * 0.2;
    targetR_ArmZ = -2.3 - Math.sin(elapsed * 10) * 0.2;
    targetHeadX = -0.1;
  } else {
    // idle: спокойное дыхание
    targetRigY = Math.sin(elapsed * 2.2) * 0.025;
    targetL_ArmZ = 0.12 + Math.sin(elapsed * 2.2) * 0.03;
    targetR_ArmZ = -0.12 - Math.sin(elapsed * 2.2) * 0.03;
    targetHeadX = Math.sin(elapsed * 1.3) * 0.03;
  }

  const k = 1 - Math.exp(-14 * dt);
  rig.position.y = THREE.MathUtils.lerp(rig.position.y, targetRigY, k);
  torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, targetTorsoX, k);
  leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, targetL_LegX, k);
  rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, targetR_LegX, k);
  leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, targetL_ArmX, k);
  rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, targetR_ArmX, k);
  leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, targetL_ArmZ, k);
  rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, targetR_ArmZ, k);
  headGroup.rotation.x = THREE.MathUtils.lerp(headGroup.rotation.x, targetHeadX, k);
  headGroup.rotation.z = THREE.MathUtils.lerp(headGroup.rotation.z, targetHeadZ, k);

  // Лёгкое покачивание волос от ветра/движения
  hairGroup.rotation.x = Math.sin(elapsed * 3.1) * 0.025;
}

// Спутник Эхо-огонёк для одиночного тестирования кооперативных загадок
export function createEchoSpirit(glowTex) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe49e })
  );
  core.position.y = 0.9;
  group.add(core);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x9fe8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.position.y = 0.9;
  halo.scale.set(1.5, 1.5, 1.5);
  group.add(halo);

  return { group, core, halo };
}
