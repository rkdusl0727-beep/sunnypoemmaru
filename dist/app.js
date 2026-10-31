import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c'];
const children=Array.from({length:10},(_,i)=>({id:i+1,name:`어린이 ${String(i+1).padStart(2,'0')}`,color:COLORS[i],poems:Array.from({length:5},(_,j)=>({title:`작품 ${j+1}`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const adminMode=document.body.dataset.admin==='true';
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false,overviewMode=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,dragMode=null,dragStartX=0,dragStartY=0,lastX=0,lastY=0,keys={},joy={x:0,y:0};
let tourActive=false,tourElapsed=0,entryActive=false,entryElapsed=0,hasDestination=false,zoneTravelActive=false,zoneTravelElapsed=0;
let destinationTurnsView=true;
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
const poemPngTextures=new Map();
const poemArtMeshes=new Map(),frameGroups=new Map(),zoneFrameGroups=new Map(),scanRecords=new Map();
const SCAN_DB_NAME='sunny-poem-original-scans',SCAN_STORE='scans';
let scanDbPromise=null,activeScanUrl=null;
const FRAME_PRESETS={
  'portrait-small':{label:'세로 소형',w:.8,h:1.18},portrait:{label:'세로 기본',w:1.06,h:1.62},'portrait-large':{label:'세로 대형',w:1.28,h:1.86},
  'landscape-small':{label:'가로 소형',w:1.16,h:.78},landscape:{label:'가로 기본',w:1.48,h:1},'landscape-large':{label:'가로 대형',w:1.78,h:1.18}
};
const DEFAULT_GALLERY_CONFIG={name:'햇살 동시 마루',theme:'warm',frames:{}};
let galleryConfig=loadGalleryConfig();

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
  buildGallery();bind();buildIndex();if(adminMode)buildSettings();applyGalleryName(galleryConfig.name,false);applyGalleryTheme(galleryConfig.theme,false);loadStoredScans();renderer.compile(scene,camera);if(renderer.shadowMap.enabled){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true}animate();
  setTimeout(()=>$('#loading').classList.add('done'),450);
}

function buildGallery(){
  const textureLoader=new THREE.TextureLoader();
  scene.userData.theme={panels:[],bases:[],decor:[]};
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
  scene.userData.theme.floor=floor.material;scene.userData.theme.ceiling=ceiling.material;
  const canopy=new THREE.Mesh(new THREE.PlaneGeometry(9.4,26.6),new THREE.MeshStandardMaterial({map:scene.userData.cottonTexture,color:0xfffbf3,transparent:true,opacity:.46,roughness:1,side:THREE.DoubleSide,depthWrite:false}));
  canopy.rotation.x=Math.PI/2;canopy.position.y=5.68;scene.add(canopy);scene.userData.theme.canopy=canopy;
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
  const facade=new THREE.Mesh(new THREE.PlaneGeometry(30.4,5.7),new THREE.MeshBasicMaterial({map:facadeMap,color:0xffffff,transparent:true,alphaTest:.025,side:THREE.DoubleSide}));facade.position.set(0,2.85,13.2);facade.renderOrder=2;scene.add(facade);scene.userData.entranceFacade=facade;scene.userData.theme.facade=facade.material;
  [-9.6,9.6].forEach(x=>{const lightPatch=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.2),new THREE.MeshBasicMaterial({color:0xffe2aa,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));lightPatch.rotation.x=-Math.PI/2;lightPatch.position.set(x,.03,9.7);scene.add(lightPatch)});
  const leaves=[];[-1,1].forEach(side=>{const map=doorMap.clone();map.needsUpdate=true;if(side<0){map.wrapS=THREE.RepeatWrapping;map.repeat.x=-1;map.offset.x=1}const pivot=new THREE.Group();pivot.position.set(side*2.52,0,13.12);const panel=new THREE.Mesh(new THREE.PlaneGeometry(2.52,4.72),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.035,side:THREE.DoubleSide}));panel.position.set(-side*1.26,2.36,0);panel.renderOrder=3;pivot.add(panel);scene.add(pivot);leaves.push(pivot)});scene.userData.doors=leaves;
}
function buildZone(ci){
  const layout=ZONE_LAYOUT[ci],c=children[ci],zone=new THREE.Group();zone.position.set(layout.x,0,layout.z);zone.rotation.y=layout.ry;scene.add(zone);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(7.18,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));panel.position.y=2.55;panel.receiveShadow=true;zone.add(panel);
  const wood=new THREE.Mesh(new THREE.BoxGeometry(7.2,1.02,.32),new THREE.MeshStandardMaterial({color:0x9b6840,roughness:.85}));wood.position.y=.53;zone.add(wood);
  scene.userData.theme.panels.push(panel.material);scene.userData.theme.bases.push(wood.material);
  const header=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.95),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,'어린이 작가의 방',c.color,1024,256),transparent:true}));
  header.position.set(0,4.35,.17);zone.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(6.65,.06,.08),new THREE.MeshBasicMaterial({color:c.color}));accent.position.set(0,3.84,.18);zone.add(accent);
  const groups=[];c.poems.forEach((p,pi)=>{
    const key=`${ci}-${pi}`,preset=galleryConfig.frames[key]||'portrait',framedArt=new THREE.Group();framedArt.position.z=.22;
    const frameBody=new THREE.Mesh(new THREE.BoxGeometry(1,1,.16),scene.userData.frameSideMaterial);frameBody.castShadow=renderer.shadowMap.enabled;framedArt.add(frameBody);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:makePoemPngTexture(ci,pi,preset),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045,side:THREE.DoubleSide}));art.position.z=.086;art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);poemArtMeshes.set(key,art);framedArt.add(art);
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:scene.userData.frameTexture,transparent:true,alphaTest:.035,depthWrite:false,toneMapped:true,side:THREE.DoubleSide}));frame.position.z=.098;frame.renderOrder=2;framedArt.add(frame);framedArt.userData={key,ci,pi,preset,frameBody,art,frame};frameGroups.set(key,framedArt);groups.push(framedArt);zone.add(framedArt);setFrameGeometry(framedArt,preset);
  });zoneFrameGroups.set(ci,groups);layoutZoneFrames(ci);
  const glowPos=zoneLocalToWorld(layout,0,2.2);const zoneGlow=new THREE.PointLight(c.color,.38,6,2);zoneGlow.position.set(glowPos.x,3.6,glowPos.z);scene.add(zoneGlow);
  const plantPos=zoneLocalToWorld(layout,2.95,1.05);buildPlant(plantPos.x,plantPos.z);
}

function zoneLocalToWorld(layout,x,z){return new THREE.Vector3(layout.x+Math.cos(layout.ry)*x+Math.sin(layout.ry)*z,0,layout.z-Math.sin(layout.ry)*x+Math.cos(layout.ry)*z)}
function loadGalleryConfig(){try{const saved=JSON.parse(localStorage.getItem('galleryConfig')||'{}'),frames=saved.frames&&typeof saved.frames==='object'?Object.fromEntries(Object.entries(saved.frames).filter(([key,value])=>/^\d-\d$/.test(key)&&FRAME_PRESETS[value])):{},theme=saved.theme==='white'?'storybook':saved.theme,savedName=typeof saved.name==='string'?saved.name.trim().slice(0,30):'';return{name:savedName&&savedName!=='우리들의 미술관'?savedName:DEFAULT_GALLERY_CONFIG.name,theme:['warm','storybook'].includes(theme)?theme:'warm',frames}}catch{return{name:DEFAULT_GALLERY_CONFIG.name,theme:'warm',frames:{}}}}
function saveGalleryConfig(){localStorage.setItem('galleryConfig',JSON.stringify(galleryConfig))}
function applyGalleryName(name,persist=true){
  const clean=(name||DEFAULT_GALLERY_CONFIG.name).trim().slice(0,30)||DEFAULT_GALLERY_CONFIG.name,parts=clean.split(/\s+/),first=parts.shift(),rest=parts.join(' ');galleryConfig.name=clean;
  const title=$('#intro-title'),accent=document.createElement('em');accent.textContent=first;title.replaceChildren(accent);if(rest)title.append(document.createElement('br'),document.createTextNode(rest));$('.logo span').textContent=clean;document.title=`${clean}${adminMode?' 관리자':''} — 3D 전시장`;if($('#gallery-name'))$('#gallery-name').value=clean;if(persist)saveGalleryConfig()
}
function applyGalleryTheme(theme,persist=true){
  const selected=theme==='storybook'||theme==='white'?'storybook':'warm',t=scene.userData.theme;galleryConfig.theme=selected;document.body.dataset.galleryTheme=selected;
  if(selected==='storybook'){const panelPalette=[0xf0d3c2,0xe6d9ad,0xcbdcca,0xcad8e6,0xe5cbd7];scene.background.set(0xe3d2bb);scene.fog.color.set(0xe3d2bb);t.floor.color.set(0xffe5b5);t.floor.roughness=.9;t.ceiling.color.set(0xf7dfc3);t.facade.color.set(0xf2d1b8);t.canopy.visible=true;t.canopy.material.opacity=.3;t.decor.forEach(item=>item.visible=true);t.panels.forEach((m,i)=>m.color.set(panelPalette[i%panelPalette.length]));t.bases.forEach(m=>m.color.set(0x8c6241));scene.userData.frameSideMaterial.color.set(0x835535);renderer.toneMappingExposure=1.22}
  else{scene.background.set(0xf8eedf);scene.fog.color.set(0xf8eedf);t.floor.color.set(0xffffff);t.floor.roughness=.88;t.ceiling.color.set(0xfff4df);t.facade.color.set(0xffffff);t.canopy.visible=true;t.canopy.material.opacity=.46;t.decor.forEach(item=>item.visible=true);t.panels.forEach(m=>m.color.set(0xf1dfc3));t.bases.forEach(m=>m.color.set(0x9b6840));scene.userData.frameSideMaterial.color.set(0x8d5b34);renderer.toneMappingExposure=1.18}
  $$('[data-theme-choice]').forEach(button=>{const active=button.dataset.themeChoice===selected;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});if(renderer.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;if(persist)saveGalleryConfig()
}
function setFrameGeometry(group,presetName){
  const preset=FRAME_PRESETS[presetName]||FRAME_PRESETS.portrait,artW=Math.max(.54,preset.w-.18),artH=Math.max(.52,preset.h-.24),{frameBody,art,frame}=group.userData;
  frameBody.geometry.dispose();frameBody.geometry=new THREE.BoxGeometry(preset.w,preset.h,.16);art.geometry.dispose();art.geometry=new THREE.PlaneGeometry(artW,artH);frame.geometry.dispose();frame.geometry=new THREE.PlaneGeometry(preset.w+.02,preset.h+.02);group.userData.preset=presetName
}
function layoutZoneFrames(ci){
  const groups=zoneFrameGroups.get(ci)||[],gap=.24,width=g=>FRAME_PRESETS[g.userData.preset]?.w||1.06,total=groups.reduce((sum,g)=>sum+width(g),0)+gap*Math.max(0,groups.length-1),placeRow=(row,y)=>{const rowWidth=row.reduce((sum,g)=>sum+width(g),0)+gap*Math.max(0,row.length-1);let x=-rowWidth/2;row.forEach(g=>{const w=width(g);g.position.x=x+w/2;g.position.y=y;x+=w+gap})};
  if(total<=6.55)placeRow(groups,2.55);else{placeRow(groups.slice(0,3),2.86);placeRow(groups.slice(3),1.43)}
}
async function applyFramePreset(key,presetName,persist=true){
  const group=frameGroups.get(key);if(!group||!FRAME_PRESETS[presetName])return;galleryConfig.frames[key]=presetName;setFrameGeometry(group,presetName);layoutZoneFrames(group.userData.ci);const {ci,pi}=group.userData,art=group.userData.art,record=scanRecords.get(key);
  if(record){try{record.displayBlob=await createDisplayBlob(record.originalBlob,presetName);await putScanRecord(record);applyScanTexture(record)}catch(error){setScanStatus(error?.message||'액자용 이미지를 다시 만들지 못했어요.',true)}}else{art.material.map=makePoemPngTexture(ci,pi,presetName);art.material.needsUpdate=true}if(persist)saveGalleryConfig()
}
function makeTextTexture(title,sub,color,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.textAlign='center';x.fillStyle=color;x.font='76px Jua, sans-serif';x.fillText(title,w/2,105);
  x.fillStyle='#6a513d';x.font='28px Gowun Dodum, sans-serif';x.fillText(sub,w/2,164);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makePoemPngTexture(ci,pi,presetName='portrait'){
  const preset=FRAME_PRESETS[presetName]||FRAME_PRESETS.portrait,key=`${ci}-${pi}-${presetName}`;if(poemPngTextures.has(key))return poemPngTextures.get(key);const aspect=(preset.w-.18)/(preset.h-.24),c=document.createElement('canvas');c.width=640;c.height=Math.round(640/aspect);const x=c.getContext('2d'),d=children[ci],h=c.height,pad=Math.round(Math.min(c.width,h)*.085),landscape=aspect>1;
  x.fillStyle='#fffaf0';x.fillRect(0,0,c.width,h);x.fillStyle=d.color;x.fillRect(0,0,c.width,Math.max(18,h*.035));x.fillStyle='#777f91';x.font=`${Math.max(18,h*.032)}px Gowun Dodum, sans-serif`;x.fillText(d.name,pad,h*.12);x.fillStyle='#463426';x.font=`${Math.max(34,h*(landscape?.082:.058))}px Jua, sans-serif`;x.fillText(`작품 ${pi+1}`,pad,h*.24);x.strokeStyle='#e5dfd2';x.beginPath();x.moveTo(pad,h*.29);x.lineTo(c.width-pad,h*.29);x.stroke();x.font=`${Math.max(20,h*(landscape?.05:.036))}px Gowun Dodum, sans-serif`;x.fillStyle='#766b60';['작품 원본','준비 중'].forEach((line,i)=>x.fillText(line,pad,h*(.48+i*(landscape?.12:.085))));x.fillStyle='#a9a190';x.font=`${Math.max(16,h*.026)}px Gowun Dodum, sans-serif`;x.fillText(`${pi+1} / 5`,pad,h*.94);const png=c.toDataURL('image/png'),t=new THREE.TextureLoader().load(png);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),coarsePointer?2:4);t.userData={format:'image/png',source:'framed-artwork-png'};poemPngTextures.set(key,t);return t;
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
  [[-5.4,4.4,-1.4],[5.5,4.4,-2.7],[-2.3,4.4,6]].forEach((p,i)=>scene.userData.theme.decor.push(makePngSprite('assets/cotton-mobile.png',3.9,2.6,p,0,i*.9)));
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
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'){closePoem();closeIndex();if(adminMode)closeSettings();stopGuideVoice()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;dragging=true;dragMoved=false;dragMode=null;dragStartX=lastX=e.clientX;dragStartY=lastY=e.clientY;canvas.classList.add('is-dragging');canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive||!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY,totalX=e.clientX-dragStartX,totalY=e.clientY-dragStartY;if(Math.abs(totalX)+Math.abs(totalY)>7){dragMoved=true;if(!dragMode)dragMode=e.shiftKey||Math.abs(totalX)>=Math.abs(totalY)*.9?'look':'move'}if(dragMode==='move'){queueDirectionalMove(-dy*.022);canvas.classList.add('is-moving-drag')}else if(dragMode==='look'){yaw-=dx*.0042;pitch=THREE.MathUtils.clamp(pitch-dy*.003,PITCH_MIN,PITCH_MAX);camera.rotation.set(pitch,yaw,0)}lastX=e.clientX;lastY=e.clientY});
  const finishDrag=e=>{if(dragging&&!dragMoved&&e?.type==='pointerup')handleWorldClick(e.clientX,e.clientY);dragging=false;dragMode=null;canvas.classList.remove('is-dragging','is-moving-drag')};
  canvas.addEventListener('pointerleave',finishDrag);canvas.addEventListener('pointercancel',finishDrag);canvas.addEventListener('lostpointercapture',finishDrag);canvas.addEventListener('pointerup',finishDrag);
  canvas.addEventListener('wheel',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;e.preventDefault();if(e.shiftKey){pitch=THREE.MathUtils.clamp(pitch-e.deltaY*.00075,PITCH_MIN,PITCH_MAX);camera.rotation.x=pitch;return}const distance=THREE.MathUtils.clamp(-e.deltaY*.016,-2.4,2.4);if(Math.abs(distance)>.03)queueDirectionalMove(distance)},{passive:false});
  $('#enter').onclick=()=>{started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;startAmbientMusic();startEntrySequence()};
  $('#home').onclick=()=>{$('#intro').classList.remove('closed');$('#hud').hidden=true;$('#hud').classList.remove('cinematic');started=false;tourActive=false;entryActive=false;zoneTravelActive=false;hasDestination=false;resetEntrance();stopAmbientMusic();stopGuideVoice()};
  $('#music-toggle').onclick=()=>musicOn?stopAmbientMusic():startAmbientMusic();
  if($('#overview'))$('#overview').onclick=showOverview;$('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;if(adminMode){$('#settings-open').onclick=openSettings;$('#settings-close').onclick=closeSettings}
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
      else if(hasDestination){moveTarget.set(moveDestination.x-camera.position.x,0,moveDestination.z-camera.position.z);const distance=moveTarget.length();if(distance<.28){hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(0,0,0)}else{if(destinationTurnsView){const desiredYaw=Math.atan2(-moveTarget.x,-moveTarget.z);yaw=dampAngle(yaw,desiredYaw,1-Math.exp(-7*dt))}moveTarget.normalize().multiplyScalar(Math.min(7.2,Math.max(1.3,distance*2.7)))}}
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
function setMoveDestination(target,turnsView=true,showMarker=true){
  moveDestination.copy(target);moveDestination.y=0;constrainWalkPosition(moveDestination);destinationTurnsView=turnsView;hasDestination=true;moveVelocity.multiplyScalar(.35);const marker=scene.userData.clickMarker;marker.position.set(moveDestination.x,.018,moveDestination.z);marker.visible=showMarker
}
function queueDirectionalMove(distance){
  if(!Number.isFinite(distance)||Math.abs(distance)<.001)return;const direction=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),base=hasDestination&&!destinationTurnsView?moveDestination:camera.position,target=base.clone().addScaledVector(direction,distance);setMoveDestination(target,false,false)
}
function handleWorldClick(x,y){
  clickPoint.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);raycaster.setFromCamera(clickPoint,camera);
  const subject=raycaster.intersectObjects(frameMeshes,false)[0];if(subject){const d=subject.object.userData;if(d.type==='curator')speakCurator();else openPoem(d.child,d.poem);return}
  if(y>innerHeight*.72){queueDirectionalMove(-4.2);return}
  const floorHit=raycaster.intersectObject(scene.userData.floor,false)[0];
  if(floorHit)setMoveDestination(floorHit.point,true,true);else{const direction=raycaster.ray.direction.clone();direction.y=0;if(direction.lengthSq()<.01)return;direction.normalize();setMoveDestination(camera.position.clone().addScaledVector(direction,6),true,true)}
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
  selectedChild=ci;selectedPoem=pi;modalOpen=true;const c=children[ci];
  visited.add(`${ci}-${pi}`);localStorage.setItem('galleryVisited',JSON.stringify([...visited]));
  $('.poem-card').style.setProperty('--accent',c.color);$('#poem-child').textContent=c.name;$('#poem-number').textContent=`작품 ${pi+1} / 5`;
  $('#poem-title').textContent=`${c.name} 작품 ${pi+1} 원본`;showPoemScan(ci,pi);$('#poem-modal').classList.add('open');$('#poem-modal').setAttribute('aria-hidden','false');
  setTimeout(()=>$('.modal-close').focus(),250);
}
function closePoem(){modalOpen=false;$('#poem-modal').classList.remove('open');$('#poem-modal').setAttribute('aria-hidden','true');if(activeScanUrl){URL.revokeObjectURL(activeScanUrl);activeScanUrl=null}}
function movePoem(step){selectedPoem=(selectedPoem+step+5)%5;openPoem(selectedChild,selectedPoem)}
function openIndex(){modalOpen=true;$('#index-panel').classList.add('open');$('#index-panel').setAttribute('aria-hidden','false')}
function closeIndex(){modalOpen=false;$('#index-panel').classList.remove('open');$('#index-panel').setAttribute('aria-hidden','true')}
function openSettings(){if(!adminMode)return;closeIndex();closePoem();modalOpen=true;$('#settings-panel').classList.add('open');$('#settings-panel').setAttribute('aria-hidden','false');setTimeout(()=>$('#settings-close').focus(),220)}
function closeSettings(){if(!adminMode)return;modalOpen=false;$('#settings-panel').classList.remove('open');$('#settings-panel').setAttribute('aria-hidden','true')}
function getNaturalKoreanVoice(){
  if(!('speechSynthesis' in window))return null;const voices=speechSynthesis.getVoices(),korean=voices.filter(v=>/^ko([-_]|$)/i.test(v.lang));
  return korean.find(v=>/natural|premium|enhanced|yuna|sunhi|sora|heami|google/i.test(v.name))||null
}
function speakCurator(){
  if(!('speechSynthesis' in window)||guideUtterance||speechSynthesis.speaking)return;const voice=getNaturalKoreanVoice();if(!voice)return;
  moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;
  const line='반가워요. 이곳에는 어린이 작가들의 소중한 작품이 전시되어 있어요. 천천히 걸으며 마음에 드는 작품을 눌러 감상해 보세요.';
  guideUtterance=new SpeechSynthesisUtterance(line);guideUtterance.voice=voice;guideUtterance.lang='ko-KR';guideUtterance.rate=.88;guideUtterance.pitch=.96;guideUtterance.volume=.82;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.018,audioContext.currentTime+.35);const finish=()=>{guideUtterance=null;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.055,audioContext.currentTime+.8)};guideUtterance.onend=finish;guideUtterance.onerror=finish;speechSynthesis.speak(guideUtterance)
}
function stopGuideVoice(){if('speechSynthesis' in window)speechSynthesis.cancel();guideUtterance=null;if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.055,audioContext.currentTime+.4)}
function showPoemScan(ci,pi){
  const record=scanRecords.get(`${ci}-${pi}`),scan=$('#poem-scan'),empty=$('#poem-scan-empty');if(activeScanUrl){URL.revokeObjectURL(activeScanUrl);activeScanUrl=null}
  if(!record){scan.hidden=true;scan.removeAttribute('src');empty.hidden=false;return}
  activeScanUrl=URL.createObjectURL(record.originalBlob);scan.src=activeScanUrl;scan.alt=`${children[ci].name}의 ${pi+1}번째 작품 원본 스캔`;scan.hidden=false;empty.hidden=true
}
function buildSettings(){
  $('#gallery-name').value=galleryConfig.name;const applyName=()=>{applyGalleryName($('#gallery-name').value);setScanStatus('전시장 이름을 바꿨어요.')};$('#gallery-name-apply').onclick=applyName;$('#gallery-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyName()}};$$('[data-theme-choice]').forEach(button=>button.onclick=()=>{applyGalleryTheme(button.dataset.themeChoice);setScanStatus(`${button.querySelector('strong').textContent} 배경으로 바꿨어요.`)});
  const frameOptions=Object.entries(FRAME_PRESETS).map(([value,preset])=>`<option value="${value}">${preset.label}</option>`).join(''),root=$('#settings-list');children.forEach((child,ci)=>{const section=document.createElement('section');section.className='scan-child';section.innerHTML=`<h3><i style="--c:${child.color}"></i>${child.name}<span>작품 5점</span></h3><div class="scan-grid">${child.poems.map((_,pi)=>{const key=`${ci}-${pi}`,preset=galleryConfig.frames[key]||'portrait';return `<article class="scan-slot" data-scan-slot="${key}"><div><strong>작품 ${pi+1}</strong><span class="scan-file-name">원본 없음</span></div><label class="frame-field"><span>액자 형태</span><select data-frame-select="${key}">${frameOptions}</select></label><div class="scan-actions"><label>원본 선택<input type="file" accept="image/png,image/jpeg,image/webp" data-scan-input="${key}"></label><button type="button" data-scan-remove="${key}" hidden>삭제</button></div></article>`}).join('')}</div>`;root.append(section);child.poems.forEach((_,pi)=>{const key=`${ci}-${pi}`;root.querySelector(`[data-frame-select="${key}"]`).value=galleryConfig.frames[key]||'portrait'})});
  $$('[data-frame-select]').forEach(select=>select.onchange=async()=>{const key=select.dataset.frameSelect,preset=select.value;setScanStatus('액자 크기와 배치를 바꾸고 있어요.');await applyFramePreset(key,preset);setScanStatus(`${FRAME_PRESETS[preset].label} 액자로 바꿨어요.`)});
  $$('[data-scan-input]').forEach(input=>input.onchange=async()=>{const file=input.files?.[0],key=input.dataset.scanInput;input.value='';if(!file)return;const [ci,pi]=key.split('-').map(Number);try{setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 준비하고 있어요.`);const record=await createScanRecord(key,ci,pi,file);await putScanRecord(record);scanRecords.set(key,record);applyScanTexture(record);updateScanSlot(record);if(selectedChild===ci&&selectedPoem===pi&&$('#poem-modal').classList.contains('open'))showPoemScan(ci,pi);setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 저장했어요.`)}catch(error){setScanStatus(error?.message||'원본 파일을 저장하지 못했어요.',true)}});
  $$('[data-scan-remove]').forEach(button=>button.onclick=async()=>{const key=button.dataset.scanRemove,[ci,pi]=key.split('-').map(Number);try{await deleteScanRecord(key);scanRecords.delete(key);restorePlaceholderTexture(ci,pi);updateScanSlot({key,name:''});if(selectedChild===ci&&selectedPoem===pi&&$('#poem-modal').classList.contains('open'))showPoemScan(ci,pi);setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 삭제했어요.`)}catch{setScanStatus('원본을 삭제하지 못했어요.',true)}})
}
function setScanStatus(message,isError=false){const status=$('#scan-status');if(!status)return;status.textContent=message;status.classList.toggle('error',isError)}
function openScanDb(){
  if(scanDbPromise)return scanDbPromise;if(!('indexedDB' in window))return Promise.reject(new Error('이 브라우저에서는 원본 저장 기능을 사용할 수 없어요.'));
  scanDbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(SCAN_DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(SCAN_STORE))db.createObjectStore(SCAN_STORE,{keyPath:'key'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return scanDbPromise
}
function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function loadStoredScans(){
  try{const db=await openScanDb(),records=await requestResult(db.transaction(SCAN_STORE,'readonly').objectStore(SCAN_STORE).getAll());records.forEach(record=>{scanRecords.set(record.key,record);applyScanTexture(record);updateScanSlot(record)});setScanStatus(records.length?`저장된 원본 ${records.length}개를 불러왔어요.`:'아직 등록된 원본 스캔이 없어요.')}catch(error){setScanStatus(error?.message||'저장된 원본을 불러오지 못했어요.',true)}
}
async function putScanRecord(record){const db=await openScanDb();await requestResult(db.transaction(SCAN_STORE,'readwrite').objectStore(SCAN_STORE).put(record))}
async function deleteScanRecord(key){const db=await openScanDb();await requestResult(db.transaction(SCAN_STORE,'readwrite').objectStore(SCAN_STORE).delete(key))}
function loadFileImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('스캔 이미지를 읽을 수 없어요.'))};image.src=url})}
function canvasBlob(canvas,type='image/png'){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 이미지를 만들 수 없어요.')),type))}
async function createDisplayBlob(file,presetName='portrait'){
  const image=await loadFileImage(file),preset=FRAME_PRESETS[presetName]||FRAME_PRESETS.portrait,aspect=(preset.w-.18)/(preset.h-.24),canvas=document.createElement('canvas');canvas.width=900;canvas.height=Math.round(canvas.width/aspect);const ctx=canvas.getContext('2d');ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,canvas.width,canvas.height);const margin=Math.round(Math.min(canvas.width,canvas.height)*.045),scale=Math.min((canvas.width-margin*2)/image.naturalWidth,(canvas.height-margin*2)/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);return canvasBlob(canvas)
}
async function createScanRecord(key,ci,pi,file){
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error('PNG, JPG 또는 WEBP 스캔 이미지를 선택해 주세요.');if(file.size>25*1024*1024)throw new Error('스캔 파일은 한 장당 25MB 이하로 넣어 주세요.');
  const image=await loadFileImage(file),displayBlob=await createDisplayBlob(file,galleryConfig.frames[key]||'portrait');return{key,ci,pi,name:file.name,originalBlob:file,displayBlob,width:image.naturalWidth,height:image.naturalHeight,updatedAt:Date.now()}
}
function applyScanTexture(record){
  const mesh=poemArtMeshes.get(record.key);if(!mesh)return;const url=URL.createObjectURL(record.displayBlob),texture=new THREE.TextureLoader().load(url,()=>URL.revokeObjectURL(url));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),coarsePointer?2:4);texture.userData={format:'image/png',source:'original-scan-display'};mesh.material.map=texture;mesh.material.needsUpdate=true
}
function restorePlaceholderTexture(ci,pi){const key=`${ci}-${pi}`,mesh=poemArtMeshes.get(key);if(!mesh)return;mesh.material.map=makePoemPngTexture(ci,pi,galleryConfig.frames[key]||'portrait');mesh.material.needsUpdate=true}
function updateScanSlot(record){const slot=$(`[data-scan-slot="${record.key}"]`);if(!slot)return;const hasFile=!!record.name;slot.classList.toggle('filled',hasFile);slot.querySelector('.scan-file-name').textContent=hasFile?record.name:'원본 없음';slot.querySelector('[data-scan-remove]').hidden=!hasFile}
function buildIndex(){
  const root=$('#index-list');
  children.forEach((c,ci)=>{
    const el=document.createElement('div');el.className='index-child';
    el.innerHTML=`<div class="index-child-row"><button class="index-child-go" type="button" aria-label="${c.name} 전시공간으로 이동"><i style="--c:${c.color}"></i><strong>${c.name}</strong></button><button class="index-child-toggle" type="button" aria-label="${c.name}의 작품 5점 펼치기" aria-expanded="false">작품 5점</button></div><div class="index-poems">${c.poems.map((_,pi)=>`<button type="button" data-ci="${ci}" data-pi="${pi}">작품 ${pi+1}</button>`).join('')}</div>`;
    const go=el.querySelector('.index-child-go'),toggle=el.querySelector('.index-child-toggle');go.onclick=()=>goToChildZone(ci);toggle.onclick=()=>{const open=el.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${c.name}의 작품 5점 ${open?'접기':'펼치기'}`)};root.append(el);
  });
  $$('[data-ci]').forEach(b=>b.onclick=()=>{closeIndex();openPoem(+b.dataset.ci,+b.dataset.pi)});
}
init();
