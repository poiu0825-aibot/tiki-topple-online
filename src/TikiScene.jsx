import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TIKIS } from './game.js';
import { START_POSITIONS, tilePosition } from './layout.js';
import { tikiImageUrl } from './tikiArt.js';

const PLAYER_COLORS = { coral:'#ed7965', jade:'#5db89b', sun:'#edbd58', lavender:'#9b8ad7' };
const FLOOR_Y = .32;

function rankTexture(rank) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = rank <= 3 ? '#f5d47a' : '#f4eddc';
  context.beginPath(); context.roundRect(7, 7, 114, 114, 24); context.fill();
  context.strokeStyle = '#33483a'; context.lineWidth = 5; context.stroke();
  context.fillStyle = '#263c31'; context.font = 'bold 72px sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(String(rank), 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function stickman(color) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({color:'#26362e',roughness:.8});
  const suit = new THREE.MeshStandardMaterial({color,roughness:.7});
  const skin = new THREE.MeshStandardMaterial({color:'#e9c49b',roughness:.76});
  const limb = (parent, material, length, width, y) => {
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(width,width,length,9),material);
    segment.position.y=y; segment.castShadow=true; parent.add(segment); return segment;
  };
  const head = new THREE.Mesh(new THREE.SphereGeometry(.18,18,14),skin);
  head.position.y=1.16;head.castShadow=true;group.add(head);
  limb(group,suit,.55,.11,.73);
  const arms=[],legs=[];
  [-1,1].forEach(side=>{
    const arm=new THREE.Group();arm.position.set(side*.16,.96,0);
    limb(arm,dark,.48,.045,-.22);group.add(arm);arms.push(arm);
    const leg=new THREE.Group();leg.position.set(side*.075,.45,0);
    limb(leg,dark,.47,.055,-.23);group.add(leg);legs.push(leg);
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.27,20),new THREE.MeshBasicMaterial({color:'#0c1c16',transparent:true,opacity:.22,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.014;group.add(shadow);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.29,.36,28),new THREE.MeshBasicMaterial({color:'#ffe18b',transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.019;halo.visible=false;group.add(halo);
  group.userData={arms,legs,suit,halo,flight:null};
  return group;
}

export default function TikiScene({board=[],players=[],myPlayerID,decorative=false,lastMove,interactive=false,selectedHead,onTikiClick,onWalk,onGroundClick,canWalk=false}) {
  const mount = useRef(null);
  const latest = useRef({board,players,myPlayerID,lastMove,selectedHead,onTikiClick,onWalk,onGroundClick,canWalk});
  latest.current={board,players,myPlayerID,lastMove,selectedHead,onTikiClick,onWalk,onGroundClick,canWalk};

  useEffect(()=>{
    const node=mount.current;
    if(!node)return;
    const scene=new THREE.Scene();
    scene.background=new THREE.Color('#1a4039');
    scene.fog=new THREE.FogExp2('#1a4039',.018);
    const camera=new THREE.PerspectiveCamera(45,Math.max(1,node.clientWidth)/Math.max(1,node.clientHeight),.1,100);
    const renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
    renderer.setSize(Math.max(1,node.clientWidth),Math.max(1,node.clientHeight));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    node.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#e6f8e5','#493c2a',2.2));
    const sun=new THREE.DirectionalLight('#ffecc4',3.1);
    sun.position.set(-5,12,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;
    scene.add(sun);
    const material=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
    const island=new THREE.Mesh(new THREE.CircleGeometry(17,72),material('#326e51'));
    island.rotation.x=-Math.PI/2;island.position.y=-.2;island.receiveShadow=true;scene.add(island);
    const table=new THREE.Mesh(new THREE.CylinderGeometry(5.3,5.55,.42,72),material('#ab875a'));
    table.position.y=.08;table.receiveShadow=true;table.castShadow=true;scene.add(table);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(5.25,.085,8,80),material('#ead08d',.4));
    rim.rotation.x=Math.PI/2;rim.position.y=.3;scene.add(rim);
    const lane=new THREE.Mesh(new THREE.PlaneGeometry(2.28,9.25),new THREE.MeshBasicMaterial({color:'#3a654b',transparent:true,opacity:.45,side:THREE.DoubleSide}));
    lane.rotation.x=-Math.PI/2;lane.position.set(0,FLOOR_Y+.006,0);scene.add(lane);
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4+.24, palm=new THREE.Group();
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.08,.16,1.8,7),material('#81613d'));
      trunk.position.y=.8;palm.add(trunk);
      for(let j=0;j<5;j++){
        const leaf=new THREE.Mesh(new THREE.ConeGeometry(.16,1.55,5),material(j%2?'#4f8051':'#669258'));
        leaf.position.set(Math.cos(j*1.25)*.46,1.65,Math.sin(j*1.25)*.46);
        leaf.rotation.z=-Math.cos(j*1.25)*.92;leaf.rotation.x=Math.sin(j*1.25)*.92;
        palm.add(leaf);
      }
      palm.position.set(Math.sin(angle)*7.9,0,Math.cos(angle)*7.9);
      scene.add(palm);
    }

    const headTextures=TIKIS.map(tiki=>{
      const texture=new THREE.TextureLoader().load(tikiImageUrl(tiki));
      texture.colorSpace=THREE.SRGBColorSpace;
      return texture;
    });
    const ranks=Array.from({length:9},(_,index)=>rankTexture(index+1));
    const tiles=new Map();
    const tileRoot=new THREE.Group();scene.add(tileRoot);
    TIKIS.forEach((tiki,id)=>{
      const group=new THREE.Group();
      const edge=new THREE.Mesh(new THREE.BoxGeometry(1.25,.07,1.25),material('#e9d9b6',.7));
      edge.receiveShadow=true;edge.castShadow=true;group.add(edge);
      const art=new THREE.Mesh(new THREE.PlaneGeometry(1.18,1.18),new THREE.MeshBasicMaterial({map:headTextures[id],transparent:true,side:THREE.DoubleSide}));
      art.rotation.x=-Math.PI/2;art.position.y=.041;group.add(art);
      const rank=new THREE.Mesh(new THREE.PlaneGeometry(.47,.47),new THREE.MeshBasicMaterial({map:ranks[0],transparent:true,side:THREE.DoubleSide}));
      rank.rotation.x=-Math.PI/2;rank.position.set(.88,.046,0);group.add(rank);
      const highlight=new THREE.Mesh(new THREE.RingGeometry(.64,.72,32),new THREE.MeshBasicMaterial({color:'#fff2b1',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
      highlight.rotation.x=-Math.PI/2;highlight.position.y=.049;group.add(highlight);
      group.userData={id,art,rank,highlight,start:new THREE.Vector3(),target:new THREE.Vector3(),moveStart:0,jump:false};
      group.position.y=FLOOR_Y;
      tileRoot.add(group);tiles.set(id,group);
    });

    const avatars=new Map();
    const avatarRoot=new THREE.Group();scene.add(avatarRoot);
    for(let id=0;id<4;id++){
      const avatar=stickman(Object.values(PLAYER_COLORS)[id]);
      avatar.position.set(START_POSITIONS[id].x,FLOOR_Y,START_POSITIONS[id].z);
      avatarRoot.add(avatar);avatars.set(id,avatar);
    }
    const effects=new THREE.Group();scene.add(effects);
    const bursts=[];
    const makeBurst=(move)=>{
      const point=move.blastAt||{x:0,z:0};
      const ring=new THREE.Mesh(new THREE.RingGeometry(.28,.42,32),new THREE.MeshBasicMaterial({color:'#ffe288',transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.set(point.x,FLOOR_Y+.11,point.z);effects.add(ring);
      const shards=[];
      for(let i=0;i<18;i++){
        const shard=new THREE.Mesh(new THREE.TetrahedronGeometry(.09+Math.random()*.09),new THREE.MeshBasicMaterial({color:i%2?'#ffe18c':'#fa9165',transparent:true,opacity:1}));
        shard.position.set(point.x,FLOOR_Y+.1,point.z);effects.add(shard);
        const a=i*Math.PI*2/18;
        shards.push({mesh:shard,velocity:new THREE.Vector3(Math.cos(a)*(1.5+Math.random()),1.6+Math.random()*1.7,Math.sin(a)*(1.5+Math.random()))});
      }
      bursts.push({ring,shards,point,start:performance.now()});
      (move.blastPlayers||[]).forEach(({id,from,to})=>{const avatar=avatars.get(id);if(avatar)avatar.userData.flight={from,to,start:performance.now()}});
    };

    let boardSignature='',toastStamp=null;
    const sync=()=>{
      const data=latest.current;
      const live=(decorative&&data.board.length===0?TIKIS.map((tiki,id)=>({...tiki,id,active:true})):data.board).filter(tiki=>tiki.active);
      const signature=live.map(tiki=>tiki.id).join(',');
      if(signature!==boardSignature){
        boardSignature=signature;
        tiles.forEach(tile=>tile.visible=false);
        live.forEach((tiki,index)=>{
          const tile=tiles.get(tiki.id),target=tilePosition(index,live.length),y=FLOOR_Y+index*.006;
          tile.visible=true;
          tile.userData.rank.material.map=ranks[index];tile.userData.rank.material.needsUpdate=true;
          tile.userData.start.copy(tile.position);
          tile.userData.target.set(target.x,y,target.z);
          tile.userData.moveStart=performance.now();
          tile.userData.jump=Boolean(data.lastMove&&data.lastMove.tikiId===tiki.id);
          if(!tile.userData.initialized){tile.position.copy(tile.userData.target);tile.userData.initialized=true}
        });
      }
      tiles.forEach(tile=>{tile.userData.highlight.material.opacity=tile.visible&&tile.userData.id===data.selectedHead?.32:0});
      if(data.lastMove?.type==='toast'&&data.lastMove.stamp!==toastStamp){toastStamp=data.lastMove.stamp;makeBurst(data.lastMove)}
      const people=decorative&&data.players.length===0?START_POSITIONS.map((position,id)=>({joined:true,position,color:Object.keys(PLAYER_COLORS)[id]})):data.players;
      avatars.forEach((avatar,id)=>{
        const person=people[id];avatar.visible=Boolean(person?.joined);
        avatar.userData.halo.visible=!decorative&&String(id)===String(data.myPlayerID);
        if(person?.joined)avatar.userData.suit.color.set(PLAYER_COLORS[person.color]||Object.values(PLAYER_COLORS)[id]);
      });
      return people;
    };

    let down=null,theta=.28,targetTheta=.28,radius=decorative?11.5:8.2;
    const mouseRay=(event)=>{
      const rect=renderer.domElement.getBoundingClientRect();
      const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);return ray;
    };
    const pointerDown=event=>{down={x:event.clientX,y:event.clientY,theta:targetTheta};renderer.domElement.setPointerCapture?.(event.pointerId)};
    const pointerMove=event=>{if(down)targetTheta=down.theta+(event.clientX-down.x)*.007};
    const pointerUp=event=>{
      if(!down)return;
      const movement=Math.abs(event.clientX-down.x)+Math.abs(event.clientY-down.y);
      down=null;
      if(movement>=8||!interactive)return;
      const ray=mouseRay(event);
      const tileHit=ray.intersectObjects([...tiles.values()].filter(tile=>tile.visible),true)[0];
      if(tileHit){let root=tileHit.object;while(root.parent&&root.parent!==tileRoot)root=root.parent;if(root.parent===tileRoot){latest.current.onTikiClick?.(root.userData.id);return}}
      const place=new THREE.Vector3();
      if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-FLOOR_Y),place)&&Math.hypot(place.x,place.z)<=4.55){latest.current.onGroundClick?.({x:place.x,z:place.z})}
    };
    const wheel=event=>{event.preventDefault();radius=Math.max(6.5,Math.min(17,radius+Math.sign(event.deltaY)*.8))};
    renderer.domElement.addEventListener('pointerdown',pointerDown);
    renderer.domElement.addEventListener('pointermove',pointerMove);
    renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('wheel',wheel,{passive:false});
    const keys=new Set();
    const keyDown=event=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){keys.add(event.code);event.preventDefault()}};
    const keyUp=event=>keys.delete(event.code);
    const blur=()=>keys.clear();
    window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);
    const walking=setInterval(()=>{
      if(!latest.current.canWalk||!latest.current.onWalk||!keys.size)return;
      const horizontal=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      if(!horizontal&&!forward)return;
      const dx=Math.cos(theta)*horizontal-Math.sin(theta)*forward;
      const dz=-Math.sin(theta)*horizontal-Math.cos(theta)*forward;
      latest.current.onWalk(dx,dz);
    },115);
    const resize=()=>{const width=Math.max(1,node.clientWidth),height=Math.max(1,node.clientHeight);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height)};
    const observer=new ResizeObserver(resize);observer.observe(node);
    let animationFrame=0;
    const render=()=>{
      animationFrame=requestAnimationFrame(render);
      const people=sync();
      if(decorative)targetTheta+=.0007;
      theta+=(targetTheta-theta)*.1;
      camera.position.set(Math.sin(theta)*radius,decorative?10.5:8.2,Math.cos(theta)*radius);
      camera.lookAt(0,.4,0);
      const now=performance.now();
      tiles.forEach(tile=>{
        if(!tile.visible)return;
        const fraction=Math.min(1,(now-tile.userData.moveStart)/550);
        const eased=1-(1-fraction)**3;
        tile.position.lerpVectors(tile.userData.start,tile.userData.target,eased);
        if(tile.userData.jump&&fraction<1)tile.position.y+=Math.sin(fraction*Math.PI)*.55;
      });
      avatars.forEach((avatar,id)=>{
        if(!avatar.visible)return;
        const person=people[id],destination=person?.position||START_POSITIONS[id],flight=avatar.userData.flight;
        let moving=false;
        if(flight){
          const fraction=Math.min(1,(now-flight.start)/850);
          avatar.position.set(THREE.MathUtils.lerp(flight.from.x,flight.to.x,fraction),FLOOR_Y+Math.sin(fraction*Math.PI)*1.6,THREE.MathUtils.lerp(flight.from.z,flight.to.z,fraction));
          avatar.rotation.z=Math.sin(fraction*Math.PI)*.8;
          if(fraction>=1){avatar.userData.flight=null;avatar.rotation.z=0}
          moving=true;
        }else{
          const dx=destination.x-avatar.position.x,dz=destination.z-avatar.position.z;
          moving=Math.hypot(dx,dz)>.02;
          if(moving){avatar.position.x+=dx*.3;avatar.position.z+=dz*.3;avatar.rotation.y=Math.atan2(dx,dz)}
          avatar.position.y=FLOOR_Y+(moving?Math.abs(Math.sin(now*.017+id))*.05:0);
        }
        const stride=moving?Math.sin(now*.017+id)*.5:0;
        avatar.userData.legs[0].rotation.x=stride;avatar.userData.legs[1].rotation.x=-stride;
        avatar.userData.arms[0].rotation.x=-stride*.8;avatar.userData.arms[1].rotation.x=stride*.8;
      });
      for(let index=bursts.length-1;index>=0;index--){
        const effect=bursts[index],fraction=(now-effect.start)/850;
        if(fraction>=1){effects.remove(effect.ring);effect.ring.geometry.dispose();effect.ring.material.dispose();effect.shards.forEach(({mesh})=>{effects.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()});bursts.splice(index,1);continue}
        effect.ring.scale.setScalar(1+fraction*6);effect.ring.material.opacity=1-fraction;
        effect.shards.forEach(({mesh,velocity})=>{mesh.position.set(effect.point.x+velocity.x*fraction,FLOOR_Y+.1+velocity.y*fraction-2*fraction*fraction,effect.point.z+velocity.z*fraction);mesh.rotation.set(fraction*6,fraction*7,0);mesh.material.opacity=1-fraction});
      }
      renderer.render(scene,camera);
    };
    render();
    return()=>{
      cancelAnimationFrame(animationFrame);clearInterval(walking);observer.disconnect();
      window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);
      renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('wheel',wheel);
      headTextures.forEach(texture=>texture.dispose());ranks.forEach(texture=>texture.dispose());
      scene.traverse(object=>{if(object.isMesh){object.geometry.dispose();if(Array.isArray(object.material))object.material.forEach(mat=>mat.dispose());else object.material.dispose()}});
      renderer.dispose();node.removeChild(renderer.domElement);
    };
  },[decorative]);
  return <div className={`three-scene ${decorative?'decorative':''} ${interactive?'interactive':''}`} ref={mount} aria-label="可行走與旋轉視角的平面提基圖騰場景"/>;
}

