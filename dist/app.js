import * as THREE from './vendor/three.module.min.js';

const COLORS=['#ffd464','#82d8c5','#ff8f85','#a99aff','#82bff5','#ffb465','#ec90cc','#94dc84','#7dd1df','#f09c9c','#c6d98f','#cbb6ef'];
const POEMS_PER_CHILD=5;
const DEFAULT_CHILD_COUNT=10;
const CHILD_COUNT_MIN=1,CHILD_COUNT_MAX=12,CHILD_COUNT_SCHEMA=4;
const GENERATED_CHILD_NAME_PATTERN=/^어린이\s*0?\d{1,2}$/;
function normalizeChildCount(config,fallback=DEFAULT_CHILD_COUNT){const value=Number(config?.childCount);return Number(config?.childCountSchema)===CHILD_COUNT_SCHEMA&&Number.isInteger(value)?Math.min(CHILD_COUNT_MAX,Math.max(CHILD_COUNT_MIN,value)):fallback}
function readStoredChildCount(){try{return normalizeChildCount(JSON.parse(localStorage.getItem('galleryConfig')||'{}'))}catch{return DEFAULT_CHILD_COUNT}}
function defaultChildName(){return'어린이 작가'}
function sanitizeChildName(value,index){const clean=typeof value==='string'?value.trim():'';return clean&&!GENERATED_CHILD_NAME_PATTERN.test(clean)?clean.slice(0,20):defaultChildName(index)}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function readStoredChildName(index){try{return sanitizeChildName(JSON.parse(localStorage.getItem('galleryConfig')||'{}').childNames?.[index],index)}catch{return defaultChildName(index)}}
function isValidFrameKey(key){const [childIndex,poemIndex,...extra]=String(key).split('-').map(Number);return extra.length===0&&Number.isInteger(childIndex)&&Number.isInteger(poemIndex)&&childIndex>=0&&childIndex<CHILD_COUNT_MAX&&poemIndex>=0&&poemIndex<POEMS_PER_CHILD}
const children=Array.from({length:readStoredChildCount()},(_,i)=>({id:i+1,name:readStoredChildName(i),color:COLORS[i],poems:Array.from({length:POEMS_PER_CHILD},(_,j)=>({title:`작품 ${j+1}`}))}));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const adminMode=document.body.dataset.admin==='true';
const ADMIN_CREDENTIAL_KEY='sunnyPoemAdminCredential',ADMIN_SESSION_KEY='sunnyPoemAdminSession',ADMIN_RESUME_KEY='sunnyPoemAdminResume';
const CHEER_STORAGE_KEY='sunnyPoemCheers',CHEER_MAX_LENGTH=100;
const CHEER_NOTE_COLORS=['#fff1a8','#ffd8d2','#d9f0d0','#d9e8ff','#eadcff'];
const CHEER_BOARD_WIDTH=5.05,CHEER_BOARD_HEIGHT=1.08;
const ARTWORK_INTERACTION_DISTANCE=10,ARTWORK_FRONT_DISTANCE=3.55,ARTWORK_FRONT_FOV=58;
const canvas=$('#gallery-canvas');
let scene,camera,renderer,clock,raycaster,frameMeshes=[],navigationMeshes=[],yaw=0,pitch=0,started=false,modalOpen=false,overviewMode=false;
let selectedChild=0,selectedPoem=0,dragging=false,dragMoved=false,dragMode=null,dragStartX=0,dragStartY=0,lastX=0,lastY=0,keys={},pointerMoveActive=false,curatorPointerIdle=false;
let tourActive=false,tourElapsed=0,tourStartedAt=0,entryActive=false,entryElapsed=0,entryStartedAt=0,hasDestination=false,zoneTravelActive=false,zoneTravelElapsed=0;
let activeChildZone=-1,lastFocusedArtwork=null;
let destinationTurnsView=true;
let artworkViewRestore=null;
let audioContext,audioMaster,musicTimer,musicStep=0,musicOn=true;
let guideAudioPending=false,guidePlayed=false,guideAudioPrimed=false,guideRetryBound=false,guideAudioReadyPromise=null,guideAudioDecodePromise=null,guideAudioBuffer=null,guideAudioSource=null,contactShadowTexture=null;
const guideAudioElement=$('#curator-guide-audio');
let entryPortalOpenTimer=null,entryPortalHideTimer=null;
let tourUiUpdatedAt=0,tourFrameCount=0,tourFrameStartedAt=0;
const coarsePointer=matchMedia('(pointer:coarse)').matches||innerWidth<800,reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches,moveVelocity=new THREE.Vector3(),moveTarget=new THREE.Vector3(),moveDestination=new THREE.Vector3(),curatorTarget=new THREE.Vector3(),curatorLastCameraPosition=new THREE.Vector3(),curatorCameraDelta=new THREE.Vector3(),curatorMotionVector=new THREE.Vector3(),curatorPositionDelta=new THREE.Vector3(),clickPoint=new THREE.Vector2();
const cameraPos=new THREE.Vector3(0,1.65,11.2);
const zoneTravelStart=new THREE.Vector3(),zoneTravelEnd=new THREE.Vector3();
const TOUR_DURATION=10;
const MUSIC_VOLUME=.042;
const BASE_PIXEL_RATIO=Math.min(devicePixelRatio,coarsePointer?1:1.25);
const TOUR_PIXEL_RATIO=Math.min(devicePixelRatio,coarsePointer?.58:.68);
const TOUR_UI_INTERVAL=120;
const ENTRY_DURATION=6.1;
const DOOR_OPEN_START=.08,DOOR_OPEN_END=.5,ENTRY_WALK_START=.46;
const DOOR_OPEN_ANGLE=Math.PI*.495;
const ZONE_TRAVEL_DURATION=1.55;
const CURATOR_DIRECTION_DAMPING=3.2;
const CURATOR_TURN_CONFIRM=coarsePointer?.28:.24;
const CURATOR_TURN_INTERVAL=coarsePointer?.52:.46;
const CURATOR_IDLE_RETURN_DELAY=.85;
const PITCH_MIN=-.24,PITCH_MAX=.42;
const MANUAL_MOVE_SPEED=4.4,CLICK_MOVE_MAX_SPEED=3.8,CLICK_STOP_RADIUS=.12,DRAG_THRESHOLD=coarsePointer?14:10;
let zoneTravelStartAngle=0,zoneTravelAngleDelta=0,zoneTravelStartRadius=0,zoneTravelEndRadius=0,zoneTravelStartYaw=0,zoneTravelEndYaw=0,zoneTravelChild=0;
const WALK_BOUNDS={minX:-11.55,maxX:11.55,minZ:-9.7,maxZ:10};
const SAFE_ZONES=[];
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),groundHitPoint=new THREE.Vector3();
const BACK_ZONE_SLOTS=[{x:-10.05,z:-13.15,ry:0},{x:-3.35,z:-13.15,ry:0},{x:3.35,z:-13.15,ry:0},{x:10.05,z:-13.15,ry:0}];
const LEFT_ZONE_SLOTS=[{x:-15,z:-10.05,ry:Math.PI/2},{x:-15,z:-3.35,ry:Math.PI/2},{x:-15,z:3.35,ry:Math.PI/2},{x:-15,z:10.05,ry:Math.PI/2}];
const RIGHT_ZONE_SLOTS=[{x:15,z:-10.05,ry:-Math.PI/2},{x:15,z:-3.35,ry:-Math.PI/2},{x:15,z:3.35,ry:-Math.PI/2},{x:15,z:10.05,ry:-Math.PI/2}];
function selectBalancedSlots(slots,count){if(count<=0)return[];if(count>=slots.length)return slots.slice(0,count);const centerIndex=(slots.length-1)/2,startIndex=centerIndex-(count-1)/2;return Array.from({length:count},(_,i)=>{const index=startIndex+i,lower=Math.floor(index),upper=Math.ceil(index),mix=index-lower,a=slots[lower],b=slots[upper];return{x:THREE.MathUtils.lerp(a.x,b.x,mix),z:THREE.MathUtils.lerp(a.z,b.z,mix),ry:THREE.MathUtils.lerp(a.ry,b.ry,mix)}})}
function createZoneLayout(count){const backCount=Math.min(4,Math.ceil(count/3)),remaining=count-backCount,leftCount=Math.ceil(remaining/2),rightCount=Math.floor(remaining/2);return[...selectBalancedSlots(BACK_ZONE_SLOTS,backCount),...selectBalancedSlots(LEFT_ZONE_SLOTS,leftCount),...selectBalancedSlots(RIGHT_ZONE_SLOTS,rightCount)]}
const ZONE_LAYOUT=createZoneLayout(children.length);
const visited=new Set(JSON.parse(localStorage.getItem('galleryVisited')||'[]'));
const poemPngTextures=new Map();
const poemArtMeshes=new Map(),frameGroups=new Map(),messageCardMeshes=new Map(),zoneFrameGroups=new Map(),zoneCheerBoardMeshes=new Map(),scanRecords=new Map();
const SCAN_DB_NAME='sunny-poem-original-scans',SCAN_STORE='scans';
let scanDbPromise=null,activeScanUrl=null;
const FRAME_PRESETS={
  'portrait-small':{label:'세로 소형',w:.8,h:1.18},portrait:{label:'세로 기본',w:1.06,h:1.62},'portrait-large':{label:'세로 대형',w:1.28,h:1.86},
  'landscape-small':{label:'가로 소형',w:1.16,h:.78},landscape:{label:'가로 기본',w:1.48,h:1},'landscape-large':{label:'가로 대형',w:1.78,h:1.18}
};
const DEFAULT_GALLERY_CONFIG={name:'햇살 동시 마루',theme:'warm',childCount:DEFAULT_CHILD_COUNT,childCountSchema:CHILD_COUNT_SCHEMA,childNames:[],frames:{}};
let galleryConfig=loadGalleryConfig();

async function init(){
  if(adminMode&&!(await initAdminAuth()))return;
  THREE.Cache.enabled=true;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf8eedf);
  scene.fog=new THREE.FogExp2(0xf8eedf,.009);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,100);
  camera.position.copy(cameraPos);camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(BASE_PIXEL_RATIO);renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  buildGallery();bind();buildIndex();if(adminMode)buildSettings();refreshCheerCards();validateGalleryIntegrity();validateMovementIntegrity();bindGuideAudioEvents();preloadGuideAudio().catch(()=>{});applyGalleryName(galleryConfig.name,false);applyGalleryTheme(galleryConfig.theme,false);loadStoredScans();if(adminMode&&sessionStorage.getItem(ADMIN_RESUME_KEY)==='gallery')resumeAdminGallery();if(renderer.shadowMap.enabled){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true}animate();
  setTimeout(()=>$('#loading').classList.add('done'),450);
}

function bytesToBase64(bytes){let binary='';bytes.forEach(value=>binary+=String.fromCharCode(value));return btoa(binary)}
function base64ToBytes(value){const binary=atob(value);return Uint8Array.from(binary,char=>char.charCodeAt(0))}
function getAdminCredential(){try{const credential=JSON.parse(localStorage.getItem(ADMIN_CREDENTIAL_KEY)||'null');return credential?.salt&&credential?.hash?credential:null}catch{return null}}
async function deriveAdminHash(password,salt,iterations=120000){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']),bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(salt),iterations},material,256);return bytesToBase64(new Uint8Array(bits))}
async function createAdminCredential(password){const saltBytes=crypto.getRandomValues(new Uint8Array(16)),salt=bytesToBase64(saltBytes),iterations=120000,hash=await deriveAdminHash(password,salt,iterations);return{version:1,salt,hash,iterations}}
async function verifyAdminPassword(password,credential=getAdminCredential()){if(!credential)return false;try{return await deriveAdminHash(password,credential.salt,credential.iterations)===credential.hash}catch{return false}}
async function initAdminAuth(){
  const gate=$('#admin-auth-gate'),form=$('#admin-auth-form'),password=$('#admin-auth-password'),confirmWrap=$('#admin-auth-confirm-wrap'),confirm=$('#admin-auth-confirm'),title=$('#admin-auth-title'),description=$('#admin-auth-description'),submit=$('#admin-auth-submit'),error=$('#admin-auth-error'),credential=getAdminCredential();
  if(credential&&sessionStorage.getItem(ADMIN_SESSION_KEY)===credential.hash){gate.classList.add('unlocked');return true}
  const setup=!credential;title.textContent=setup?'관리자 비밀번호 설정':'관리자 비밀번호 입력';description.textContent=setup?'처음 사용할 관리자 비밀번호를 직접 설정하세요. 비밀번호는 이 브라우저에 암호화된 해시로 저장됩니다.':'설정한 비밀번호를 입력하면 관리자 모드로 들어갑니다.';confirmWrap.hidden=!setup;confirm.required=setup;password.autocomplete=setup?'new-password':'current-password';submit.textContent=setup?'비밀번호 설정하고 들어가기':'관리자 모드 들어가기';
  setTimeout(()=>password.focus(),120);
  return new Promise(resolve=>{form.onsubmit=async event=>{event.preventDefault();error.textContent='';const value=password.value;if(value.length<6){error.textContent='비밀번호를 6자 이상 입력해 주세요.';password.focus();return}if(setup&&value!==confirm.value){error.textContent='비밀번호 확인이 일치하지 않습니다.';confirm.focus();return}submit.disabled=true;submit.textContent=setup?'비밀번호 설정 중':'확인 중';try{const activeCredential=setup?await createAdminCredential(value):credential,valid=setup||await verifyAdminPassword(value,activeCredential);if(!valid){error.textContent='비밀번호가 맞지 않습니다.';password.select();return}if(setup)localStorage.setItem(ADMIN_CREDENTIAL_KEY,JSON.stringify(activeCredential));sessionStorage.setItem(ADMIN_SESSION_KEY,activeCredential.hash);gate.classList.add('unlocked');resolve(true)}catch{error.textContent='비밀번호를 확인하지 못했습니다. 다시 시도해 주세요.'}finally{submit.disabled=false;submit.textContent=setup?'비밀번호 설정하고 들어가기':'관리자 모드 들어가기'}}})
}

function resumeAdminGallery(){
  sessionStorage.removeItem(ADMIN_RESUME_KEY);started=true;modalOpen=false;entryActive=false;tourActive=false;zoneTravelActive=false;hasDestination=false;hideEntryPortal(true);$('#intro').classList.add('closed');$('#hud').hidden=false;$('#hud').classList.remove('cinematic');showOverview();document.body.dataset.adminResume='gallery';setScanStatus('전체 설정을 저장했습니다. 관리자 전시장으로 돌아왔어요.')
}
function endAdminSession(){
  if(!adminMode)return;sessionStorage.removeItem(ADMIN_SESSION_KEY);sessionStorage.removeItem(ADMIN_RESUME_KEY);location.replace('/admin/')
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
  for(let i=0;i<children.length;i++)buildZone(i);
  buildCurator();buildWarmLights();buildCozyDetails();
}
function buildEntrance(){
  const loader=new THREE.TextureLoader(),facadeMap=loader.load('assets/entrance-facade-2d.png'),gardenMap=loader.load('assets/garden-view-2d.png');[facadeMap,gardenMap].forEach(t=>t.colorSpace=THREE.SRGBColorSpace);
  const deck=new THREE.Mesh(new THREE.PlaneGeometry(7.6,6.2),new THREE.MeshStandardMaterial({map:scene.userData.floorTexture,color:0xffffff,roughness:.88}));deck.rotation.x=-Math.PI/2;deck.position.set(0,-.005,15.75);deck.receiveShadow=true;scene.add(deck);
  const gardenBackdrop=new THREE.Mesh(new THREE.PlaneGeometry(22,9.6),new THREE.MeshBasicMaterial({map:gardenMap,side:THREE.DoubleSide}));gardenBackdrop.position.set(0,4.3,21);scene.add(gardenBackdrop);
  const wallMaterial=new THREE.MeshStandardMaterial({map:scene.userData.cottonTexture,color:0xfff3df,roughness:.96,side:THREE.DoubleSide}),baseMaterial=new THREE.MeshStandardMaterial({color:0xc99662,roughness:.88}),trimMaterial=new THREE.MeshStandardMaterial({color:0xe0b77f,roughness:.76});
  const wallParts=[];const addWall=(geometry,x,y,z,material=wallMaterial)=>{const wall=new THREE.Mesh(geometry,material);wall.position.set(x,y,z);wall.receiveShadow=true;scene.add(wall);wallParts.push(wall);return wall};
  addWall(new THREE.BoxGeometry(12.62,5.7,.34),-8.83,2.85,13.22);addWall(new THREE.BoxGeometry(12.62,5.7,.34),8.83,2.85,13.22);addWall(new THREE.BoxGeometry(5.42,.98,.34),0,5.21,13.22);
  addWall(new THREE.BoxGeometry(.34,5.7,3.7),-2.68,2.85,15.05);addWall(new THREE.BoxGeometry(.34,5.7,3.7),2.68,2.85,15.05);addWall(new THREE.BoxGeometry(5.7,.24,3.7),0,5.58,15.05);
  addWall(new THREE.BoxGeometry(.12,1.02,3.7),-2.49,.52,15.05,baseMaterial);addWall(new THREE.BoxGeometry(.12,1.02,3.7),2.49,.52,15.05,baseMaterial);
  addWall(new THREE.BoxGeometry(.24,4.88,.48),-2.64,2.44,13.32,trimMaterial);addWall(new THREE.BoxGeometry(.24,4.88,.48),2.64,2.44,13.32,trimMaterial);addWall(new THREE.BoxGeometry(5.52,.24,.48),0,4.82,13.32,trimMaterial);
  const facade=new THREE.Mesh(new THREE.PlaneGeometry(30.4,5.7),new THREE.MeshBasicMaterial({map:facadeMap,color:0xffffff,transparent:true,alphaTest:.025,side:THREE.DoubleSide}));facade.position.set(0,2.85,13.41);facade.renderOrder=2;scene.add(facade);scene.userData.entranceFacade=facade;scene.userData.theme.facade=facade.material;scene.userData.entranceWalls=wallParts;
  [-9.6,9.6].forEach(x=>{const lightPatch=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.2),new THREE.MeshBasicMaterial({color:0xffe2aa,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));lightPatch.rotation.x=-Math.PI/2;lightPatch.position.set(x,.03,9.7);scene.add(lightPatch)});
  const doorEdgeMaterial=new THREE.MeshStandardMaterial({color:0xb77d43,roughness:.72,metalness:0});
  const leaves=[];[-1,1].forEach(side=>{const map=loader.load('assets/door-leaf-2d.png');map.colorSpace=THREE.SRGBColorSpace;if(side<0){map.wrapS=THREE.RepeatWrapping;map.repeat.x=-1;map.offset.x=1}const pivot=new THREE.Group();pivot.position.set(side*2.52,0,13.12);const panel=new THREE.Mesh(new THREE.PlaneGeometry(2.52,4.72),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.035,side:THREE.DoubleSide}));panel.position.set(-side*1.26,2.36,.071);panel.renderOrder=3;const edgeX=-side*1.26;[[.1,4.62,.14,edgeX-side*1.21,2.36,0],[.1,4.62,.14,edgeX+side*1.21,2.36,0],[2.42,.1,.14,edgeX,4.67,0],[2.42,.1,.14,edgeX,.05,0]].forEach(([w,h,d,x,y,z])=>{const edge=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),doorEdgeMaterial);edge.position.set(x,y,z);pivot.add(edge)});pivot.add(panel);scene.add(pivot);leaves.push(pivot)});scene.userData.doors=leaves;
}
function buildZone(ci){
  const layout=ZONE_LAYOUT[ci],c=children[ci],zone=new THREE.Group();zone.position.set(layout.x,0,layout.z);zone.rotation.y=layout.ry;scene.add(zone);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(6.55,5,.28),new THREE.MeshStandardMaterial({color:0xf1dfc3,roughness:.9}));panel.position.y=2.55;panel.receiveShadow=true;zone.add(panel);
  const wood=new THREE.Mesh(new THREE.BoxGeometry(6.57,1.02,.32),new THREE.MeshStandardMaterial({color:0x9b6840,roughness:.85}));wood.position.y=.53;zone.add(wood);
  const navigationTarget=zoneLocalToWorld(layout,0,3.65);panel.userData={type:'navigation',target:navigationTarget};wood.userData={type:'navigation',target:navigationTarget};navigationMeshes.push(panel,wood);
  scene.userData.theme.panels.push(panel.material);scene.userData.theme.bases.push(wood.material);
  const header=new THREE.Mesh(new THREE.PlaneGeometry(5.35,1.4),new THREE.MeshBasicMaterial({map:makeTextTexture(c.name,c.color,2048,512),transparent:true,toneMapped:false,depthWrite:false}));header.renderOrder=4;
  header.position.set(0,4.18,.19);zone.add(header);
  const accent=new THREE.Mesh(new THREE.BoxGeometry(6.05,.07,.08),new THREE.MeshBasicMaterial({color:c.color}));accent.position.set(0,3.58,.18);zone.add(accent);
  const groups=[];c.poems.forEach((p,pi)=>{
    const key=`${ci}-${pi}`,preset=galleryConfig.frames[key]||'portrait',framedArt=new THREE.Group();framedArt.position.z=.22;
    const frameBody=new THREE.Mesh(new THREE.BoxGeometry(1,1,.16),scene.userData.frameSideMaterial);frameBody.castShadow=renderer.shadowMap.enabled;framedArt.add(frameBody);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:makePoemPngTexture(ci,pi,preset),roughness:.48,emissive:new THREE.Color(c.color),emissiveIntensity:.045,side:THREE.DoubleSide}));art.position.z=.086;art.userData={type:'poem',child:ci,poem:pi};frameMeshes.push(art);poemArtMeshes.set(key,art);framedArt.add(art);
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:scene.userData.frameTexture,transparent:true,alphaTest:.035,depthWrite:false,toneMapped:true,side:THREE.DoubleSide}));frame.position.z=.098;frame.renderOrder=2;framedArt.add(frame);
    const messageCard=new THREE.Mesh(new THREE.PlaneGeometry(1,.36),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));messageCard.position.z=.11;messageCard.renderOrder=3;messageCard.visible=false;messageCard.userData={type:'poem',child:ci,poem:pi,cheerCard:true};framedArt.add(messageCard);frameMeshes.push(messageCard);messageCardMeshes.set(key,messageCard);
    framedArt.userData={key,ci,pi,preset,frameBody,art,frame,messageCard};frameGroups.set(key,framedArt);groups.push(framedArt);zone.add(framedArt);setFrameGeometry(framedArt,preset);
  });zoneFrameGroups.set(ci,groups);layoutZoneFrames(ci);
  const cheerBoardTexture=makeChildCheerBoardTexture(ci,[]);cheerBoardTexture.userData.cheerBoard=true;const cheerBoardHeight=cheerBoardTexture.userData.boardHeight;const cheerBoard=new THREE.Mesh(new THREE.PlaneGeometry(CHEER_BOARD_WIDTH,cheerBoardHeight),new THREE.MeshBasicMaterial({map:cheerBoardTexture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));cheerBoard.position.set(0,cheerBoardHeight/2+.04,.19);cheerBoard.renderOrder=3;cheerBoard.userData={type:'cheer-board',child:ci};zone.add(cheerBoard);zoneCheerBoardMeshes.set(ci,cheerBoard);
  const plantPos=zoneLocalToWorld(layout,3.35,.34);buildPlant(plantPos.x,plantPos.z);
}

function zoneLocalToWorld(layout,x,z){return new THREE.Vector3(layout.x+Math.cos(layout.ry)*x+Math.sin(layout.ry)*z,0,layout.z-Math.sin(layout.ry)*x+Math.cos(layout.ry)*z)}
function loadGalleryConfig(){try{const saved=JSON.parse(localStorage.getItem('galleryConfig')||'{}'),frames=saved.frames&&typeof saved.frames==='object'?Object.fromEntries(Object.entries(saved.frames).filter(([key,value])=>isValidFrameKey(key)&&FRAME_PRESETS[value])):{},theme=saved.theme==='white'?'storybook':saved.theme,savedName=typeof saved.name==='string'?saved.name.trim().slice(0,30):'',childCount=normalizeChildCount(saved,DEFAULT_GALLERY_CONFIG.childCount),childNames=Array.from({length:childCount},(_,index)=>sanitizeChildName(saved.childNames?.[index],index));return{name:savedName&&savedName!=='우리들의 미술관'?savedName:DEFAULT_GALLERY_CONFIG.name,theme:['warm','storybook'].includes(theme)?theme:'warm',childCount,childCountSchema:CHILD_COUNT_SCHEMA,childNames,frames}}catch{return{...DEFAULT_GALLERY_CONFIG,childNames:Array.from({length:DEFAULT_CHILD_COUNT},(_,index)=>defaultChildName(index)),frames:{}}}}
function saveGalleryConfig(){localStorage.setItem('galleryConfig',JSON.stringify(galleryConfig))}
function applyGalleryName(name,persist=true){
  const clean=(name||DEFAULT_GALLERY_CONFIG.name).trim().slice(0,30)||DEFAULT_GALLERY_CONFIG.name,parts=clean.split(/\s+/),first=parts.shift(),rest=parts.join(' ');galleryConfig.name=clean;
  const title=$('#intro-title'),accent=document.createElement('em'),browserTitle=`${clean}${adminMode?' 관리자':''} — 어린이 창작 온라인 전시`,shareTitle=`${clean} — 어린이 창작 온라인 전시`;accent.textContent=first;title.replaceChildren(accent);if(rest)title.append(document.createElement('br'),document.createTextNode(rest));$('.logo span').textContent=clean;$('.logo').setAttribute('aria-label',`${clean} 입구로 돌아가기`);document.title=browserTitle;document.querySelector('meta[property="og:site_name"]')?.setAttribute('content',clean);document.querySelector('meta[property="og:title"]')?.setAttribute('content',shareTitle);document.querySelector('meta[name="twitter:title"]')?.setAttribute('content',shareTitle);if($('#gallery-name'))$('#gallery-name').value=clean;if(persist)saveGalleryConfig()
}
function applyGalleryTheme(theme,persist=true){
  const selected=theme==='storybook'||theme==='white'?'storybook':'warm',t=scene.userData.theme;galleryConfig.theme=selected;document.body.dataset.galleryTheme=selected;
  if(selected==='storybook'){const panelPalette=[0xf0d3c2,0xe6d9ad,0xcbdcca,0xcad8e6,0xe5cbd7];scene.background.set(0xe3d2bb);scene.fog.color.set(0xe3d2bb);t.floor.color.set(0xffe5b5);t.floor.roughness=.9;t.ceiling.color.set(0xf7dfc3);t.facade.color.set(0xf2d1b8);t.canopy.visible=true;t.canopy.material.opacity=.3;t.decor.forEach(item=>item.visible=true);t.panels.forEach((m,i)=>m.color.set(panelPalette[i%panelPalette.length]));t.bases.forEach(m=>m.color.set(0x8c6241));scene.userData.frameSideMaterial.color.set(0x835535);renderer.toneMappingExposure=1.22}
  else{scene.background.set(0xf8eedf);scene.fog.color.set(0xf8eedf);t.floor.color.set(0xffffff);t.floor.roughness=.88;t.ceiling.color.set(0xfff4df);t.facade.color.set(0xffffff);t.canopy.visible=true;t.canopy.material.opacity=.46;t.decor.forEach(item=>item.visible=true);t.panels.forEach(m=>m.color.set(0xf1dfc3));t.bases.forEach(m=>m.color.set(0x9b6840));scene.userData.frameSideMaterial.color.set(0x8d5b34);renderer.toneMappingExposure=1.18}
  $$('[data-theme-choice]').forEach(button=>{const active=button.dataset.themeChoice===selected;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});if(renderer.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;if(persist)saveGalleryConfig()
}
function setFrameGeometry(group,presetName){
  const preset=FRAME_PRESETS[presetName]||FRAME_PRESETS.portrait,artW=Math.max(.54,preset.w-.18),artH=Math.max(.52,preset.h-.24),{frameBody,art,frame,messageCard}=group.userData;
  frameBody.geometry.dispose();frameBody.geometry=new THREE.BoxGeometry(preset.w,preset.h,.16);art.geometry.dispose();art.geometry=new THREE.PlaneGeometry(artW,artH);frame.geometry.dispose();frame.geometry=new THREE.PlaneGeometry(preset.w+.02,preset.h+.02);if(messageCard){messageCard.geometry.dispose();messageCard.geometry=new THREE.PlaneGeometry(Math.min(1.02,Math.max(.72,preset.w-.08)),.38);messageCard.position.y=-preset.h/2-.27}group.userData.preset=presetName
}
function layoutZoneFrames(ci){
  const groups=zoneFrameGroups.get(ci)||[],gap=.12,width=g=>FRAME_PRESETS[g.userData.preset]?.w||1.06,total=groups.reduce((sum,g)=>sum+width(g),0)+gap*Math.max(0,groups.length-1),placeRow=(row,y)=>{const rowWidth=row.reduce((sum,g)=>sum+width(g),0)+gap*Math.max(0,row.length-1);let x=-rowWidth/2;row.forEach(g=>{const w=width(g);g.position.x=x+w/2;g.position.y=y;x+=w+gap})};
  if(total<=6.05)placeRow(groups,2.55);else{placeRow(groups.slice(0,3),2.86);placeRow(groups.slice(3),1.43)}
}
async function applyFramePreset(key,presetName,persist=true){
  const group=frameGroups.get(key);if(!group||!FRAME_PRESETS[presetName])return;galleryConfig.frames[key]=presetName;setFrameGeometry(group,presetName);layoutZoneFrames(group.userData.ci);const {ci,pi}=group.userData,art=group.userData.art,record=scanRecords.get(key);
  if(record){try{record.displayBlob=await createDisplayBlob(record.originalBlob,presetName);await putScanRecord(record);applyScanTexture(record)}catch(error){setScanStatus(error?.message||'액자용 이미지를 다시 만들지 못했어요.',true)}}else{art.material.map=makePoemPngTexture(ci,pi,presetName);art.material.needsUpdate=true}if(persist)saveGalleryConfig()
}
function makeTextTexture(title,color,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.shadowColor='#4b302e35';x.shadowBlur=34;x.shadowOffsetY=15;roundedRect(x,118,62,w-236,h-124,72);x.fillStyle='#fffaf0f5';x.fill();x.shadowColor='transparent';x.lineWidth=16;x.strokeStyle=color;x.stroke();
  const length=Array.from(title).length,fontSize=length>8?154:length>6?184:length>4?220:270;x.textAlign='center';x.textBaseline='middle';x.font=`${fontSize}px Jua, sans-serif`;while(x.measureText(title).width>w-390){const size=parseFloat(x.font)-8;if(size<=132)break;x.font=`${size}px Jua, sans-serif`}x.lineJoin='round';x.lineWidth=20;x.strokeStyle='#fffdf8';x.strokeText(title,w/2,h/2+5);x.lineWidth=7;x.strokeStyle='#493326';x.strokeText(title,w/2,h/2+5);x.fillStyle='#493326';x.fillText(title,w/2,h/2+5);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
function makePoemPngTexture(ci,pi,presetName='portrait'){
  const preset=FRAME_PRESETS[presetName]||FRAME_PRESETS.portrait,key=`${ci}-${pi}-${presetName}`;if(poemPngTextures.has(key))return poemPngTextures.get(key);const aspect=(preset.w-.18)/(preset.h-.24),c=document.createElement('canvas'),textureWidth=coarsePointer?320:448;c.width=textureWidth;c.height=Math.round(textureWidth/aspect);const x=c.getContext('2d'),d=children[ci],h=c.height,pad=Math.round(Math.min(c.width,h)*.085),landscape=aspect>1;
  x.fillStyle='#fffaf0';x.fillRect(0,0,c.width,h);x.fillStyle=d.color;x.fillRect(0,0,c.width,Math.max(18,h*.035));x.fillStyle='#777f91';x.font=`${Math.max(18,h*.032)}px Gowun Dodum, sans-serif`;x.fillText(d.name,pad,h*.12);x.fillStyle='#463426';x.font=`${Math.max(34,h*(landscape?.082:.058))}px Jua, sans-serif`;x.fillText(`작품 ${pi+1}`,pad,h*.24);x.strokeStyle='#e5dfd2';x.beginPath();x.moveTo(pad,h*.29);x.lineTo(c.width-pad,h*.29);x.stroke();x.font=`${Math.max(20,h*(landscape?.05:.036))}px Gowun Dodum, sans-serif`;x.fillStyle='#766b60';['작품 원본','준비 중'].forEach((line,i)=>x.fillText(line,pad,h*(.48+i*(landscape?.12:.085))));x.fillStyle='#a9a190';x.font=`${Math.max(16,h*.026)}px Gowun Dodum, sans-serif`;x.fillText(`${pi+1} / ${POEMS_PER_CHILD}`,pad,h*.94);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=1;t.userData={format:'image/png',source:'framed-artwork-png'};renderer.initTexture(t);poemPngTextures.set(key,t);return t;
}
function buildPlant(x,z){
  makePngSprite('assets/planter-png.png',1.12,1.42,[x,.69,z]);makeContactShadow(x,z,.8,.34,.19);
}
function buildCurator(){
  const loader=new THREE.TextureLoader(),textures={idle:loader.load('assets/curator-maru.png'),frontA:loader.load('assets/curator-walk-a.png'),frontB:loader.load('assets/curator-walk-b.png'),sideA:loader.load('assets/curator-side-a.png'),sideB:loader.load('assets/curator-side-b.png'),backA:loader.load('assets/curator-back-a.png'),backB:loader.load('assets/curator-back-b.png')};Object.values(textures).forEach(t=>t.colorSpace=THREE.SRGBColorSpace);
  const g=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.idle,color:0xd7c8b8,transparent:true,alphaTest:.04,depthWrite:false,toneMapped:true}));g.scale.set(1.28,1.92,1);g.position.set(1.35,.96,6.7);g.visible=false;g.renderOrder=4;g.userData={type:'curator',textures,currentTexture:textures.idle,facing:'front',facingCandidate:'front',facingCandidateSince:0,lastFacingChange:0,sideSign:1,lastSideSignChange:0,smoothedMotion:new THREE.Vector3(0,0,-1)};scene.add(g);scene.userData.curator=g;
  const shadow=makeContactShadow(g.position.x,g.position.z,.86,.34,.24);shadow.visible=false;scene.userData.curatorShadow=shadow;curatorLastCameraPosition.copy(camera.position);
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
  addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key==='Escape'){if(adminMode&&!$('#password-modal').hidden){closePasswordModal();return}closePoem();closeIndex();if(adminMode)closeSettings();stopGuideVoice()}});
  addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;e.preventDefault();const action=handleWorldClick(e.clientX,e.clientY);if(action==='artwork')return;dragging=true;dragMoved=false;dragMode=null;pointerMoveActive=action==='move';curatorPointerIdle=false;document.body.dataset.pressMove=pointerMoveActive?'moving':'ready';dragStartX=lastX=e.clientX;dragStartY=lastY=e.clientY;canvas.classList.add('is-dragging');canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive||!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY,totalX=e.clientX-dragStartX,totalY=e.clientY-dragStartY;if(Math.hypot(totalX,totalY)>DRAG_THRESHOLD){dragMoved=true;if(!dragMode)dragMode=e.shiftKey||Math.abs(totalX)>=Math.abs(totalY)*.9?'look':'move'}if(dragMode==='move'){pointerMoveActive=true;curatorPointerIdle=false;document.body.dataset.pressMove='moving';queueDirectionalMove(-dy*.016);canvas.classList.add('is-moving-drag')}else if(dragMode==='look'){if(pointerMoveActive)stopPressedMovement();yaw-=dx*.0038;pitch=THREE.MathUtils.clamp(pitch-dy*.0028,PITCH_MIN,PITCH_MAX);camera.rotation.set(pitch,yaw,0)}lastX=e.clientX;lastY=e.clientY});
  const finishDrag=()=>{if(pointerMoveActive||dragMode==='move')stopPressedMovement();dragging=false;dragMode=null;canvas.classList.remove('is-dragging','is-moving-drag')};
  canvas.addEventListener('pointerleave',finishDrag);canvas.addEventListener('pointercancel',finishDrag);canvas.addEventListener('lostpointercapture',finishDrag);canvas.addEventListener('pointerup',finishDrag);
  canvas.addEventListener('wheel',e=>{if(!started||modalOpen||tourActive||entryActive||zoneTravelActive)return;e.preventDefault();if(e.shiftKey){pitch=THREE.MathUtils.clamp(pitch-e.deltaY*.0007,PITCH_MIN,PITCH_MAX);camera.rotation.x=pitch;return}const distance=THREE.MathUtils.clamp(-e.deltaY*.01,-1.4,1.4);if(Math.abs(distance)>.03)queueDirectionalMove(distance)},{passive:false});
  $('#enter').onclick=()=>{started=true;startAmbientMusic();primeGuideAudio();hideEntryPortal(true);$('#intro').classList.add('closed');$('#hud').hidden=false;startEntrySequence()};
  $('#home').onclick=()=>{hideEntryPortal(true);$('#intro').classList.remove('closed');$('#hud').hidden=true;$('#hud').classList.remove('cinematic');started=false;tourActive=false;setPanoramaPerformanceMode(false);entryActive=false;zoneTravelActive=false;hasDestination=false;if($('#guide-replay'))$('#guide-replay').hidden=true;resetEntrance();stopAmbientMusic();stopGuideVoice()};
  if($('#music-toggle'))$('#music-toggle').onclick=()=>musicOn?stopAmbientMusic():startAmbientMusic();
  if($('#guide-replay'))$('#guide-replay').onclick=replayCuratorGuide;
  if($('#cheer-toggle'))$('#cheer-toggle').onclick=toggleCheerForm;
  if($('#cheer-message'))$('#cheer-message').oninput=()=>{$('#cheer-length').textContent=String($('#cheer-message').value.length)};
  if($('#cheer-form')&&!adminMode)$('#cheer-form').onsubmit=submitCheerMessage;
  addEventListener('storage',event=>{if(event.key!==CHEER_STORAGE_KEY)return;refreshCheerCards();renderCheerSection(selectedChild,selectedPoem);renderCheerAdmin()});
  if($('#overview'))$('#overview').onclick=showOverview;$('#index-open').onclick=openIndex;$('#index-close').onclick=closeIndex;if(adminMode){$('#settings-open').onclick=openSettings;$('#settings-close').onclick=closeSettings;$('#password-open').onclick=openPasswordModal;$('#password-close').onclick=closePasswordModal;$$('[data-password-close]').forEach(button=>button.onclick=closePasswordModal);$$('[data-admin-logout]').forEach(button=>button.onclick=endAdminSession)}
  $$('[data-close]').forEach(b=>b.onclick=closePoem);
  $('#prev-poem').onclick=()=>movePoem(-1);$('#next-poem').onclick=()=>movePoem(1);
}

function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
  if(started&&!modalOpen){
    if(entryActive){updateEntrySequence(dt);updateMap()}else if(tourActive){updatePanoramaTour(dt);const nowMs=performance.now();if(nowMs-tourUiUpdatedAt>=TOUR_UI_INTERVAL){tourUiUpdatedAt=nowMs;updateZone();updateMap()}}else if(zoneTravelActive){updateZoneTravel(dt);updateMap()}else{
      const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);
      const side=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
      if(forward||side){curatorPointerIdle=false;hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(-Math.sin(yaw)*forward+Math.cos(yaw)*side,0,-Math.cos(yaw)*forward-Math.sin(yaw)*side);if(moveTarget.lengthSq()>1)moveTarget.normalize();moveTarget.multiplyScalar(MANUAL_MOVE_SPEED)}
      else if(hasDestination){
        moveTarget.set(moveDestination.x-camera.position.x,0,moveDestination.z-camera.position.z);const distance=moveTarget.length();
        if(distance<=CLICK_STOP_RADIUS){camera.position.x=moveDestination.x;camera.position.z=moveDestination.z;hasDestination=false;scene.userData.clickMarker.visible=false;moveTarget.set(0,0,0);moveVelocity.set(0,0,0)}
        else{if(destinationTurnsView){const desiredYaw=Math.atan2(-moveTarget.x,-moveTarget.z);yaw=dampAngle(yaw,desiredYaw,1-Math.exp(-5*dt))}const targetSpeed=Math.min(CLICK_MOVE_MAX_SPEED,Math.max(.22,distance*1.45),Math.sqrt(distance*6.5));moveTarget.normalize().multiplyScalar(targetSpeed)}
      }
      else moveTarget.set(0,0,0);
      moveVelocity.lerp(moveTarget,1-Math.exp(-(moveTarget.lengthSq()>.01?6.5:11)*dt));camera.position.addScaledVector(moveVelocity,dt);
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
  const hidden=!started||entryActive||tourActive;curator.visible=!hidden;if(shadow)shadow.visible=!hidden;if(hidden){curatorLastCameraPosition.copy(camera.position);document.body.dataset.curatorMotion='hidden';return}
  if(modalOpen){curatorLastCameraPosition.copy(camera.position);document.body.dataset.curatorMotion='frozen';return}
  const activeLayout=activeChildZone>=0?ZONE_LAYOUT[activeChildZone]:null,activeDistanceSq=activeLayout?(camera.position.x-activeLayout.x)**2+(camera.position.z-activeLayout.z)**2:Infinity,anchoredToZone=!!activeLayout&&activeDistanceSq<64,rightX=Math.cos(yaw),rightZ=-Math.sin(yaw),forwardX=-Math.sin(yaw),forwardZ=-Math.cos(yaw),manualInput=!!(keys.w||keys.a||keys.s||keys.d||keys.arrowup||keys.arrowdown||keys.arrowleft||keys.arrowright),forcePointerIdle=curatorPointerIdle&&!zoneTravelActive&&!hasDestination&&!manualInput;
  curatorCameraDelta.copy(camera.position).sub(curatorLastCameraPosition);curatorCameraDelta.y=0;const cameraMoving=!forcePointerIdle&&curatorCameraDelta.lengthSq()>.000004,movingWithCamera=!forcePointerIdle&&(zoneTravelActive||hasDestination||manualInput||cameraMoving||moveVelocity.lengthSq()>.01);
  if(forcePointerIdle)curatorTarget.copy(curator.position);else if(movingWithCamera){const followDistance=anchoredToZone?2.35:3;curatorTarget.set(camera.position.x+forwardX*followDistance,anchoredToZone?.79:.96,camera.position.z+forwardZ*followDistance)}
  else if(anchoredToZone){const forwardDistance=coarsePointer?2.65:2.5,sideDistance=coarsePointer?1.45:2.1;curatorTarget.set(camera.position.x+forwardX*forwardDistance+rightX*sideDistance,.79,camera.position.z+forwardZ*forwardDistance+rightZ*sideDistance)}
  else curatorTarget.set(camera.position.x+forwardX*3,.96,camera.position.z+forwardZ*3);
  curatorTarget.x=THREE.MathUtils.clamp(curatorTarget.x,-13.15,13.15);curatorTarget.z=THREE.MathUtils.clamp(curatorTarget.z,-11.45,11.45);
  curatorPositionDelta.copy(curatorTarget).sub(curator.position);curatorPositionDelta.y=0;const forceForward=zoneTravelActive||(hasDestination&&destinationTurnsView);if(forceForward)curatorMotionVector.set(forwardX,0,forwardZ);else if(cameraMoving)curatorMotionVector.copy(curatorCameraDelta).normalize();else if(moveTarget.lengthSq()>.01)curatorMotionVector.copy(moveTarget).normalize();else if(curatorPositionDelta.lengthSq()>.0004)curatorMotionVector.copy(curatorPositionDelta).normalize();else curatorMotionVector.set(0,0,0);
  const walking=!forcePointerIdle&&(movingWithCamera||curatorPositionDelta.lengthSq()>.0225),smoothedMotion=curator.userData.smoothedMotion;
  if(curatorMotionVector.lengthSq()>.0001){const directionAlpha=1-Math.exp(-CURATOR_DIRECTION_DAMPING*dt);if(smoothedMotion.lengthSq()<.0001)smoothedMotion.copy(curatorMotionVector);else smoothedMotion.lerp(curatorMotionVector,directionAlpha);smoothedMotion.normalize()}
  const screenX=smoothedMotion.x*rightX+smoothedMotion.z*rightZ,depth=smoothedMotion.x*forwardX+smoothedMotion.z*forwardZ,desiredFacing=resolveCuratorFacing(walking,forceForward,screenX,depth),turnState=settleCuratorFacing(curator,desiredFacing,screenX,now,walking),facing=turnState.facing,step=Math.floor(now*4.2)%2?'A':'B',tex=walking?curator.userData.textures[`${facing}${step}`]:facing==='front'?curator.userData.textures.idle:curator.userData.textures[`${facing}A`];
  const zoneScaleX=anchoredToZone?1.05:1.28;curator.scale.set(facing==='side'&&turnState.sideSign>0?-zoneScaleX:zoneScaleX,anchoredToZone?1.58:1.92,1);document.body.dataset.curatorFacing=facing;document.body.dataset.curatorDesiredFacing=desiredFacing;document.body.dataset.curatorTurnState=curator.userData.facingCandidate===facing?'steady':'settling';document.body.dataset.curatorMotion=walking?'walking':'idle';document.body.dataset.curatorZoneSide=anchoredToZone&&!movingWithCamera?'right':'follow';
  const textureReady=!!(tex?.image&&(!('complete' in tex.image)||tex.image.complete));if(textureReady&&curator.userData.currentTexture!==tex){curator.material.map=tex;curator.material.needsUpdate=true;curator.userData.currentTexture=tex}curator.material.rotation=walking?Math.sin(now*8.4)*.014:Math.sin(now*1.4)*.006;
  const curatorBaseY=anchoredToZone?.79:.96;curatorTarget.y=walking?curatorBaseY+Math.abs(Math.sin(now*8.4))*.028:curatorBaseY+Math.sin(now*1.8)*.006;curatorPositionDelta.copy(curatorTarget).sub(curator.position);const remaining=curatorPositionDelta.length();document.body.dataset.curatorGap=remaining.toFixed(2);if(zoneTravelActive)curator.position.copy(curatorTarget);else if(remaining>.0005){const maxSpeed=movingWithCamera?5.1:3.15,alpha=1-Math.exp(-(movingWithCamera?7.5:5.2)*dt),travel=Math.min(remaining,remaining*alpha,maxSpeed*dt);curator.position.addScaledVector(curatorPositionDelta,travel/remaining)}curatorLastCameraPosition.copy(camera.position);if(shadow){shadow.position.x=curator.position.x;shadow.position.z=curator.position.z;shadow.material.opacity=walking?.19:.24}
}

function resolveCuratorFacing(walking,forceForward,screenX,depth){if(!walking)return'front';if(forceForward)return'back';if(Math.abs(screenX)>Math.abs(depth)*.82)return'side';return depth>.03?'back':'front'}

function curatorTurnStep(current,desired){if((current==='front'&&desired==='back')||(current==='back'&&desired==='front'))return'side';return desired}

function settleCuratorFacing(curator,desiredFacing,screenX,now,walking){
  const data=curator.userData,current=data.facing||'front';
  if(data.facingCandidate!==desiredFacing){data.facingCandidate=desiredFacing;data.facingCandidateSince=now}
  const confirmDelay=walking?CURATOR_TURN_CONFIRM:CURATOR_IDLE_RETURN_DELAY;
  if(desiredFacing!==current&&now-data.facingCandidateSince>=confirmDelay&&now-data.lastFacingChange>=CURATOR_TURN_INTERVAL){data.facing=curatorTurnStep(current,desiredFacing);data.lastFacingChange=now}
  if(data.facing==='side'&&Math.abs(screenX)>.28){const nextSign=screenX>0?1:-1;if(nextSign!==data.sideSign&&now-data.lastSideSignChange>=CURATOR_TURN_INTERVAL){data.sideSign=nextSign;data.lastSideSignChange=now}}
  return{facing:data.facing||'front',sideSign:data.sideSign||1}
}

function validateMovementIntegrity(){const checks=[resolveCuratorFacing(true,true,1,0)==='back',resolveCuratorFacing(true,false,0,1)==='back',resolveCuratorFacing(true,false,0,-1)==='front',resolveCuratorFacing(true,false,1,0)==='side',resolveCuratorFacing(true,false,-1,0)==='side',resolveCuratorFacing(false,false,1,1)==='front',curatorTurnStep('front','back')==='side',curatorTurnStep('back','front')==='side',curatorTurnStep('side','front')==='front',curatorTurnStep('side','back')==='back',CURATOR_TURN_INTERVAL>=.3];document.body.dataset.curatorMovementIntegrity=checks.every(Boolean)?'ok':'error';document.body.dataset.curatorTurnInterval=CURATOR_TURN_INTERVAL.toFixed(2);if(checks.some(check=>!check))throw new Error('Curator movement direction validation failed')}

function startAmbientMusic(){
  if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)();audioMaster=audioContext.createGain();const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=5200;filter.Q.value=.35;audioMaster.gain.value=.0001;audioMaster.connect(filter).connect(audioContext.destination)}
  audioContext.resume();musicOn=true;audioMaster.gain.cancelScheduledValues(audioContext.currentTime);audioMaster.gain.exponentialRampToValueAtTime(MUSIC_VOLUME,audioContext.currentTime+1.5);playAmbientChord();clearInterval(musicTimer);musicTimer=setInterval(playAmbientChord,5600);document.body.dataset.musicStyle='clear-breeze';updateMusicButton();
}
function stopAmbientMusic(){
  musicOn=false;clearInterval(musicTimer);if(audioContext&&audioMaster){audioMaster.gain.cancelScheduledValues(audioContext.currentTime);audioMaster.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+1.2)}updateMusicButton();
}
function playAmbientChord(){
  if(!musicOn||!audioContext)return;const phrases=[[523.25,659.25,783.99,880,783.99,659.25],[587.33,698.46,880,1046.5,880,783.99],[659.25,783.99,987.77,880,783.99,659.25],[523.25,659.25,880,783.99,659.25,587.33]],roots=[261.63,349.23,293.66,392],index=musicStep++%phrases.length,now=audioContext.currentTime+.06;
  [1,1.5].forEach((ratio,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=roots[index]*ratio;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(i?.008:.012,now+.55);gain.gain.exponentialRampToValueAtTime(.0001,now+4.9);osc.connect(gain).connect(audioMaster);osc.start(now);osc.stop(now+5)});
  phrases[index].forEach((frequency,i)=>{const start=now+.22+i*.48;[[1,.026,'sine'],[2,.007,'triangle']].forEach(([ratio,peak,type])=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=frequency*ratio;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(peak,start+.045);gain.gain.exponentialRampToValueAtTime(.0001,start+1.22);osc.connect(gain).connect(audioMaster);osc.start(start);osc.stop(start+1.28)})});
}
function updateMusicButton(){const b=$('#music-toggle');if(!b)return;b.classList.toggle('muted',!musicOn);b.setAttribute('aria-pressed',String(musicOn));b.setAttribute('aria-label',musicOn?'전시 음악 끄기':'전시 음악 켜기')}
function updateZone(){
  if(Math.abs(camera.position.x)<5.2&&Math.abs(camera.position.z)<5.2){activeChildZone=-1;$('#zone-name').textContent='중앙 햇살 통로';return}
  if(activeChildZone>=0){const zone=ZONE_LAYOUT[activeChildZone],d=(camera.position.x-zone.x)**2+(camera.position.z-zone.z)**2;if(d<64){$('#zone-name').textContent=`${children[activeChildZone].name}의 방`;return}}
  let nearest=0,best=Infinity;ZONE_LAYOUT.slice(0,children.length).forEach((zone,i)=>{const d=(camera.position.x-zone.x)**2+(camera.position.z-zone.z)**2;if(d<best){best=d;nearest=i}});activeChildZone=nearest;$('#zone-name').textContent=`${children[nearest].name}의 방`;
}
function updateFocus(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(frameMeshes,false),hit=hits[0]&&hits[0].distance<ARTWORK_INTERACTION_DISTANCE?hits[0]:null;
  $('#crosshair').classList.toggle('active',!!hit);camera.userData.focus=hit?.object||null;if(hit)lastFocusedArtwork=hit.object;
}
function activateCenter(){if(camera.userData.focus){const d=camera.userData.focus.userData;openPoem(d.child,d.poem)}}
function setMoveDestination(target,turnsView=true,showMarker=true){
  curatorPointerIdle=false;moveDestination.copy(target);moveDestination.y=0;constrainWalkPosition(moveDestination);destinationTurnsView=turnsView;const distance=Math.hypot(moveDestination.x-camera.position.x,moveDestination.z-camera.position.z);hasDestination=distance>CLICK_STOP_RADIUS;moveVelocity.multiplyScalar(.2);const marker=scene.userData.clickMarker;marker.position.set(moveDestination.x,.018,moveDestination.z);marker.visible=showMarker&&hasDestination;if(!hasDestination)moveVelocity.set(0,0,0)
}
function stopPressedMovement(){pointerMoveActive=false;hasDestination=false;moveTarget.set(0,0,0);moveVelocity.set(0,0,0);scene.userData.clickMarker.visible=false;curatorPointerIdle=true;document.body.dataset.pressMove='stopped';document.body.dataset.pressStopSpeed=moveVelocity.length().toFixed(3);document.body.dataset.pressHasDestination=String(hasDestination)}
function queueDirectionalMove(distance){
  if(!Number.isFinite(distance)||Math.abs(distance)<.001)return;curatorPointerIdle=false;const direction=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),base=hasDestination&&!destinationTurnsView?moveDestination:camera.position,target=base.clone().addScaledVector(direction,distance);setMoveDestination(target,false,false)
}
function handleWorldClick(x,y){
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height||x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return'none';
  clickPoint.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height*2-1));raycaster.setFromCamera(clickPoint,camera);
  const subject=raycaster.intersectObjects(frameMeshes,false)[0],navigationHit=raycaster.intersectObjects(navigationMeshes,false)[0],floorHit=raycaster.intersectObject(scene.userData.floor,false)[0];
  if(subject&&subject.distance<ARTWORK_INTERACTION_DISTANCE){const d=subject.object.userData;openPoem(d.child,d.poem);return'artwork'}
  const nearestDistance=Math.min(navigationHit?.distance??Infinity,floorHit?.distance??Infinity);
  if(navigationHit&&navigationHit.distance===nearestDistance){setMoveDestination(navigationHit.object.userData.target,true,true);return'move'}
  if(floorHit){setMoveDestination(floorHit.point,true,true);return'move'}
  if(raycaster.ray.intersectPlane(groundPlane,groundHitPoint)){setMoveDestination(groundHitPoint,true,true);return'move'}
  const fallbackDirection=raycaster.ray.direction.clone();fallbackDirection.y=0;if(fallbackDirection.lengthSq()>.01){fallbackDirection.normalize();setMoveDestination(camera.position.clone().addScaledVector(fallbackDirection,6),true,true);return'move'}return'none'
}
function constrainWalkPosition(position){
  let adjusted=false,x=THREE.MathUtils.clamp(position.x,WALK_BOUNDS.minX,WALK_BOUNDS.maxX),z=THREE.MathUtils.clamp(position.z,WALK_BOUNDS.minZ,WALK_BOUNDS.maxZ);if(x!==position.x||z!==position.z)adjusted=true;position.x=x;position.z=z;
  SAFE_ZONES.forEach(zone=>{let dx=position.x-zone.x,dz=position.z-zone.z,dist=Math.hypot(dx,dz);if(dist<zone.r){adjusted=true;if(dist<.001){dx=1;dz=0;dist=1}position.x=zone.x+dx/dist*zone.r;position.z=zone.z+dz/dist*zone.r}});
  position.x=THREE.MathUtils.clamp(position.x,WALK_BOUNDS.minX,WALK_BOUNDS.maxX);position.z=THREE.MathUtils.clamp(position.z,WALK_BOUNDS.minZ,WALK_BOUNDS.maxZ);return adjusted
}
function setEntranceDoors(open,progress=1){const angle=open?DOOR_OPEN_ANGLE*THREE.MathUtils.clamp(progress,0,1):0,doors=scene.userData.doors||[];if(doors[0])doors[0].rotation.y=-angle;if(doors[1])doors[1].rotation.y=angle;doors.forEach(door=>door.visible=true);document.body.dataset.entranceDoors=open&&progress>=1?'open':open?'opening':'closed'}
function resetEntrance(){setEntranceDoors(false);if(scene.userData.entranceFacade)scene.userData.entranceFacade.visible=true;(scene.userData.entranceWalls||[]).forEach(wall=>wall.visible=true);camera.position.set(0,1.65,11.2);yaw=0;pitch=0;camera.rotation.set(0,0,0)}
function showEntryPortal(){
  const portal=$('#entry-portal');if(!portal)return;clearTimeout(entryPortalOpenTimer);clearTimeout(entryPortalHideTimer);portal.classList.remove('open');portal.classList.add('active');entryPortalOpenTimer=setTimeout(()=>portal.classList.add('open'),600);entryPortalHideTimer=setTimeout(()=>hideEntryPortal(false),2400)
}
function hideEntryPortal(immediate=false){
  const portal=$('#entry-portal');clearTimeout(entryPortalOpenTimer);clearTimeout(entryPortalHideTimer);entryPortalOpenTimer=entryPortalHideTimer=null;if(!portal)return;portal.classList.remove('active');if(immediate)portal.classList.remove('open');else setTimeout(()=>portal.classList.remove('open'),420)
}
function startEntrySequence(){
  activeChildZone=-1;hasDestination=false;tourActive=false;zoneTravelActive=false;entryActive=true;entryElapsed=0;entryStartedAt=performance.now();moveVelocity.set(0,0,0);$('#hud').classList.add('cinematic');const curator=scene.userData.curator,shadow=scene.userData.curatorShadow;if(curator)curator.visible=false;if(shadow)shadow.visible=false;document.body.dataset.curatorState='hidden';document.body.dataset.doorOpenDuration=((DOOR_OPEN_END-DOOR_OPEN_START)*ENTRY_DURATION).toFixed(2);document.body.dataset.entryWalkStart=(ENTRY_WALK_START*ENTRY_DURATION).toFixed(2);setEntranceDoors(false);if(scene.userData.entranceFacade)scene.userData.entranceFacade.visible=true;(scene.userData.entranceWalls||[]).forEach(wall=>wall.visible=true);camera.position.set(0,1.68,16.5);yaw=0;pitch=0;camera.fov=68;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='전시장 입구'
}
function updateEntrySequence(dt){
  entryElapsed=Math.min(ENTRY_DURATION,(performance.now()-entryStartedAt)/1000);const t=entryElapsed/ENTRY_DURATION,doorT=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((t-DOOR_OPEN_START)/(DOOR_OPEN_END-DOOR_OPEN_START),0,1),0,1),walkT=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((t-ENTRY_WALK_START)/(1-ENTRY_WALK_START),0,1),0,1);setEntranceDoors(true,doorT);camera.position.z=THREE.MathUtils.lerp(16.5,11.2,walkT);camera.position.y=1.68+Math.sin(walkT*Math.PI)*.025;camera.fov=THREE.MathUtils.lerp(68,72,walkT);camera.updateProjectionMatrix();camera.rotation.set(0,0,0);if(t>=1){entryActive=false;setEntranceDoors(true);$('#hud').classList.remove('cinematic');camera.position.set(0,1.68,11.2);camera.fov=72;camera.updateProjectionMatrix();startPanoramaTour()}
}
function startPanoramaTour(){
  setEntranceDoors(true);hasDestination=false;moveVelocity.set(0,0,0);tourElapsed=0;tourStartedAt=performance.now();tourUiUpdatedAt=0;tourFrameCount=0;tourFrameStartedAt=tourStartedAt;tourActive=!reduceMotion;setPanoramaPerformanceMode(tourActive);camera.fov=74;camera.updateProjectionMatrix();camera.position.set(0,2.08,8.2);yaw=0;pitch=-.03;camera.rotation.set(pitch,yaw,0);document.body.dataset.panoramaMotion=reduceMotion?'skipped':'continuous';if(reduceMotion)finishPanoramaTour()
}
function updatePanoramaTour(dt){
  tourFrameCount++;tourElapsed=Math.min(TOUR_DURATION,tourElapsed+Math.min(dt,1/30));const t=tourElapsed/TOUR_DURATION,angle=t*Math.PI*2;document.body.dataset.panoramaAngle=angle.toFixed(4);document.body.dataset.panoramaFrameMode='delta-smoothed';camera.position.set(Math.sin(angle)*9.1,2.08,Math.cos(angle)*8.2);const dx=-camera.position.x,dz=-camera.position.z;yaw=Math.atan2(-dx,-dz);pitch=-.03;camera.rotation.set(pitch,yaw,0);if(t>=1)finishPanoramaTour()
}
function setPanoramaPerformanceMode(active){renderer.setPixelRatio(active?TOUR_PIXEL_RATIO:BASE_PIXEL_RATIO);(scene.userData.zoneGlows||[]).forEach(light=>light.visible=!active);document.body.dataset.panoramaQuality=active?'optimized':'full'}
function finishPanoramaTour(){setEntranceDoors(true);activeChildZone=-1;tourActive=false;setPanoramaPerformanceMode(false);const elapsed=Math.max(.001,(performance.now()-tourFrameStartedAt)/1000);document.body.dataset.panoramaFps=String(Math.round(tourFrameCount/elapsed));moveVelocity.set(0,0,0);camera.position.set(0,1.65,9.8);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구';updateMap();const curator=scene.userData.curator,shadow=scene.userData.curatorShadow;if(curator){curator.position.set(1.35,.96,6.7);curator.visible=true}if(shadow){shadow.position.set(1.35,.012,6.7);shadow.visible=true}document.body.dataset.curatorState='visible';if(!adminMode){if($('#guide-replay'))$('#guide-replay').hidden=false;setTimeout(()=>{if(started&&!entryActive&&!tourActive)speakCurator()},450)}}
function dampAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t}
function showOverview(){setEntranceDoors(true);activeChildZone=-1;tourActive=false;setPanoramaPerformanceMode(false);entryActive=false;zoneTravelActive=false;hasDestination=false;scene.userData.clickMarker.visible=false;overviewMode=false;moveVelocity.set(0,0,0);camera.position.set(0,1.65,9.8);yaw=0;pitch=0;camera.fov=72;camera.updateProjectionMatrix();camera.rotation.set(0,0,0);$('#zone-name').textContent='정면 입구'}
function goToChildZone(ci){
  const layout=ZONE_LAYOUT[ci];activeChildZone=ci;closeIndex();closePoem();if(!started){started=true;$('#intro').classList.add('closed');$('#hud').hidden=false;startAmbientMusic();resetEntrance()}setEntranceDoors(true);
  entryActive=false;tourActive=false;setPanoramaPerformanceMode(false);hasDestination=false;scene.userData.clickMarker.visible=false;moveVelocity.set(0,0,0);moveTarget.set(0,0,0);zoneTravelChild=ci;zoneTravelElapsed=0;zoneTravelActive=true;zoneTravelStart.copy(camera.position);zoneTravelEnd.copy(zoneLocalToWorld(layout,0,4.45));zoneTravelEnd.y=1.65;
  zoneTravelStartRadius=Math.max(3.6,Math.hypot(zoneTravelStart.x,zoneTravelStart.z));zoneTravelEndRadius=Math.hypot(zoneTravelEnd.x,zoneTravelEnd.z);zoneTravelStartAngle=Math.atan2(zoneTravelStart.z,zoneTravelStart.x);const endAngle=Math.atan2(zoneTravelEnd.z,zoneTravelEnd.x);zoneTravelAngleDelta=(endAngle-zoneTravelStartAngle+Math.PI*3)%(Math.PI*2)-Math.PI;zoneTravelStartYaw=yaw;zoneTravelEndYaw=Math.atan2(-(layout.x-zoneTravelEnd.x),-(layout.z-zoneTravelEnd.z));pitch=0;$('#zone-name').textContent=`${children[ci].name}의 방으로 이동 중`
}
function updateZoneTravel(dt){
  zoneTravelElapsed=Math.min(ZONE_TRAVEL_DURATION,zoneTravelElapsed+dt);const t=zoneTravelElapsed/ZONE_TRAVEL_DURATION,e=t*t*(3-2*t),angle=zoneTravelStartAngle+zoneTravelAngleDelta*e,radius=THREE.MathUtils.lerp(zoneTravelStartRadius,zoneTravelEndRadius,e);camera.position.set(Math.cos(angle)*radius,1.65,Math.sin(angle)*radius);yaw=dampAngle(zoneTravelStartYaw,zoneTravelEndYaw,e);camera.rotation.set(0,yaw,0);if(t>=1){zoneTravelActive=false;moveTarget.set(0,0,0);camera.position.copy(zoneTravelEnd);camera.rotation.set(0,zoneTravelEndYaw,0);yaw=zoneTravelEndYaw;$('#zone-name').textContent=`${children[zoneTravelChild].name}의 방`}
}
function updateMap(){const x=camera.position.x/15*40,z=camera.position.z/13.2*40;$('#map-dot').style.transform=`translate(${x}px,${z}px)`;$('#map-view').style.transform=`rotate(${-yaw}rad)`}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(tourActive?TOUR_PIXEL_RATIO:BASE_PIXEL_RATIO)}

function getArtworkFrontView(ci,pi){
  const group=frameGroups.get(`${ci}-${pi}`),layout=ZONE_LAYOUT[ci];if(!group||!layout)return null;
  const target=zoneLocalToWorld(layout,group.position.x,.22),position=zoneLocalToWorld(layout,group.position.x,ARTWORK_FRONT_DISTANCE);target.y=group.position.y;position.y=target.y;
  const dx=target.x-position.x,dz=target.z-position.z;return{position,target,yaw:Math.atan2(-dx,-dz),pitch:0}
}
function focusArtworkFront(ci,pi){
  const view=getArtworkFrontView(ci,pi);if(!view)return false;
  if(!artworkViewRestore)artworkViewRestore={position:camera.position.clone(),yaw,pitch,fov:camera.fov,activeChildZone};
  moveVelocity.set(0,0,0);moveTarget.set(0,0,0);hasDestination=false;zoneTravelActive=false;scene.userData.clickMarker.visible=false;camera.position.copy(view.position);yaw=view.yaw;pitch=view.pitch;camera.fov=ARTWORK_FRONT_FOV;camera.updateProjectionMatrix();camera.rotation.set(pitch,yaw,0);activeChildZone=ci;$('#zone-name').textContent=`${children[ci].name} · 작품 ${pi+1} 정면 보기`;document.body.dataset.artworkFrontView=`${ci}-${pi}`;document.body.dataset.artworkFrontAligned='true';return true
}
function restoreArtworkView(){
  if(!artworkViewRestore)return;camera.position.copy(artworkViewRestore.position);yaw=artworkViewRestore.yaw;pitch=artworkViewRestore.pitch;camera.fov=artworkViewRestore.fov;activeChildZone=artworkViewRestore.activeChildZone;camera.updateProjectionMatrix();camera.rotation.set(pitch,yaw,0);artworkViewRestore=null;delete document.body.dataset.artworkFrontView;delete document.body.dataset.artworkFrontAligned;updateZone();updateMap()
}
function openPoem(ci,pi){
  moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;
  focusArtworkFront(ci,pi);
  selectedChild=ci;selectedPoem=pi;modalOpen=true;const c=children[ci];
  visited.add(`${ci}-${pi}`);localStorage.setItem('galleryVisited',JSON.stringify([...visited]));
  $('.poem-card').style.setProperty('--accent',c.color);$('#poem-child').textContent=c.name;$('#poem-number').textContent=`작품 ${pi+1} / ${c.poems.length}`;
  $('#poem-title').textContent=`${c.name} 작품 ${pi+1} 원본`;showPoemScan(ci,pi);renderCheerSection(ci,pi);collapseCheerForm();$('#poem-modal').classList.add('open');$('#poem-modal').setAttribute('aria-hidden','false');
  setTimeout(()=>$('.modal-close').focus(),250);
}
function closePoem(){modalOpen=false;$('#poem-modal').classList.remove('open');$('#poem-modal').setAttribute('aria-hidden','true');if(activeScanUrl){URL.revokeObjectURL(activeScanUrl);activeScanUrl=null}restoreArtworkView()}
function movePoem(step){const count=children[selectedChild]?.poems.length||POEMS_PER_CHILD;selectedPoem=(selectedPoem+step+count)%count;openPoem(selectedChild,selectedPoem)}
function openIndex(){modalOpen=true;$('#index-panel').classList.add('open');$('#index-panel').setAttribute('aria-hidden','false')}
function closeIndex(){modalOpen=false;$('#index-panel').classList.remove('open');$('#index-panel').setAttribute('aria-hidden','true')}
function openSettings(){if(!adminMode)return;closeIndex();closePoem();modalOpen=true;$('#settings-panel').classList.add('open');$('#settings-panel').setAttribute('aria-hidden','false');setTimeout(()=>$('#settings-close').focus(),220)}
function closeSettings(){if(!adminMode)return;closePasswordModal();modalOpen=false;$('#settings-panel').classList.remove('open');$('#settings-panel').setAttribute('aria-hidden','true')}
function openPasswordModal(){if(!adminMode)return;const modal=$('#password-modal'),status=$('#password-change-status');modal.hidden=false;modal.setAttribute('aria-hidden','false');status.textContent='';status.classList.remove('error');setTimeout(()=>$('#current-admin-password').focus(),80)}
function closePasswordModal(){if(!adminMode)return;const modal=$('#password-modal');if(!modal||modal.hidden)return;modal.hidden=true;modal.setAttribute('aria-hidden','true');$('#current-admin-password').value=$('#new-admin-password').value=$('#confirm-admin-password').value='';$('#password-open')?.focus()}
function normalizeCheerColor(value){return CHEER_NOTE_COLORS.includes(value)?value:CHEER_NOTE_COLORS[0]}
function noteColorFor(item,index=0){if(CHEER_NOTE_COLORS.includes(item?.color))return item.color;const seed=[...(item?.id||String(index))].reduce((sum,char)=>sum+char.charCodeAt(0),0);return CHEER_NOTE_COLORS[seed%CHEER_NOTE_COLORS.length]}
function readCheerMessages(){try{const stored=JSON.parse(localStorage.getItem(CHEER_STORAGE_KEY)||'[]');if(!Array.isArray(stored))return[];return stored.filter(item=>item&&typeof item==='object'&&Number.isInteger(item.ci)&&Number.isInteger(item.pi)&&item.ci>=0&&item.ci<CHILD_COUNT_MAX&&item.pi>=0&&item.pi<POEMS_PER_CHILD&&typeof item.author==='string'&&typeof item.message==='string').map(item=>({id:String(item.id||''),ci:item.ci,pi:item.pi,author:item.author.trim().slice(0,12),message:item.message.trim().slice(0,CHEER_MAX_LENGTH),color:CHEER_NOTE_COLORS.includes(item.color)?item.color:null,status:item.status==='hidden'?'hidden':'approved',createdAt:Number(item.createdAt)||Date.now()})).filter(item=>item.id&&item.author&&item.message)}catch{return[]}}
function saveCheerMessages(messages){localStorage.setItem(CHEER_STORAGE_KEY,JSON.stringify(messages.slice(-500)));if(scene)refreshCheerCards()}
function cheerDate(timestamp){try{return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'}).format(new Date(timestamp))}catch{return''}}
function roundedRect(context,x,y,width,height,radius){const r=Math.min(radius,width/2,height/2);context.beginPath();context.moveTo(x+r,y);context.arcTo(x+width,y,x+width,y+height,r);context.arcTo(x+width,y+height,x,y+height,r);context.arcTo(x,y+height,x,y,r);context.arcTo(x,y,x+width,y,r);context.closePath()}
function cheerLines(context,text,maxWidth,maxLines=2){const chars=[...text],lines=[];let line='';for(const char of chars){const next=line+char;if(context.measureText(next).width>maxWidth&&line){lines.push(line);line=char;if(lines.length===maxLines-1)break}else line=next}const consumed=lines.join('').length;if(lines.length===maxLines-1&&consumed<chars.length){let tail=chars.slice(consumed).join('');while(context.measureText(`${tail}…`).width>maxWidth&&tail.length)tail=tail.slice(0,-1);lines.push(`${tail}…`)}else if(line)lines.push(line);return lines.slice(0,maxLines)}
function makeCheerCardTexture(item,total,color){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=288;const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.shadowColor='#5a3b2226';context.shadowBlur=20;context.shadowOffsetY=9;roundedRect(context,22,18,724,244,28);context.fillStyle='#fffaf0';context.fill();context.shadowColor='transparent';context.lineWidth=5;context.strokeStyle=color;context.stroke();context.fillStyle='#8a674c';context.font='700 25px Gowun Dodum, sans-serif';context.fillText('따뜻한 응원',55,63);if(total>1){context.font='700 22px Gowun Dodum, sans-serif';const label=`+${total-1}`,labelWidth=context.measureText(label).width+30;roundedRect(context,714-labelWidth,36,labelWidth,42,21);context.fillStyle='#f3dfbd';context.fill();context.fillStyle='#765338';context.textAlign='center';context.fillText(label,714-labelWidth/2,65);context.textAlign='left'}context.fillStyle='#4f3b2d';context.font='700 34px Gowun Dodum, sans-serif';cheerLines(context,item.message,660,2).forEach((line,index)=>context.fillText(line,55,122+index*47));context.fillStyle='#9a7960';context.font='24px Gowun Dodum, sans-serif';context.fillText(item.author,55,238);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return texture
}
function wrapCheerText(context,text,maxWidth){
  const lines=[];let line='';for(const char of [...text]){const next=line+char;if(line&&context.measureText(next).width>maxWidth){lines.push(line);line=char}else line=next}if(line)lines.push(line);return lines.length?lines:['']
}
function fitCheerMessage(context,text,maxWidth,maxHeight){
  for(let fontSize=28;fontSize>=10;fontSize--){context.font=`700 ${fontSize}px Gowun Dodum, sans-serif`;const lines=wrapCheerText(context,text,maxWidth),lineHeight=Math.max(12,Math.round(fontSize*1.22));if(lines.length*lineHeight<=maxHeight)return{fontSize,lineHeight,lines}}
  context.font='700 10px Gowun Dodum, sans-serif';const lines=wrapCheerText(context,text,maxWidth);return{fontSize:10,lineHeight:Math.max(8,maxHeight/Math.max(1,lines.length)),lines}
}
function makeChildCheerBoardTexture(ci,items){
  const columns=Math.min(3,Math.max(1,items.length)),rows=Math.max(1,Math.ceil(items.length/columns)),canvas=document.createElement('canvas');canvas.width=1536;canvas.height=300+Math.max(0,rows-2)*104;
  const context=canvas.getContext('2d'),accent=children[ci]?.color||'#e5b566',boardX=12,boardY=10,boardWidth=1512,boardHeight=canvas.height-20,gridX=218,gridY=18,gridWidth=canvas.width-gridX-18,gridHeight=canvas.height-36,cellWidth=gridWidth/columns,cellHeight=gridHeight/rows;
  context.clearRect(0,0,canvas.width,canvas.height);context.shadowColor='#5a3b2228';context.shadowBlur=16;context.shadowOffsetY=7;roundedRect(context,boardX,boardY,boardWidth,boardHeight,24);context.fillStyle='#f3e1c3';context.fill();context.shadowColor='transparent';context.lineWidth=4;context.strokeStyle=accent;context.stroke();
  context.fillStyle='#6e4c36';context.font='700 25px Gowun Dodum, sans-serif';context.fillText('따뜻한 응원',42,58);context.fillStyle='#9a7658';context.font='21px Gowun Dodum, sans-serif';context.fillText(children[ci]?.name||defaultChildName(ci),42,94);context.fillStyle='#fff7e8';roundedRect(context,42,116,142,42,21);context.fill();context.fillStyle='#765338';context.font='700 19px Gowun Dodum, sans-serif';context.textAlign='center';context.fillText(`응원 ${items.length}개`,113,144);context.textAlign='left';
  if(!items.length){const noteX=gridX+28,noteY=44,noteWidth=gridWidth-55,noteHeight=canvas.height-88;context.shadowColor='#5a3b2225';context.shadowBlur=12;context.shadowOffsetY=6;roundedRect(context,noteX,noteY,noteWidth,noteHeight,14);context.fillStyle=CHEER_NOTE_COLORS[0];context.fill();context.shadowColor='transparent';context.fillStyle='#6f5946';context.font='700 25px Gowun Dodum, sans-serif';context.fillText('작품을 클릭하고 첫 번째 따뜻한 응원을 남겨주세요.',noteX+34,noteY+noteHeight/2+8)}
  else items.forEach((item,index)=>{const column=index%columns,row=Math.floor(index/columns),cellX=gridX+column*cellWidth,cellY=gridY+row*cellHeight,noteX=cellX+12,noteY=cellY+10,noteWidth=cellWidth-24,noteHeight=cellHeight-20,angle=[-.012,.009,-.007,.014][index%4],noteColor=noteColorFor(item,index),labelSize=Math.max(10,Math.min(17,noteHeight*.14)),metaSize=Math.max(11,Math.min(17,noteHeight*.12));context.save();context.translate(noteX+noteWidth/2,noteY+noteHeight/2);context.rotate(angle);context.shadowColor='#5a3b2228';context.shadowBlur=11;context.shadowOffsetY=5;roundedRect(context,-noteWidth/2,-noteHeight/2,noteWidth,noteHeight,12);context.fillStyle=noteColor;context.fill();context.shadowColor='transparent';context.fillStyle='#fff9dfb8';roundedRect(context,-26,-noteHeight/2-3,52,15,4);context.fill();context.beginPath();context.rect(-noteWidth/2+8,-noteHeight/2+8,noteWidth-16,noteHeight-16);context.clip();const left=-noteWidth/2+16,top=-noteHeight/2+17,metaY=noteHeight/2-13;context.fillStyle='#8a6a4d';context.font=`700 ${labelSize}px Gowun Dodum, sans-serif`;context.fillText(`작품 ${item.pi+1}`,left,top+labelSize);const messageTop=top+labelSize+7,availableHeight=Math.max(12,metaY-metaSize-7-messageTop),fitted=fitCheerMessage(context,item.message,noteWidth-32,availableHeight);context.fillStyle='#4b3b31';context.font=`700 ${fitted.fontSize}px Gowun Dodum, sans-serif`;fitted.lines.forEach((line,lineIndex)=>context.fillText(line,left,messageTop+fitted.lineHeight*(lineIndex+1)));context.fillStyle='#876f5d';context.font=`${metaSize}px Gowun Dodum, sans-serif`;context.fillText(`${item.author} · ${cheerDate(item.createdAt)}`,left,metaY);context.restore()});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.userData.boardHeight=CHEER_BOARD_HEIGHT;return texture
}
function refreshCheerCards(){
  if(!zoneCheerBoardMeshes.size)return;messageCardMeshes.forEach(mesh=>{const oldTexture=mesh.material.map;mesh.visible=false;mesh.material.map=null;mesh.material.needsUpdate=true;if(oldTexture?.userData?.cheerCard)oldTexture.dispose()});const approvedByChild=new Map();readCheerMessages().filter(item=>item.status==='approved').sort((a,b)=>b.createdAt-a.createdAt).forEach(item=>{if(!approvedByChild.has(item.ci))approvedByChild.set(item.ci,[]);approvedByChild.get(item.ci).push(item)});zoneCheerBoardMeshes.forEach((mesh,ci)=>{const oldTexture=mesh.material.map,texture=makeChildCheerBoardTexture(ci,approvedByChild.get(ci)||[]),boardHeight=texture.userData.boardHeight;texture.userData.cheerBoard=true;mesh.geometry.dispose();mesh.geometry=new THREE.PlaneGeometry(CHEER_BOARD_WIDTH,boardHeight);mesh.position.y=boardHeight/2+.04;mesh.material.map=texture;mesh.material.needsUpdate=true;mesh.visible=true;if(oldTexture?.userData?.cheerBoard)oldTexture.dispose()})
}
function collapseCheerForm(){const form=$('#cheer-form'),toggle=$('#cheer-toggle');if(!form)return;form.hidden=adminMode;if(toggle){toggle.hidden=!adminMode;toggle.setAttribute('aria-expanded',String(!form.hidden))}if($('#cheer-status'))$('#cheer-status').textContent='';if($('#cheer-length'))$('#cheer-length').textContent=String($('#cheer-message')?.value.length||0)}
function toggleCheerForm(){if(adminMode)return;const form=$('#cheer-form'),toggle=$('#cheer-toggle'),opening=form.hidden;form.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));toggle.textContent=opening?'응원 작성 접기':'응원 남기기';if(opening)setTimeout(()=>$('#cheer-author').focus(),60)}
function renderCheerSection(ci,pi){
  const list=$('#cheer-list'),count=$('#cheer-count');if(!list||!count)return;const messages=readCheerMessages().filter(item=>item.ci===ci&&item.pi===pi&&item.status==='approved').sort((a,b)=>b.createdAt-a.createdAt);count.textContent=`응원 ${messages.length}개`;list.replaceChildren();if(!messages.length){const empty=document.createElement('p');empty.className='cheer-empty';empty.textContent='아직 공개된 응원이 없어요. 첫 번째 따뜻한 한마디를 남겨보세요.';list.append(empty)}else messages.forEach((item,index)=>{const card=document.createElement('blockquote'),message=document.createElement('p'),meta=document.createElement('footer');card.className='cheer-note';card.style.setProperty('--note-color',noteColorFor(item,index));card.style.setProperty('--note-tilt',`${[-.8,.55,-.4,.7][index%4]}deg`);message.textContent=item.message;meta.textContent=`${item.author} · ${cheerDate(item.createdAt)}`;card.append(message,meta);list.append(card)})
}
function submitCheerMessage(event){
  event.preventDefault();const author=$('#cheer-author').value.trim().replace(/\s+/g,' '),message=$('#cheer-message').value.trim().replace(/\s+/g,' '),color=normalizeCheerColor($('#cheer-form input[name="cheer-color"]:checked')?.value),status=$('#cheer-status'),button=$('#cheer-form button[type="submit"]');status.classList.remove('error');if(author.length<2){status.textContent='보내는 분을 두 글자 이상 적어주세요.';status.classList.add('error');$('#cheer-author').focus();return}if(message.length<4){status.textContent='응원 한마디를 네 글자 이상 적어주세요.';status.classList.add('error');$('#cheer-message').focus();return}if(/(?:01[016789][- .]?\d{3,4}[- .]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(message)){status.textContent='전화번호나 이메일은 적지 말아주세요.';status.classList.add('error');return}button.disabled=true;const messages=readCheerMessages(),id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;messages.push({id,ci:selectedChild,pi:selectedPoem,author:author.slice(0,12),message:message.slice(0,CHEER_MAX_LENGTH),color,status:'approved',createdAt:Date.now()});saveCheerMessages(messages);$('#cheer-author').value='';$('#cheer-message').value='';$('#cheer-length').textContent='0';status.textContent='선택한 포스트잇 색상으로 응원이 바로 붙었어요.';button.disabled=false;renderCheerSection(selectedChild,selectedPoem);renderCheerAdmin()
}
function renderCheerAdmin(){
  const root=$('#cheer-admin-list'),badge=$('#cheer-pending-count');if(!adminMode||!root||!badge)return;const messages=readCheerMessages().sort((a,b)=>(a.status==='hidden'?1:0)-(b.status==='hidden'?1:0)||b.createdAt-a.createdAt);badge.textContent=`전체 ${messages.length}개`;root.replaceChildren();if(!messages.length){const empty=document.createElement('p');empty.className='cheer-admin-empty';empty.textContent='아직 도착한 응원 메시지가 없습니다.';root.append(empty);return}messages.forEach(item=>{const card=document.createElement('article');card.className=`cheer-admin-card ${item.status}`;const child=children[item.ci]?.name||defaultChildName(item.ci),state=item.status==='hidden'?'숨김':'공개 중';card.innerHTML=`<div class="cheer-admin-meta"><strong>${escapeHtml(child)} · 작품 ${item.pi+1}</strong><span>${state}</span></div><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.author)} · ${escapeHtml(cheerDate(item.createdAt))}</small><div class="cheer-admin-actions"><button type="button" data-cheer-action="approve" data-cheer-id="${escapeHtml(item.id)}">공개</button><button type="button" data-cheer-action="hide" data-cheer-id="${escapeHtml(item.id)}">숨김</button><button type="button" data-cheer-action="delete" data-cheer-id="${escapeHtml(item.id)}">삭제</button></div>`;root.append(card)});$$('[data-cheer-action]').forEach(button=>button.onclick=()=>moderateCheerMessage(button.dataset.cheerId,button.dataset.cheerAction))
}
function moderateCheerMessage(id,action){let messages=readCheerMessages(),item=messages.find(entry=>entry.id===id);if(!item)return;if(action==='delete'){if(!confirm('이 응원 메시지를 삭제할까요?'))return;messages=messages.filter(entry=>entry.id!==id)}else item.status=action==='approve'?'approved':'hidden';saveCheerMessages(messages);renderCheerAdmin();renderCheerSection(selectedChild,selectedPoem)}
function setGuideState(state){document.body.dataset.guideState=state;const button=$('#guide-replay');if(button){const playing=state==='playing';button.classList.toggle('playing',playing);button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'마루 안내 음성 재생 중, 처음부터 다시 듣기':'마루 안내 음성 다시 듣기')}}
function restoreGuideMusic(){if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(MUSIC_VOLUME,audioContext.currentTime+.8)}
function bindGuideAudioEvents(){if(!guideAudioElement)return;guideAudioElement.addEventListener('ended',()=>{setGuideState('ended');restoreGuideMusic()});guideAudioElement.addEventListener('error',()=>{setGuideState('recording-error');restoreGuideMusic()})}
function preloadGuideAudio(){
  if(adminMode)return Promise.resolve(null);if(guideAudioReadyPromise)return guideAudioReadyPromise;setGuideState('loading');guideAudioReadyPromise=fetch('assets/curator-guide.mp3',{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error(`guide audio ${response.status}`);return response.arrayBuffer()}).then(bytes=>{setGuideState('loaded');return bytes}).catch(error=>{guideAudioReadyPromise=null;setGuideState('load-error');throw error});return guideAudioReadyPromise
}
function queueGuideReplayOnInteraction(){if(guideRetryBound||guidePlayed)return;guideRetryBound=true;window.addEventListener('pointerdown',()=>{guideRetryBound=false;if(started&&!entryActive&&!tourActive&&!guidePlayed)speakCurator()},{once:true,capture:true})}
function prepareGuideAudioBuffer(){
  if(adminMode)return Promise.resolve(null);if(guideAudioBuffer)return Promise.resolve(guideAudioBuffer);if(!audioContext)return Promise.reject(new Error('audio context not ready'));if(guideAudioDecodePromise)return guideAudioDecodePromise;guideAudioDecodePromise=Promise.all([preloadGuideAudio(),audioContext.resume()]).then(([bytes])=>audioContext.decodeAudioData(bytes.slice(0))).then(buffer=>{guideAudioBuffer=buffer;guideAudioPrimed=true;setGuideState('ready');return buffer}).catch(error=>{guideAudioDecodePromise=null;guideAudioPrimed=false;setGuideState('decode-error');throw error});return guideAudioDecodePromise
}
function primeGuideAudio(){
  if(adminMode||guidePlayed)return;setGuideState('priming');prepareGuideAudioBuffer().catch(()=>{guideAudioPrimed=false;setGuideState('prime-blocked')})
}
function speakCurator(){
  if(guidePlayed||guideAudioPending)return;if(!started||entryActive||tourActive)return;moveVelocity.set(0,0,0);hasDestination=false;scene.userData.clickMarker.visible=false;guideAudioPending=true;if(audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(.008,audioContext.currentTime+.25);setGuideState(guideAudioPrimed?'starting':'starting-unprimed');prepareGuideAudioBuffer().then(buffer=>{if(!buffer||guidePlayed||!started||entryActive||tourActive){guideAudioPending=false;return}const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=buffer;gain.gain.value=.96;source.connect(gain).connect(audioContext.destination);guideAudioSource=source;source.onended=()=>{if(guideAudioSource!==source)return;guideAudioSource=null;setGuideState('ended');restoreGuideMusic()};source.start(0);guideAudioPending=false;guidePlayed=true;setGuideState('playing')}).catch(()=>{if(!guideAudioElement){guideAudioPending=false;setGuideState('recording-missing');restoreGuideMusic();return}guideAudioElement.loop=false;guideAudioElement.currentTime=0;guideAudioElement.muted=false;guideAudioElement.volume=1;const playback=guideAudioElement.play();if(!playback){guideAudioPending=false;guidePlayed=true;setGuideState('playing');return}playback.then(()=>{guideAudioPending=false;guidePlayed=true;setGuideState('playing')}).catch(()=>{guideAudioPending=false;guidePlayed=false;setGuideState('recording-blocked');restoreGuideMusic();queueGuideReplayOnInteraction()})})
}
function replayCuratorGuide(){if(!started||entryActive||tourActive)return;if(guideAudioSource){const source=guideAudioSource;guideAudioSource=null;try{source.stop()}catch{}}if(guideAudioElement){guideAudioElement.pause();guideAudioElement.loop=false;guideAudioElement.currentTime=0}guideAudioPending=false;guidePlayed=false;speakCurator()}
function stopGuideVoice(){guideAudioPending=false;if(guideAudioSource){const source=guideAudioSource;guideAudioSource=null;try{source.stop()}catch{}}if(guideAudioElement){guideAudioElement.pause();guideAudioElement.loop=false;guideAudioElement.currentTime=0;guideAudioElement.volume=.96}setGuideState(guidePlayed?'stopped':'idle');if(audioContext&&audioMaster&&musicOn)audioMaster.gain.linearRampToValueAtTime(MUSIC_VOLUME,audioContext.currentTime+.4)}
function showPoemScan(ci,pi){
  const record=scanRecords.get(`${ci}-${pi}`),scan=$('#poem-scan'),empty=$('#poem-scan-empty');if(activeScanUrl){URL.revokeObjectURL(activeScanUrl);activeScanUrl=null}
  if(!record){scan.hidden=true;scan.removeAttribute('src');empty.hidden=false;return}
  activeScanUrl=URL.createObjectURL(record.originalBlob);scan.src=activeScanUrl;scan.alt=`${children[ci].name}의 ${pi+1}번째 작품 원본 스캔`;scan.hidden=false;empty.hidden=true
}
function buildSettings(){
  const saveState=$('#settings-save-state'),saveButton=$('#settings-save-all'),markDirty=message=>{document.body.dataset.adminSettings='unsaved';saveState.textContent=message||'변경 내용이 있습니다. 전체 저장 버튼을 눌러 주세요.';saveButton.classList.add('dirty')};
  const galleryNameInput=$('#gallery-name');galleryNameInput.value=galleryConfig.name;galleryNameInput.oninput=()=>markDirty('메인 타이틀 변경 내용이 아직 저장되지 않았습니다.');galleryNameInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('#child-count').focus()}};
  $$('[data-theme-choice]').forEach(button=>button.onclick=()=>{applyGalleryTheme(button.dataset.themeChoice,false);markDirty(`${button.querySelector('strong').textContent} 배경을 선택했습니다. 전체 저장을 눌러 주세요.`)});
  const childCountInput=$('#child-count');childCountInput.value=galleryConfig.childCount;childCountInput.oninput=()=>markDirty('참여 어린이 수 변경 내용이 아직 저장되지 않았습니다.');
  $('#admin-password-change').onclick=async()=>{const current=$('#current-admin-password'),next=$('#new-admin-password'),confirm=$('#confirm-admin-password'),status=$('#password-change-status'),button=$('#admin-password-change');status.classList.remove('error');status.textContent='';if(!(await verifyAdminPassword(current.value))){status.textContent='현재 비밀번호가 맞지 않습니다.';status.classList.add('error');current.focus();return}if(next.value.length<6){status.textContent='새 비밀번호를 6자 이상 입력해 주세요.';status.classList.add('error');next.focus();return}if(next.value!==confirm.value){status.textContent='새 비밀번호 확인이 일치하지 않습니다.';status.classList.add('error');confirm.focus();return}button.disabled=true;button.textContent='변경 중';try{const credential=await createAdminCredential(next.value);localStorage.setItem(ADMIN_CREDENTIAL_KEY,JSON.stringify(credential));sessionStorage.setItem(ADMIN_SESSION_KEY,credential.hash);current.value=next.value=confirm.value='';status.textContent='관리자 비밀번호를 변경했습니다.'}catch{status.textContent='비밀번호를 변경하지 못했습니다.';status.classList.add('error')}finally{button.disabled=false;button.textContent='비밀번호 변경'}};
  const frameOptions=Object.entries(FRAME_PRESETS).map(([value,preset])=>`<option value="${value}">${preset.label}</option>`).join(''),root=$('#settings-list');children.forEach((child,ci)=>{const section=document.createElement('section');section.className='scan-child';section.innerHTML=`<div class="scan-child-header"><i style="--c:${child.color}"></i><label class="child-name-editor"><span class="sr-only">${ci+1}번 어린이 이름</span><input type="text" maxlength="20" value="${escapeHtml(child.name)}" data-child-name="${ci}" autocomplete="off" aria-label="${ci+1}번 어린이 이름"></label><span class="work-count">작품 ${child.poems.length}점</span></div><div class="scan-grid">${child.poems.map((_,pi)=>{const key=`${ci}-${pi}`,preset=galleryConfig.frames[key]||'portrait';return `<article class="scan-slot" data-scan-slot="${key}"><div><strong>작품 ${pi+1}</strong><span class="scan-file-name">원본 없음</span></div><label class="frame-field"><span>액자 형태</span><select data-frame-select="${key}">${frameOptions}</select></label><div class="scan-actions"><label>원본 선택<input type="file" accept="image/png,image/jpeg,image/webp" data-scan-input="${key}"></label><button type="button" data-scan-remove="${key}" hidden>삭제</button></div></article>`}).join('')}</div>`;root.append(section);child.poems.forEach((_,pi)=>{const key=`${ci}-${pi}`;root.querySelector(`[data-frame-select="${key}"]`).value=galleryConfig.frames[key]||'portrait'})});
  $$('[data-child-name]').forEach((input,index,inputs)=>{input.oninput=()=>markDirty(`${index+1}번째 어린이 이름 변경 내용이 아직 저장되지 않았습니다.`);input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();(inputs[index+1]||saveButton).focus()}}});
  $$('[data-frame-select]').forEach(select=>select.onchange=async()=>{const key=select.dataset.frameSelect,preset=select.value;setScanStatus('액자 크기와 배치를 미리 바꾸고 있어요.');await applyFramePreset(key,preset,false);markDirty(`${FRAME_PRESETS[preset].label} 액자를 선택했습니다. 전체 저장을 눌러 주세요.`)});
  $$('[data-scan-input]').forEach(input=>input.onchange=async()=>{const file=input.files?.[0],key=input.dataset.scanInput;input.value='';if(!file)return;const [ci,pi]=key.split('-').map(Number);try{setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 준비하고 있어요.`);const record=await createScanRecord(key,ci,pi,file);await putScanRecord(record);scanRecords.set(key,record);applyScanTexture(record);updateScanSlot(record);if(selectedChild===ci&&selectedPoem===pi&&$('#poem-modal').classList.contains('open'))showPoemScan(ci,pi);setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 저장했어요.`)}catch(error){setScanStatus(error?.message||'원본 파일을 저장하지 못했어요.',true)}});
  $$('[data-scan-remove]').forEach(button=>button.onclick=async()=>{const key=button.dataset.scanRemove,[ci,pi]=key.split('-').map(Number);try{await deleteScanRecord(key);scanRecords.delete(key);restorePlaceholderTexture(ci,pi);updateScanSlot({key,name:''});if(selectedChild===ci&&selectedPoem===pi&&$('#poem-modal').classList.contains('open'))showPoemScan(ci,pi);setScanStatus(`${children[ci].name}의 ${pi+1}번째 원본을 삭제했어요.`)}catch{setScanStatus('원본을 삭제하지 못했어요.',true)}})
  saveButton.onclick=()=>{const count=Math.min(CHILD_COUNT_MAX,Math.max(CHILD_COUNT_MIN,Math.round(Number(childCountInput.value)||galleryConfig.childCount))),cleanTitle=galleryNameInput.value.trim().slice(0,30)||DEFAULT_GALLERY_CONFIG.name,names=Array.from({length:count},(_,index)=>{const input=$(`[data-child-name="${index}"]`);return sanitizeChildName(input?.value||galleryConfig.childNames?.[index]||children[index]?.name,index)}),credential=getAdminCredential();childCountInput.value=count;galleryNameInput.value=cleanTitle;galleryConfig.name=cleanTitle;galleryConfig.childCount=count;galleryConfig.childCountSchema=CHILD_COUNT_SCHEMA;galleryConfig.childNames=names;saveGalleryConfig();if(credential)sessionStorage.setItem(ADMIN_SESSION_KEY,credential.hash);sessionStorage.setItem(ADMIN_RESUME_KEY,'gallery');document.body.dataset.adminSettings='saved';saveState.textContent='저장했습니다. 관리자 전시장으로 이동합니다.';saveButton.classList.remove('dirty');saveButton.disabled=true;saveButton.textContent='저장 완료 · 전시장으로 이동 중';setScanStatus('타이틀, 어린이 이름, 인원, 배경과 액자 설정을 모두 저장했습니다.');setTimeout(()=>location.replace('/admin/?saved=1'),420)};
  document.body.dataset.adminSettings='saved';
  renderCheerAdmin()
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
  const mesh=poemArtMeshes.get(record.key);if(!mesh)return;const url=URL.createObjectURL(record.displayBlob);new THREE.TextureLoader().load(url,texture=>{URL.revokeObjectURL(url);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),coarsePointer?2:4);texture.userData={format:'image/png',source:'original-scan-display'};mesh.material.map=texture;mesh.material.needsUpdate=true},undefined,()=>URL.revokeObjectURL(url))
}
function restorePlaceholderTexture(ci,pi){const key=`${ci}-${pi}`,mesh=poemArtMeshes.get(key);if(!mesh)return;mesh.material.map=makePoemPngTexture(ci,pi,galleryConfig.frames[key]||'portrait');mesh.material.needsUpdate=true}
function updateScanSlot(record){const slot=$(`[data-scan-slot="${record.key}"]`);if(!slot)return;const hasFile=!!record.name;slot.classList.toggle('filled',hasFile);slot.querySelector('.scan-file-name').textContent=hasFile?record.name:'원본 없음';slot.querySelector('[data-scan-remove]').hidden=!hasFile}
function buildIndex(){
  const root=$('#index-list');
  $('#index-title').textContent=`${children.length*POEMS_PER_CHILD}개의 작품`;
  children.forEach((c,ci)=>{
    const workCount=c.poems.length,el=document.createElement('div');el.className='index-child';
    el.innerHTML=`<div class="index-child-row"><button class="index-child-go" type="button" aria-label="${c.name} 전시공간으로 이동"><i style="--c:${c.color}"></i><strong>${c.name}</strong></button><button class="index-child-toggle" type="button" aria-label="${c.name}의 작품 ${workCount}점 펼치기" aria-expanded="false">작품 ${workCount}점</button></div><div class="index-poems">${c.poems.map((_,pi)=>`<button type="button" data-ci="${ci}" data-pi="${pi}">작품 ${pi+1}</button>`).join('')}</div>`;
    const go=el.querySelector('.index-child-go'),toggle=el.querySelector('.index-child-toggle');go.onclick=()=>goToChildZone(ci);toggle.onclick=()=>{const open=el.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${c.name}의 작품 ${workCount}점 ${open?'접기':'펼치기'}`)};root.append(el);
  });
  $$('[data-ci]').forEach(b=>b.onclick=()=>{closeIndex();openPoem(+b.dataset.ci,+b.dataset.pi)});
}
function validateGalleryIntegrity(){
  const expectedWorks=children.length*POEMS_PER_CHILD,frontViews=Array.from({length:children.length},(_,ci)=>Array.from({length:POEMS_PER_CHILD},(_,pi)=>getArtworkFrontView(ci,pi))).flat(),frontViewAligned=frontViews.every(view=>{if(!view||![view.position.x,view.position.y,view.position.z,view.yaw].every(Number.isFinite))return false;const forward=new THREE.Vector3(-Math.sin(view.yaw),0,-Math.cos(view.yaw)),direction=view.target.clone().sub(view.position);direction.y=0;return direction.lengthSq()>.01&&forward.dot(direction.normalize())>.999}),numberedNames=children.filter(child=>GENERATED_CHILD_NAME_PATTERN.test(child.name));
  const checks={children:children.length,zones:zoneFrameGroups.size,cheerBoards:zoneCheerBoardMeshes.size,frames:frameGroups.size,artworks:poemArtMeshes.size,frontViews:frontViews.filter(Boolean).length,indexChildren:$('#index-list').querySelectorAll('.index-child').length,indexWorks:$('#index-list').querySelectorAll('[data-ci]').length,settingsWorks:adminMode?$('#settings-list').querySelectorAll('[data-scan-slot]').length:expectedWorks};
  const failures=[];if(ZONE_LAYOUT.length<children.length)failures.push('zone-layout');if(checks.children!==galleryConfig.childCount)failures.push('child-config');if(checks.zones!==children.length)failures.push('zone-count');if(checks.cheerBoards!==children.length)failures.push('cheer-board-count');if(checks.frames!==expectedWorks)failures.push('frame-count');if(checks.artworks!==expectedWorks)failures.push('artwork-count');if(checks.frontViews!==expectedWorks||!frontViewAligned)failures.push('front-view-count');if(checks.indexChildren!==children.length)failures.push('index-child-count');if(checks.indexWorks!==expectedWorks)failures.push('index-work-count');if(checks.settingsWorks!==expectedWorks)failures.push('settings-work-count');if(numberedNames.length)failures.push('numbered-child-name');document.body.dataset.galleryChildren=String(children.length);document.body.dataset.galleryWorks=String(expectedWorks);document.body.dataset.galleryCheerBoards=String(checks.cheerBoards);document.body.dataset.childNumberLabels=numberedNames.length?'error':'removed';document.body.dataset.artworkFrontViews=String(checks.frontViews);document.body.dataset.artworkFrontIntegrity=frontViewAligned&&checks.frontViews===expectedWorks?'ok':'error';document.body.dataset.galleryIntegrity=failures.length?'error':'ok';if(failures.length)throw new Error(`Gallery integrity check failed: ${failures.join(', ')}`)
}
init();
