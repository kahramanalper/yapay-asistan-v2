"use client";

import { useState, useRef, useEffect } from "react";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeProject, setActiveProject] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");

    // Kullanıcı mesajını ekle
    const newMessages = [
      ...messages,
      { role: "user", content: userMessage },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      // API'ye Claude formatında gönder
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          activeProject,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: `⚠️ Hata: ${data.error}` },
        ]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.message,
            model: data.model,
          },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `❌ Bağlantı hatası: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <h1>Yapay İmalat</h1>
          <span className="version">v2</span>
        </div>
        <div className="header-right">
          <input
            type="text"
            placeholder="Aktif proje (ör: SK-2602)"
            value={activeProject}
            onChange={(e) => setActiveProject(e.target.value)}
            className="project-input"
          />
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area">
        {messages.length === 0 && (
          <div className="welcome">
            <p className="welcome-title">Merhaba 👋</p>
            <p className="welcome-text">
              Ben Yapay İmalat asistanınızım. Ne yapmamı istersiniz?
            </p>
            <div className="examples">
              <button onClick={() => setInput("satın almada neler var?")}>
                📋 Satın almada neler var?
              </button>
              <button onClick={() => setInput("T-104 nerede?")}>
                🔍 T-104 nerede?
              </button>
              <button onClick={() => setInput("not al: yarın toplantı var")}>
                📝 Not al
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <div className="message-content">
                {msg.content.split("\n").map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
              {msg.model && (
                <span className="model-badge">
                  {msg.model.includes("haiku") ? "⚡" : "🧠"}{" "}
                  {msg.model.includes("haiku") ? "Hızlı" : "Akıllı"}
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-bubble">
              <div className="typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="input-area">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Bir şey söyleyin..."
          disabled={loading}
          className="chat-input"
        />
        <button type="submit" disabled={loading || !input.trim()} className="send-btn">
          ↑
        </button>
      </form>
    </div>
  );
}
