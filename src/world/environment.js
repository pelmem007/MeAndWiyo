import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  baseTerrainHeight,
  createContactShadowTexture,
  createGlowSpriteTexture,
  createStoneTexture,
  createToonGradientTexture,
  createWoodTexture,
  FOREST_LEDGE,
  groundHeightAt,
  LAKE_CENTER,
  OBS_SUMMIT,
  RUINS_CHASM,
  WATER_LEVEL,
} from './terrain.js';
import { createAnimeCharacter } from './character.js';

// Создаёт составной фонарь (каменное основание, столб, лампа, крыша, точка света)
function createLanternProp(id, x, z, isGrandBeacon, gradientMap, glowTex, worldState) {
  const y = groundHeightAt(x, z, worldState);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const scale = isGrandBeacon ? 1.55 : 1.0;
  group.scale.setScalar(scale);

  const stoneMat = new THREE.MeshToonMaterial({ color: 0x6f778c, gradientMap });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x2f3547,
    roughness: 0.45,
    metalness: 0.65,
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x555b70 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 0.45, 8), stoneMat);
  base.position.y = 0.22;
  base.castShadow = true;
  base.receiveShadow = true;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.2, 8), darkMetalMat);
  pole.position.y = 1.45;
  pole.castShadow = true;

  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.52, 6), coreMat);
  cage.position.y = 2.7;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.36, 6), darkMetalMat);
  roof.position.y = 3.12;
  roof.castShadow = true;

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: isGrandBeacon ? 0xffe49c : 0xffbe6b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.position.y = 2.7;
  halo.scale.set(3.2, 3.2, 3.2);

  // Луч вверх для главного небесного маяка
  let skyBeam = null;
  if (isGrandBeacon) {
    skyBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.65, 36, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe6a3,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    skyBeam.position.y = 20;
    group.add(skyBeam);
  }

  group.add(base, pole, cage, roof, halo);

  return {
    id,
    x,
    y,
    z,
    isGrandBeacon,
    group,
    coreMat,
    halo,
    skyBeam,
    lit: false,
  };
}

// Составная деревянная скамейка на двоих
function createBenchProp(id, x, z, rotY, woodTex, gradientMap, worldState, isStargaze = false) {
  const y = groundHeightAt(x, z, worldState);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  const woodMat = new THREE.MeshToonMaterial({ map: woodTex, color: 0xdfb995, gradientMap });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x353b4e, roughness: 0.5, metalness: 0.6 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.66), woodMat);
  seat.position.y = 0.46;
  seat.castShadow = true;
  seat.receiveShadow = true;

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.1), woodMat);
  back.position.set(0, 0.78, -0.28);
  back.rotation.x = -0.14;
  back.castShadow = true;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.58), ironMat);
  legL.position.set(-0.82, 0.23, 0);
  const legR = legL.clone();
  legR.position.x = 0.82;

  group.add(seat, back, legL, legR);

  // Вычисляем мировые координаты левого и правого места на скамейке
  const localLeft = new THREE.Vector3(-0.48, 0.46, 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(group.position);
  const localRight = new THREE.Vector3(0.48, 0.46, 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(group.position);

  return {
    id,
    group,
    center: new THREE.Vector3(x, y, z),
    rotY,
    isStargaze,
    seats: [localLeft, localRight],
  };
}

// Составной деревенский домик (фундамент, стены, балки, крыша, труба, светящееся окно)
function createCottage(x, z, rotY, woodTex, stoneTex, gradientMap, worldState) {
  const y = groundHeightAt(x, z, worldState);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  const plasterMat = new THREE.MeshToonMaterial({ color: 0xf4ece0, gradientMap });
  const roofMat = new THREE.MeshToonMaterial({ color: 0xc96556, gradientMap });
  const timberMat = new THREE.MeshToonMaterial({ map: woodTex, color: 0x9b6d4c, gradientMap });
  const stoneMat = new THREE.MeshToonMaterial({ map: stoneTex, color: 0x8e95a6, gradientMap });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd782 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 3.8), stoneMat);
  plinth.position.y = 0.2;
  plinth.receiveShadow = true;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.5, 3.5), plasterMat);
  walls.position.y = 1.65;
  walls.castShadow = true;
  walls.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.45, 1.9, 4), roofMat);
  roof.position.y = 3.82;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.55, 0.12), timberMat);
  door.position.set(0, 1.18, 1.76);

  const winL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.12), windowMat);
  winL.position.set(-1.15, 1.75, 1.76);
  const winR = winL.clone();
  winR.position.x = 1.15;

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), stoneMat);
  chimney.position.set(1.2, 4.0, -0.7);
  chimney.castShadow = true;

  group.add(plinth, walls, roof, door, winL, winR, chimney);
  return { group, windowMat };
}

export function buildIslandEnvironment(scene, renderer, isSoftwareGl) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const gradientMap = createToonGradientTexture(4);
  const contactShadowTex = createContactShadowTexture();
  const glowTex = createGlowSpriteTexture();
  const woodTex = createWoodTexture(maxAniso);
  const stoneTex = createStoneTexture(maxAniso);

  // Обязательная карта окружения для корректных отражений и полупрозрачностей
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // Туман, согласованный с цветом горизонта
  const fog = new THREE.FogExp2(0xe29a7f, 0.0072);
  scene.fog = fog;

  // Освещение (тёплый ключевой свет + прохладная небесная полусфера)
  const hemiLight = new THREE.HemisphereLight(0x9fb8ff, 0x5c4738, 0.72);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffcb96, 1.75);
  sunLight.position.set(-45, 34, 45);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(1024, 1024);
  const d = 48;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Локальный тёплый огонь маяка
  const beaconPointLight = new THREE.PointLight(0xffcb77, 1.8, 28, 1.5);
  beaconPointLight.position.set(-14, 14.5, 48);
  scene.add(beaconPointLight);

  // 1. Небо (шейдерный купол с переходом закат -> ночь -> рассвет -> день)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color('#273164') },
      uMidColor: { value: new THREE.Color('#b65d78') },
      uBotColor: { value: new THREE.Color('#f4a26b') },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uBotColor;
      varying vec3 vWorldPos;
      void main() {
        float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
        vec3 col = mix(uBotColor, uMidColor, smoothstep(0.0, 0.26, h));
        col = mix(col, uTopColor, smoothstep(0.22, 0.78, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 16), skyMat);
  scene.add(skyDome);

  // Солнце и луна
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdf9e })
  );
  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xe6efff })
  );
  scene.add(sunDisc, moonDisc);

  // Звёздное небо
  const starCount = 480;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.15 + Math.random() * 0.85);
    const r = 230;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xfff6dc,
    size: 2.2,
    map: glowTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // Облака (процедурные группы пушистых сфер)
  const clouds = [];
  const cloudMat = new THREE.MeshToonMaterial({
    color: 0xffebd6,
    gradientMap,
    transparent: true,
    opacity: 0.88,
  });
  for (let i = 0; i < 12; i++) {
    const cg = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.6 + (p % 2) * 1.1, 10, 8), cloudMat);
      puff.position.set((p - 1) * 2.5, (p % 2) * 0.6, (p % 3 - 1) * 1.1);
      puff.scale.set(1.4, 0.75, 1.1);
      cg.add(puff);
    }
    const angle = (i / 12) * Math.PI * 2;
    const dist = 55 + (i % 4) * 20;
    cg.position.set(Math.cos(angle) * dist, 30 + (i % 3) * 5, Math.sin(angle) * dist);
    cg.userData = { speed: 0.45 + (i % 3) * 0.25, radius: dist, angle };
    scene.add(cg);
    clouds.push(cg);
  }

  // 2. Рельеф острова с вершинными цветами (песок, трава, лесная зелень, камень, тропы)
  const terrainSize = 220;
  const terrainSegs = 128;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const colSand = new THREE.Color('#e3c998');
  const colGrass = new THREE.Color('#6db86b');
  const colForest = new THREE.Color('#4f9459');
  const colStone = new THREE.Color('#8e96ab');
  const colDeep = new THREE.Color('#3b556e');
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = baseTerrainHeight(x, z);
    posAttr.setY(i, y);

    if (y < -0.45) {
      tmpCol.copy(colDeep);
    } else if (y < 0.72) {
      tmpCol.copy(colSand);
    } else {
      const dRuins = Math.hypot(x + 18, z + 34);
      const dObs = Math.hypot(x - 18, z + 42);
      const dForest = Math.hypot(x + 34, z - 4);
      if (dRuins < 15 || dObs < 14 || y > 7.4) {
        tmpCol.copy(colStone).lerp(colGrass, y < 7.0 ? 0.35 : 0.15);
      } else if (dForest < 24) {
        tmpCol.copy(colForest);
      } else {
        tmpCol.copy(colGrass);
      }
      // Тёплая песочная тропинка от деревни к центру
      if (Math.abs(x) < 2.2 && z > 8 && z < 44) {
        tmpCol.lerp(colSand, 0.55);
      }
    }

    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 3. Вода (океан + озеро) на кастомном шейдере с рябью и бликами
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uWaterDeep: { value: new THREE.Color('#285e8c') },
      uWaterShallow: { value: new THREE.Color('#57b4c2') },
      uSunColor: { value: new THREE.Color('#ffcf8a') },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.35, 0.6).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWave;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.25 + uTime * 1.4) * 0.06 + cos(p.z * 0.3 - uTime * 1.1) * 0.05;
        p.y += w;
        vWave = w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterShallow;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      varying float vWave;
      void main() {
        float dist = length(vWorldPos.xz);
        float isLake = 1.0 - smoothstep(10.0, 18.0, length(vWorldPos.xz - vec2(36.0, 8.0)));
        float shoreMix = max(isLake, 1.0 - smoothstep(40.0, 74.0, dist));
        vec3 baseCol = mix(uWaterDeep, uWaterShallow, shoreMix * 0.72);

        float ripple = sin(vWorldPos.x * 1.4 + uTime * 1.8) * cos(vWorldPos.z * 1.4 - uTime * 1.5);
        vec3 n = normalize(vec3(ripple * 0.14, 1.0, vWave * 1.4));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(n, halfVec), 0.0), 42.0);

        vec3 finalCol = baseCol + uSunColor * spec * 0.65 + vec3(0.06) * max(0.0, ripple);
        float alpha = mix(0.88, 0.72, shoreMix);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });
  const waterGeo = new THREE.PlaneGeometry(460, 460, 64, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = WATER_LEVEL;
  scene.add(waterMesh);

  // 4. Инстансированная трава с ветром в вершинном шейдере
  const maxGrassCount = 2400;
  const bladeGeo = new THREE.ConeGeometry(0.08, 0.52, 3);
  bladeGeo.translate(0, 0.26, 0);
  const grassMat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap,
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    grassMat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float sway = sin(uTime * 2.1 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.25) * 0.14;
      transformed.x += sway * (position.y * 1.8);
      transformed.z += sway * 0.4 * (position.y * 1.8);
      `
    );
  };
  const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, maxGrassCount);
  const dummy = new THREE.Object3D();
  const grassColor = new THREE.Color();
  let placedGrass = 0;
  let tries = 0;

  while (placedGrass < maxGrassCount && tries < 14000) {
    tries += 1;
    const gx = (Math.random() - 0.5) * 116;
    const gz = (Math.random() - 0.5) * 116;
    const gy = baseTerrainHeight(gx, gz);
    if (gy < 1.1 || gy > 9.5) continue;
    if (Math.hypot(gx + 18, gz + 34) < 12) continue;
    if (Math.hypot(gx - 18, gz + 42) < 9) continue;
    if (Math.abs(gx) < 2.5 && gz > 12 && gz < 52) continue;

    dummy.position.set(gx, gy - 0.04, gz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = 0.75 + Math.random() * 0.65;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(placedGrass, dummy.matrix);

    grassColor.setHSL(0.31 + (Math.random() - 0.5) * 0.05, 0.48, 0.48 + Math.random() * 0.14);
    grassMesh.setColorAt(placedGrass, grassColor);
    placedGrass += 1;
  }
  grassMesh.count = placedGrass;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  scene.add(grassMesh);

  // 5. Деревья (InstancedMesh для стволов и двух ярусов крон, 75 деревьев за 3 вызова отрисовки)
  const treePositions = [];
  for (let i = 0; i < 85; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 14 + Math.random() * 44;
    const tx = Math.cos(angle) * rad;
    const tz = Math.sin(angle) * rad;
    const ty = baseTerrainHeight(tx, tz);
    if (ty < 1.4 || ty > 8.2) continue;
    if (Math.hypot(tx, tz - 38) < 10) continue; // не ставим на деревню
    if (Math.hypot(tx + 14, tz - 48) < 7) continue; // не перекрываем маяк
    if (Math.hypot(tx + 18, tz + 34) < 12) continue; // не в руины
    if (Math.hypot(tx - 18, tz + 42) < 13) continue; // не в обсерваторию
    if (Math.hypot(tx + 42, tz + 4) < 7.5) continue; // не на лесной уступ
    if (Math.hypot(tx - 36, tz - 8) < 16.5) continue; // не в озеро
    treePositions.push({ x: tx, y: ty, z: tz, isBlossom: Math.random() < 0.28 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 2.4, 7);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshToonMaterial({ color: 0x734e38, gradientMap });
  const crownLowGeo = new THREE.ConeGeometry(1.55, 2.3, 8);
  crownLowGeo.translate(0, 2.9, 0);
  const crownHighGeo = new THREE.ConeGeometry(1.12, 1.9, 8);
  crownHighGeo.translate(0, 4.15, 0);
  const crownMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  const crownLowInst = new THREE.InstancedMesh(crownLowGeo, crownMat, treePositions.length);
  const crownHighInst = new THREE.InstancedMesh(crownHighGeo, crownMat, treePositions.length);
  trunkInst.castShadow = !isSoftwareGl;
  crownLowInst.castShadow = !isSoftwareGl;
  crownHighInst.castShadow = !isSoftwareGl;

  const treeColor = new THREE.Color();
  treePositions.forEach((tp, idx) => {
    const sc = 0.85 + (idx % 5) * 0.11;
    dummy.position.set(tp.x, tp.y - 0.1, tp.z);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
    crownLowInst.setMatrixAt(idx, dummy.matrix);
    crownHighInst.setMatrixAt(idx, dummy.matrix);

    if (tp.isBlossom) {
      treeColor.set('#f5a3ba').offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
    } else {
      treeColor.set('#4c945c').offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08);
    }
    crownLowInst.setColorAt(idx, treeColor);
    crownHighInst.setColorAt(idx, treeColor.clone().offsetHSL(0, 0, 0.05));
  });
  [trunkInst, crownLowInst, crownHighInst].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    scene.add(m);
  });

  // Камни по берегам и в лесу (InstancedMesh)
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
  const rockCount = 45;
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  let rPlaced = 0;
  for (let i = 0; i < 120 && rPlaced < rockCount; i++) {
    const a = (i / 120) * Math.PI * 2 + 0.2;
    const rad = 22 + (i % 7) * 5.2;
    const rx = Math.cos(a) * rad;
    const rz = Math.sin(a) * rad;
    const ry = baseTerrainHeight(rx, rz);
    if (ry < -0.2 || ry > 9) continue;
    if (Math.hypot(rx, rz - 40) < 12) continue;
    dummy.position.set(rx, ry + 0.1, rz);
    dummy.rotation.set(i * 0.4, i * 0.7, 0);
    const s = 0.55 + (i % 4) * 0.38;
    dummy.scale.set(s * 1.2, s * 0.75, s);
    dummy.updateMatrix();
    rockInst.setMatrixAt(rPlaced, dummy.matrix);
    rockInst.setColorAt(rPlaced, new THREE.Color('#80899d').offsetHSL(0, 0, (i % 3) * 0.04));
    rPlaced += 1;
  }
  rockInst.count = rPlaced;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  scene.add(rockInst);

  // 6. ЗОНА 1: Деревня у причала + Маяк бухты
  const cottages = [
    createCottage(-6.5, 35, 0.35, woodTex, stoneTex, gradientMap, null),
    createCottage(7.5, 37, -0.45, woodTex, stoneTex, gradientMap, null),
  ];
  cottages.forEach((c) => scene.add(c.group));

  // Деревянный пирс + лодочка
  const pierGroup = new THREE.Group();
  const pierWoodMat = new THREE.MeshToonMaterial({ map: woodTex, color: 0xc2956e, gradientMap });
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 17), pierWoodMat);
  pierDeck.position.set(0, 0.8, 59.5);
  pierDeck.receiveShadow = true;
  pierDeck.castShadow = true;
  pierGroup.add(pierDeck);
  for (let pz = 52; pz <= 67; pz += 3.7) {
    for (const px of [-1.85, 1.85]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.9, 8), pierWoodMat);
      post.position.set(px, 0.35, pz);
      post.castShadow = true;
      pierGroup.add(post);
    }
  }
  // Маленькая деревянная лодка у края пирса
  const boatGroup = new THREE.Group();
  const boatHull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 3.2), pierWoodMat);
  const boatSeat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.4), pierWoodMat);
  boatSeat.position.y = 0.2;
  boatGroup.add(boatHull, boatSeat);
  boatGroup.position.set(3.2, 0.12, 65.5);
  boatGroup.rotation.y = 0.32;
  pierGroup.add(boatGroup);
  scene.add(pierGroup);

  // Главный маяк бухты (-14, 48)
  const lhY = baseTerrainHeight(-14, 48);
  const lighthouse = new THREE.Group();
  lighthouse.position.set(-14, lhY, 48);
  const lhStoneMat = new THREE.MeshToonMaterial({ map: stoneTex, color: 0x9aa2b6, gradientMap });
  const lhWhiteMat = new THREE.MeshToonMaterial({ color: 0xf6efe6, gradientMap });
  const lhCoralMat = new THREE.MeshToonMaterial({ color: 0xd96859, gradientMap });
  const lhDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a3147, roughness: 0.4, metalness: 0.7 });
  const lhGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe49e });

  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.9, 1.6, 12), lhStoneMat);
  lhBase.position.y = 0.8;
  lhBase.castShadow = true;
  const lhBody1 = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.25, 3.8, 14), lhWhiteMat);
  lhBody1.position.y = 3.5;
  lhBody1.castShadow = true;
  const lhStripe = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.85, 2.4, 14), lhCoralMat);
  lhStripe.position.y = 6.6;
  lhStripe.castShadow = true;
  const lhBody2 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.62, 2.2, 14), lhWhiteMat);
  lhBody2.position.y = 8.9;
  const lhGallery = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.3, 14), lhDarkMat);
  lhGallery.position.y = 10.1;
  const lhLantern = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 12), lhGlowMat);
  lhLantern.position.y = 11.0;
  const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(1.65, 1.5, 12), lhDarkMat);
  lhRoof.position.y = 12.55;

  // Вращающийся мягкий луч маяка
  const lhBeam = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffdf94,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  lhBeam.rotation.z = Math.PI / 2;
  lhBeam.position.set(13, 11.0, 0);
  const lhBeamPivot = new THREE.Group();
  lhBeamPivot.add(lhBeam);
  lighthouse.add(lhBase, lhBody1, lhStripe, lhBody2, lhGallery, lhLantern, lhRoof, lhBeamPivot);
  scene.add(lighthouse);

  // 7. ЗОНА 2: Лесной высокий уступ, точка подсадки и верёвка
  const ledgeGroup = new THREE.Group();
  const ledgeHeight = FOREST_LEDGE.topY - FOREST_LEDGE.baseY;
  const ledgeRock = new THREE.Mesh(
    new THREE.CylinderGeometry(FOREST_LEDGE.radius, FOREST_LEDGE.radius + 1.1, ledgeHeight + 1.2, 12),
    new THREE.MeshToonMaterial({ map: stoneTex, color: 0x7e8596, gradientMap })
  );
  ledgeRock.position.set(FOREST_LEDGE.x, FOREST_LEDGE.baseY + (ledgeHeight - 1.2) * 0.5, FOREST_LEDGE.z);
  ledgeRock.castShadow = true;
  ledgeRock.receiveShadow = true;

  const ledgeTopGrass = new THREE.Mesh(
    new THREE.CylinderGeometry(FOREST_LEDGE.radius - 0.1, FOREST_LEDGE.radius, 0.35, 12),
    new THREE.MeshToonMaterial({ color: 0x5da461, gradientMap })
  );
  ledgeTopGrass.position.set(FOREST_LEDGE.x, FOREST_LEDGE.topY - 0.17, FOREST_LEDGE.z);
  ledgeTopGrass.receiveShadow = true;
  ledgeGroup.add(ledgeRock, ledgeTopGrass);

  // Светящийся круг помощи на земле (подсадка)
  const boostSpot = new THREE.Vector3(FOREST_LEDGE.x + FOREST_LEDGE.radius + 1.35, FOREST_LEDGE.baseY + 0.12, FOREST_LEDGE.z);
  const boostRing = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 1.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffcf70, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
  );
  boostRing.rotation.x = -Math.PI / 2;
  boostRing.position.set(boostSpot.x, baseTerrainHeight(boostSpot.x, boostSpot.z) + 0.08, boostSpot.z);
  ledgeGroup.add(boostRing);

  // Верёвка с уступа (видна, когда сброшена вниз)
  const ropeAnchor = new THREE.Vector3(FOREST_LEDGE.x + FOREST_LEDGE.radius - 0.4, FOREST_LEDGE.topY, FOREST_LEDGE.z + 1.8);
  const ropeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, ledgeHeight + 0.4, 8),
    new THREE.MeshToonMaterial({ color: 0xdcb47b, gradientMap })
  );
  ropeMesh.position.set(ropeAnchor.x + 0.55, FOREST_LEDGE.baseY + ledgeHeight * 0.5, ropeAnchor.z);
  ropeMesh.visible = false;
  ledgeGroup.add(ropeMesh);
  scene.add(ledgeGroup);

  // 8. ЗОНА 3: Зеркальное озеро, 2 нажимные плиты и выдвижной мост
  const lakePlatePosA = new THREE.Vector3(20, baseTerrainHeight(20, 4) + 0.08, 4);
  const lakePlatePosB = new THREE.Vector3(20, baseTerrainHeight(20, 12) + 0.08, 12);

  const createPlateMesh = (pos) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.2, 8),
      new THREE.MeshToonMaterial({ color: 0x7b859c, gradientMap })
    );
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.85, 8),
      new THREE.MeshBasicMaterial({ color: 0x67d8ff, side: THREE.DoubleSide })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = 0.12;
    g.add(pad, rune);
    scene.add(g);
    return { group: g, runeMat: rune.material, pos };
  };

  const lakePlateA = createPlateMesh(lakePlatePosA);
  const lakePlateB = createPlateMesh(lakePlatePosB);

  const lakeBridge = new THREE.Mesh(
    new THREE.BoxGeometry(12.2, 0.45, 3.3),
    new THREE.MeshToonMaterial({ map: stoneTex, color: 0x99b6cf, gradientMap })
  );
  lakeBridge.position.set(27.5, -0.6, 8);
  lakeBridge.receiveShadow = true;
  scene.add(lakeBridge);

  // 9. ЗОНА 4: Старые руины, колонны, кристаллы и световой мост
  const ruinsGroup = new THREE.Group();
  const ruinsStoneMat = new THREE.MeshToonMaterial({ map: stoneTex, color: 0x959db3, gradientMap });
  const pillarCoords = [
    [-24, -27, 4.4],
    [-12, -27, 3.8],
    [-24, -33, 4.6],
    [-12, -33, 4.2],
    [-23, -44, 4.5],
    [-13, -44, 4.5],
  ];
  for (const [px, pz, ph] of pillarCoords) {
    const py = baseTerrainHeight(px, pz);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, ph, 10), ruinsStoneMat);
    col.position.set(px, py + ph * 0.5 - 0.1, pz);
    col.castShadow = true;
    col.receiveShadow = true;
    ruinsGroup.add(col);
  }
  // Арка у входа в святилище руин
  const archBeam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.9, 1.4), ruinsStoneMat);
  archBeam.position.set(-18, baseTerrainHeight(-18, -44) + 4.5, -44);
  archBeam.castShadow = true;
  ruinsGroup.add(archBeam);

  // Два кристалла по краям пропасти
  const createCrystal = (cx, cz) => {
    const cy = baseTerrainHeight(cx, cz);
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.8, 6), ruinsStoneMat);
    ped.position.y = 0.4;
    const gemMat = new THREE.MeshBasicMaterial({ color: 0x64b5f6 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), gemMat);
    gem.position.y = 1.45;
    g.add(ped, gem);
    scene.add(g);
    return { group: g, gem, gemMat, pos: new THREE.Vector3(cx, cy, cz), active: false };
  };
  const crystalA = createCrystal(-23, -33.5);
  const crystalB = createCrystal(-13, -33.5);

  const ruinsBridgeMat = new THREE.MeshBasicMaterial({
    color: 0x8be2ff,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
  });
  const ruinsBridge = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.28, 8.2), ruinsBridgeMat);
  ruinsBridge.position.set(-18, 5.15, -37.8);
  ruinsBridge.visible = false;
  ruinsGroup.add(ruinsBridge);
  scene.add(ruinsGroup);

  // 10. ЗОНА 5: Горная обсерватория и латунный телескоп
  const obsGroup = new THREE.Group();
  const obsTerrace = new THREE.Mesh(
    new THREE.CylinderGeometry(9.6, 10.2, 0.5, 18),
    ruinsStoneMat
  );
  obsTerrace.position.set(OBS_SUMMIT.x, OBS_SUMMIT.y - 0.25, OBS_SUMMIT.z);
  obsTerrace.receiveShadow = true;
  obsGroup.add(obsTerrace);

  // Латунный телескоп
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.28, metalness: 0.82 });
  const tripodMat = new THREE.MeshStandardMaterial({ color: 0x4b3b34, roughness: 0.65, metalness: 0.2 });
  const telescope = new THREE.Group();
  telescope.position.set(22.5, OBS_SUMMIT.y, -44);
  telescope.rotation.y = -0.6;
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), tripodMat);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.35, 0.7, Math.sin(a) * 0.35);
    leg.rotation.z = -Math.cos(a) * 0.28;
    leg.rotation.x = Math.sin(a) * 0.28;
    telescope.add(leg);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.0, 12), brassMat);
  tube.position.set(0, 1.55, 0);
  tube.rotation.x = -Math.PI * 0.32;
  telescope.add(tube);
  obsGroup.add(telescope);
  scene.add(obsGroup);

  // 11. Пять главных фонарей острова
  const lanterns = [
    createLanternProp('village', -7.5, 44, false, gradientMap, glowTex, null),
    createLanternProp('forest', FOREST_LEDGE.x, FOREST_LEDGE.z, false, gradientMap, glowTex, { lakeBridgeOpen: false }),
    createLanternProp('lake', LAKE_CENTER.x, LAKE_CENTER.z, false, gradientMap, glowTex, null),
    createLanternProp('ruins', -18, -45.5, false, gradientMap, glowTex, null),
    createLanternProp('observatory', OBS_SUMMIT.x, OBS_SUMMIT.z - 5.2, true, gradientMap, glowTex, null),
  ];
  // Корректируем высоту фонаря леса на вершине уступа
  lanterns[1].y = FOREST_LEDGE.topY;
  lanterns[1].group.position.y = FOREST_LEDGE.topY;
  lanterns.forEach((l) => scene.add(l.group));

  // 12. Скамейки для двоих
  const benches = [
    createBenchProp('village_bench', 3.4, 52.5, Math.PI, woodTex, gradientMap, null, false),
    createBenchProp('lake_bench', 23.5, 16.5, -2.2, woodTex, gradientMap, null, true),
    createBenchProp('obs_bench', 14.2, -44.2, -0.35, woodTex, gradientMap, null, true),
  ];
  benches.forEach((b) => scene.add(b.group));

  // 13. Коллекционные предметы (8 осколков света + 4 ракушки памяти)
  const collectibleSpecs = [
    { id: 'shard_1', kind: 'shard', x: 0, z: 66.5 },
    { id: 'shard_2', kind: 'shard', x: -10, z: 32 },
    { id: 'shard_3', kind: 'shard', x: -28, z: 12 },
    { id: 'shard_4', kind: 'shard', x: -41, z: -6, yOverride: FOREST_LEDGE.topY },
    { id: 'shard_5', kind: 'shard', x: 37, z: 10 },
    { id: 'shard_6', kind: 'shard', x: -22, z: -30 },
    { id: 'shard_7', kind: 'shard', x: 10, z: -22 },
    { id: 'shard_8', kind: 'shard', x: 22, z: -40, yOverride: OBS_SUMMIT.y },
    { id: 'shell_1', kind: 'shell', x: 12, z: 51 },
    { id: 'shell_2', kind: 'shell', x: -22, z: 42 },
    { id: 'shell_3', kind: 'shell', x: 24, z: -2 },
    { id: 'shell_4', kind: 'shell', x: -15, z: -46 },
  ];

  const shardGeo = new THREE.OctahedronGeometry(0.36, 0);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xffe48f });
  const shellGeo = new THREE.SphereGeometry(0.3, 10, 8);
  shellGeo.scale(1.25, 0.7, 1.0);
  const shellMat = new THREE.MeshToonMaterial({ color: 0xffb7cc, gradientMap });

  const collectibles = collectibleSpecs.map((spec) => {
    const cy = spec.yOverride !== undefined ? spec.yOverride : baseTerrainHeight(spec.x, spec.z);
    const g = new THREE.Group();
    g.position.set(spec.x, cy + 0.9, spec.z);
    const mesh = new THREE.Mesh(
      spec.kind === 'shard' ? shardGeo : shellGeo,
      spec.kind === 'shard' ? shardMat : shellMat
    );
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: spec.kind === 'shard' ? 0xffe082 : 0xffb3c8,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(1.4, 1.4, 1.4);
    g.add(mesh, glow);
    scene.add(g);
    return {
      ...spec,
      baseY: cy + 0.9,
      group: g,
      collected: false,
    };
  });

  // 14. 5 NPC персонажей
  const npcDefs = [
    {
      id: 'miro',
      x: 2.6,
      z: 42,
      rotY: -0.4,
      app: { hairStyle: 'short', hairColor: '#dce2ec', eyeColor: '#3876b8', outfitStyle: 'cloak', outfitColor: '#3d7c98', accessory: 'scarf' },
    },
    {
      id: 'lina',
      x: -30.5,
      z: 3.5,
      rotY: 1.2,
      app: { hairStyle: 'bob', hairColor: '#d89b52', eyeColor: '#3b8c66', outfitStyle: 'tunic', outfitColor: '#528065', accessory: 'flower' },
    },
    {
      id: 'tim',
      x: 21.5,
      z: 14.5,
      rotY: -1.1,
      app: { hairStyle: 'short', hairColor: '#4a352a', eyeColor: '#c87d2e', outfitStyle: 'hoodie', outfitColor: '#e07a5f', accessory: 'beret' },
    },
    {
      id: 'sen',
      x: -23.5,
      z: -28.5,
      rotY: 0.6,
      app: { hairStyle: 'ponytail', hairColor: '#25293d', eyeColor: '#7557a8', outfitStyle: 'cloak', outfitColor: '#945276', accessory: 'backpack' },
    },
    {
      id: 'noa',
      x: 15.2,
      z: -37.2,
      rotY: -0.5,
      app: { hairStyle: 'twintails', hairColor: '#71a8d8', eyeColor: '#c87d2e', outfitStyle: 'tunic', outfitColor: '#3d7c98', accessory: 'beret' },
    },
  ];

  const npcs = npcDefs.map((def) => {
    const rig = createAnimeCharacter(def.app, gradientMap, contactShadowTex, false);
    const ny = baseTerrainHeight(def.x, def.z);
    rig.root.position.set(def.x, ny, def.z);
    rig.root.rotation.y = def.rotY;
    scene.add(rig.root);

    // Маленький индикатор разговора над NPC
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe48f })
    );
    marker.position.set(0, 2.25, 0);
    rig.root.add(marker);

    return {
      ...def,
      y: ny,
      rig,
      marker,
      pos: new THREE.Vector3(def.x, ny, def.z),
    };
  });

  // 15. Частицы: светлячки по острову + лепестки в лесу
  const fireflyCount = 90;
  const ffPos = new Float32Array(fireflyCount * 3);
  const ffBase = [];
  for (let i = 0; i < fireflyCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 48;
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r;
    const fy = Math.max(0.8, baseTerrainHeight(fx, fz)) + 0.8 + Math.random() * 2.4;
    ffBase.push({ x: fx, y: fy, z: fz, phase: Math.random() * 10 });
    ffPos[i * 3] = fx;
    ffPos[i * 3 + 1] = fy;
    ffPos[i * 3 + 2] = fz;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({
    color: 0xffdf80,
    size: 0.65,
    map: glowTex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  scene.add(fireflies);

  const petalCount = 60;
  const petPos = new Float32Array(petalCount * 3);
  const petBase = [];
  for (let i = 0; i < petalCount; i++) {
    const px = -34 + (Math.random() - 0.5) * 32;
    const pz = 4 + (Math.random() - 0.5) * 32;
    const py = 3 + Math.random() * 7;
    petBase.push({ x: px, y: py, z: pz, speed: 0.6 + Math.random() * 0.6, phase: Math.random() * 6 });
    petPos[i * 3] = px;
    petPos[i * 3 + 1] = py;
    petPos[i * 3 + 2] = pz;
  }
  const petGeo = new THREE.BufferGeometry();
  petGeo.setAttribute('position', new THREE.BufferAttribute(petPos, 3));
  const petMat = new THREE.PointsMaterial({
    color: 0xffb3c9,
    size: 0.34,
    map: glowTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const petals = new THREE.Points(petGeo, petMat);
  scene.add(petals);

  // Палитры времени суток для плавного цикла день-закат-ночь-рассвет
  const SKY_KEYS = [
    { t: 0.0, top: '#0c1028', mid: '#18224a', bot: '#263462', sun: '#7ea4ff', hemiSky: '#5874bd', hemiGnd: '#1e2438', fog: '#1b264a', sunInt: 0.42, starOp: 0.95, ffOp: 0.95 }, // Полночь
    { t: 0.25, top: '#3c5fa6', mid: '#d67e8b', bot: '#ffbe86', sun: '#ffd39b', hemiSky: '#a8bfff', hemiGnd: '#6b574b', fog: '#d9a48c', sunInt: 1.35, starOp: 0.2, ffOp: 0.4 }, // Рассвет
    { t: 0.50, top: '#3c8be0', mid: '#78bef5', bot: '#cbe9ff', sun: '#fff4d6', hemiSky: '#b8e0ff', hemiGnd: '#6b7a52', fog: '#b5dcf5', sunInt: 1.85, starOp: 0.0, ffOp: 0.12 }, // День
    { t: 0.72, top: '#252d63', mid: '#b65b78', bot: '#f4a26a', sun: '#ffba73', hemiSky: '#98a6f0', hemiGnd: '#594238', fog: '#df967c', sunInt: 1.65, starOp: 0.48, ffOp: 0.9 }, // Тёплый закат (старт!)
    { t: 0.86, top: '#131838', mid: '#3a3466', bot: '#7a4b68', sun: '#b59be8', hemiSky: '#687bb5', hemiGnd: '#2b283b', fog: '#48385c', sunInt: 0.65, starOp: 0.88, ffOp: 0.98 }, // Сумерки
    { t: 1.0, top: '#0c1028', mid: '#18224a', bot: '#263462', sun: '#7ea4ff', hemiSky: '#5874bd', hemiGnd: '#1e2438', fog: '#1b264a', sunInt: 0.42, starOp: 0.95, ffOp: 0.95 },
  ];

  const c1 = new THREE.Color();
  const c2 = new THREE.Color();

  function updateTimeOfDay(timeOfDay) {
    const t = ((timeOfDay % 1) + 1) % 1;
    let k0 = SKY_KEYS[0];
    let k1 = SKY_KEYS[1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) {
        k0 = SKY_KEYS[i];
        k1 = SKY_KEYS[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, k1.t - k0.t);
    const f = (t - k0.t) / span;

    const lerpCol = (target, hexA, hexB) => {
      c1.set(hexA);
      c2.set(hexB);
      target.copy(c1).lerp(c2, f);
    };

    lerpCol(skyMat.uniforms.uTopColor.value, k0.top, k1.top);
    lerpCol(skyMat.uniforms.uMidColor.value, k0.mid, k1.mid);
    lerpCol(skyMat.uniforms.uBotColor.value, k0.bot, k1.bot);
    lerpCol(fog.color, k0.fog, k1.fog);
    lerpCol(sunLight.color, k0.sun, k1.sun);
    lerpCol(hemiLight.color, k0.hemiSky, k1.hemiSky);
    lerpCol(hemiLight.groundColor, k0.hemiGnd, k1.hemiGnd);

    sunLight.intensity = THREE.MathUtils.lerp(k0.sunInt, k1.sunInt, f);
    starMat.opacity = THREE.MathUtils.lerp(k0.starOp, k1.starOp, f);
    ffMat.opacity = THREE.MathUtils.lerp(k0.ffOp, k1.ffOp, f);

    // Положение солнца и луны на небесной дуге
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const sunX = Math.cos(sunAngle) * 165;
    const sunY = Math.sin(sunAngle) * 135;
    const sunZ = -90;
    sunDisc.position.set(sunX, sunY, sunZ);
    sunDisc.visible = sunY > -15;

    moonDisc.position.set(-sunX, -sunY, -sunZ);
    moonDisc.visible = -sunY > -15;

    // Светило теней всегда держится выше горизонта (днём солнце, ночью луна)
    const dirPos = sunY >= 8 ? sunDisc.position : moonDisc.position;
    waterMat.uniforms.uSunDir.value.copy(dirPos).normalize();
    waterMat.uniforms.uSunColor.value.copy(sunLight.color);

    const isNight = t < 0.22 || t > 0.78;
    const winColor = isNight ? 0xffdf8b : 0x89a2bf;
    cottages.forEach((c) => c.windowMat.color.setHex(winColor));

    return { sunDirPos: dirPos, isNight };
  }

  return {
    gradientMap,
    contactShadowTex,
    glowTex,
    sunLight,
    beaconPointLight,
    waterMat,
    grassMat,
    grassMesh,
    maxGrassCount,
    clouds,
    boatGroup,
    lhBeamPivot,
    boostSpot,
    ropeAnchor,
    ropeMesh,
    lakePlateA,
    lakePlateB,
    lakeBridge,
    crystalA,
    crystalB,
    ruinsBridge,
    ruinsBridgeMat,
    lanterns,
    benches,
    collectibles,
    npcs,
    fireflies,
    ffBase,
    petals,
    petBase,
    updateTimeOfDay,
  };
}
