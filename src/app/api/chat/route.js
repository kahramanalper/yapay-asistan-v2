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
  try {
    const { messages, activeProject, yuklenenDosyalar } = await request.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: "Mesaj gerekli" }, { status: 400 });
    }

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
    // DEBUG: Tüm araç çağrılarını burada topluyoruz
    // ─────────────────────────────────────────────
    const debug = {
      aracCagrilari: [], // { arac, girdi, sonucOzet, basarili }
      zorlamaYapildi: false,
      iterasyon: 0,
    };

    // Dosya çıktıları (Excel/PDF/Word) — frontend'e iletilecek
    const dosyalar = [];

    // BOM yüklemesi başarılı olunca otomatik temizlenecek dosyalar
    const dosyaTemizle = [];

    // Tool executor context (yüklenen dosyaları araçlara iletmek için)
    const toolCtx = { yuklenenDosyalar: yuklenenDosyalar || [] };

    async function claudeCagir(msgs, forceTool = false) {
      const payload = {
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools, // tools her zaman gönderiliyor
        messages: msgs,
      };
      // forceTool=true ise Claude'u araç çağırmaya zorla
      // ÖNEMLİ: tool_choice.any sadece tools dolu ve API tarafında tanınmışsa çalışır.
      // Bazen Vercel cold-start veya API edge case'lerinde "tool_choice.any may only be
      // specified while providing tools" hatası alabiliyoruz. Bu yüzden hem tools'un
      // dolu olduğunu kontrol ediyoruz hem de try/catch ile fallback yapıyoruz.
      if (forceTool && tools && tools.length > 0) {
        payload.tool_choice = { type: "any" };
      }
      try {
        return await anthropic.messages.create(payload);
      } catch (e) {
        // tool_choice hatası geldiyse: zorlamayı bırak, sadece normal çağrı yap.
        // System mesajına eklenmiş olan zorlama metni Claude'u yine yönlendirecek.
        if (forceTool && String(e.message || "").toLowerCase().includes("tool_choice")) {
          delete payload.tool_choice;
          return await anthropic.messages.create(payload);
        }
        throw e;
      }
    }

    async function aracDongusu(baslangicMesajlari, ilkYanit) {
      let response = ilkYanit;
      const allMessages = [...baslangicMesajlari];
      let maxIterations = 10;

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
    let response = await claudeCagir(messages);
    response = await aracDongusu(messages, response);

    let textBlocks = response.content.filter((b) => b.type === "text");
    let assistantText = textBlocks.map((b) => b.text).join("\n");

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

      // Hangi araç çağrılmalı, açıkça söyle (Claude yön bulması için)
      let aracYonlendirme = "";
      const msgLower = lastUserMsg.toLowerCase();
      if (msgLower.includes("nerede") || msgLower.includes("durum")) {
        aracYonlendirme = "parca_nerede aracını çağır (parcaNo parametresi ver).";
      } else if (sorguIstendi) {
        // Sorgu — kayit_listele kullanılmalı, tablo adı mesajdan çıkarsanabilir
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
          aracYonlendirme = `kayit_listele aracını çağır: tablo="${eslesme.tablo}".`;
        } else {
          aracYonlendirme = "İlgili tablodan kayit_listele aracıyla veri çek.";
        }
      } else {
        aracYonlendirme = "İlgili yazma aracını (kayit_olustur, durum_degistir vb.) çağır.";
      }

      const zorlaMesajlar = [
        ...messages,
        {
          role: "user",
          content:
            "⚠️ SİSTEM UYARISI: Önceki cevabında araç çağırmadan metin ürettin — bu YASAK. " +
            "Şimdi kullanıcının son isteğini GERÇEK araç çağrısıyla yap. " +
            aracYonlendirme +
            " Cevap olarak hiçbir açıklama yazma, doğrudan aracı çağır.",
        },
      ];

      response = await claudeCagir(zorlaMesajlar, true);
      response = await aracDongusu(zorlaMesajlar, response);

      textBlocks = response.content.filter((b) => b.type === "text");
      assistantText = textBlocks.map((b) => b.text).join("\n");

      // Zorlamaya rağmen hâlâ araç çağrılmadıysa → kullanıcıyı kandırma, dürüst ol
      if (debug.aracCagrilari.length === 0) {
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
    return Response.json(
      { error: "Bir hata oluştu: " + error.message },
      { status: 500 }
    );
  }
}
