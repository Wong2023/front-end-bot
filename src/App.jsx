import React, { useEffect } from "react";
import "./index.css";
import { startLegacy } from "./legacy";

export default function App() {
  useEffect(() => {
    const cleanup = startLegacy();
    return () => cleanup?.();
  }, []);

  return (
    <>
      <div className="drawerShade" id="shade"></div>

      <div className="wrap">
        <div className="sidebar" id="sidebar">
          <div className="brand">
            <b>💬 AI Chats</b>
            <button className="btn primary" id="newBtn">+ Новый</button>
          </div>

          <div className="list" id="chatList"></div>
          <div className="note">История хранится в базе (по Telegram user_id).</div>
        </div>

        <div className="main">
          <div className="top">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button className="btn hamb" id="openSide" title="Чаты">☰</button>
              <div
                className="card"
                id="title"
                style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                Выбери чат
              </div>
            </div>
            <div className="card note" id="status">—</div>
          </div>

          <div className="msgs" id="msgs"></div>

          <div className="input">
            <input id="inp" placeholder="Напиши сообщение…" />
            <button className="btn primary" id="send">Отправить</button>
          </div>
        </div>
      </div>
    </>
  );
}
