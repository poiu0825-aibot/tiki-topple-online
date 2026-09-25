import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TOWER_POSITION = { x: 6.55, z: -0.55 };
const LAYER_HEIGHT = 1.18;
const MODEL_SCALE = 0.58;
const SCORE_COLORS = ['#ffe19a', '#d8e5e3', '#eab98b'];

function rankSprite(rank) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#213b31';
  ctx.strokeStyle = SCORE_COLORS[rank];
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.roundRect(9, 9, 110, 110, 27);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SCORE_COLORS[rank];
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank + 1), 64, 69);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(.38, .38, 1);
  sprite.renderOrder = 12;
  return sprite;
}

export function createDarumaTower(scene, position = TOWER_POSITION, options = {}) {
  const stage = new THREE.Group();
  stage.position.set(position.x, .02, position.z);
  scene.add(stage);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(.72, .84, .22, 48),
    new THREE.MeshStandardMaterial({ color: '#71563d', metalness: .15, roughness: .7 }),
  );
  plinth.position.y = -.11;
  plinth.castShadow = plinth.receiveShadow = true;
  stage.add(plinth);
  const plinthRim = new THREE.Mesh(
    new THREE.TorusGeometry(.72, .035, 8, 48),
    new THREE.MeshStandardMaterial({ color: '#eac985', metalness: .52, roughness: .3 }),
  );
  plinthRim.rotation.x = Math.PI / 2;
  plinthRim.position.y = -.005;
  stage.add(plinthRim);

  const heads = new Map();
  const badges = [];
  const sparks = [];
  let model = null;
  let latestBoard = [];
  let demoBoard = null;
  let demoTimer = null;
  let disposed = false;
  let blastStamp = null;
  let flashId = null;
  let flashUntil = 0;

  new GLTFLoader().load(options.modelUrl || '/assets/daruma-tower-prototype.glb', (gltf) => {
    if (disposed) {
      gltf.scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      return;
    }
    model = gltf.scene;
    model.scale.setScalar(MODEL_SCALE);
    model.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    stage.add(model);
    for (let id = 0; id < 9; id++) {
      const head = model.getObjectByName(`Tiki_${String(id).padStart(2, '0')}_${['Sleepy', 'EyeRoll', 'Smile', 'Angry', 'Smirk', 'Sweat', 'Wink', 'Surprised', 'Neutral'][id]}`);
      if (head) {
        const flashMaterials = new Set();
        head.traverse(child => {
          if (!child.isMesh) return;
          const clone = original => {
            const separate = original.clone();
            if ('emissive' in separate) { separate.emissive.set('#ffec8b'); separate.emissiveIntensity = 0; flashMaterials.add(separate); }
            return separate;
          };
          child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
        });
        heads.set(id, { object: head, targetY: head.position.y, targetScale: 1, flashMaterials });
      }
    }
    for (let rank = 0; rank < 3; rank++) {
      const badge = rankSprite(rank);
      model.add(badge);
      badges.push(badge);
    }
    applyBoard();
  }, undefined, (error) => {
    console.error('立體頭像塔載入失敗', error);
  });

  function applyBoard() {
    if (!model) return;
    const active = (demoBoard || latestBoard).filter((tiki) => tiki.active);
    heads.forEach((head, id) => {
      const rank = active.findIndex((tiki) => tiki.id === id);
      head.targetY = rank < 0 ? -.55 : (active.length - 1 - rank) * LAYER_HEIGHT;
      head.targetScale = rank < 0 ? 0 : 1;
      if (rank >= 0) head.object.visible = true;
    });
    badges.forEach((badge, rank) => {
      badge.visible = rank < active.length;
      badge.userData.targetY = (active.length - 1 - rank) * LAYER_HEIGHT + .96;
      if (!badge.userData.initialized) {
        badge.position.y = badge.userData.targetY;
        badge.userData.initialized = true;
      }
      badge.position.x = 1.1;
      badge.position.z = -.06;
    });
  }

  function blast() {
    const origin = new THREE.Vector3(0, .15, 0);
    for (let index = 0; index < 18; index++) {
      const angle = index * Math.PI * 2 / 18;
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(.065 + index % 3 * .018),
        new THREE.MeshBasicMaterial({ color: index % 2 ? '#ffe7a5' : '#ff7953', transparent: true, opacity: 1 }),
      );
      mesh.position.copy(origin);
      stage.add(mesh);
      sparks.push({ mesh, start: performance.now(), vx: Math.cos(angle) * (1.2 + index % 4 * .18), vy: 1.3 + index % 5 * .2, vz: Math.sin(angle) * (1.2 + index % 4 * .18) });
    }
  }

  return {
    root: stage,
    flash(id, now = performance.now()) {
      if (!Number.isInteger(id)) return;
      flashId = id;
      flashUntil = now + 2000;
    },
    sync(board, lastMove) {
      const previous = latestBoard.filter((tiki) => tiki.active).map((tiki) => tiki.id).join(',');
      latestBoard = board || [];
      const next = latestBoard.filter((tiki) => tiki.active).map((tiki) => tiki.id).join(',');
      if (previous !== next) {
        clearTimeout(demoTimer);
        demoBoard = null;
        applyBoard();
      }
      if (lastMove?.type === 'toast' && lastMove.stamp !== blastStamp) {
        blastStamp = lastMove.stamp;
        blast();
      }
    },
    previewBlast() {
      if (!model || latestBoard.filter((tiki) => tiki.active).length < 2) return false;
      clearTimeout(demoTimer);
      demoBoard = latestBoard.filter((tiki) => tiki.active).slice(0, -1);
      applyBoard();
      blast();
      demoTimer = setTimeout(() => { demoBoard = null; applyBoard(); }, 3800);
      return true;
    },
    tick(now) {
      badges.forEach((badge) => {
        if (badge.visible) badge.position.y += (badge.userData.targetY - badge.position.y) * .075;
      });
      heads.forEach((head) => {
        const object = head.object;
        object.position.y += (head.targetY - object.position.y) * .075;
        const size = object.scale.x + (head.targetScale - object.scale.x) * .15;
        object.scale.setScalar(size);
        if (size < .012 && head.targetScale === 0) object.visible = false;
      });
      heads.forEach((head, id) => {
        const selected = id === flashId && now < flashUntil && head.targetScale > 0;
        const strength = selected ? 1.1 + .9 * Math.sin(now * .022) ** 2 : 0;
        head.flashMaterials.forEach(material => { material.emissiveIntensity = strength; });
      });
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index];
        const fraction = (now - spark.start) / 820;
        if (fraction >= 1) {
          stage.remove(spark.mesh);
          spark.mesh.geometry.dispose();
          spark.mesh.material.dispose();
          sparks.splice(index, 1);
          continue;
        }
        spark.mesh.position.set(spark.vx * fraction, .15 + spark.vy * fraction - 1.7 * fraction * fraction, spark.vz * fraction);
        spark.mesh.rotation.set(fraction * 6, fraction * 8, 0);
        spark.mesh.material.opacity = 1 - fraction;
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(demoTimer);
      badges.forEach((badge) => {
        badge.material.map?.dispose();
        badge.material.dispose();
      });
    },
  };
}
