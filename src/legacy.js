export function startLegacy(){
  if(window.__AI_CHAT_LEGACY_STARTED__) return ()=>{};
  window.__AI_CHAT_LEGACY_STARTED__=true;

  const BACKEND_URL="https://telegram-miniapp-backend-nlwh.onrender.com";
  const tg=window.Telegram?.WebApp; tg?.ready?.(); tg?.expand?.();
  const initData=tg?.initData||"";
  const isDev=location.hostname==="localhost"||location.hostname==="127.0.0.1";
  let chats=[],cur=null,renameChatId=null,isGenerating=false,abortCtrl=null;
  const $=id=>document.getElementById(id);
  const esc=s=>(s??"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  const aiReady=Object.create(null);
  const setStatus=t=>{ if($("status")) $("status").textContent=t; };
  const isNearBottom=el=>(el.scrollHeight-el.scrollTop-el.clientHeight)<10;

  async function api(path,opts){
    const r=await fetch(BACKEND_URL+path,opts);
    if(!r.ok) throw new Error(await r.text());
    return r;
  }

  function openDrawer(){ $("sidebar")?.classList.add("open"); $("shade")?.classList.add("show"); }
  function closeDrawer(){ $("sidebar")?.classList.remove("open"); $("shade")?.classList.remove("show"); }
  if($("openSide")) $("openSide").onclick=openDrawer;
  if($("shade")) $("shade").onclick=closeDrawer;

  function setInputEnabled(on){
    const wrap=document.querySelector(".input");
    if(wrap) wrap.style.display=on?"":"none";
  }

  function setSendMode(mode){
    const btn=$("send"); if(!btn) return;
    if(mode==="stop"){ btn.textContent="Стоп"; btn.classList.remove("primary"); btn.dataset.mode="stop"; }
    else{ btn.textContent="Отправить"; btn.classList.add("primary"); btn.dataset.mode="send"; }
  }

  async function stopGeneration(){
    if(!isGenerating) return;
    try{ await api(`/chat/stop`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData,chat_id:cur})}); }catch(e){}
    try{ abortCtrl?.abort(); }catch(e){}
  }

  function openRenameModal(chatId){
    renameChatId=chatId;
    $("renameInp").value=chats.find(c=>c.id===chatId)?.title||"";
    $("renameShade")?.classList.add("show");
    $("renameModal")?.classList.add("show");
    setTimeout(()=>{ $("renameInp")?.focus(); $("renameInp")?.select?.(); },0);
  }
  function closeRenameModal(){
    renameChatId=null;
    $("renameShade")?.classList.remove("show");
    $("renameModal")?.classList.remove("show");
  }
  if($("renameCancel")) $("renameCancel").onclick=closeRenameModal;
  if($("renameShade")) $("renameShade").onclick=closeRenameModal;
  if($("renameOk")) $("renameOk").onclick=async()=>{
    if(!renameChatId) return;
    const title=$("renameInp").value.trim(); if(!title) return;
    try{
      setStatus("Сохраняю…");
      await api(`/chats/title`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData,chat_id:renameChatId,title})});
      chats=chats.map(c=>c.id===renameChatId?{...c,title}:c);
      if(cur===renameChatId) $("title").textContent=title;
      renderChats(); setStatus("Готово"); closeRenameModal();
    }catch(e){ console.error(e); setStatus("Ошибка"); alert("Не удалось переименовать"); }
  };
  $("renameInp")?.addEventListener("keydown",e=>{ if(e.key==="Enter") $("renameOk")?.click(); if(e.key==="Escape") closeRenameModal(); });

  function addMsg(role,text){
    const d=document.createElement("div");
    d.className="msg "+role;
    d.textContent=text||"";
    const box=$("msgs");
    const stick=box?isNearBottom(box):false;
    box?.appendChild(d);
    if(stick) box.scrollTop=box.scrollHeight;
    return d;
  }

  function renderChats(){
    const list=$("chatList"); if(!list) return;
    list.innerHTML=chats.map(c=>`
      <div class="item ${c.id===cur?"active":""}" onclick="window._sel('${c.id}')">
        <div class="ava">💬</div>
        <div class="meta"><b>${esc(c.title)}</b><small>${esc(c.id)}</small></div>
        <div class="rowActions">
          ${aiReady[String(c.id)]?`<button class="iconbtn" title="Переименовать" onclick="window._ren(event,'${c.id}')">✏️</button>`:""}
          <button class="iconbtn" title="Удалить чат" onclick="window._del(event,'${c.id}')">🗑</button>
        </div>
      </div>`).join("") || `<div class="note">Чатов пока нет.</div>`;
  }

  async function loadChats(){
    setStatus("Загрузка…");
    const r=await api(`/chats?initData=${encodeURIComponent(initData)}`);
    const j=await r.json();
    chats=(j.chats||[]);
    if(!cur && chats[0]) cur=chats[0].id;
    setInputEnabled(!!cur);
    renderChats();
    if(cur) await loadMessages(cur);
    setStatus("Готово");
  }

  async function loadMessages(chatId){
    cur=chatId; setInputEnabled(true);
    renderChats();
    $("title").textContent=(chats.find(c=>c.id===cur)?.title)||"Чат";
    $("msgs").innerHTML="";
    const r=await api(`/messages?initData=${encodeURIComponent(initData)}&chat_id=${encodeURIComponent(chatId)}`);
    const j=await r.json();
    const hasAi=(j.messages||[]).some(m=>m?.role==="ai");
    if(hasAi) aiReady[String(chatId)]=true;
    (j.messages||[]).forEach(m=>addMsg(m.role,m.content));
    const box=$("msgs"); if(box && isNearBottom(box)) box.scrollTop=box.scrollHeight;
    if(hasAi) renderChats();
    closeDrawer();
  }

  function newChat(){
    const id=String(Date.now());
    chats=[{id,title:"Новый чат"}].concat(chats);
    cur=id; setInputEnabled(true);
    renderChats();
    $("msgs").innerHTML="";
    $("title").textContent="Новый чат";
    closeDrawer();
  }
  if($("newBtn")) $("newBtn").onclick=newChat;

  async function send(){
    const text=$("inp").value.trim(); if(!text||!cur) return;
    if(isGenerating) await stopGeneration();
    $("inp").value="";
    addMsg("user",text);
    const aiEl=addMsg("ai","");
    setStatus("AI печатает…");
    isGenerating=true; abortCtrl=new AbortController(); setSendMode("stop");

    try{
      const r=await api(`/chat/stream`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData,chat_id:cur,text}),signal:abortCtrl.signal});
      const reader=r.body.getReader(),dec=new TextDecoder();
      let buf="",full="";
      while(true){
        const {value,done}=await reader.read(); if(done) break;
        buf+=dec.decode(value,{stream:true});
        const parts=buf.split("\n\n"); buf=parts.pop();
        for(const p of parts){
          const lines=p.split("\n").filter(x=>x.startsWith("data: "));
          const chunk=lines.map(x=>x.slice(6)).join("\n");
          if(chunk==="__START__"||chunk==="__DONE__") continue;
          full+=chunk;
          const box=$("msgs"),stick=box?isNearBottom(box):false;
          aiEl.textContent=full;
          if(stick) box.scrollTop=box.scrollHeight;
        }
      }
      setStatus("Готово");
      aiReady[String(cur)]=true; renderChats();
      await loadChats();
    }catch(e){
      const msg=String(e||"");
      if(!/AbortError/i.test(msg)){
        console.error(e); setStatus("Ошибка");
        if(!aiEl.textContent) aiEl.textContent="❌ Ошибка";
      }else{
        setStatus("Остановлено");
        if(!aiEl.textContent) aiEl.textContent="⏹ Остановлено.";
      }
      if((aiEl.textContent||"").trim()){ aiReady[String(cur)]=true; renderChats(); }
    }finally{
      isGenerating=false; abortCtrl=null; setSendMode("send");
    }
  }

  window._sel=id=>loadMessages(id);
  window._ren=(e,id)=>{ e?.stopPropagation?.(); openRenameModal(id); };

  window._del=async(e,id)=>{
    e?.stopPropagation?.();
    if(!confirm("Удалить чат?")) return;
    try{
      setStatus("Удаляю…");
      await api(`/chats?initData=${encodeURIComponent(initData)}&chat_id=${encodeURIComponent(id)}`,{method:"DELETE"});
      chats=chats.filter(c=>c.id!==id);
      if(cur===id){
        cur=chats[0]?.id||null;
        $("msgs").innerHTML="";
        $("title").textContent=cur?(chats.find(c=>c.id===cur)?.title||"Чат"):"Выбери чат";
        if(cur) await loadMessages(cur);
      }
      setInputEnabled(!!cur);
      if(!cur) $("msgs").innerHTML=`<div class="msg ai">Нажми <b>+ Новый</b>, чтобы создать чат.</div>`;
      renderChats(); setStatus("Готово");
    }catch(err){ console.error(err); setStatus("Ошибка"); alert("Не удалось удалить чат"); }
  };

  if($("send")) $("send").onclick=()=>{ if(isGenerating) stopGeneration(); else send(); };
  $("inp")?.addEventListener("keydown",e=>{ if(e.key==="Enter") send(); });

  (async()=>{
    if(!initData){
      if(isDev){
        setStatus("DEV режим");
        chats=[{id:"dev",title:"DEV чат"}]; cur="dev";
        setInputEnabled(true); renderChats();
        $("title").textContent="DEV чат";
        addMsg("ai","Локальный режим");
        return;
      }
      setInputEnabled(false);
      setStatus("Открой Mini App");
      $("msgs").innerHTML=`<div class="msg ai">Открой через кнопку <b>Mini App</b>.</div>`;
      return;
    }
    await loadChats().catch(e=>{
      setStatus("Ошибка");
      $("msgs").innerHTML=`<div class="msg ai">❌ ${esc(String(e))}</div>`;
    });
  })();

  const onTouch=e=>{ if(!e.target.closest(".input")) document.activeElement?.blur?.(); };
  document.addEventListener("touchstart",onTouch);
  setSendMode("send");

  function setVh(){ document.documentElement.style.setProperty("--vh", `${window.innerHeight*0.01}px`); }
  setVh(); window.addEventListener("resize",setVh); window.visualViewport?.addEventListener("resize",setVh);

  return ()=>{
    document.removeEventListener("touchstart",onTouch);
    window.removeEventListener("resize",setVh);
    window.visualViewport?.removeEventListener("resize",setVh);
  };
}
