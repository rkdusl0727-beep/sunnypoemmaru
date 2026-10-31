import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c'];
const children=Array.from({length:10},(_,i)=>({id:i+1,name:`어린이 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],poems:Array.from({length:5},(_,j)=>({title:`동시 제목 ${j+1}`,body:`여기에 어린이가 쓴 동시 ${j+1}의\n첫 번째 행을 넣어주세요.\n\n행갈이와 빈 줄도\n그대로 예쁘게 보여요.`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,lastX=0,lastY=0,keys={},joy={x:0,y:0};
const cameraPos=new THREE.Vector3(0,1.65,5.3);
const visited=new Set(JSON.parse(localStorage.getItem('galleryVisited')||'[]'));

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080b13);
  scene.fog=new THREE.FogExp2(0x080b13,.022);
  camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.08,100);
  camera.position.copy(cameraPos);camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  buildGallery();bind();buildIndex();animate();
  setTimeout(()=>$('#loading').classList.add('done'),450);
}

function buildGallery(){
  scene.add(new THREE.HemisphereLight(0x819ed1,0x161018,1.3));
  const floor=new THREE.Mesh(new THREE.CircleGeometry(15.2,96),new THREE.MeshStandardMaterial({color:0x30251f,roughness:.78,metalness:.12}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  for(let r=2;r<15;r+=2){
    const ring=new THREE.Mesh(new THREE.RingGeometry(r-.018,r+.018,96),new THREE.MeshBasicMaterial({color:0x725f48,transparent:true,opacity:.34,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.012;scene.add(ring);
  }
  const ceiling=new THREE.Mesh(new THREE.CircleGeometry(15.2,96),new THREE.MeshStandardMaterial({color:0x101622,roughness:.62,side:THREE.DoubleSide}));
  ceiling.rotation.x=Math.PI/2;ceiling.position.y=5.7;scene.add(ceiling);
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(15,15,5.7,100,1,true),new THREE.MeshStandardMaterial({color:0x242b39,roughness:.7,side:THREE.BackSide}));
  wall.position.y=2.85;wall.receiveShadow=true;scene.add(wall);
  for(let i=0;i<10;i++)buildZone(i);
  buildCenterSculpture();buildStars();
}

function buildZone(ci){
  const base=ci/10*Math.PI*2,c=children[ci];
  const header=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.95),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,'작은 시인의 방',c.color,1024,256),transparent:true}));
  placeOnRing(header,base,14.77,4.35);scene.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(7.3,.06,.08),new THREE.MeshBasicMaterial({color:c.color}));
  placeOnRing(accent,base,14.72,3.84);scene.add(accent);
  c.poems.forEach((p,pi)=>{
    const angle=base+THREE.MathUtils.degToRad((pi-2)*5.7);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(1.48,1.92,.13),new THREE.MeshStandardMaterial({color:0xd0a95a,roughness:.35,metalness:.5}));
    placeOnRing(frame,angle,14.78,2.55);scene.add(frame);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(1.34,1.78),new THREE.MeshStandardMaterial({map:makePoemTexture(ci,pi),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045}));
    placeOnRing(art,angle,14.65,2.55);art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);scene.add(art);
    const spot=new THREE.SpotLight(0xffe7ba,3.2,9,Math.PI/7,.55,1.3);
    spot.position.set(Math.sin(angle)*11.8,5.15,Math.cos(angle)*11.8);spot.target=art;scene.add(spot,spot.target);
  });
  const zoneGlow=new THREE.PointLight(c.color,1.5,8,2);zoneGlow.position.set(Math.sin(base)*11.8,3.6,Math.cos(base)*11.8);scene.add(zoneGlow);
}

function placeOnRing(obj,angle,radius,y){obj.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius);obj.rotation.y=angle+Math.PI}
function makeTextTexture(title,sub,color,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.textAlign='center';x.fillStyle=color;x.font='76px Jua, sans-serif';x.fillText(title,w/2,105);
  x.fillStyle='#dbe2ef';x.font='28px Gowun Dodum, sans-serif';x.fillText(sub,w/2,164);
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
  x.textAlign='right';x.fillStyle=d.color;x.font='52px serif';x.fillText('✦',580,790);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
}
function buildCenterSculpture(){
  const g=new THREE.Group();
  for(let i=0;i<4;i++){
    const torus=new THREE.Mesh(new THREE.TorusGeometry(1.05+i*.34,.025,12,80),new THREE.MeshStandardMaterial({color:i%2?0xffd464:0x89d9cb,emissive:i%2?0x8b6320:0x235d58,emissiveIntensity:.65,metalness:.55,roughness:.25}));
    torus.rotation.set(Math.PI/2+i*.38,i*.51,i*.2);g.add(torus);
  }
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.42,2),new THREE.MeshStandardMaterial({color:0xffdf83,emissive:0xb57c1d,emissiveIntensity:1.2,roughness:.22}));
  core.castShadow=true;g.add(core);g.position.y=2.15;scene.add(g);scene.userData.sculpture=g;
  const light=new THREE.PointLight(0xffd47b,5,12,2);light.position.y=2.5;scene.add(light);
}
function buildStars(){
  const geo=new THREE.BufferGeometry(),pos=[];
  for(let i=0;i<700;i++){const r=16+Math.random()*22,a=Math.random()*Math.PI*2,y=2+Math.random()*18;pos.push(Math.sin(a)*r,y,Math.cos(a)*r)}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xcbd9ff,size:.055,transparent:true,opacity:.72})));
}

function bind(){
  addEventListener('resize',resize);
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'){closePoem();closeIndex()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen)return;dragging=true;dragMoved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!dragging||modalOpen)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)dragMoved=true;yaw-=dx*.0042;pitch=Math.max(-.78,Math.min(.72,pitch-dy*.0034));lastX=e.clientX;lastY=e.clientY});
  canvas.addEventListener('pointerup',()=>{if(dragging&&!dragMoved)activateCenter();dragging=false});
  $('#enter').onclick=()=>{started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;showToast('드래그해서 360°로 둘러보세요')};
  $('#home').onclick=()=>{$('#intro').classList.remove('closed');$('#hud').hidden=true;started=false};
  $('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;
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
    const speed=4.2*dt;
    camera.position.x+=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed;
    camera.position.z+=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed;
    const r=Math.hypot(camera.position.x,camera.position.z);
    if(r>12.8){camera.position.x*=12.8/r;camera.position.z*=12.8/r}
    camera.position.y=1.65;camera.rotation.set(pitch,yaw,0);updateZone();updateFocus();updateMap();
  }
  if(scene.userData.sculpture){scene.userData.sculpture.rotation.y+=dt*.22;scene.userData.sculpture.rotation.x=Math.sin(performance.now()*.00025)*.12}
  renderer.render(scene,camera);
}
function updateZone(){
  const r=Math.hypot(camera.position.x,camera.position.z);
  if(r<4.2){$('#zone-name').textContent='중앙 별빛 홀';return}
  let a=Math.atan2(camera.position.x,camera.position.z);if(a<0)a+=Math.PI*2;
  const i=Math.round(a/(Math.PI*2)*10)%10;$('#zone-name').textContent=`${children[i].name}의 방`;
}
function updateFocus(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(frameMeshes,false),hit=hits[0]&&hits[0].distance<7?hits[0]:null;
  $('#crosshair').classList.toggle('active',!!hit);$('#focus-hint').classList.toggle('show',!!hit);camera.userData.focus=hit?.object||null;
}
function activateCenter(){if(camera.userData.focus){const d=camera.userData.focus.userData;openPoem(d.child,d.poem)}}
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
