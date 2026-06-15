import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { tools } from "@/lib/tools";
import { executeTool } from "@/lib/tool-executor";
import { selectModel } from "@/lib/model-router";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// İşlem/sorgu niyeti tespiti — bu kelimeler varsa araç çağrısı ZORUNLU
const ISLEM_KELIMELERI = [
  "ekle", "kaydet", "oluştur", "olustur", "güncelle", "guncelle",
  "değiştir", "degistir", "sil", "işleme al", "isleme al", "imalata al",
  "not al", "görev ata", "gorev ata", "teslim alındı", "teslim alindi",
  "tamamlandı", "tamamlandi", "onayla", "bitti", "geldi", "gönder", "gonder",
];
const SORGU_KELIMELERI = [
  "neler var", "neler", "var mı", "var mi", "listele", "göster", "goster",
  "kaç", "kac", "hangi", "kimler", "kim ", "nedir", "ne durumda", "nerede",
  "durumu", "listesi", "merak ediyorum", "öğren", "ogren", "anlat", "?",
];

// Başarı iddiası tespiti — Claude bu kalıpları kullanıyorsa bir işlem yaptığını iddia ediyor
const BASARI_KALIPLARI = [
  "✅", "eklendi", "kaydedildi", "güncellendi", "guncellendi",
  "oluşturuldu", "olusturuldu", "silindi", "tamamlandı olarak",
  "değiştirildi", "degistirildi", "alındı olarak",
];

// Sahte tool call tespiti — Claude araç çağrısı yerine XML/JSON metin yazıyorsa
const SAHTE_ARAC_KALIPLARI = [
  "<call>", "</call>", "<tool>", "<function>", "</tool_use>",
  "sorgu yapıyorum", "sorguluyorum", "çekiyorum...", "cekiyorum...",
  "araç çağrısı yapıyorum", "arac cagrisi yapiyorum",
];

function niyetVar(metin, kelimeler) {
  const kucuk = metin.toLowerCase();
  return kelimeler.some((k) => kucuk.includes(k));
}

export async function POST(request) {
  // debug nesnesi try DIŞINDA — catch'te de erişebilelim
  const debug = {
    aracCagrilari: [],
    zorlamaYapildi: false,
    iterasyon: 0,
    loglar: [],
  };

  function dlog(seviye, ...args) {
    const mesaj = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
    const satir = `[${seviye}] ${mesaj}`;
    debug.loglar.push(satir);
    if (seviye === "ERROR") console.error(satir);
    else if (seviye === "WARN") console.warn(satir);
    else console.log(satir);
  }

  try {
    const { messages, activeProject, yuklenenDosyalar } = await request.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: "Mesaj gerekli" }, { status: 400 });
    }

    dlog("INFO", "POST başladı, mesaj sayısı:", messages.length);

    const lastUserMsg =
      typeof messages[messages.length - 1]?.content === "string"
        ? messages[messages.length - 1].content
        : "";
    const model = selectModel(lastUserMsg);

    // Aktif proje varsa system prompt'a ekle
    let systemPrompt = SYSTEM_PROMPT;
    if (activeProject) {
      systemPrompt += `\n\n## AKTİF PROJE: ${activeProject}\nKullanıcı proje belirtmezse bu projeyi kullan.`;
    }

    // Yüklenmiş dosya varsa Claude'a bilgi ver
    if (yuklenenDosyalar && yuklenenDosyalar.length > 0) {
      const dosyaListesi = yuklenenDosyalar
        .map((d) => `- ${d.ad} (${(d.boyut / 1024).toFixed(1)} KB)`)
        .join("\n");
      systemPrompt += `\n\n## YÜKLENMİŞ DOSYALAR\nKullanıcı bu mesajla birlikte şu dosyaları yükledi:\n${dosyaListesi}\n\nEğer dosya bir BOM listesi (parça listesi, malzeme listesi, Excel/CSV) gibi görünüyorsa bom_yukle_onizleme aracını çağır. Önce projeAdi'nı netleştir (aktif proje varsa onu kullan, yoksa kullanıcıya sor).`;
    }

    // ─────────────────────────────────────────────
    // (debug ve dlog POST fonksiyonu başında tanımlı — try DIŞINDA)
    // ─────────────────────────────────────────────

    // Dosya çıktıları (Excel/PDF/Word) — frontend'e iletilecek
    const dosyalar = [];

    // BOM yüklemesi başarılı olunca otomatik temizlenecek dosyalar
    const dosyaTemizle = [];

    // Tool executor context (yüklenen dosyaları araçlara iletmek için)
    const toolCtx = { yuklenenDosyalar: yuklenenDosyalar || [] };

    async function claudeCagir(msgs, forceToolName = null) {
      // forceToolName: null = serbest, string = o aracı çağırmaya zorla, "any" = herhangi
      const payload = {
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools, // her zaman gönderiliyor
        messages: msgs,
      };

      // Tools'un yüklendiğinden emin ol
      if (!tools || tools.length === 0) {
        dlog("ERROR", "tools array BOŞ! Import sorunu olabilir. tools:", tools);
        return await anthropic.messages.create({
          model, max_tokens: 2048, system: systemPrompt, messages: msgs,
        });
      }

      if (forceToolName === "any") {
        payload.tool_choice = { type: "any" };
      } else if (typeof forceToolName === "string" && forceToolName.length > 0) {
        payload.tool_choice = { type: "tool", name: forceToolName };
      }

      dlog("INFO", "claudeCagir model:", model, "toolsCount:", tools.length, "forceToolName:", forceToolName || "none", "msgCount:", msgs.length, "tool_choice:", JSON.stringify(payload.tool_choice || "auto"));

      try {
        const res = await anthropic.messages.create(payload);
        const blocks = Array.isArray(res?.content) ? res.content : [];
        dlog("INFO", "claudeCagir cevap → stop_reason:", res?.stop_reason, "contentBlocks:", blocks.length, "blockTypes:", blocks.map((b) => b.type).join(","), "outputTokens:", res?.usage?.output_tokens);
        for (const b of blocks) {
          if (b.type === "text") {
            dlog("INFO", "text block:", b.text.slice(0, 200));
          } else if (b.type === "tool_use") {
            dlog("INFO", "tool_use block:", b.name, "input:", JSON.stringify(b.input).slice(0, 200));
          }
        }
        return res;
      } catch (e) {
        dlog("ERROR", "claudeCagir HATA:", e.message, "status:", e.status);
        if (forceToolName && String(e.message || "").toLowerCase().includes("tool_choice")) {
          dlog("WARN", "tool_choice fallback: zorlamayı kaldırıp tekrar deniyorum");
          delete payload.tool_choice;
          try {
            const res2 = await anthropic.messages.create(payload);
            const blocks2 = Array.isArray(res2?.content) ? res2.content : [];
            dlog("INFO", "fallback cevap → stop_reason:", res2?.stop_reason, "blockTypes:", blocks2.map((b) => b.type).join(","));
            return res2;
          } catch (e2) {
            dlog("ERROR", "fallback de başarısız:", e2.message);
            throw e2;
          }
        }
        throw e;
      }
    }

    async function aracDongusu(baslangicMesajlari, ilkYanit) {
      let response = ilkYanit;
      const allMessages = [...baslangicMesajlari];
      let maxIterations = 10;

      // SAVUNMA: response veya response.content undefined olabilir mi?
      if (!response) {
        dlog("ERROR", "aracDongusu: response undefined geldi!");
        return { content: [], stop_reason: "error", usage: {} };
      }
      if (!Array.isArray(response.content)) {
        dlog("ERROR", "aracDongusu: response.content array değil:", typeof response.content, JSON.stringify(response).slice(0, 300));
        return response;
      }

      while (response.stop_reason === "tool_use" && maxIterations > 0) {
        maxIterations--;
        debug.iterasyon++;

        allMessages.push({ role: "assistant", content: response.content });

        const toolResults = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            let result;
            try {
              result = await executeTool(block.name, block.input, toolCtx);
            } catch (e) {
              result = { basarili: false, hata: e.message };
            }

            // DEBUG kaydı
            debug.aracCagrilari.push({
              arac: block.name,
              girdi: block.input,
              basarili: result?.basarili !== false,
              sonucOzet: JSON.stringify(result).slice(0, 300),
            });

            // Dosya çıktısı varsa yakala (Excel/PDF/Word)
            if (result?.dosya && result.dosya.base64) {
              dosyalar.push(result.dosya);
              // Claude'a base64 göndermemek için tool_result'tan çıkar (token israfı önlenir)
              const temizSonuc = { ...result };
              delete temizSonuc.dosya;
              temizSonuc.dosya = { ad: result.dosya.ad, boyut: result.dosya.boyut, hazirlandi: true };
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(temizSonuc),
              });
              continue;
            }

            // BOM yükleme başarılı olursa o dosyayı frontend'e "temizle" diye işaretle
            if (
              block.name === "bom_yukle_onayla" &&
              result?.basarili === true &&
              result?.yazilan > 0
            ) {
              const ad = block.input?.dosyaAdi;
              if (ad && !dosyaTemizle.includes(ad)) {
                dosyaTemizle.push(ad);
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
              // Airtable hatası varsa Claude'a açıkça bildir
              ...(result?.basarili === false ? { is_error: true } : {}),
            });
          }
        }

        allMessages.push({ role: "user", content: toolResults });
        response = await claudeCagir(allMessages);
      }

      return response;
    }

    // ── 1. tur: normal çağrı ──
    dlog("INFO", "1. tur çağrılıyor (serbest)");
    let response = await claudeCagir(messages);
    dlog("INFO", "1. tur döndü, aracDongusu'na giriliyor");
    response = await aracDongusu(messages, response);
    dlog("INFO", "aracDongusu bitti, iterasyon:", debug.iterasyon, "aracCagrilari:", debug.aracCagrilari.length);

    // SAVUNMA: response.content undefined olursa boş array gibi davran
    const safeContent = (r) => Array.isArray(r?.content) ? r.content : [];
    let textBlocks = safeContent(response).filter((b) => b.type === "text");
    let assistantText = textBlocks.map((b) => b.text).join("\n");
    dlog("INFO", "assistantText uzunluk:", assistantText.length);

    // ─────────────────────────────────────────────
    // HALLÜSİNASYON KORUMASI
    // Kullanıcı işlem/sorgu istedi + Claude HİÇ araç çağırmadı
    // + (işlemse) başarı iddia ediyor → araç çağırmaya ZORLA
    // ─────────────────────────────────────────────
    const islemIstendi = niyetVar(lastUserMsg, ISLEM_KELIMELERI);
    const sorguIstendi = niyetVar(lastUserMsg, SORGU_KELIMELERI);
    const aracCagrildi = debug.aracCagrilari.length > 0;
    const basariIddiasi = niyetVar(assistantText, BASARI_KALIPLARI);
    // YENİ: Claude araç çağrısını metin olarak uydurdu mu? (XML, "sorguluyorum..." vb.)
    const sahteAracCagrisi = niyetVar(assistantText, SAHTE_ARAC_KALIPLARI);

    const zorlamaGerekli =
      !aracCagrildi &&
      ((islemIstendi && basariIddiasi) || sorguIstendi || sahteAracCagrisi);

    if (zorlamaGerekli) {
      debug.zorlamaYapildi = true;

      // Hangi aracın çağrılması gerek — ismen söyleyeceğiz
      let zorlanacakArac = null; // null = "any"
      let aracYonlendirme = "";
      const msgLower = lastUserMsg.toLowerCase();

      if (msgLower.includes("nerede") || msgLower.includes(" durum")) {
        zorlanacakArac = "parca_nerede";
        aracYonlendirme = "parca_nerede aracını çağır (parcaNo parametresi ver).";
      } else if (sorguIstendi || sahteAracCagrisi) {
        zorlanacakArac = "kayit_listele";
        const tabloIpuclari = [
          { kelimeler: ["proje"], tablo: "Projeler" },
          { kelimeler: ["bom", "malzeme listesi", "parça listesi"], tablo: "BOM" },
          { kelimeler: ["satın al", "satin al", "sa "], tablo: "Satın Alma" },
          { kelimeler: ["imalat", "üretim"], tablo: "İmalat" },
          { kelimeler: ["kalite", "kk "], tablo: "Kalite Kontrol" },
          { kelimeler: ["depo", "stok"], tablo: "Depo" },
          { kelimeler: ["teklif"], tablo: "Teklifler" },
          { kelimeler: ["tedarikçi", "tedarikci"], tablo: "Tedarikçiler" },
          { kelimeler: ["görev", "gorev"], tablo: "Görevler" },
          { kelimeler: ["not "], tablo: "Notlar" },
          { kelimeler: ["bildirim"], tablo: "Bildirimler" },
          { kelimeler: ["doküman", "dokuman"], tablo: "Dökümanlar" },
          { kelimeler: ["test"], tablo: "Test" },
          { kelimeler: ["müşteri", "musteri"], tablo: "Müşteriler" },
        ];
        const eslesme = tabloIpuclari.find((t) => t.kelimeler.some((k) => msgLower.includes(k)));
        if (eslesme) {
          aracYonlendirme = `kayit_listele aracını ÇAĞIR. tablo parametresi: "${eslesme.tablo}".`;
        } else {
          aracYonlendirme = "kayit_listele aracını ÇAĞIR ve uygun tablo adını ver.";
        }
      } else {
        zorlanacakArac = "any";
        aracYonlendirme = "İlgili yazma aracını (kayit_olustur, durum_degistir vb.) ÇAĞIR.";
      }

      dlog("INFO", "ZORLAMA tetiklendi → zorlanacakArac:", zorlanacakArac, "yonlendirme:", aracYonlendirme);

      const zorlaMesajlar = [
        ...messages,
        {
          role: "user",
          content:
            "SİSTEM: Bir önceki cevabın araç çağırmadan üretildi, bu hatalı. " +
            "Şimdi kullanıcının orijinal isteğini araç çağrısı ile yap. " +
            aracYonlendirme,
        },
      ];

      response = await claudeCagir(zorlaMesajlar, zorlanacakArac);
      response = await aracDongusu(zorlaMesajlar, response);

      textBlocks = safeContent(response).filter((b) => b.type === "text");
      assistantText = textBlocks.map((b) => b.text).join("\n");

      // Zorlamaya rağmen hâlâ araç çağrılmadıysa → kullanıcıyı kandırma, dürüst ol
      if (debug.aracCagrilari.length === 0) {
        dlog("ERROR", "ZORLAMA BAŞARISIZ - toolsCount:", tools.length, "stop_reason:", response.stop_reason, "content:", JSON.stringify(response.content).slice(0, 500));
        assistantText =
          "⚠️ İşlemi gerçekleştiremedim — sistem araç çağrısı yapamadı. " +
          "Lütfen komutu tekrar dene veya farklı şekilde yaz.";
      }
    }

    // ─────────────────────────────────────────────
    // SON KONTROL: Araçlardan herhangi biri hata döndü mü?
    // Döndüyse ve Claude yine de "✅ başarılı" diyorsa → düzelt
    // ─────────────────────────────────────────────
    const hataliCagrilar = debug.aracCagrilari.filter((c) => !c.basarili);
    if (hataliCagrilar.length > 0 && niyetVar(assistantText, ["✅"])) {
      const hataDetay = hataliCagrilar
        .map((c) => `${c.arac}: ${c.sonucOzet}`)
        .join(" | ");
      assistantText =
        "⚠️ İşlem sırasında hata oluştu, kayıt tam yapılamamış olabilir.\n" +
        "Detay: " + hataDetay;
    }

    return Response.json({
      message: assistantText,
      model,
      usage: response.usage,
      dosyalar, // ← Excel/PDF/Word çıktıları
      dosyaTemizle, // ← Frontend stickyFiles'tan çıkaracak dosya adları
      debug, // ← Network sekmesinden görebileceksin
    });
  } catch (error) {
    console.error("Chat API error:", error);
    debug.loglar.push(`[CATCH] ${error.name}: ${error.message}`);
    return Response.json(
      {
        error: "Bir hata oluştu: " + error.message,
        debug: {
          ...debug,
          hataMesaji: error.message,
          hataAdi: error.name,
          stack: error.stack ? error.stack.split("\n").slice(0, 10).join("\n") : "stack yok",
        },
      },
      { status: 500 }
    );
  }
}
