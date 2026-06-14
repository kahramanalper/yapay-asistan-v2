"use client";

import { useState, useRef, useEffect } from "react";

function DosyaIndir({ dosya }) {
  function indir() {
    try {
      const byteChars = atob(dosya.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: dosya.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dosya.ad;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Dosya indirilemedi: " + err.message);
    }
  }

  const ikon = dosya.ad.endsWith(".xlsx") ? "📊"
             : dosya.ad.endsWith(".pdf") ? "📄"
             : dosya.ad.endsWith(".docx") ? "📝" : "📎";

  return (
    <button onClick={indir} className="dosya-indir-btn" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      marginTop: 8,
      border: "1px solid #d0d7de",
      borderRadius: 8,
      background: "#f6f8fa",
      cursor: "pointer",
      fontSize: 14,
    }}>
      <span>{ikon}</span>
      <span>{dosya.ad}</span>
      <span style={{ color: "#656d76", fontSize: 12 }}>
        ({(dosya.boyut / 1024).toFixed(1)} KB) ↓
      </span>
    </button>
  );
}

// Yüklenen dosya rozeti (kullanıcı tarafında gösterilir)
function YuklenenDosyaRozeti({ dosya, onSil }) {
  const ikon = dosya.ad.match(/\.(xlsx|xls)$/i) ? "📊"
             : dosya.ad.match(/\.csv$/i) ? "📋"
             : dosya.ad.match(/\.pdf$/i) ? "📄"
             : "📎";
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      margin: "4px 4px 4px 0",
      border: "1px solid #d0d7de",
      borderRadius: 16,
      background: "#eef6ff",
      fontSize: 13,
    }}>
      <span>{ikon}</span>
      <span>{dosya.ad}</span>
      {onSil && (
        <button onClick={onSil} style={{
          border: "none", background: "transparent", cursor: "pointer",
          color: "#656d76", fontSize: 16, padding: 0, marginLeft: 4,
        }}>×</button>
      )}
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeProject, setActiveProject] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]); // gönderilmeyi bekleyen dosyalar (ilk gönderim)
  const [stickyFiles, setStickyFiles] = useState([]); // gönderildikten sonra sonraki mesajlarda da otomatik gider
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      // Sadece izin verilen tipler
      const ext = file.name.split(".").pop().toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext)) {
        alert(`Bu dosya tipi desteklenmiyor: .${ext}\nDesteklenen: .xlsx, .xls, .csv`);
        continue;
      }
      // Dosya boyutu kontrolü (10 MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} çok büyük (${(file.size/1024/1024).toFixed(1)} MB). Maksimum 10 MB.`);
        continue;
      }
      // base64'e çevir
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPendingFiles((prev) => [...prev, {
        ad: file.name,
        boyut: file.size,
        mime: file.type,
        base64,
      }]);
    }
    e.target.value = ""; // input'u temizle
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0 && stickyFiles.length === 0) || loading) return;

    const userText = input.trim() || (pendingFiles.length > 0 ? "Bu dosyayı yükle" : "");
    const yeniDosyalar = pendingFiles;

    // Gönderilecek dosyalar = sticky + yeni
    // Aynı isimli dosyalar varsa yeni olanı koru (kullanıcı yeniden yüklemiş olabilir)
    const stickyAdlar = new Set(yeniDosyalar.map((d) => d.ad));
    const filtrelenmisSticky = stickyFiles.filter((d) => !stickyAdlar.has(d.ad));
    const gonderilecekDosyalar = [...filtrelenmisSticky, ...yeniDosyalar];

    setInput("");
    setPendingFiles([]);
    // Gönderilen dosyalar sticky'ye geçer
    setStickyFiles(gonderilecekDosyalar);

    // Kullanıcı mesajını UI'a ekle
    // Sadece YENİ yüklenen dosyaları kullanıcı mesajında göster (sticky tekrar gösterme kalabalık olur)
    const newMessages = [
      ...messages,
      {
        role: "user",
        content: userText,
        ekDosyalar: yeniDosyalar.map((d) => ({ ad: d.ad, boyut: d.boyut })),
      },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
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
          yuklenenDosyalar: gonderilecekDosyalar, // ← sticky + yeni
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
            dosyalar: data.dosyalar || [],
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
              <button onClick={() => fileInputRef.current?.click()}>
                📎 BOM Excel yükle
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.ekDosyalar && msg.ekDosyalar.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {msg.ekDosyalar.map((d, k) => (
                    <YuklenenDosyaRozeti key={k} dosya={d} />
                  ))}
                </div>
              )}
              <div className="message-content">
                {msg.content.split("\n").map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
              {msg.dosyalar && msg.dosyalar.length > 0 && (
                <div className="dosyalar">
                  {msg.dosyalar.map((d, k) => (
                    <DosyaIndir key={k} dosya={d} />
                  ))}
                </div>
              )}
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

      {/* Sticky dosyalar (sohbet boyunca aktif) */}
      {stickyFiles.length > 0 && (
        <div style={{
          padding: "8px 12px",
          borderTop: "1px solid #e0e0e0",
          background: "#fff8e1",
          fontSize: 12,
        }}>
          <div style={{ color: "#856404", marginBottom: 4, fontSize: 11 }}>
            📌 Aktif dosyalar (her mesajla gönderiliyor):
          </div>
          {stickyFiles.map((d, i) => (
            <YuklenenDosyaRozeti
              key={i}
              dosya={d}
              onSil={() => setStickyFiles((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      {/* Pending files (yeni eklenen, henüz gönderilmemiş) */}
      {pendingFiles.length > 0 && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #e0e0e0", background: "#e8f5e9" }}>
          <div style={{ color: "#2e7d32", marginBottom: 4, fontSize: 11 }}>
            ➕ Yeni dosyalar (gönderildiğinde aktif olacak):
          </div>
          {pendingFiles.map((d, i) => (
            <YuklenenDosyaRozeti
              key={i}
              dosya={d}
              onSil={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="input-area">
        {/* Ataç butonu */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{
            border: "none", background: "transparent", cursor: "pointer",
            fontSize: 22, padding: "0 8px", color: "#656d76",
          }}
          title="Dosya ekle (Excel/CSV)"
        >
          📎
        </button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            pendingFiles.length > 0
              ? "Dosya hakkında istek yaz veya boş bırak..."
              : stickyFiles.length > 0
              ? `${stickyFiles.length} dosya aktif. Bir şey söyleyin...`
              : "Bir şey söyleyin..."
          }
          disabled={loading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={loading || (!input.trim() && pendingFiles.length === 0 && stickyFiles.length === 0)}
          className="send-btn"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
