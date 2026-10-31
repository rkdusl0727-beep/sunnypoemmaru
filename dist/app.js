import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c'];
const children=Array.from({length:10},(_,i)=>({id:i+1,name:`어린이 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],poems:Array.from({length:5},(_,j)=>({title:`동시 제목 ${j+1}`,body:`여기에 어린이가 쓴 동시 ${j+1}의\n첫 번째 행을 넣어주세요.\n\n행갈이와 빈 줄도\n그대로 예쁘게 보여요.`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false,overviewMode=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,lastX=0,lastY=0,keys={},joy={x:0,y:0};
let tourActive=false,tourElapsed=0,hasDestination=false;
let audioContext,audioMaster,musicTimer,musicStep=0,musicOn=true;
const coarsePointer=matchMedia('(pointer:coarse)').matches||innerWidth<800,reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches,moveVelocity=new THREE.Vector3(),moveTarget=new THREE.Vector3(),moveDestination=new THREE.Vector3(),curatorTarget=new THREE.Vector3(),clickPoint=new THREE.Vector2();
const cameraPos=new THREE.Vector3(0,1.65,11.2);
const TOUR_DURATION=10;
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
  scene.userData.cottonTexture=makeCottonTexture();
  scene.userData.frameTexture=new THREE.TextureLoader().load('assets/wood-frame-png.png');scene.userData.frameTexture.colorSpace=THREE.SRGBColorSpace;
  scene.userData.floorTexture=new THREE.TextureLoader().load('assets/oak-floor-25d.png');scene.userData.floorTexture.colorSpace=THREE.SRGBColorSpace;scene.userData.floorTexture.wrapS=scene.userData.floorTexture.wrapT=THREE.RepeatWrapping;scene.userData.floorTexture.repeat.set(8,7);scene.userData.floorTexture.anisotropy=coarsePointer?2:4;
  scene.add(new THREE.HemisphereLight(0xfff5dc,0xa66f45,2.6));
  scene.add(new THREE.AmbientLight(0xfff0d5,1.05));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30.6,26.8),new THREE.MeshStandardMaterial({map:scene.userData.floorTexture,color:0xffffff,roughness:.88,metalness:0}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.userData.type='floor';scene.add(floor);scene.userData.floor=floor;
  const marker=new THREE.Mesh(new THREE.RingGeometry(.2,.32,32),new THREE.MeshBasicMaterial({color:0xb87538,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.y=.045;marker.visible=false;scene.add(marker);scene.userData.clickMarker=marker;
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(30.8,27),new THREE.MeshStandardMaterial({color:0xfff4df,roughness:.92,side:THREE.DoubleSide}));
  ceiling.rotation.x=Math.PI/2;ceiling.position.y=5.7;scene.add(ceiling);
  const canopy=new THREE.Mesh(new THREE.PlaneGeometry(9.4,26.6),new THREE.MeshStandardMaterial({map:scene.userData.cottonTexture,color:0xfffbf3,transparent:true,opacity:.46,roughness:1,side:THREE.DoubleSide,depthWrite:false}));
  canopy.rotation.x=Math.PI/2;canopy.position.y=5.68;scene.add(canopy);
  [-9.6,9.6].forEach(x=>{const frontWall=new THREE.Mesh(new THREE.BoxGeometry(11.2,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));frontWall.position.set(x,2.55,13.25);frontWall.receiveShadow=true;scene.add(frontWall)});
  const sun=new THREE.DirectionalLight(0xffcb88,3.2);sun.position.set(-8,12,5);sun.target.position.set(2,0,-2);sun.castShadow=renderer.shadowMap.enabled;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun,sun.target);
  const sunPatch=new THREE.Mesh(new THREE.PlaneGeometry(8.5,10),new THREE.MeshBasicMaterial({color:0xffd699,transparent:true,opacity:.14,depthWrite:false}));sunPatch.rotation.x=-Math.PI/2;sunPatch.position.set(-3,.025,2);scene.add(sunPatch);
  const sunSpot=new THREE.SpotLight(0xffd29a,9,26,Math.PI/5,.92,1);sunSpot.position.set(-7,11,6);sunSpot.target.position.set(1,0,-1);sunSpot.castShadow=false;scene.add(sunSpot,sunSpot.target);
  for(let i=0;i<4;i++){const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.72,10),new THREE.MeshBasicMaterial({color:0xffdfad,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide}));stripe.rotation.x=-Math.PI/2;stripe.rotation.z=-.58;stripe.position.set(-5+i*1.25,.035,1+i*.35);scene.add(stripe)}
  scene.userData.frameSideMaterial=new THREE.MeshStandardMaterial({color:0x8d5b34,roughness:.72,metalness:0});
  for(let i=0;i<10;i++)buildZone(i);
  buildCenterSculpture();buildCurator();buildWarmLights();buildCozyDetails();
}

function makeCottonTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#fffaf0';x.fillRect(0,0,256,256);
  x.globalAlpha=.14;x.strokeStyle='#bfae96';x.lineWidth=1;for(let i=0;i<256;i+=5){x.beginPath();x.moveTo(i,0);x.lineTo(i+8,256);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(256,i+5);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function buildZone(ci){
  const layout=ZONE_LAYOUT[ci],c=children[ci],zone=new THREE.Group();zone.position.set(layout.x,0,layout.z);zone.rotation.y=layout.ry;scene.add(zone);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(7.18,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));panel.position.y=2.55;panel.receiveShadow=true;zone.add(panel);
  const wood=new THREE.Mesh(new THREE.BoxGeometry(7.2,1.02,.32),new THREE.MeshStandardMaterial({color:0x9b6840,roughness:.85}));wood.position.y=.53;zone.add(wood);
  const header=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.95),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,'작은 시인의 방',c.color,1024,256),transparent:true}));
  header.position.set(0,4.35,.17);zone.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(6.65,.06,.08),new THREE.MeshBasicMaterial({color:c.color}));accent.position.set(0,3.84,.18);zone.add(accent);
  c.poems.forEach((p,pi)=>{
    const framedArt=new THREE.Group();framedArt.position.set((pi-2)*1.32,2.55,.22);
    const frameBody=new THREE.Mesh(new THREE.BoxGeometry(1.22,1.68,.16),scene.userData.frameSideMaterial);frameBody.castShadow=renderer.shadowMap.enabled;framedArt.add(frameBody);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(1.02,1.42),new THREE.MeshStandardMaterial({map:makePoemTexture(ci,pi),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045,side:THREE.DoubleSide}));art.position.z=.086;art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);framedArt.add(art);
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(1.24,1.7),new THREE.MeshBasicMaterial({map:scene.userData.frameTexture,transparent:true,alphaTest:.035,depthWrite:false,toneMapped:true,side:THREE.DoubleSide}));frame.position.z=.098;frame.renderOrder=2;framedArt.add(frame);zone.add(framedArt);
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
function buildCenterSculpture(){
  const g=makePngSprite('assets/centerpiece-tree.png',6.4,5.85,[-8.7,2.88,5.6],.035);g.material.depthWrite=true;g.material.depthTest=true;g.renderOrder=1;scene.userData.sculpture=g;
  const light=new THREE.PointLight(0xffc77a,3.4,10,2);light.position.set(-8.7,3.5,5.6);scene.add(light);
}
function buildPlant(x,z){
  makePngSprite('assets/planter-png.png',1.12,1.42,[x,.71,z],.012,x*.17+z*.11);
}
function buildCurator(){
  const loader=new THREE.TextureLoader(),idle=loader.load('assets/curator-maru.png'),walkA=loader.load('assets/curator-walk-a.png'),walkB=loader.load('assets/curator-walk-b.png');[idle,walkA,walkB].forEach(t=>t.colorSpace=THREE.SRGBColorSpace);
  const g=new THREE.Sprite(new THREE.SpriteMaterial({map:idle,transparent:true,alphaTest:.04,depthWrite:false}));g.scale.set(1.28,1.92,1);g.position.set(1.35,.98,6.7);g.renderOrder=4;g.userData={type:'curator',textures:{idle,walkA,walkB},currentTexture:idle};scene.add(g);scene.userData.curator=g;frameMeshes.push(g);
}
function buildWarmLights(){
  const lamps=new THREE.Group();for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const bulb=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xe59d3f,emissiveIntensity:1.5}));bulb.position.set(Math.sin(a)*8.5,5.48,Math.cos(a)*8.5);lamps.add(bulb)}scene.add(lamps);
}
function buildCozyDetails(){
  [[-5.4,4.6,-1.4],[5.5,4.55,-2.7],[-2.3,4.65,6]].forEach((p,i)=>makePngSprite('assets/cotton-mobile.png',3.9,2.6,p,.025,i*.9));
}

function makePngSprite(url,width,height,position,floatAmount=0,phase=0){
  const map=new THREE.TextureLoader().load(url);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,alphaTest:.04,depthWrite:false}));
  sprite.scale.set(width,height,1);sprite.position.set(...position);sprite.userData.baseY=position[1];sprite.userData.floatAmount=floatAmount;sprite.userData.phase=phase;
  scene.add(sprite);(scene.userData.animatedSprites??=[]).push(sprite);return sprite;
}

function bind(){
  addEventListener('resize',resize);
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'){closePoem();closeIndex();closeCurator()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen||tourActive)return;dragging=true;dragMoved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!started||modalOpen||tourActive||!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)dragMoved=true;yaw-=dx*.0042;pitch=Math.max(-.78,Math.min(.72,pitch-dy*.0034));lastX=e.clientX;lastY=e.clientY});
  canvas.addEventListener('pointerleave',()=>{dragging=false});
  canvas.addEventListener('pointerup',e=>{if(dragging&&!dragMoved)handleWorldClick(e.clientX,e.clientY);dragging=false});
  $('#enter').onclick=()=>{started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;startAmbientMusic();startPanoramaTour()};
  $('#home').onclick=()=>{$('#intro').classList.remove('closed');$('#hud').hidden=true;started=false;tourActive=false;hasDestination=false;$('#tour-guide').hidden=true;stopAmbientMusic()};
  $('#music-toggle').onclick=()=>musicOn?stopAmbientMusic():startAmbientMusic();
  $('#overview').onclick=showOverview;$('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;
  $('#curator-close').onclick=closeCurator;$('#curator-overview').onclick=()=>{closeCurator();showOverview()};$('#tour-skip').onclick=finishPanoramaTour;
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
    if(tourActive){updatePanoramaTour(dt);updateZone();updateMap()}else{
      const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y;
      const side=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x;
      if(forward||side){hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(-Math.sin(yaw)*forward+Math.cos(yaw)*side,0,-Math.cos(yaw)*forward-Math.sin(yaw)*side);if(moveTarget.lengthSq()>1)moveTarget.normalize();moveTarget.multiplyScalar(7.4)}
      else if(hasDestination){moveTarget.set(moveDestination.x-camera.position.x,0,moveDestination.z-camera.position.z);const distance=moveTarget.length();if(distance<.18){hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(0,0,0)}else{const desiredYaw=Math.atan2(-moveTarget.x,-moveTarget.z);yaw=dampAngle(yaw,desiredYaw,1-Math.exp(-7*dt));moveTarget.normalize().multiplyScalar(Math.min(7.2,Math.max(1.3,distance*2.7)))}}
      else moveTarget.set(0,0,0);
      moveVelocity.lerp(moveTarget,1-Math.exp(-(moveTarget.lengthSq()>.01?11:8)*dt));camera.position.addScaledVector(moveVelocity,dt);
      camera.position.x=THREE.MathUtils.clamp(camera.position.x,-13.55,13.55);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-11.85,11.85);
      camera.position.y=1.65;camera.rotation.set(pitch,yaw,0);updateZone();updateFocus();updateMap();
    }
  }
  const now=performance.now()*.001;(scene.userData.animatedSprites||[]).forEach((sprite,i)=>{sprite.position.y=sprite.userData.baseY+Math.sin(now*1.25+sprite.userData.phase+i*.35)*sprite.userData.floatAmount;sprite.material.rotation=Math.sin(now*.7+sprite.userData.phase)*.008});if(scene.userData.clickMarker.visible){const pulse=1+Math.sin(now*5)*.12;scene.userData.clickMarker.scale.setScalar(pulse);scene.userData.clickMarker.material.opacity=.65+Math.sin(now*5)*.2}
  updateCurator(dt,now);
  renderer.render(scene,camera);
}

function updateCurator(dt,now){
  const curator=scene.userData.curator;if(!curator||!started)return;
  curatorTarget.set(camera.position.x-Math.sin(yaw)*2.25+Math.cos(yaw)*1.25,1.02+Math.sin(now*2)*.035,camera.position.z-Math.cos(yaw)*2.25-Math.sin(yaw)*1.25);
  curatorTarget.x=THREE.MathUtils.clamp(curatorTarget.x,-13.15,13.15);curatorTarget.z=THREE.MathUtils.clamp(curatorTarget.z,-11.45,11.45);
  const walking=moveVelocity.lengthSq()>.16||curator.position.distanceToSquared(curatorTarget)>.018,tex=walking?(Math.floor(now*5.5)%2?curator.userData.textures.walkA:curator.userData.textures.walkB):curator.userData.textures.idle;
  if(curator.userData.currentTexture!==tex){curator.material.map=tex;curator.material.needsUpdate=true;curator.userData.currentTexture=tex}curator.material.rotation=walking?Math.sin(now*11)*.018:Math.sin(now*1.4)*.006;
  curatorTarget.y=walking?1.02+Math.abs(Math.sin(now*11))*.045:1.02+Math.sin(now*1.8)*.018;curator.position.lerp(curatorTarget,1-Math.exp(-6.5*dt));
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
  $('#crosshair').classList.toggle('active',!!hit);$('#focus-hint').classList.toggle('show',!!hit);$('#focus-hint').textContent=hit?.object.userData.type==='curator'?'큐레이터 안내 듣기':'이 작품을 눌러 감상하기';camera.userData.focus=hit?.object||null;
}
function activateCenter(){if(camera.userData.focus){const d=camera.userData.focus.userData;if(d.type==='curator')openCurator();else openPoem(d.child,d.poem)}}
function handleWorldClick(x,y){
  clickPoint.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);raycaster.setFromCamera(clickPoint,camera);
  const subject=raycaster.intersectObjects(frameMeshes,false)[0];if(subject){const d=subject.object.userData;if(d.type==='curator')openCurator();else openPoem(d.child,d.poem);return}
  const floorHit=raycaster.intersectObject(scene.userData.floor,false)[0];if(!floorHit)return;
  moveDestination.copy(floorHit.point);moveDestination.x=THREE.MathUtils.clamp(moveDestination.x,-13.25,13.25);moveDestination.z=THREE.MathUtils.clamp(moveDestination.z,-11.55,11.55);moveDestination.y=0;hasDestination=true;moveVelocity.multiplyScalar(.35);const marker=scene.userData.clickMarker;marker.position.set(moveDestination.x,.045,moveDestination.z);marker.visible=true;showToast('선택한 곳으로 이동할게요')
}
function startPanoramaTour(){
  hasDestination=false;moveVelocity.set(0,0,0);tourElapsed=0;tourActive=!reduceMotion;$('#tour-guide').hidden=reduceMotion;$('#tour-progress').style.width='0%';camera.fov=74;camera.updateProjectionMatrix();camera.position.set(0,2.05,11.2);yaw=0;pitch=-.025;camera.rotation.set(pitch,yaw,0);if(reduceMotion)finishPanoramaTour();else showToast('먼저 직선형 전시장을 편안하게 소개할게요')
}
function updatePanoramaTour(dt){
  tourElapsed=Math.min(TOUR_DURATION,tourElapsed+dt);const t=tourElapsed/TOUR_DURATION,e=t*t*(3-2*t),angle=e*Math.PI*2;camera.position.set(Math.sin(angle)*9.1,2.08,Math.cos(angle)*8.2);const dx=-camera.position.x,dz=-camera.position.z;yaw=Math.atan2(-dx,-dz);pitch=-.03;camera.rotation.set(pitch,yaw,0);$('#tour-progress').style.width=`${Math.round(t*100)}%`;if(t>=1)finishPanoramaTour()
}
function finishPanoramaTour(){tourActive=false;$('#tour-guide').hidden=true;moveVelocity.set(0,0,0);camera.position.set(0,1.65,11.2);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구';showToast(coarsePointer?'바닥을 눌러 이동하고 화면을 밀어 둘러보세요':'바닥 클릭 이동 · 드래그 둘러보기 · 작품 클릭 감상')}
function dampAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t}
function showOverview(){tourActive=false;$('#tour-guide').hidden=true;hasDestination=false;scene.userData.clickMarker.visible=false;overviewMode=false;moveVelocity.set(0,0,0);camera.position.set(0,1.65,11.2);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구'}
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
function openCurator(){moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;modalOpen=true;$('#curator-panel').classList.add('open');$('#curator-panel').setAttribute('aria-hidden','false');setTimeout(()=>$('#curator-close').focus(),200)}
function closeCurator(){modalOpen=false;$('#curator-panel').classList.remove('open');$('#curator-panel').setAttribute('aria-hidden','true')}
function buildIndex(){
  const root=$('#index-list');
  children.forEach((c,ci)=>{
    const el=document.createElement('div');el.className='index-child';
    el.innerHTML=`<button type="button"><i style="--c:${c.color}"></i><strong>${c.name}</strong><span>동시 5편</span></button><div class="index-poems">${c.poems.map((p,pi)=>`<button type="button" data-ci="${ci}" data-pi="${pi}">${pi+1}. ${p.title}</button>`).join('')}</div>`;
    el.firstElementChild.onclick=()=>el.classList.toggle('open');root.append(el);
  });
  $$('[data-ci]').forEach(b=>b.onclick=()=>{closeIndex();openPoem(+b.dataset.ci,+b.dataset.pi)});
}
let toastTimer;function showToast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2400)}
init();
