import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c'];
const children=Array.from({length:10},(_,i)=>({id:i+1,name:`어린이 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],poems:Array.from({length:5},(_,j)=>({title:`동시 제목 ${j+1}`,body:`여기에 어린이가 쓴 동시 ${j+1}의\n첫 번째 행을 넣어주세요.\n\n행갈이와 빈 줄도\n그대로 예쁘게 보여요.`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false,overviewMode=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,lastX=0,lastY=0,keys={},joy={x:0,y:0};
let tourActive=false,tourElapsed=0,entryActive=false,entryElapsed=0,hasDestination=false,zoneTravelActive=false,zoneTravelElapsed=0;
let audioContext,audioMaster,musicTimer,musicStep=0,musicOn=true;
let guideUtterance=null,contactShadowTexture=null;
const coarsePointer=matchMedia('(pointer:coarse)').matches||innerWidth<800,reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches,moveVelocity=new THREE.Vector3(),moveTarget=new THREE.Vector3(),moveDestination=new THREE.Vector3(),curatorTarget=new THREE.Vector3(),clickPoint=new THREE.Vector2();
const cameraPos=new THREE.Vector3(0,1.65,11.2);
const zoneTravelStart=new THREE.Vector3(),zoneTravelEnd=new THREE.Vector3();
const TOUR_DURATION=10;
const ENTRY_DURATION=3.6;
const ZONE_TRAVEL_DURATION=1.55;
const PITCH_MIN=-.24,PITCH_MAX=.42;
let zoneTravelStartAngle=0,zoneTravelAngleDelta=0,zoneTravelStartRadius=0,zoneTravelEndRadius=0,zoneTravelStartYaw=0,zoneTravelEndYaw=0,zoneTravelChild=0;
const WALK_BOUNDS={minX:-11.55,maxX:11.55,minZ:-9.7,maxZ:10};
const SAFE_ZONES=[];
const ZONE_LAYOUT=[
  {x:-11.25,z:-13.15,ry:0},{x:-3.75,z:-13.15,ry:0},{x:3.75,z:-13.15,ry:0},{x:11.25,z:-13.15,ry:0},
  {x:-15,z:-7.5,ry:Math.PI/2},{x:-15,z:0,ry:Math.PI/2},{x:-15,z:7.5,ry:Math.PI/2},
  {x:15,z:-7.5,ry:-Math.PI/2},{x:15,z:0,ry:-Math.PI/2},{x:15,z:7.5,ry:-Math.PI/2}
];
const visited=new Set(JSON.parse(localStorage.getItem('galleryVisited')||'[]'));

function init(){
  THREE.Cache.enabled=true;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf8eedf);
  scene.fog=new THREE.FogExp2(0xf8eedf,.009);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,100);
  camera.position.copy(cameraPos);camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,coarsePointer?1:1.25));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=!coarsePointer;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  buildGallery();bind();buildIndex();renderer.compile(scene,camera);if(renderer.shadowMap.enabled){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true}animate();
  setTimeout(()=>$('#loading').classList.add('done'),450);
}

function buildGallery(){
  const textureLoader=new THREE.TextureLoader();
  scene.userData.cottonTexture=textureLoader.load('assets/cotton-surface-2d.png');scene.userData.cottonTexture.colorSpace=THREE.SRGBColorSpace;scene.userData.cottonTexture.wrapS=scene.userData.cottonTexture.wrapT=THREE.RepeatWrapping;scene.userData.cottonTexture.repeat.set(3,3);
  scene.userData.frameTexture=textureLoader.load('assets/wood-frame-png.png');scene.userData.frameTexture.colorSpace=THREE.SRGBColorSpace;
  scene.userData.floorTexture=textureLoader.load('assets/oak-floor-25d.png');scene.userData.floorTexture.colorSpace=THREE.SRGBColorSpace;scene.userData.floorTexture.wrapS=scene.userData.floorTexture.wrapT=THREE.RepeatWrapping;scene.userData.floorTexture.repeat.set(8,7);scene.userData.floorTexture.anisotropy=coarsePointer?2:4;
  scene.add(new THREE.HemisphereLight(0xfff5dc,0xa66f45,2.6));
  scene.add(new THREE.AmbientLight(0xfff0d5,1.05));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30.6,26.8),new THREE.MeshStandardMaterial({map:scene.userData.floorTexture,color:0xffffff,roughness:.88,metalness:0}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.userData.type='floor';scene.add(floor);scene.userData.floor=floor;
  const marker=new THREE.Mesh(new THREE.RingGeometry(.2,.32,32),new THREE.MeshBasicMaterial({color:0xb87538,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.y=.018;marker.visible=false;scene.add(marker);scene.userData.clickMarker=marker;
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(30.8,27),new THREE.MeshStandardMaterial({color:0xfff4df,roughness:.92,side:THREE.DoubleSide}));
  ceiling.rotation.x=Math.PI/2;ceiling.position.y=5.7;scene.add(ceiling);
  const canopy=new THREE.Mesh(new THREE.PlaneGeometry(9.4,26.6),new THREE.MeshStandardMaterial({map:scene.userData.cottonTexture,color:0xfffbf3,transparent:true,opacity:.46,roughness:1,side:THREE.DoubleSide,depthWrite:false}));
  canopy.rotation.x=Math.PI/2;canopy.position.y=5.68;scene.add(canopy);
  buildEntrance();
  const sun=new THREE.DirectionalLight(0xffcb88,3.2);sun.position.set(-8,12,5);sun.target.position.set(2,0,-2);sun.castShadow=renderer.shadowMap.enabled;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun,sun.target);
  const sunPatch=new THREE.Mesh(new THREE.PlaneGeometry(8.5,10),new THREE.MeshBasicMaterial({color:0xffd699,transparent:true,opacity:.14,depthWrite:false}));sunPatch.rotation.x=-Math.PI/2;sunPatch.position.set(-3,.025,2);scene.add(sunPatch);
  const sunSpot=new THREE.SpotLight(0xffd29a,9,26,Math.PI/5,.92,1);sunSpot.position.set(-7,11,6);sunSpot.target.position.set(1,0,-1);sunSpot.castShadow=false;scene.add(sunSpot,sunSpot.target);
  for(let i=0;i<4;i++){const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.72,10),new THREE.MeshBasicMaterial({color:0xffdfad,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide}));stripe.rotation.x=-Math.PI/2;stripe.rotation.z=-.58;stripe.position.set(-5+i*1.25,.035,1+i*.35);scene.add(stripe)}
  scene.userData.frameSideMaterial=new THREE.MeshStandardMaterial({color:0x8d5b34,roughness:.72,metalness:0});
  for(let i=0;i<10;i++)buildZone(i);
  buildCurator();buildWarmLights();buildCozyDetails();
}
function buildEntrance(){
  const loader=new THREE.TextureLoader(),facadeMap=loader.load('assets/entrance-facade-2d.png'),gardenMap=loader.load('assets/garden-view-2d.png'),doorMap=loader.load('assets/door-leaf-2d.png');[facadeMap,gardenMap,doorMap].forEach(t=>t.colorSpace=THREE.SRGBColorSpace);
  const deck=new THREE.Mesh(new THREE.PlaneGeometry(7.6,6.2),new THREE.MeshStandardMaterial({map:scene.userData.floorTexture,color:0xffffff,roughness:.88}));deck.rotation.x=-Math.PI/2;deck.position.set(0,-.005,15.75);deck.receiveShadow=true;scene.add(deck);
  const gardenBackdrop=new THREE.Mesh(new THREE.PlaneGeometry(22,9.6),new THREE.MeshBasicMaterial({map:gardenMap,side:THREE.DoubleSide}));gardenBackdrop.position.set(0,4.3,21);scene.add(gardenBackdrop);
  const facade=new THREE.Mesh(new THREE.PlaneGeometry(30.4,5.7),new THREE.MeshBasicMaterial({map:facadeMap,transparent:true,alphaTest:.025,side:THREE.DoubleSide}));facade.position.set(0,2.85,13.2);facade.renderOrder=2;scene.add(facade);scene.userData.entranceFacade=facade;
  [-9.6,9.6].forEach(x=>{const lightPatch=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.2),new THREE.MeshBasicMaterial({color:0xffe2aa,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));lightPatch.rotation.x=-Math.PI/2;lightPatch.position.set(x,.03,9.7);scene.add(lightPatch)});
  const leaves=[];[-1,1].forEach(side=>{const map=doorMap.clone();map.needsUpdate=true;if(side<0){map.wrapS=THREE.RepeatWrapping;map.repeat.x=-1;map.offset.x=1}const pivot=new THREE.Group();pivot.position.set(side*2.52,0,13.12);const panel=new THREE.Mesh(new THREE.PlaneGeometry(2.52,4.72),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.035,side:THREE.DoubleSide}));panel.position.set(-side*1.26,2.36,0);panel.renderOrder=3;pivot.add(panel);scene.add(pivot);leaves.push(pivot)});scene.userData.doors=leaves;
}
function buildZone(ci){
  const layout=ZONE_LAYOUT[ci],c=children[ci],zone=new THREE.Group();zone.position.set(layout.x,0,layout.z);zone.rotation.y=layout.ry;scene.add(zone);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(7.18,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));panel.position.y=2.55;panel.receiveShadow=true;zone.add(panel);
  const wood=new THREE.Mesh(new THREE.BoxGeometry(7.2,1.02,.32),new THREE.MeshStandardMaterial({color:0x9b6840,roughness:.85}));wood.position.y=.53;zone.add(wood);
  const header=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.95),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,'작은 시인의 방',c.color,1024,256),transparent:true}));
  header.position.set(0,4.35,.17);zone.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(6.65,.06,.08),new THREE.MeshBasicMaterial({color:c.color}));accent.position.set(0,3.84,.18);zone.add(accent);
  c.poems.forEach((p,pi)=>{
    const framedArt=new THREE.Group();framedArt.position.set((pi-2)*1.4,2.55,.22);
    const frameBody=new THREE.Mesh(new THREE.BoxGeometry(1.06,1.62,.16),scene.userData.frameSideMaterial);frameBody.castShadow=renderer.shadowMap.enabled;framedArt.add(frameBody);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(.88,1.36),new THREE.MeshStandardMaterial({map:makePoemTexture(ci,pi),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045,side:THREE.DoubleSide}));art.position.z=.086;art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);framedArt.add(art);
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(1.08,1.64),new THREE.MeshBasicMaterial({map:scene.userData.frameTexture,transparent:true,alphaTest:.035,depthWrite:false,toneMapped:true,side:THREE.DoubleSide}));frame.position.z=.098;frame.renderOrder=2;framedArt.add(frame);zone.add(framedArt);
  });
  const glowPos=zoneLocalToWorld(layout,0,2.2);const zoneGlow=new THREE.PointLight(c.color,.38,6,2);zoneGlow.position.set(glowPos.x,3.6,glowPos.z);scene.add(zoneGlow);
  const plantPos=zoneLocalToWorld(layout,2.95,1.05);buildPlant(plantPos.x,plantPos.z);
}

function zoneLocalToWorld(layout,x,z){return new THREE.Vector3(layout.x+Math.cos(layout.ry)*x+Math.sin(layout.ry)*z,0,layout.z-Math.sin(layout.ry)*x+Math.cos(layout.ry)*z)}
function makeTextTexture(title,sub,color,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.textAlign='center';x.fillStyle=color;x.font='76px Jua, sans-serif';x.fillText(title,w/2,105);
  x.fillStyle='#6a513d';x.font='28px Gowun Dodum, sans-serif';x.fillText(sub,w/2,164);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makePoemTexture(ci,pi){
  const c=document.createElement('canvas');c.width=384;c.height=510;const x=c.getContext('2d'),d=children[ci],p=d.poems[pi];x.scale(.6,.6);
  x.fillStyle='#fffaf0';x.fillRect(0,0,640,850);x.fillStyle=d.color;x.fillRect(0,0,640,28);
  x.fillStyle='#777f91';x.font='24px Gowun Dodum, sans-serif';x.fillText(d.name,54,92);
  x.fillStyle='#172039';x.font='56px Jua, sans-serif';x.fillText(p.title,54,180);
  x.strokeStyle='#e5dfd2';x.beginPath();x.moveTo(54,215);x.lineTo(586,215);x.stroke();
  x.font='30px Gowun Dodum, sans-serif';x.fillStyle='#364057';
  ['어린이가 쓴 동시를','여기에 넣어주세요.','','가까이 다가와','작품을 눌러 보세요.'].forEach((line,i)=>x.fillText(line,54,300+i*60));
  x.fillStyle='#a9a190';x.font='22px Gowun Dodum, sans-serif';x.fillText(`${pi+1} / 5`,54,790);
  const bead=x.createRadialGradient(558,768,4,566,776,24);bead.addColorStop(0,'#fff8');bead.addColorStop(.34,d.color);bead.addColorStop(1,'#8f694d');
  x.fillStyle=bead;x.beginPath();x.arc(566,776,22,0,Math.PI*2);x.fill();x.strokeStyle='#ffffffaa';x.lineWidth=3;x.stroke();
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),coarsePointer?2:4);return t;
}
function buildPlant(x,z){
  makePngSprite('assets/planter-png.png',1.12,1.42,[x,.69,z]);makeContactShadow(x,z,.8,.34,.19);
}
function buildCurator(){
  const loader=new THREE.TextureLoader(),textures={idle:loader.load('assets/curator-maru.png'),frontA:loader.load('assets/curator-walk-a.png'),frontB:loader.load('assets/curator-walk-b.png'),sideA:loader.load('assets/curator-side-a.png'),sideB:loader.load('assets/curator-side-b.png'),backA:loader.load('assets/curator-back-a.png'),backB:loader.load('assets/curator-back-b.png')};Object.values(textures).forEach(t=>t.colorSpace=THREE.SRGBColorSpace);
  const g=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.idle,transparent:true,alphaTest:.04,depthWrite:false}));g.scale.set(1.28,1.92,1);g.position.set(1.35,.96,6.7);g.visible=false;g.renderOrder=4;g.userData={type:'curator',textures,currentTexture:textures.idle,facing:'front'};scene.add(g);scene.userData.curator=g;frameMeshes.push(g);
  const shadow=makeContactShadow(g.position.x,g.position.z,.86,.34,.24);shadow.visible=false;scene.userData.curatorShadow=shadow;
}
function buildWarmLights(){
  const lamps=new THREE.Group(),cordMaterial=new THREE.MeshStandardMaterial({color:0x9b7652,roughness:1});for(let i=0;i<16;i++){const a=i/16*Math.PI*2,x=Math.sin(a)*8.5,z=Math.cos(a)*8.5,bulb=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xe59d3f,emissiveIntensity:1.5})),cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.18,6),cordMaterial);bulb.position.set(x,5.48,z);cord.position.set(x,5.61,z);lamps.add(cord,bulb)}scene.add(lamps);
}
function buildCozyDetails(){
  [[-5.4,4.4,-1.4],[5.5,4.4,-2.7],[-2.3,4.4,6]].forEach((p,i)=>makePngSprite('assets/cotton-mobile.png',3.9,2.6,p,0,i*.9));
}

function makeContactShadow(x,z,width,depth,opacity=.2){
  if(!contactShadowTexture){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,5,64,64,62);g.addColorStop(0,'rgba(70,42,22,.72)');g.addColorStop(.48,'rgba(70,42,22,.3)');g.addColorStop(1,'rgba(70,42,22,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);contactShadowTexture=new THREE.CanvasTexture(c);contactShadowTexture.colorSpace=THREE.SRGBColorSpace}
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({map:contactShadowTexture,transparent:true,opacity,depthWrite:false,toneMapped:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.012,z);shadow.renderOrder=0;scene.add(shadow);return shadow
}

function makePngSprite(url,width,height,position,floatAmount=0,phase=0){
  const map=new THREE.TextureLoader().load(url);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,alphaTest:.04,depthWrite:false}));
  sprite.scale.set(width,height,1);sprite.position.set(...position);sprite.userData.baseY=position[1];sprite.userData.floatAmount=floatAmount;sprite.userData.phase=phase;
  scene.add(sprite);(scene.userData.animatedSprites??=[]).push(sprite);return sprite;
}

function bind(){
  addEventListener('resize',resize);
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'){closePoem();closeIndex();stopGuideVoice()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;dragging=true;dragMoved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive||!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)dragMoved=true;yaw-=dx*.0042;pitch=THREE.MathUtils.clamp(pitch-dy*.0034,PITCH_MIN,PITCH_MAX);lastX=e.clientX;lastY=e.clientY});
  canvas.addEventListener('pointerleave',()=>{dragging=false});
  canvas.addEventListener('pointerup',e=>{if(dragging&&!dragMoved)handleWorldClick(e.clientX,e.clientY);dragging=false});
  canvas.addEventListener('wheel',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;e.preventDefault();pitch=THREE.MathUtils.clamp(pitch-e.deltaY*.00075,PITCH_MIN,PITCH_MAX);camera.rotation.x=pitch},{passive:false});
  $('#enter').onclick=()=>{started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;startAmbientMusic();startEntrySequence()};
  $('#home').onclick=()=>{$('#intro').classList.remove('closed');$('#hud').hidden=true;$('#hud').classList.remove('cinematic');started=false;tourActive=false;entryActive=false;zoneTravelActive=false;hasDestination=false;resetEntrance();stopAmbientMusic();stopGuideVoice()};
  $('#music-toggle').onclick=()=>musicOn?stopAmbientMusic():startAmbientMusic();
  $('#overview').onclick=showOverview;$('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;
  $$('[data-close]').forEach(b=>b.onclick=closePoem);
  $('#prev-poem').onclick=()=>movePoem(-1);$('#next-poem').onclick=()=>movePoem(1);bindJoystick();
}
function bindJoystick(){
  const values={forward:[0,-1],back:[0,1],left:[-1,0],right:[1,0]};
  $$('[data-move]').forEach(button=>{const value=values[button.dataset.move],start=e=>{e.preventDefault();joy.x=value[0];joy.y=value[1];button.classList.add('pressed');button.setPointerCapture?.(e.pointerId)},stop=()=>{joy.x=joy.y=0;button.classList.remove('pressed')};button.addEventListener('pointerdown',start);button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',stop)});
}

function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
  if(started&&!modalOpen){
    if(entryActive){updateEntrySequence(dt);updateMap()}else if(tourActive){updatePanoramaTour(dt);updateZone();updateMap()}else if(zoneTravelActive){updateZoneTravel(dt);updateMap()}else{
      const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y;
      const side=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x;
      if(forward||side){hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(-Math.sin(yaw)*forward+Math.cos(yaw)*side,0,-Math.cos(yaw)*forward-Math.sin(yaw)*side);if(moveTarget.lengthSq()>1)moveTarget.normalize();moveTarget.multiplyScalar(7.4)}
      else if(hasDestination){moveTarget.set(moveDestination.x-camera.position.x,0,moveDestination.z-camera.position.z);const distance=moveTarget.length();if(distance<.28){hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(0,0,0)}else{const desiredYaw=Math.atan2(-moveTarget.x,-moveTarget.z);yaw=dampAngle(yaw,desiredYaw,1-Math.exp(-7*dt));moveTarget.normalize().multiplyScalar(Math.min(7.2,Math.max(1.3,distance*2.7)))}}
      else moveTarget.set(0,0,0);
      moveVelocity.lerp(moveTarget,1-Math.exp(-(moveTarget.lengthSq()>.01?11:8)*dt));camera.position.addScaledVector(moveVelocity,dt);
      if(constrainWalkPosition(camera.position))moveVelocity.multiplyScalar(.22);
      camera.position.y=1.65;camera.rotation.set(pitch,yaw,0);updateZone();updateFocus();updateMap();
    }
  }
  const now=performance.now()*.001;(scene.userData.animatedSprites||[]).forEach((sprite,i)=>{const amount=sprite.userData.floatAmount;sprite.position.y=sprite.userData.baseY+Math.sin(now*1.25+sprite.userData.phase+i*.35)*amount;sprite.material.rotation=amount?Math.sin(now*.7+sprite.userData.phase)*.008:0});if(scene.userData.clickMarker.visible){const pulse=1+Math.sin(now*5)*.12;scene.userData.clickMarker.scale.setScalar(pulse);scene.userData.clickMarker.material.opacity=.65+Math.sin(now*5)*.2}
  updateCurator(dt,now);
  renderer.render(scene,camera);
}

function updateCurator(dt,now){
  const curator=scene.userData.curator,shadow=scene.userData.curatorShadow;if(!curator)return;
  const hidden=!started||entryActive||tourActive;curator.visible=!hidden;if(shadow)shadow.visible=!hidden;if(hidden)return;
  curatorTarget.set(camera.position.x-Math.sin(yaw)*3+Math.cos(yaw)*.95,.96,camera.position.z-Math.cos(yaw)*3-Math.sin(yaw)*.95);
  curatorTarget.x=THREE.MathUtils.clamp(curatorTarget.x,-13.15,13.15);curatorTarget.z=THREE.MathUtils.clamp(curatorTarget.z,-11.45,11.45);
  const step=Math.floor(now*5.5)%2?'A':'B',motion=curatorTarget.clone().sub(curator.position),walking=moveVelocity.lengthSq()>.16||motion.lengthSq()>.018,rightX=Math.cos(yaw),rightZ=-Math.sin(yaw),forwardX=-Math.sin(yaw),forwardZ=-Math.cos(yaw),screenX=motion.x*rightX+motion.z*rightZ,depth=motion.x*forwardX+motion.z*forwardZ;let facing='front';if(walking&&Math.abs(screenX)>Math.abs(depth)*.68)facing='side';else if(walking&&depth>0)facing='back';const tex=walking?curator.userData.textures[`${facing}${step}`]:curator.userData.textures.idle;
  curator.scale.x=facing==='side'&&screenX>0?-1.28:1.28;curator.userData.facing=facing;
  if(curator.userData.currentTexture!==tex){curator.material.map=tex;curator.material.needsUpdate=true;curator.userData.currentTexture=tex}curator.material.rotation=walking?Math.sin(now*11)*.018:Math.sin(now*1.4)*.006;
  curatorTarget.y=walking?.96+Math.abs(Math.sin(now*11))*.035:.96+Math.sin(now*1.8)*.006;curator.position.lerp(curatorTarget,1-Math.exp(-6.5*dt));if(shadow){shadow.position.x=curator.position.x;shadow.position.z=curator.position.z;shadow.material.opacity=walking?.19:.24}
}

function startAmbientMusic(){
  if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();audioMaster=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;audioMaster.gain.value=.0001;audioMaster.connect(filter).connect(audioContext.destination)}
  audioContext.resume();musicOn=true;audioMaster.gain.cancelScheduledValues(audioContext.currentTime);audioMaster.gain.exponentialRampToValueAtTime(.055,audioContext.currentTime+1.8);playAmbientChord();clearInterval(musicTimer);musicTimer=setInterval(playAmbientChord,4800);updateMusicButton();
}
function stopAmbientMusic(){
  musicOn=false;clearInterval(musicTimer);if(audioContext&&audioMaster){audioMaster.gain.cancelScheduledValues(audioContext.currentTime);audioMaster.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+1.2)}updateMusicButton();
}
function playAmbientChord(){
  if(!musicOn||!audioContext)return;const roots=[196,220,174.61,261.63],root=roots[musicStep++%roots.length],now=audioContext.currentTime;
  [1,1.25,1.5,2].forEach((ratio,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=i===3?'sine':'triangle';osc.frequency.value=root*ratio;osc.detune.value=(i-1.5)*3;gain.gain.setValueAtTime(.0001,now+i*.08);gain.gain.exponentialRampToValueAtTime(i===3?.045:.028,now+.8+i*.08);gain.gain.exponentialRampToValueAtTime(.0001,now+4.6);osc.connect(gain).connect(audioMaster);osc.start(now+i*.08);osc.stop(now+4.8)});
}
function updateMusicButton(){const b=$('#music-toggle');if(!b)return;b.classList.toggle('muted',!musicOn);b.setAttribute('aria-pressed',String(musicOn));b.setAttribute('aria-label',musicOn?'전시 음악 끄기':'전시 음악 켜기')}
function updateZone(){
  if(Math.abs(camera.position.x)<5.2&&Math.abs(camera.position.z)<5.2){$('#zone-name').textContent='중앙 햇살 통로';return}
  let nearest=0,best=Infinity;ZONE_LAYOUT.forEach((zone,i)=>{const d=(camera.position.x-zone.x)**2+(camera.position.z-zone.z)**2;if(d<best){best=d;nearest=i}});$('#zone-name').textContent=`${children[nearest].name}의 방`;
}
function updateFocus(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(frameMeshes,false),hit=hits[0]&&hits[0].distance<(hits[0].object.userData.type==='curator'?9:7)?hits[0]:null;
  $('#crosshair').classList.toggle('active',!!hit);camera.userData.focus=hit?.object||null;
}
function activateCenter(){if(camera.userData.focus){const d=camera.userData.focus.userData;if(d.type==='curator')speakCurator();else openPoem(d.child,d.poem)}}
function handleWorldClick(x,y){
  clickPoint.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);raycaster.setFromCamera(clickPoint,camera);
  const subject=raycaster.intersectObjects(frameMeshes,false)[0];if(subject){const d=subject.object.userData;if(d.type==='curator')speakCurator();else openPoem(d.child,d.poem);return}
  pitch=THREE.MathUtils.clamp(pitch+(.5-y/innerHeight)*.24,PITCH_MIN,PITCH_MAX);camera.rotation.x=pitch;raycaster.setFromCamera(clickPoint,camera);
  const floorHit=raycaster.intersectObject(scene.userData.floor,false)[0];let usedOpenSpace=false;
  if(floorHit)moveDestination.copy(floorHit.point);else{const direction=raycaster.ray.direction.clone();direction.y=0;if(direction.lengthSq()<.01)return;direction.normalize();moveDestination.copy(camera.position).addScaledVector(direction,6);usedOpenSpace=true}
  moveDestination.y=0;constrainWalkPosition(moveDestination);hasDestination=true;moveVelocity.multiplyScalar(.35);const marker=scene.userData.clickMarker;marker.position.set(moveDestination.x,.018,moveDestination.z);marker.visible=true
}
function constrainWalkPosition(position){
  let adjusted=false,x=THREE.MathUtils.clamp(position.x,WALK_BOUNDS.minX,WALK_BOUNDS.maxX),z=THREE.MathUtils.clamp(position.z,WALK_BOUNDS.minZ,WALK_BOUNDS.maxZ);if(x!==position.x||z!==position.z)adjusted=true;position.x=x;position.z=z;
  SAFE_ZONES.forEach(zone=>{let dx=position.x-zone.x,dz=position.z-zone.z,dist=Math.hypot(dx,dz);if(dist<zone.r){adjusted=true;if(dist<.001){dx=1;dz=0;dist=1}position.x=zone.x+dx/dist*zone.r;position.z=zone.z+dz/dist*zone.r}});
  position.x=THREE.MathUtils.clamp(position.x,WALK_BOUNDS.minX,WALK_BOUNDS.maxX);position.z=THREE.MathUtils.clamp(position.z,WALK_BOUNDS.minZ,WALK_BOUNDS.maxZ);return adjusted
}
function resetEntrance(){(scene.userData.doors||[]).forEach(door=>door.rotation.y=0);camera.position.set(0,1.65,11.2);yaw=0;pitch=0;camera.rotation.set(0,0,0)}
function startEntrySequence(){
  hasDestination=false;tourActive=false;zoneTravelActive=false;entryActive=true;entryElapsed=0;moveVelocity.set(0,0,0);$('#hud').classList.add('cinematic');(scene.userData.doors||[]).forEach(door=>door.rotation.y=0);camera.position.set(0,1.68,16.5);yaw=0;pitch=0;camera.fov=68;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='전시장 입구'
}
function updateEntrySequence(dt){
  entryElapsed=Math.min(ENTRY_DURATION,entryElapsed+dt);const t=entryElapsed/ENTRY_DURATION,doorT=THREE.MathUtils.smoothstep(Math.min(1,t/.42),0,1),walkT=THREE.MathUtils.smoothstep(Math.max(0,(t-.24)/.76),0,1),doors=scene.userData.doors||[];if(doors[0])doors[0].rotation.y=doorT*1.08;if(doors[1])doors[1].rotation.y=-doorT*1.08;camera.position.z=THREE.MathUtils.lerp(16.5,11.2,walkT);camera.position.y=1.68+Math.sin(walkT*Math.PI)*.035;camera.rotation.set(0,0,0);if(t>=1){entryActive=false;$('#hud').classList.remove('cinematic');camera.fov=72;camera.updateProjectionMatrix();startPanoramaTour()}
}
function startPanoramaTour(){
  hasDestination=false;moveVelocity.set(0,0,0);tourElapsed=0;tourActive=!reduceMotion;camera.fov=74;camera.updateProjectionMatrix();camera.position.set(0,2.05,11.2);yaw=0;pitch=-.025;camera.rotation.set(pitch,yaw,0);if(reduceMotion)finishPanoramaTour()
}
function updatePanoramaTour(dt){
  tourElapsed=Math.min(TOUR_DURATION,tourElapsed+dt);const t=tourElapsed/TOUR_DURATION,e=t*t*(3-2*t),angle=e*Math.PI*2;camera.position.set(Math.sin(angle)*9.1,2.08,Math.cos(angle)*8.2);const dx=-camera.position.x,dz=-camera.position.z;yaw=Math.atan2(-dx,-dz);pitch=-.03;camera.rotation.set(pitch,yaw,0);if(t>=1)finishPanoramaTour()
}
function finishPanoramaTour(){tourActive=false;moveVelocity.set(0,0,0);camera.position.set(0,1.65,9.8);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구'}
function dampAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t}
function showOverview(){tourActive=false;entryActive=false;zoneTravelActive=false;hasDestination=false;scene.userData.clickMarker.visible=false;overviewMode=false;moveVelocity.set(0,0,0);camera.position.set(0,1.65,9.8);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구'}
function goToChildZone(ci){
  const layout=ZONE_LAYOUT[ci];closeIndex();closePoem();if(!started){started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;startAmbientMusic();resetEntrance()}
  entryActive=false;tourActive=false;hasDestination=false;scene.userData.clickMarker.visible=false;moveVelocity.set(0,0,0);zoneTravelChild=ci;zoneTravelElapsed=0;zoneTravelActive=true;zoneTravelStart.copy(camera.position);zoneTravelEnd.copy(zoneLocalToWorld(layout,0,4.45));zoneTravelEnd.y=1.65;
  zoneTravelStartRadius=Math.max(3.6,Math.hypot(zoneTravelStart.x,zoneTravelStart.z));zoneTravelEndRadius=Math.hypot(zoneTravelEnd.x,zoneTravelEnd.z);zoneTravelStartAngle=Math.atan2(zoneTravelStart.z,zoneTravelStart.x);const endAngle=Math.atan2(zoneTravelEnd.z,zoneTravelEnd.x);zoneTravelAngleDelta=(endAngle-zoneTravelStartAngle+Math.PI*3)%(Math.PI*2)-Math.PI;zoneTravelStartYaw=yaw;zoneTravelEndYaw=Math.atan2(-(layout.x-zoneTravelEnd.x),-(layout.z-zoneTravelEnd.z));pitch=0;$('#zone-name').textContent=`${children[ci].name}의 방으로 이동 중`
}
function updateZoneTravel(dt){
  zoneTravelElapsed=Math.min(ZONE_TRAVEL_DURATION,zoneTravelElapsed+dt);const t=zoneTravelElapsed/ZONE_TRAVEL_DURATION,e=t*t*(3-2*t),angle=zoneTravelStartAngle+zoneTravelAngleDelta*e,radius=THREE.MathUtils.lerp(zoneTravelStartRadius,zoneTravelEndRadius,e);camera.position.set(Math.cos(angle)*radius,1.65,Math.sin(angle)*radius);yaw=dampAngle(zoneTravelStartYaw,zoneTravelEndYaw,e);camera.rotation.set(0,yaw,0);if(t>=1){zoneTravelActive=false;camera.position.copy(zoneTravelEnd);camera.rotation.set(0,zoneTravelEndYaw,0);yaw=zoneTravelEndYaw;$('#zone-name').textContent=`${children[zoneTravelChild].name}의 방`}
}
function updateMap(){const x=camera.position.x/15*40,z=camera.position.z/13.2*40;$('#map-dot').style.transform=`translate(${x}px,${z}px)`;$('#map-view').style.transform=`rotate(${-yaw}rad)`}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,coarsePointer?1:1.25))}

function openPoem(ci,pi){
  moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;
  selectedChild=ci;selectedPoem=pi;modalOpen=true;const c=children[ci],p=c.poems[pi];
  visited.add(`${ci}-${pi}`);localStorage.setItem('galleryVisited',JSON.stringify([...visited]));
  $('.poem-card').style.setProperty('--accent',c.color);$('#poem-child').textContent=c.name;$('#poem-number').textContent=`작품 ${pi+1} / 5`;
  $('#poem-title').textContent=p.title;$('#poem-body').textContent=p.body;$('#poem-modal').classList.add('open');$('#poem-modal').setAttribute('aria-hidden','false');
  setTimeout(()=>$('.modal-close').focus(),250);
}
function closePoem(){modalOpen=false;$('#poem-modal').classList.remove('open');$('#poem-modal').setAttribute('aria-hidden','true')}
function movePoem(step){selectedPoem=(selectedPoem+step+5)%5;openPoem(selectedChild,selectedPoem)}
function openIndex(){modalOpen=true;$('#index-panel').classList.add('open');$('#index-panel').setAttribute('aria-hidden','false')}
function closeIndex(){modalOpen=false;$('#index-panel').classList.remove('open');$('#index-panel').setAttribute('aria-hidden','true')}
function getNaturalKoreanVoice(){
  if(!('speechSynthesis' in window))return null;const voices=speechSynthesis.getVoices(),korean=voices.filter(v=>/^ko([-_]|$)/i.test(v.lang));
  return korean.find(v=>/natural|premium|enhanced|yuna|sunhi|sora|heami|google/i.test(v.name))||null
}
function speakCurator(){
  if(!('speechSynthesis' in window)||guideUtterance||speechSynthesis.speaking)return;const voice=getNaturalKoreanVoice();if(!voice)return;
  moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;
  const line='반가워요. 이곳에는 열 명의 어린이가 쓴 동시 쉰 편이 전시되어 있어요. 천천히 걸으며 마음에 드는 작품을 눌러 감상해 보세요.';
  guideUtterance=new SpeechSynthesisUtterance(line);guideUtterance.voice=voice;guideUtterance.lang='ko-KR';guideUtterance.rate=.88;guideUtterance.pitch=.96;guideUtterance.volume=.82;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.018,audioContext.currentTime+.35);const finish=()=>{guideUtterance=null;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.055,audioContext.currentTime+.8)};guideUtterance.onend=finish;guideUtterance.onerror=finish;speechSynthesis.speak(guideUtterance)
}
function stopGuideVoice(){if('speechSynthesis' in window)speechSynthesis.cancel();guideUtterance=null;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.055,audioContext.currentTime+.4)}
function buildIndex(){
  const root=$('#index-list');
  children.forEach((c,ci)=>{
    const el=document.createElement('div');el.className='index-child';
    el.innerHTML=`<div class="index-child-row"><button class="index-child-go" type="button" aria-label="${c.name} 전시공간으로 이동"><i style="--c:${c.color}"></i><strong>${c.name}</strong></button><button class="index-child-toggle" type="button" aria-label="${c.name}의 동시 5편 펼치기" aria-expanded="false">동시 5편</button></div><div class="index-poems">${c.poems.map((p,pi)=>`<button type="button" data-ci="${ci}" data-pi="${pi}">${pi+1}. ${p.title}</button>`).join('')}</div>`;
    const go=el.querySelector('.index-child-go'),toggle=el.querySelector('.index-child-toggle');go.onclick=()=>goToChildZone(ci);toggle.onclick=()=>{const open=el.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${c.name}의 동시 5편 ${open?'접기':'펼치기'}`)};root.append(el);
  });
  $$('[data-ci]').forEach(b=>b.onclick=()=>{closeIndex();openPoem(+b.dataset.ci,+b.dataset.pi)});
}
init();
