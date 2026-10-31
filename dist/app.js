import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c'];
const children=Array.from({length:10},(_,i)=>({id:i+1,name:`어린이 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],poems:Array.from({length:5},(_,j)=>({title:`동시 제목 ${j+1}`,body:`여기에 어린이가 쓴 동시 ${j+1}의\n첫 번째 행을 넣어주세요.\n\n행갈이와 빈 줄도\n그대로 예쁘게 보여요.`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false,overviewMode=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,lastX=0,lastY=0,keys={},joy={x:0,y:0};
let audioContext,audioMaster,musicTimer,musicStep=0,musicOn=true;
const cameraPos=new THREE.Vector3(0,1.65,5.3);
const visited=new Set(JSON.parse(localStorage.getItem('galleryVisited')||'[]'));

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf8eedf);
  scene.fog=new THREE.FogExp2(0xf8eedf,.009);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,100);
  camera.position.copy(cameraPos);camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  buildGallery();bind();buildIndex();animate();
  setTimeout(()=>$('#loading').classList.add('done'),450);
}

function buildGallery(){
  scene.userData.cottonTexture=makeCottonTexture();
  scene.userData.woodTexture=makeWoodTexture();
  scene.userData.curtainTexture=new THREE.TextureLoader().load('assets/breeze-curtains.png');scene.userData.curtainTexture.colorSpace=THREE.SRGBColorSpace;
  scene.add(new THREE.HemisphereLight(0xfff5dc,0xa66f45,2.6));
  scene.add(new THREE.AmbientLight(0xfff0d5,1.05));
  const floor=new THREE.Mesh(new THREE.CircleGeometry(15.2,96),new THREE.MeshStandardMaterial({color:0xc79768,roughness:.9,metalness:.01}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  for(let r=2;r<15;r+=2){
    const ring=new THREE.Mesh(new THREE.RingGeometry(r-.025,r+.025,96),new THREE.MeshBasicMaterial({color:0x714626,transparent:true,opacity:.3,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.012;scene.add(ring);
  }
  const ceiling=new THREE.Mesh(new THREE.RingGeometry(9.2,15.3,96),new THREE.MeshStandardMaterial({color:0xfff4df,roughness:.92,side:THREE.DoubleSide}));
  ceiling.rotation.x=Math.PI/2;ceiling.position.y=5.7;scene.add(ceiling);
  const canopy=new THREE.Mesh(new THREE.RingGeometry(6.4,9.25,96),new THREE.MeshStandardMaterial({map:scene.userData.cottonTexture,color:0xfffbf3,transparent:true,opacity:.62,roughness:1,side:THREE.DoubleSide,depthWrite:false}));
  canopy.rotation.x=Math.PI/2;canopy.position.y=5.68;scene.add(canopy);
  for(let i=0;i<10;i++){
    const a=i/10*Math.PI*2;
    const panel=new THREE.Mesh(new THREE.BoxGeometry(8.2,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));placeOnRing(panel,a,15.02,2.55);panel.receiveShadow=true;scene.add(panel);
    const wood=new THREE.Mesh(new THREE.BoxGeometry(8.22,1.02,.32),new THREE.MeshStandardMaterial({color:0x9b6840,roughness:.85}));placeOnRing(wood,a,14.98,.53);scene.add(wood);
    buildCottonCurtain(a+Math.PI/10);
  }
  const sun=new THREE.DirectionalLight(0xffcb88,3.2);sun.position.set(-8,12,5);sun.target.position.set(2,0,-2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun,sun.target);
  const sunPatch=new THREE.Mesh(new THREE.CircleGeometry(5.4,48),new THREE.MeshBasicMaterial({color:0xffd699,transparent:true,opacity:.18,depthWrite:false}));sunPatch.rotation.x=-Math.PI/2;sunPatch.position.set(-3,.025,2);scene.add(sunPatch);
  const sunSpot=new THREE.SpotLight(0xffd29a,9,26,Math.PI/5,.92,1);sunSpot.position.set(-7,11,6);sunSpot.target.position.set(1,0,-1);sunSpot.castShadow=true;scene.add(sunSpot,sunSpot.target);
  for(let i=0;i<4;i++){const stripe=new THREE.Mesh(new THREE.PlaneGeometry(.72,10),new THREE.MeshBasicMaterial({color:0xffdfad,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide}));stripe.rotation.x=-Math.PI/2;stripe.rotation.z=-.58;stripe.position.set(-5+i*1.25,.035,1+i*.35);scene.add(stripe)}
  for(let i=0;i<10;i++)buildZone(i);
  buildCenterSculpture();buildCurator();buildWarmLights();buildCozyDetails();
}

function makeCottonTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#fffaf0';x.fillRect(0,0,256,256);
  x.globalAlpha=.14;x.strokeStyle='#bfae96';x.lineWidth=1;for(let i=0;i<256;i+=5){x.beginPath();x.moveTo(i,0);x.lineTo(i+8,256);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(256,i+5);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makeWoodTexture(){
  const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'#e0b17b');g.addColorStop(.5,'#bc7d49');g.addColorStop(1,'#d79c63');x.fillStyle=g;x.fillRect(0,0,512,256);
  x.globalAlpha=.26;x.strokeStyle='#6f3e20';for(let i=0;i<46;i++){const y=i*6+Math.sin(i*.9)*5;x.beginPath();x.moveTo(0,y);for(let px=0;px<=512;px+=32)x.lineTo(px,y+Math.sin(px*.035+i)*3);x.stroke()}x.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,1);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function buildCottonCurtain(angle){
  const geo=new THREE.PlaneGeometry(4.6,3.45,12,10),pos=geo.attributes.position;geo.userData.base=Float32Array.from(pos.array);
  const curtain=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:scene.userData.curtainTexture,transparent:true,alphaTest:.035,side:THREE.DoubleSide,depthWrite:false,toneMapped:true}));
  placeOnRing(curtain,angle,14.72,3.55);curtain.renderOrder=2;curtain.userData.phase=angle*2;scene.add(curtain);(scene.userData.curtains??=[]).push(curtain);
}

function buildZone(ci){
  const base=ci/10*Math.PI*2,c=children[ci];
  const header=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.95),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,'작은 시인의 방',c.color,1024,256),transparent:true}));
  placeOnRing(header,base,14.77,4.35);scene.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(7.3,.06,.08),new THREE.MeshBasicMaterial({color:c.color}));
  placeOnRing(accent,base,14.72,3.84);scene.add(accent);
  c.poems.forEach((p,pi)=>{
    const angle=base+THREE.MathUtils.degToRad((pi-2)*5.7);
    const frame=new THREE.Group(),woodMat=new THREE.MeshStandardMaterial({map:scene.userData.woodTexture,color:0xd6a06a,roughness:.78,metalness:0});
    [[1.56,.13,0,.965],[1.56,.13,0,-.965],[.13,1.82,-.715,0],[.13,1.82,.715,0]].forEach(v=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(v[0],v[1],.16),woodMat);rail.position.set(v[2],v[3],0);rail.castShadow=true;frame.add(rail)});
    placeOnRing(frame,angle,14.78,2.55);scene.add(frame);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(1.34,1.78),new THREE.MeshStandardMaterial({map:makePoemTexture(ci,pi),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045}));
    placeOnRing(art,angle,14.65,2.55);art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);scene.add(art);
    const spot=new THREE.SpotLight(0xffd6a0,4.6,9,Math.PI/6,.62,1.15);
    spot.position.set(Math.sin(angle)*11.8,5.15,Math.cos(angle)*11.8);spot.target=art;scene.add(spot,spot.target);
  });
  const zoneGlow=new THREE.PointLight(c.color,.38,6,2);zoneGlow.position.set(Math.sin(base)*11.8,3.6,Math.cos(base)*11.8);scene.add(zoneGlow);
  buildPlant(base+THREE.MathUtils.degToRad(16),12.9);
}

function placeOnRing(obj,angle,radius,y){obj.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius);obj.rotation.y=angle+Math.PI}
function makeTextTexture(title,sub,color,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.textAlign='center';x.fillStyle=color;x.font='76px Jua, sans-serif';x.fillText(title,w/2,105);
  x.fillStyle='#6a513d';x.font='28px Gowun Dodum, sans-serif';x.fillText(sub,w/2,164);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makePoemTexture(ci,pi){
  const c=document.createElement('canvas');c.width=640;c.height=850;const x=c.getContext('2d'),d=children[ci],p=d.poems[pi];
  x.fillStyle='#fffaf0';x.fillRect(0,0,640,850);x.fillStyle=d.color;x.fillRect(0,0,640,28);
  x.fillStyle='#777f91';x.font='24px Gowun Dodum, sans-serif';x.fillText(d.name,54,92);
  x.fillStyle='#172039';x.font='56px Jua, sans-serif';x.fillText(p.title,54,180);
  x.strokeStyle='#e5dfd2';x.beginPath();x.moveTo(54,215);x.lineTo(586,215);x.stroke();
  x.font='30px Gowun Dodum, sans-serif';x.fillStyle='#364057';
  ['어린이가 쓴 동시를','여기에 넣어주세요.','','가까이 다가와','작품을 눌러 보세요.'].forEach((line,i)=>x.fillText(line,54,300+i*60));
  x.fillStyle='#a9a190';x.font='22px Gowun Dodum, sans-serif';x.fillText(`${pi+1} / 5`,54,790);
  const bead=x.createRadialGradient(558,768,4,566,776,24);bead.addColorStop(0,'#fff8');bead.addColorStop(.34,d.color);bead.addColorStop(1,'#8f694d');
  x.fillStyle=bead;x.beginPath();x.arc(566,776,22,0,Math.PI*2);x.fill();x.strokeStyle='#ffffffaa';x.lineWidth=3;x.stroke();
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
}
function buildCenterSculpture(){
  const g=makePngSprite('assets/centerpiece-tree.png',6.4,5.85,[0,2.88,0],.035);scene.userData.sculpture=g;
  const light=new THREE.PointLight(0xffc77a,3.4,10,2);light.position.y=3.5;scene.add(light);
}
function buildPlant(angle,radius){
  const g=new THREE.Group();const pot=new THREE.Mesh(new THREE.CylinderGeometry(.28,.38,.52,18),new THREE.MeshStandardMaterial({color:0xc6784e,roughness:.9}));pot.position.y=.27;g.add(pot);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,1.35,8),new THREE.MeshStandardMaterial({color:0x557147,roughness:1}));stem.position.y=1.08;g.add(stem);
  const leafMat=new THREE.MeshStandardMaterial({color:0x6f8d5b,roughness:.95});
  [[-.26,1.3,0],[.25,1.55,.05],[-.18,1.8,.02]].forEach((v,i)=>{const leaf=new THREE.Mesh(new THREE.SphereGeometry(.27,12,8),leafMat);leaf.position.set(...v);leaf.scale.set(1,.45,.5);leaf.rotation.z=i%2?-.55:.55;g.add(leaf)});
  g.position.set(Math.sin(angle)*radius,0,Math.cos(angle)*radius);g.rotation.y=angle+Math.PI;scene.add(g);
}
function buildCurator(){
  const g=makePngSprite('assets/curator-maru.png',2.05,3.08,[3.4,1.53,3.2],.055);g.renderOrder=3;scene.userData.curator=g;
  const hit=new THREE.Mesh(new THREE.CapsuleGeometry(.58,1.55,5,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.set(3.4,1.2,3.2);hit.userData={type:'curator'};frameMeshes.push(hit);scene.add(hit);
  const bubble=new THREE.Mesh(new THREE.PlaneGeometry(2.6,.9),new THREE.MeshBasicMaterial({map:makeTextTexture('안녕하세요!','저를 눌러 관람 안내를 받아보세요','#7b5538',900,300),transparent:true,depthTest:false}));bubble.position.set(3.4,3.08,3.18);bubble.lookAt(0,3.08,0);bubble.renderOrder=5;scene.add(bubble);
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
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen)return;dragging=true;dragMoved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!dragging||modalOpen)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)dragMoved=true;yaw-=dx*.0042;pitch=Math.max(-.78,Math.min(.72,pitch-dy*.0034));lastX=e.clientX;lastY=e.clientY});
  canvas.addEventListener('pointerup',()=>{if(dragging&&!dragMoved)activateCenter();dragging=false});
  $('#enter').onclick=()=>{started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;showOverview();startAmbientMusic();showToast('전시장 전체를 한눈에 둘러보세요')};
  $('#home').onclick=()=>{$('#intro').classList.remove('closed');$('#hud').hidden=true;started=false;stopAmbientMusic()};
  $('#music-toggle').onclick=()=>musicOn?stopAmbientMusic():startAmbientMusic();
  $('#overview').onclick=showOverview;$('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;
  $('#curator-close').onclick=closeCurator;$('#curator-overview').onclick=()=>{closeCurator();showOverview()};
  $$('[data-close]').forEach(b=>b.onclick=closePoem);
  $('#prev-poem').onclick=()=>movePoem(-1);$('#next-poem').onclick=()=>movePoem(1);bindJoystick();
}
function bindJoystick(){
  const j=$('#joystick'),k=$('#joystick-knob');let active=false;
  const move=e=>{if(!active)return;const r=j.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=35,len=Math.hypot(dx,dy)||1,s=Math.min(1,max/len);joy.x=dx*s/max;joy.y=dy*s/max;k.style.transform=`translate(${dx*s}px,${dy*s}px)`};
  j.addEventListener('pointerdown',e=>{active=true;j.setPointerCapture(e.pointerId);move(e)});j.addEventListener('pointermove',move);
  j.addEventListener('pointerup',()=>{active=false;joy.x=joy.y=0;k.style.transform=''});
}

function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
  if(started&&!modalOpen){
    const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y;
    const side=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+joy.x;
    if(overviewMode&&(Math.abs(forward)+Math.abs(side)>.05)){exitOverview();showToast('작품 가까이 이동해 감상해 보세요')}
    const speed=4.2*dt;
    if(!overviewMode){camera.position.x+=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed;
    camera.position.z+=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed;}
    const r=Math.hypot(camera.position.x,camera.position.z);
    if(r>12.8){camera.position.x*=12.8/r;camera.position.z*=12.8/r}
    if(!overviewMode)camera.position.y=1.65;camera.rotation.set(pitch,yaw,0);updateZone();updateFocus();updateMap();
  }
  const now=performance.now()*.001;(scene.userData.animatedSprites||[]).forEach((sprite,i)=>{sprite.position.y=sprite.userData.baseY+Math.sin(now*1.25+sprite.userData.phase+i*.35)*sprite.userData.floatAmount;sprite.material.rotation=Math.sin(now*.7+sprite.userData.phase)*.008});
  (scene.userData.curtains||[]).forEach(curtain=>{const p=curtain.geometry.attributes.position,b=curtain.geometry.userData.base;for(let i=0;i<p.count;i++){const ix=i*3,x=b[ix],y=b[ix+1];p.setZ(i,b[ix+2]+Math.sin(now*1.15+curtain.userData.phase+y*1.25+x*.7)*(.045+(1.72-y)*.028));}p.needsUpdate=true;});
  renderer.render(scene,camera);
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
  const r=Math.hypot(camera.position.x,camera.position.z);
  if(r<4.2){$('#zone-name').textContent='중앙 햇살 마루';return}
  let a=Math.atan2(camera.position.x,camera.position.z);if(a<0)a+=Math.PI*2;
  const i=Math.round(a/(Math.PI*2)*10)%10;$('#zone-name').textContent=`${children[i].name}의 방`;
}
function updateFocus(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(frameMeshes,false),hit=hits[0]&&hits[0].distance<(hits[0].object.userData.type==='curator'?9:7)?hits[0]:null;
  $('#crosshair').classList.toggle('active',!!hit);$('#focus-hint').classList.toggle('show',!!hit);$('#focus-hint').textContent=hit?.object.userData.type==='curator'?'큐레이터 안내 듣기':'이 작품을 눌러 감상하기';camera.userData.focus=hit?.object||null;
}
function activateCenter(){if(camera.userData.focus){const d=camera.userData.focus.userData;if(d.type==='curator')openCurator();else openPoem(d.child,d.poem)}}
function showOverview(){overviewMode=true;camera.position.set(0,5.25,1.8);yaw=0;pitch=-1.02;camera.fov=78;camera.updateProjectionMatrix();$('#zone-name').textContent='전시장 전체 보기'}
function exitOverview(){overviewMode=false;camera.position.copy(cameraPos);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix()}
function updateMap(){const x=camera.position.x/15*40,z=camera.position.z/15*40;$('#map-dot').style.transform=`translate(${x}px,${z}px)`;$('#map-view').style.transform=`rotate(${-yaw}rad)`}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7))}

function openPoem(ci,pi){
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
function openCurator(){modalOpen=true;$('#curator-panel').classList.add('open');$('#curator-panel').setAttribute('aria-hidden','false');setTimeout(()=>$('#curator-close').focus(),200)}
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
