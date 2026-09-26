import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDarumaTower, decorateDarumaHead, DARUMA_HEAD_NAMES } from './darumaTower.js';
import { createShrineBackdrop, SHRINE_BACKDROPS } from './shrineBackdrop.js';

const HEAD_STEP = 1.18 * .58;
const COLORS = ['#ed7965', '#5db89b', '#edbd58', '#9b8ad7'];
const stairPosition = (rank, count) => ({ x: .05, y: .15 + (count - 1 - rank) * HEAD_STEP, z: 1.12 - (count - 1 - rank) * .18 });

function scoreboardTexture(players, backdrop) {
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1280;
  const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#263b32';ctx.beginPath();ctx.roundRect(12,12,744,616,30);ctx.fill();
  ctx.strokeStyle='#d8b46e';ctx.lineWidth=14;ctx.stroke();ctx.fillStyle='#f4dfb0';ctx.font='bold 62px sans-serif';ctx.fillText(`總積分 · ${SHRINE_BACKDROPS[backdrop]||SHRINE_BACKDROPS[0]}`,54,94);
  players.map((player,index)=>({player,index})).filter(({player})=>player?.joined).forEach(({player,index},row)=>{const y=171+row*111;ctx.fillStyle=COLORS[index];ctx.fillRect(54,y-43,18,78);ctx.fillStyle='#f5ecd7';ctx.font='bold 45px sans-serif';ctx.fillText(String(player.name).slice(0,14),94,y+5,430);ctx.textAlign='right';ctx.font='bold 56px sans-serif';ctx.fillText(`${player.total||0}`,702,y+8);ctx.textAlign='left';});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function label(text) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.scale(2,2); ctx.fillStyle = '#102c26'; ctx.beginPath(); ctx.roundRect(5, 5, 502, 118, 22); ctx.fill();
  ctx.strokeStyle = '#f4d796'; ctx.lineWidth = 6; ctx.stroke(); ctx.fillStyle = '#fff9e9';
  ctx.font = '800 45px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(text).slice(0, 23), 256, 64, 470);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: .94, depthTest: false }));
  sprite.scale.set(2.1, .52, 1); sprite.renderOrder = 15; return sprite;
}

function person(color) {
  const body = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: .7 });
  const ink = new THREE.MeshStandardMaterial({ color: '#192f2b', roughness: .8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#f4cda0', roughness: .8 });
  const add = (geometry, material, x, y, z) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; body.add(mesh); return mesh; };
  const headPlaceholder = add(new THREE.SphereGeometry(.14, 16, 14), skin, 0, .73, 0);
  add(new THREE.CylinderGeometry(.12, .11, .32, 10), suit, 0, .41, 0);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side*.15,.54,0); body.add(shoulder);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .31, 8), ink); arm.position.y=-.155; arm.castShadow=true; shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.046,10,8),skin); hand.position.y=-.32; hand.castShadow=true; shoulder.add(hand);
    arms.push(shoulder);
    const leg = add(new THREE.CylinderGeometry(.045, .045, .30, 8), ink, side * .07, .11, 0); legs.push(leg);
  }
  const hitbox = add(new THREE.SphereGeometry(.43, 10, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, .38, 0);
  const headMount = new THREE.Group(); headMount.position.set(0,.59,0); body.add(headMount);
  body.userData = { arms, legs, hitbox, suit, headPlaceholder, headMount, headChoices:new Map(), headKey:null, label: null, labelKey: '' };
  return body;
}

export default function ShrineScene({ board = [], players = [], phase, roundEndAt, myPlayerID, currentPlayer, lastMove, lastAttack, lastCrow, messages = [], backdrop = 0, shootMode = false, flashTikiId = null, flashToken = 0, onHead, onPlayer, onStairs, onGround, onWalk, interactive = true }) {
  const mount = useRef(null);
  const latest = useRef({ board, players, phase, roundEndAt, myPlayerID, currentPlayer, lastMove, lastAttack, lastCrow, messages, shootMode, flashTikiId, flashToken, onHead, onPlayer, onStairs, onGround, onWalk });
  latest.current = { board, players, phase, roundEndAt, myPlayerID, currentPlayer, lastMove, lastAttack, lastCrow, messages, shootMode, flashTikiId, flashToken, onHead, onPlayer, onStairs, onGround, onWalk };

  useEffect(() => {
    const node = mount.current; if (!node) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#182f2e'); scene.fog = new THREE.Fog('#182f2e', 19, 35);
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 65);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; node.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#d5ecdf', '#4d3027', 2.1));
    const light = new THREE.DirectionalLight('#ffe2aa', 2.8); light.position.set(-6, 12, 9); light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -10; light.shadow.camera.right = 10; light.shadow.camera.top = 12; light.shadow.camera.bottom = -8; scene.add(light);
    const material = (color, roughness = .8) => new THREE.MeshStandardMaterial({ color, roughness });
    const wood = material('#67412d'), darkWood = material('#3b2925'), vermilion = material('#a62f26', .58), gold = material('#d8ad65', .45);
    const mesh = (parent, geo, mat, pos, cast = true) => { const item = new THREE.Mesh(geo, mat); item.position.set(...pos); item.castShadow = cast; item.receiveShadow = true; parent.add(item); return item; };
    const floor = mesh(scene, new THREE.PlaneGeometry(36, 25), material('#857962'), [0, -.12, 4], false); floor.rotation.x = -Math.PI / 2;
    const mat = mesh(scene, new THREE.PlaneGeometry(12, 9), material('#57694b'), [0, -.105, 2], false); mat.rotation.x = -Math.PI / 2;
    const wall = mesh(scene, new THREE.BoxGeometry(13, 8.2, .42), material('#d4bea0'), [0, 3.9, -2.72]);
    createShrineBackdrop(scene, backdrop);
    for (let x = -6; x <= 6; x += 1.2) mesh(scene, new THREE.BoxGeometry(.12, 8.1, .12), wood, [x, 3.9, -2.45]);
    for (let y = .35; y < 8.1; y += 1.15) mesh(scene, new THREE.BoxGeometry(12.9, .09, .12), darkWood, [0, y, -2.43]);
    for (const side of [-1, 1]) {
      mesh(scene, new THREE.CylinderGeometry(.22, .28, 7.5, 12), vermilion, [side * 4.55, 3.65, -1.85]);
      mesh(scene, new THREE.BoxGeometry(.52, .20, 1), gold, [side * 4.55, 6.95, -1.85]);
      mesh(scene, new THREE.BoxGeometry(.75, .15, .75), darkWood, [side * 4.55, .05, -1.85]);
      const lantern = mesh(scene, new THREE.SphereGeometry(.27, 12, 10), material('#efc178', .5), [side * 5.4, 4.75, -.8]);
      mesh(scene, new THREE.CylinderGeometry(.04, .04, .42, 7), darkWood, [side * 5.4, 5.1, -.8]); lantern.userData.lantern = true;
    }
    mesh(scene, new THREE.BoxGeometry(10.3, .5, .78), vermilion, [0, 7.35, -1.85]);
    mesh(scene, new THREE.BoxGeometry(11, .18, .95), darkWood, [0, 7.72, -1.85]);
    mesh(scene, new THREE.BoxGeometry(7.3, .3, .65), vermilion, [0, 6.68, -1.85]);
    mesh(scene, new THREE.BoxGeometry(.8, .6, .15), gold, [0, 7.02, -1.39]);
    const stairGroup = new THREE.Group(); scene.add(stairGroup);
    const beam=(from,to,radius,mat)=>{const start=new THREE.Vector3(...from),end=new THREE.Vector3(...to),delta=end.clone().sub(start);const item=mesh(stairGroup,new THREE.CylinderGeometry(radius,radius,delta.length(),9),mat,start.clone().add(end).multiplyScalar(.5).toArray());item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return item;};
    for(const side of [-1,1]){
      beam([.05+side*.62,0,1.43],[.05+side*.52,6.05,-.39],.09,wood);
      beam([.05+side*.65,0,-.64],[.05+side*.52,6.05,-.39],.09,darkWood);
      beam([.05+side*.62,2.45,1.43-2.45*.30],[.05+side*.65,2.45,-.55],.065,gold);
      mesh(stairGroup,new THREE.SphereGeometry(.12,12,8),gold,[.05+side*.52,6.05,-.39]);
    }
    for(let rank=8;rank>=0;rank--){
      const step=stairPosition(rank,9);
      const rung=mesh(stairGroup,new THREE.BoxGeometry(1.15,.115,.24),wood,[step.x,step.y,step.z]);
      rung.userData.stairRank=rank;
      mesh(stairGroup,new THREE.BoxGeometry(1.1,.026,.20),gold,[step.x,step.y+.073,step.z]);
    }
    const feet=mesh(stairGroup,new THREE.BoxGeometry(1.52,.12,2.28),darkWood,[.05,-.02,.38]);
    feet.userData.stairRank=8;
    const tower = createDarumaTower(scene, { x: 1.15, z: .45 }, { modelUrl:'/assets/daruma-tower-v2.glb' });
    const scoreboard=new THREE.Mesh(new THREE.PlaneGeometry(3.5,2.95),new THREE.MeshBasicMaterial({map:scoreboardTexture(players,backdrop),transparent:true,side:THREE.DoubleSide}));
    scoreboard.position.set(-2.75,3.9,-1.91);scoreboard.visible=interactive;scene.add(scoreboard);
    const avatars = new Map(); const avatarRoot = new THREE.Group(); scene.add(avatarRoot);
    const groundStart=[[-4,2.7],[-2.8,3.4],[2.8,3.4],[4,2.7]];
    for (let id = 0; id < 4; id++) { const avatar = person(COLORS[id]); avatar.userData.id = id; avatar.position.set(groundStart[id][0],0,groundStart[id][1]); avatars.set(id, avatar); avatarRoot.add(avatar); }
    const headTemplates = new Map(); let sceneAlive = true;
    new GLTFLoader().load('/assets/daruma-tower-v2.glb', gltf => {
      if(!sceneAlive)return;
      for(let id=0;id<9;id++){const head=gltf.scene.getObjectByName(`Tiki_${String(id).padStart(2,'0')}_${DARUMA_HEAD_NAMES[id]}`);if(head)headTemplates.set(id,head);}
    });
    const crow = new THREE.Group(); const crowBody = mesh(crow, new THREE.SphereGeometry(.18, 12, 9), material('#13191b'), [0, 0, 0]);
    const wing1 = mesh(crow, new THREE.ConeGeometry(.20, .82, 3), material('#22252a'), [-.37, .08, 0]); wing1.rotation.z = -1.35;
    const wing2 = mesh(crow, new THREE.ConeGeometry(.20, .82, 3), material('#22252a'), [.37, .08, 0]); wing2.rotation.z = 1.35;
    const beak = mesh(crow, new THREE.ConeGeometry(.07, .26, 6), gold, [.03, -.02, .17]); beak.rotation.x = Math.PI / 2;
    scene.add(crow); crow.visible = false;
    const effects = new THREE.Group(); scene.add(effects); let tracer = null;
    let crowStamp = null, attackStamp = null, crowStart = 0, shakeUntil = 0, attackAt = 0, attackTarget = null;
    let boardKey = '', lastBoard = [], currentBoard = [];
    const raycaster = new THREE.Raycaster();
    let yaw = .05, yawTarget = .05, distance = 13.1, height = 4.9, drag = null; const pointers = new Map();
    const eventRay = e => { const rect = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera); return raycaster; };
    const down = e => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, yaw: yawTarget, height, moved: false }; renderer.domElement.setPointerCapture?.(e.pointerId); };
    const move = e => { if (!drag || !pointers.has(e.pointerId)) return; const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size > 1) { const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1]; if (other) distance = THREE.MathUtils.clamp(distance - (Math.hypot(e.clientX - other.x, e.clientY - other.y) - Math.hypot(prev.x - other.x, prev.y - other.y)) * .022, 9.5, 19); drag.moved = true; return; }
      yawTarget = THREE.MathUtils.clamp(drag.yaw + (e.clientX - drag.x) * .004, -.44, .44); height = THREE.MathUtils.clamp(drag.height + (e.clientY - drag.y) * .012, 3.4, 7.3); if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 7) drag.moved = true;
    };
    const up = e => { pointers.delete(e.pointerId); if (!drag) return; const moved = drag.moved; drag = null; if (moved || !interactive) return; const ray = eventRay(e);
      const people = ray.intersectObjects([...avatars.values()].filter(a => a.visible), true);
      if (people.length && latest.current.shootMode) { let target = people[0].object; while (target.parent && target.parent !== avatarRoot) target = target.parent; if (target.parent === avatarRoot) { latest.current.onPlayer?.(target.userData.id); return; } }
      const headHits = ray.intersectObjects([tower.root], true);
      for (const hit of headHits) { let target = hit.object; while (target && target !== tower.root) { const match = target.name?.match(/^Tiki_(\d\d)_/); if (match) { latest.current.onHead?.(Number(match[1])); return; } target = target.parent; } }
      const stairHits = ray.intersectObjects([stairGroup], true);
      if (stairHits.length) { const count=latest.current.board.filter(t=>t.active).length; if(count){ const rung=stairHits[0].object.userData.stairRank; const level=Number.isInteger(rung)?8-rung:Math.round((stairHits[0].point.y-.15)/HEAD_STEP); latest.current.onStairs?.(THREE.MathUtils.clamp(count-1-level,0,count-1)); } return; }
      const ground=ray.intersectObjects([mat,floor]); if(ground.length) latest.current.onGround?.({x:THREE.MathUtils.clamp(ground[0].point.x,-5.3,5.3),z:THREE.MathUtils.clamp(ground[0].point.z,1.1,5.3)});
    };
    const wheel = e => { e.preventDefault(); distance = THREE.MathUtils.clamp(distance + Math.sign(e.deltaY) * .7, 9.5, 19); };
    const keys=new Set(); const keyDown=e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return; if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());};const keyUp=e=>keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
    const walkTimer=setInterval(()=>{let dx=0,dz=0;if(keys.has('a')||keys.has('arrowleft'))dx--;if(keys.has('d')||keys.has('arrowright'))dx++;if(keys.has('w')||keys.has('arrowup'))dz--;if(keys.has('s')||keys.has('arrowdown'))dz++;if(dx||dz)latest.current.onWalk?.(dx,dz);},115);
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('wheel', wheel, { passive: false });
    const resize = () => { const w = Math.max(1, node.clientWidth), h = Math.max(1, node.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }; const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame = 0, scoreKey='', blastStamp=null, blastAt=0, seenFlashToken=0, touchStamp=null, touchAt=0, touchActor=-1;
    const render = () => { frame = requestAnimationFrame(render); const data = latest.current; const now = performance.now();
      currentBoard = data.board.filter(t => t.active); const key = currentBoard.map(t => t.id).join(','); if (key !== boardKey) { boardKey = key; lastBoard = currentBoard; }
      if(data.flashToken!==seenFlashToken){seenFlashToken=data.flashToken;tower.flash(data.flashTikiId,now);}
      const nextScoreKey=data.players.map(p=>`${p?.joined}:${p?.name}:${p?.total}`).join('|');if(scoreKey!==nextScoreKey){scoreKey=nextScoreKey;scoreboard.material.map.dispose();scoreboard.material.map=scoreboardTexture(data.players,backdrop);scoreboard.material.needsUpdate=true;}
      const flashElapsed=data.phase==='roundEnd'&&data.roundEndAt?Date.now()-(data.roundEndAt-4000):-1;
      scoreboard.material.opacity=flashElapsed>=0&&flashElapsed<1000?.65+.35*Math.abs(Math.sin(flashElapsed*.024)):1;
      tower.sync(currentBoard, data.lastMove); tower.tick(now);
      if(data.lastMove?.stamp!==touchStamp&&data.lastMove?.type&&data.lastMove.type!=='toast'){touchStamp=data.lastMove.stamp;touchAt=now;touchActor=Number(data.lastMove.by);}
      if(data.lastMove?.stamp!==blastStamp&&data.lastMove?.type==='toast'){blastStamp=data.lastMove.stamp;blastAt=now;for(const fallen of data.lastMove.blastPlayers||[]){const avatar=avatars.get(Number(fallen.id));if(avatar)avatar.userData.blastFrom=avatar.position.clone();}}
      if (data.lastAttack?.stamp !== attackStamp && data.lastAttack) { attackStamp = data.lastAttack.stamp; attackAt = now; attackTarget = Number(data.lastAttack.targetID); if (data.lastAttack.type === 'kick') shakeUntil = now + 750;
        else { const a = avatars.get(Number(data.lastAttack.by)), b = avatars.get(attackTarget); if (a && b) { const points = [a.position.clone().add(new THREE.Vector3(0,.55,0)), b.position.clone().add(new THREE.Vector3(0,.55,0))]; tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#ffe4a7', transparent: true, opacity: .9 })); effects.add(tracer); } }
      }
      if (data.lastCrow?.stamp !== crowStamp && data.lastCrow) { crowStamp = data.lastCrow.stamp; crowStart = now; crow.visible = true; }
      if (crow.visible) { const p = (now - crowStart) / 2400; crow.position.set(-6 + p * 12, 4.3 + Math.sin(p * 7) * .28, .35); wing1.rotation.z = -1.2 - Math.sin(now * .023) * .35; wing2.rotation.z = 1.2 + Math.sin(now * .023) * .35; if (p > 1) crow.visible = false; }
      stairGroup.position.x = now < shakeUntil ? Math.sin(now * .09) * .095 : 0;
      if (tracer) { tracer.material.opacity = Math.max(0, 1 - (now - attackAt) / 390); if (tracer.material.opacity <= 0) { effects.remove(tracer); tracer.geometry.dispose(); tracer.material.dispose(); tracer = null; } }
      avatars.forEach((avatar, id) => { const p = data.players[id]; avatar.visible = Boolean(p?.joined); if (!avatar.visible) return;
        const headId=Number.isInteger(p.avatarTikiId)&&p.avatarTikiId>=0&&p.avatarTikiId<9?p.avatarTikiId:null;
        if(avatar.userData.headKey!==headId&&headTemplates.size){avatar.userData.headKey=headId;avatar.userData.headPlaceholder.visible=headId===null;avatar.userData.headChoices.forEach(head=>head.visible=false);if(headId!==null){let head=avatar.userData.headChoices.get(headId);if(!head&&headTemplates.has(headId)){head=headTemplates.get(headId).clone(true);head.position.set(0,0,0);head.scale.setScalar(.28);decorateDarumaHead(head,headId);avatar.userData.headMount.add(head);avatar.userData.headChoices.set(headId,head)}if(head)head.visible=true;}}
        avatar.userData.suit.color.set(({coral:'#ed7965',jade:'#5db89b',sun:'#edbd58',lavender:'#9b8ad7'})[p.color]||COLORS[id]);
        const rank = p.ladderRank; const step = Number.isInteger(rank)&&currentBoard.length ? stairPosition(Math.min(rank, currentBoard.length - 1), currentBoard.length) : null;
        const touching=id===touchActor&&now-touchAt<900?Math.sin(Math.PI*(now-touchAt)/900):0;
        const pos = step ? { x: step.x + .13 + touching*.25, y: step.y + .16, z: step.z + .24 } : { x: p.position?.x??groundStart[id][0], y: 0, z: p.position?.z??groundStart[id][1] };
        const dx = pos.x - avatar.position.x, dy = pos.y - avatar.position.y, dz = pos.z - avatar.position.z; const moving = Math.hypot(dx, dy, dz) > .015;
        avatar.position.x += dx * .14; avatar.position.y += dy * .14; avatar.position.z += dz * .14;
        if(avatar.userData.blastFrom&&now-blastAt<900){const t=(now-blastAt)/900;avatar.position.lerpVectors(avatar.userData.blastFrom,new THREE.Vector3(pos.x,0,pos.z),t);avatar.position.y+=Math.sin(Math.PI*t)*.8;}else if(avatar.userData.blastFrom&&now-blastAt>=900)delete avatar.userData.blastFrom;
        if (id === attackTarget && data.lastAttack?.type === 'shot' && now - attackAt < 650) {
          const flight = (now - attackAt) / 650;
          const from = stairPosition(data.lastAttack.from, currentBoard.length);
          const to = stairPosition(data.lastAttack.to, currentBoard.length);
          avatar.position.y = THREE.MathUtils.lerp(from.y, to.y, flight) + .16 + Math.sin(Math.PI * flight) * .38;
        }
        const stride = moving ? Math.sin(now * .016 + id) * .54 : 0; avatar.userData.legs[0].rotation.x = stride; avatar.userData.legs[1].rotation.x = -stride; avatar.userData.arms[0].rotation.x = -stride*.55; avatar.userData.arms[1].rotation.x = stride*.55;
        avatar.userData.arms[1].rotation.z=touching*1.28;
        avatar.rotation.z = id === attackTarget && now - attackAt < 600 ? Math.sin((now - attackAt) / 600 * Math.PI) * .28 : 0;
        const chosen=Number.isInteger(rank)?currentBoard[rank]:null;
        const shown = `${p.name || `玩家 ${id+1}`}${chosen ? ` |${rank+1}` : ''}`;
        if (shown !== avatar.userData.labelKey) { if (avatar.userData.label) { avatar.remove(avatar.userData.label); avatar.userData.label.material.map.dispose(); avatar.userData.label.material.dispose(); } avatar.userData.label = label(shown); avatar.userData.label.position.y = 1.05; avatar.add(avatar.userData.label); avatar.userData.labelKey = shown; }
        const speech = [...data.messages].reverse().find(m => String(m.playerID) === String(id) && m.kind !== 'system' && Date.now() - m.at < 3000);
        const speechKey = speech ? `${speech.at}:${speech.text || speech.phrase}` : '';
        if (speechKey !== avatar.userData.speechKey) { if (avatar.userData.speech) { avatar.remove(avatar.userData.speech); avatar.userData.speech.material.map.dispose(); avatar.userData.speech.material.dispose(); avatar.userData.speech = null; } if (speech) { avatar.userData.speech = label(speech.kind === 'emote' ? `${speech.emoji} ${speech.phrase}` : speech.text); avatar.userData.speech.position.y = 1.55; avatar.add(avatar.userData.speech); } avatar.userData.speechKey = speechKey; }
      });
      yaw += (yawTarget - yaw) * .09; camera.position.set(Math.sin(yaw) * distance, height, Math.cos(yaw) * distance); camera.lookAt(0, 3.55, -1.15);
      renderer.render(scene, camera);
    }; render();
    return () => { sceneAlive=false;cancelAnimationFrame(frame); clearInterval(walkTimer);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp); observer.disconnect(); tower.dispose(); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('wheel', wheel);scoreboard.material.map.dispose(); scene.traverse(object => { object.geometry?.dispose(); object.material?.map?.dispose(); if (Array.isArray(object.material)) object.material.forEach(m => m.dispose()); else object.material?.dispose(); }); renderer.dispose(); node.removeChild(renderer.domElement); };
  }, [interactive,backdrop]);
  return <div className="three-scene shrine-scene interactive" ref={mount} aria-label="神社牆面上的不倒翁塔與可攀爬樓梯"/>;
}
