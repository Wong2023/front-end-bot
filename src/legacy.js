export function startLegacy() {
  // защита от двойного запуска (в React dev StrictMode useEffect может запускаться 2 раза)
  if (window.__AI_CHAT_LEGACY_STARTED__) return () => {};
  window.__AI_CHAT_LEGACY_STARTED__ = true;

  const BACKEND_URL="https://telegram-miniapp-backend-nlwh.onrender.com"; // например https://xxx.onrender.com
  const tg=window.Telegram?.WebApp; tg?.ready?.(); tg?.expand?.();
  const initData = tg?.initData || "";
  const isDev =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  // пусто в браузере -> сервер вернёт 403 (и это ок)
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

  // ====== Local delete "mask" (НЕ трогаем бэк) ======
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

  // ====== Load Chats / Messages (как было) ======
  async function loadChats(){
    setStatus("Загрузка…");
    const r=await api(`/chats?initData=${encodeURIComponent(initData)}`);
    const j=await r.json(); chats=(j.chats||[]).filter(c=>!isDeleted(c.id));

    if(!cur && chats[0]) cur=chats[0].id;

    if(cur && isDeleted(cur)) cur = chats[0]?.id || null;

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
    $("msgs").scrollTop=$("msgs").scrollHeight;
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
          <button class="iconbtn" title="Переименовать чат" onclick="window._ren(event,'${c.id}')">✏️</button>
          <button class="iconbtn" title="Удалить чат (локально)" onclick="window._del(event,'${c.id}')">🗑</button>
        </div>
      </div>`).join("") || `<div class="note">Чатов пока нет. Нажми “+ Новый”.</div>`;
  }
  window._sel=(id)=>loadMessages(id);

  window._del = (e, id) => {
    e?.stopPropagation?.();

    addDeleted(id);
    chats = chats.filter(c => c.id !== id);

    if(cur === id){
      cur = chats[0]?.id || null;
      $("msgs").innerHTML = "";
      $("title").textContent = cur
        ? (chats.find(c=>c.id===cur)?.title || "Чат")
        : "Выбери чат";

      if(cur) loadMessages(cur).catch(()=>{});
    }

    renderChats();
    setStatus("Готово");
  };

  // ✅ НОВОЕ: переименование чата (сохраняется на бэке => на всех устройствах)
  window._ren = async (e, id) => {
    e?.stopPropagation?.();

    const curTitle = chats.find(c => c.id === id)?.title || "";
    const title = prompt("Новое название чата:", curTitle);
    if (title == null) return;

    const newTitle = title.trim();
    if (!newTitle) return;

    try {
      setStatus("Сохраняю…");

      await api(`/chats/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, chat_id: id, title: newTitle })
      });

      chats = chats.map(c => c.id === id ? { ...c, title: newTitle } : c);

      if (cur === id) $("title").textContent = newTitle;

      renderChats();
      setStatus("Готово");
    } catch (err) {
      console.error(err);
      setStatus("Ошибка");
      alert("Не удалось переименовать: " + String(err));
    }
  };

  function addMsg(role, text){
    const d=document.createElement("div");
    d.className="msg "+role;
    d.textContent=text||"";
    $("msgs").appendChild(d);
    $("msgs").scrollTop=$("msgs").scrollHeight;
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
    $("inp").value="";
    addMsg("user", text);
    const aiEl=addMsg("ai","");
    setStatus("AI печатает…");

    const r=await api(`/chat/stream`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ initData, chat_id: cur, text })
    });

    const reader=r.body.getReader(); const dec=new TextDecoder();
    let buf="", full="";
    while(true){
      const {value,done}=await reader.read(); if(done) break;
      buf += dec.decode(value,{stream:true});
      const parts = buf.split("\n\n"); buf = parts.pop();
      for(const p of parts){
        const lines=p.split("\n").filter(x=>x.startsWith("data: "));
        const chunk=lines.map(x=>x.slice(6)).join("\n");
        if(chunk==="__START__"||chunk==="__DONE__") continue;
        full += chunk;
        aiEl.textContent = full;
        $("msgs").scrollTop=$("msgs").scrollHeight;
      }
    }
    setStatus("Готово");
    await loadChats();
  }
  $("send").onclick=send;
  $("inp").addEventListener("keydown",e=>{ if(e.key==="Enter") send(); });

 (async ()=>{
  if (!initData) {
    const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";

    if (isDev) {
      setStatus("DEV режим");
      chats = [{ id: "dev", title: "DEV чат" }];
      cur = "dev";
      renderChats();
      $("title").textContent = "DEV чат";
      addMsg("ai", "Локальный режим: backend не вызываю (нет initData).");
      return;
    }

    setStatus("Открой Mini App");
    $("msgs").innerHTML = `<div class="msg ai">Открой через кнопку <b>Mini App</b> в боте.</div>`;
    return;
  }

  await loadChats().catch(e=>{
    setStatus("Ошибка");
    $("msgs").innerHTML=`<div class="msg ai">❌ ${esc(String(e))}</div>`;
  });
})();

  // ===== ЗАКРЫВАТЬ КЛАВУ ПО ТАПУ ВНЕ INPUT =====
  const onTouch = (e) => {
    if (!e.target.closest(".input")) {
      document.activeElement?.blur?.();
    }
  };
  document.addEventListener("touchstart", onTouch);

  // cleanup
  return () => {
    document.removeEventListener("touchstart", onTouch);
  };
}
