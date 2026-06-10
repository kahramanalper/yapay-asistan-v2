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
  "neler var", "var mı", "var mi", "listele", "göster", "goster",
  "kaç", "kac", "hangi", "kimler", "nedir", "ne durumda", "nerede",
  "durumu", "listesi", "?",
];

// Başarı iddiası tespiti — Claude bu kalıpları kullanıyorsa bir işlem yaptığını iddia ediyor
const BASARI_KALIPLARI = [
  "✅", "eklendi", "kaydedildi", "güncellendi", "guncellendi",
  "oluşturuldu", "olusturuldu", "silindi", "tamamlandı olarak",
  "değiştirildi", "degistirildi", "alındı olarak",
];

function niyetVar(metin, kelimeler) {
  const kucuk = metin.toLowerCase();
  return kelimeler.some((k) => kucuk.includes(k));
}

export async function POST(request) {
  try {
    const { messages, activeProject } = await request.json();

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

    // ─────────────────────────────────────────────
    // DEBUG: Tüm araç çağrılarını burada topluyoruz
    // ─────────────────────────────────────────────
    const debug = {
      aracCagrilari: [], // { arac, girdi, sonucOzet, basarili }
      zorlamaYapildi: false,
      iterasyon: 0,
    };

    async function claudeCagir(msgs, forceTool = false) {
      return anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        // forceTool=true ise Claude araç çağırmak ZORUNDA (metin üretemez)
        ...(forceTool ? { tool_choice: { type: "any" } } : {}),
        messages: msgs,
      });
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
              result = await executeTool(block.name, block.input);
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

    const zorlamaGerekli =
      !aracCagrildi &&
      ((islemIstendi && basariIddiasi) || sorguIstendi);

    if (zorlamaGerekli) {
      debug.zorlamaYapildi = true;

      // Claude'u araç çağırmaya zorla (tool_choice: any → metin üretemez)
      const zorlaMesajlar = [
        ...messages,
        {
          role: "user",
          content:
            "SİSTEM UYARISI: Az önce araç çağırmadan cevap verdin. Bu yasak. " +
            "Şimdi kullanıcının son isteğini GERÇEK araç çağrısıyla yap. " +
            "Sorguysa airtable_sorgula, yazma işlemiyse ilgili yazma aracını kullan.",
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
