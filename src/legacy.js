export function startLegacy() {
  // защита от двойного запуска (в React dev StrictMode useEffect может запускаться 2 раза)
  if (window.__AI_CHAT_LEGACY_STARTED__) return () => {};
  window.__AI_CHAT_LEGACY_STARTED__ = true;

  const BACKEND_URL="https://telegram-miniapp-backend-nlwh.onrender.com";
  const tg=window.Telegram?.WebApp; tg?.ready?.(); tg?.expand?.();
  const initData = tg?.initData || "";
  const isDev =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  let chats=[], cur=null;

  const $=id=>document.getElementById(id);
  const esc=s=>(s??"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  function setStatus(t){$("status").textContent=t}

  async function api(path, opts){
    const r=await fetch(BACKEND_URL+path, opts);
    if(!r.ok){ throw new Error(await r.text()); }
    return r;
  }

  // ====== Drawer (mobile) ======
  function openDrawer(){
    $("sidebar").classList.add("open");
    $("shade").classList.add("show");
  }
  function closeDrawer(){
    $("sidebar").classList.remove("open");
    $("shade").classList.remove("show");
  }
  $("openSide").onclick=openDrawer;
  $("shade").onclick=closeDrawer;

  // ====== Local delete "mask" ======
  const LS_DELETED_KEY = "deleted_chat_ids_v1";
  function getDeletedSet(){
    try{ return new Set(JSON.parse(localStorage.getItem(LS_DELETED_KEY)||"[]")); }
    catch{ return new Set(); }
  }
  function addDeleted(id){
    const s=getDeletedSet(); s.add(String(id));
    localStorage.setItem(LS_DELETED_KEY, JSON.stringify([...s]));
  }
  function isDeleted(id){
    return getDeletedSet().has(String(id));
  }

  // ====== RENAME MODAL (ADD) ======
  let renameChatId=null;

  function openRenameModal(chatId){
    renameChatId=chatId;
    $("renameInp").value = chats.find(c=>c.id===chatId)?.title || "";
    $("renameShade").classList.add("show");
    $("renameModal").classList.add("show");
    setTimeout(()=>{
      $("renameInp").focus();
      $("renameInp").select?.();
    },0);
  }
  function closeRenameModal(){
    renameChatId=null;
    $("renameShade").classList.remove("show");
    $("renameModal").classList.remove("show");
  }

  $("renameCancel").onclick=closeRenameModal;
  $("renameShade").onclick=closeRenameModal;

  $("renameOk").onclick=async()=>{
    if(!renameChatId) return;
    const newTitle=$("renameInp").value.trim();
    if(!newTitle) return;

    try{
      setStatus("Сохраняю…");
      await api(`/chats/title`,{
        method:"PATCH",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ initData, chat_id:renameChatId, title:newTitle })
      });

      chats=chats.map(c=>c.id===renameChatId?{...c,title:newTitle}:c);
      if(cur===renameChatId) $("title").textContent=newTitle;
      renderChats();
      setStatus("Готово");
      closeRenameModal();
    }catch(e){
      console.error(e);
      setStatus("Ошибка");
      alert("Не удалось переименовать");
    }
  };

  $("renameInp").addEventListener("keydown",e=>{
    if(e.key==="Enter") $("renameOk").click();
    if(e.key==="Escape") closeRenameModal();
  });

  // ====== Scroll helper (ADD) ======
  function isNearBottom(el){
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < 10;
  }

  // ====== STOP support (ADD) ======
  let isGenerating = false;
  let abortCtrl = null;

  async function stopGeneration(){
    if(!isGenerating) return;

    // 1) просим бэк остановиться (может упасть — не критично)
    try{
      await api(`/chat/stop`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ initData, chat_id: cur })
      });
    }catch(e){}

    // 2) обрываем чтение стрима на фронте
    try{ abortCtrl?.abort(); }catch(e){}
  }

  // ====== Load Chats / Messages ======
  async function loadChats(){
    setStatus("Загрузка…");
    const r=await api(`/chats?initData=${encodeURIComponent(initData)}`);
    const j=await r.json();
    chats=(j.chats||[]).filter(c=>!isDeleted(c.id));
    if(!cur && chats[0]) cur=chats[0].id;
    if(cur && isDeleted(cur)) cur=chats[0]?.id||null;
    renderChats();
    if(cur) await loadMessages(cur);
    setStatus("Готово");
  }

  async function loadMessages(chatId){
    cur=chatId; renderChats();
    $("title").textContent=(chats.find(c=>c.id===cur)?.title)||"Чат";
    $("msgs").innerHTML="";
    const r=await api(`/messages?initData=${encodeURIComponent(initData)}&chat_id=${encodeURIComponent(chatId)}`);
    const j=await r.json();
    (j.messages||[]).forEach(m=>addMsg(m.role,m.content));

    // было: $("msgs").scrollTop=$("msgs").scrollHeight;
    // FIX: скроллим вниз только если пользователь и так был внизу
    const box = $("msgs");
    if (isNearBottom(box)) box.scrollTop = box.scrollHeight;

    closeDrawer();
  }

  function renderChats(){
    $("chatList").innerHTML = chats.map(c=>`
      <div class="item ${c.id===cur?"active":""}" onclick="window._sel('${c.id}')">
        <div class="ava">💬</div>
        <div class="meta">
          <b>${esc(c.title)}</b>
          <small>${esc(c.id)}</small>
        </div>
        <div class="rowActions">
          <button class="iconbtn" title="Переименовать" onclick="window._ren(event,'${c.id}')">✏️</button>
          <button class="iconbtn" title="Удалить чат" onclick="window._del(event,'${c.id}')">🗑</button>
        </div>
      </div>`).join("") || `<div class="note">Чатов пока нет.</div>`;
  }

  window._sel=id=>loadMessages(id);

  window._ren=(e,id)=>{
    e?.stopPropagation?.();
    openRenameModal(id);
  };

  window._del=(e,id)=>{
    e?.stopPropagation?.();
    addDeleted(id);
    chats=chats.filter(c=>c.id!==id);
    if(cur===id){
      cur=chats[0]?.id||null;
      $("msgs").innerHTML="";
      $("title").textContent=cur?(chats.find(c=>c.id===cur)?.title||"Чат"):"Выбери чат";
      if(cur) loadMessages(cur).catch(()=>{});
    }
    renderChats();
    setStatus("Готово");
  };

  function addMsg(role,text){
    const d=document.createElement("div");
    d.className="msg "+role;
    d.textContent=text||"";

    // было: append + scroll всегда вниз
    // FIX: скроллим вниз только если юзер был внизу до добавления
    const box = $("msgs");
    const stick = isNearBottom(box);
    box.appendChild(d);
    if(stick) box.scrollTop = box.scrollHeight;

    return d;
  }

  function newChat(){
    const id=String(Date.now());
    chats=[{id,title:"Новый чат"}].concat(chats);
    cur=id;
    renderChats();
    $("msgs").innerHTML="";
    $("title").textContent="Новый чат";
    closeDrawer();
  }
  $("newBtn").onclick=newChat;

  async function send(){
    const text=$("inp").value.trim(); if(!text||!cur) return;

    // если вдруг уже генерим — остановим предыдущую
    if(isGenerating) await stopGeneration();

    $("inp").value="";
    addMsg("user",text);
    const aiEl=addMsg("ai","");
    setStatus("AI печатает…");

    // ====== STOP support (ADD) ======
    isGenerating = true;
    abortCtrl = new AbortController();

    // если в App.jsx есть кнопка id="stop" — покажем/активируем
    if ($("stop")) {
      $("stop").style.display = "";
      $("stop").disabled = false;
    }
    if ($("send")) $("send").disabled = true;

    try{
      const r=await api(`/chat/stream`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ initData, chat_id:cur, text }),
        signal: abortCtrl.signal
      });

      const reader=r.body.getReader(); const dec=new TextDecoder();
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

          // было: всегда тянули вниз => нельзя листать
          // FIX: тянем вниз ТОЛЬКО если пользователь был внизу
          const box = $("msgs");
          const stick = isNearBottom(box);
          aiEl.textContent=full;
          if(stick) box.scrollTop = box.scrollHeight;
        }
      }
      setStatus("Готово");
      await loadChats();
    } catch(e){
      // AbortError при стопе — это ок, не считаем ошибкой
      const msg = String(e || "");
      if(!/AbortError/i.test(msg)){
        console.error(e);
        setStatus("Ошибка");
        if(!aiEl.textContent) aiEl.textContent = "❌ Ошибка";
      } else {
        setStatus("Остановлено");
        if(!aiEl.textContent) aiEl.textContent = "⏹ Остановлено.";
      }
    } finally {
      isGenerating = false;
      abortCtrl = null;

      if ($("stop")) {
        $("stop").style.display = "none";
      }
      if ($("send")) $("send").disabled = false;
    }
  }

  $("send").onclick=send;

  // ====== STOP support (ADD) ======
  if ($("stop")) $("stop").onclick=stopGeneration;

  $("inp").addEventListener("keydown",e=>{ if(e.key==="Enter") send(); });

  (async ()=>{
    if(!initData){
      if(isDev){
        setStatus("DEV режим");
        chats=[{id:"dev",title:"DEV чат"}];
        cur="dev";
        renderChats();
        $("title").textContent="DEV чат";
        addMsg("ai","Локальный режим");
        return;
      }
      setStatus("Открой Mini App");
      $("msgs").innerHTML=`<div class="msg ai">Открой через кнопку <b>Mini App</b>.</div>`;
      return;
    }
    await loadChats().catch(e=>{
      setStatus("Ошибка");
      $("msgs").innerHTML=`<div class="msg ai">❌ ${esc(String(e))}</div>`;
    });
  })();

  const onTouch=e=>{
    if(!e.target.closest(".input")){
      document.activeElement?.blur?.();
    }
  };
  document.addEventListener("touchstart",onTouch);

  return ()=>{ document.removeEventListener("touchstart",onTouch); };
}
