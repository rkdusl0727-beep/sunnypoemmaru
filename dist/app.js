const COLORS=["#ffd96a","#8be0ca","#ff8e86","#b8a9ff","#8dc8ff","#ffb86b","#f49bd8","#9be58f","#8fd9e8","#f5a3a3"];
const children=Array.from({length:10},(_,i)=>({
  id:i+1,name:`어린이 ${String(i+1).padStart(2,"0")}`,color:COLORS[i],
  poems:Array.from({length:5},(_,j)=>({title:`동시 제목 ${j+1}`,body:`여기에 어린이가 쓴 동시 ${j+1}의\n첫 번째 행을 넣어주세요.\n\n행갈이와 빈 줄도\n그대로 예쁘게 보여요.`}))
}));

const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const welcome=$("#welcome"),gallery=$("#gallery"),childStars=$("#child-stars"),panel=$("#poem-panel"),listPanel=$("#list-panel");
let selectedChild=0,selectedPoem=0,visited=new Set(JSON.parse(localStorage.getItem("poemVisited")||"[]"));

function placeStars(){
  childStars.innerHTML="";
  const positions=[
    [19,30,-40],[37,21,30],[61,22,10],[81,31,-20],[88,51,15],
    [76,69,35],[58,78,-10],[38,76,20],[18,66,5],[10,48,25]
  ];
  children.forEach((child,i)=>{
    const b=document.createElement("button"); b.className=`child-star${visited.has(child.id)?" visited":""}`;
    b.style.cssText=`--x:${positions[i][0]}%;--y:${positions[i][1]}%;--z:${positions[i][2]}px;--color:${child.color};--speed:${3.2+(i%4)*.6}s`;
    b.setAttribute("aria-label",`${child.name}의 동시 5편 보기`); b.dataset.child=i;
    b.innerHTML=`<span class="orbit"></span><span class="orb"></span><span class="star-name">${child.name}</span>`;
    b.addEventListener("click",()=>openChild(i,0)); childStars.append(b);
  });
  updateProgress();
}

function enter(){welcome.hidden=true;gallery.hidden=false;requestAnimationFrame(()=>gallery.classList.add("ready"));}
function goHome(){gallery.hidden=true;welcome.hidden=false;closePanel();closeList();}

function openChild(childIndex,poemIndex=0){
  selectedChild=(childIndex+children.length)%children.length;selectedPoem=poemIndex;
  const c=children[selectedChild]; visited.add(c.id);localStorage.setItem("poemVisited",JSON.stringify([...visited]));
  $(`[data-child="${selectedChild}"]`)?.classList.add("visited");updateProgress();
  $("#panel-child-name").textContent=c.name;$("#panel-avatar").style.setProperty("--child-color",c.color);
  $(".panel-card").style.setProperty("--child-color",c.color);
  $("#guide-name").textContent=c.name;$("#guide-index").textContent=`동시 5편 · ${selectedChild+1}번째 별`;
  renderTabs();renderPoem();panel.classList.add("open");panel.setAttribute("aria-hidden","false");
  setTimeout(()=>$(".panel-close").focus(),300);
}
function renderTabs(){
  const tabs=$("#poem-tabs");tabs.innerHTML="";
  children[selectedChild].poems.forEach((_,i)=>{const b=document.createElement("button");b.type="button";b.role="tab";b.textContent=i+1;b.setAttribute("aria-label",`${i+1}번째 동시`);b.setAttribute("aria-selected",i===selectedPoem);b.onclick=()=>{selectedPoem=i;renderTabs();renderPoem()};tabs.append(b)});
}
function renderPoem(){const p=children[selectedChild].poems[selectedPoem];$("#poem-title").textContent=p.title;$("#poem-body").textContent=p.body;$("#poem-count").textContent=`${children[selectedChild].name}의 ${selectedPoem+1}번째 동시 · 총 5편`;}
function closePanel(){panel.classList.remove("open");panel.setAttribute("aria-hidden","true")}
function movePoem(step){selectedPoem=(selectedPoem+step+5)%5;renderTabs();renderPoem()}
function cycleStar(step){selectedChild=(selectedChild+step+children.length)%children.length;const c=children[selectedChild];$("#guide-name").textContent=c.name;$("#guide-index").textContent=`동시 5편 · ${selectedChild+1}번째 별`;const el=$(`[data-child="${selectedChild}"]`);el?.animate([{transform:"translate(-50%,-50%) scale(1)"},{transform:"translate(-50%,-50%) scale(1.2)"},{transform:"translate(-50%,-50%) scale(1)"}],{duration:600});}
function updateProgress(){$("#progress-text").textContent=`${visited.size} / 10 별을 만났어요`;$("#progress-bar").style.width=`${visited.size*10}%`;if(visited.size===10)showToast("모든 별을 만났어요! ✦")}
let toastTimer;function showToast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2200)}

function buildList(){
  const root=$("#child-list");root.innerHTML="";
  children.forEach((c,ci)=>{const item=document.createElement("div");item.className="list-child";item.innerHTML=`<button type="button"><span class="list-dot" style="--dot:${c.color}"></span><strong>${c.name}</strong><span>동시 5편</span></button><div class="list-poems">${c.poems.map((p,pi)=>`<button type="button" data-ci="${ci}" data-pi="${pi}">${pi+1}. ${p.title}</button>`).join("")}</div>`;item.firstElementChild.onclick=()=>item.classList.toggle("open");root.append(item)});
  $$('[data-ci]').forEach(b=>b.onclick=()=>{closeList();openChild(Number(b.dataset.ci),Number(b.dataset.pi))});
}
function openList(){listPanel.classList.add("open");listPanel.setAttribute("aria-hidden","false");}
function closeList(){listPanel.classList.remove("open");listPanel.setAttribute("aria-hidden","true")}

$("#enter-button").onclick=enter;$("#home-button").onclick=goHome;$("#list-button").onclick=openList;$("#list-close").onclick=closeList;
$$('[data-close-panel]').forEach(x=>x.onclick=closePanel);$("#prev-poem").onclick=()=>movePoem(-1);$("#next-poem").onclick=()=>movePoem(1);$("#prev-star").onclick=()=>cycleStar(-1);$("#next-star").onclick=()=>cycleStar(1);
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closePanel();closeList()}if(!panel.classList.contains("open")&&gallery.hidden===false){if(e.key==="ArrowLeft")cycleStar(-1);if(e.key==="ArrowRight")cycleStar(1);if(e.key==="Enter")openChild(selectedChild,0)}});

placeStars();buildList();
