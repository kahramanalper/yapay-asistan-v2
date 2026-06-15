import {
  listRecords,
  createRecord,
  createRecords,
  updateRecord,
  updateRecords,
  deleteRecord,
} from "./airtable.js";

function resolveTableName(input) {
  const map = {
    projeler: "Projeler", proje: "Projeler",
    bom: "BOM", "malzeme listesi": "BOM",
    "satın alma": "Sat\u0131n Alma", "satin alma": "Sat\u0131n Alma", sa: "Sat\u0131n Alma",
    imalat: "\u0130malat",
    "imalat süre": "\u0130malat S\u00fcre Ar\u015fivi", "süre arşivi": "\u0130malat S\u00fcre Ar\u015fivi",
    kalite: "Kalite Kontrol", "kalite kontrol": "Kalite Kontrol", kk: "Kalite Kontrol",
    depo: "Depo", stok: "Depo",
    "depo rezervasyon": "Depo Rezervasyon Alanlar",
    teklifler: "Teklifler", teklif: "Teklifler",
    "tedarikçiler": "Tedarik\u00e7iler", tedarikciler: "Tedarik\u00e7iler",
    "dökümanlar": "D\u00f6k\u00fcmanlar", dokumanlar: "D\u00f6k\u00fcmanlar",
    "görevler": "G\u00f6revler", gorevler: "G\u00f6revler", "görev": "G\u00f6revler",
    notlar: "Notlar", not: "Notlar",
    bildirimler: "Bildirimler", bildirim: "Bildirimler",
    "kullanıcılar": "Kullan\u0131c\u0131lar", kullanicilar: "Kullan\u0131c\u0131lar",
    "parça kuralları": "Par\u00e7a Kurallar\u0131",
    "tedarik kuralları": "Tedarik Kurallar\u0131",
    test: "Test",
    "müşteriler": "M\u00fc\u015fteriler", musteriler: "M\u00fc\u015fteriler",
    "sohbet özetleri": "Sohbet \u00d6zetleri",
    token: "TokenKullanim", tokenkullanim: "TokenKullanim",
    ayarlar: "Ayarlar",
  };
  const key = input.toLowerCase().trim();
  return map[key] || input;
}

export async function executeTool(toolName, toolInput, ctx = {}) {
  try {
    switch (toolName) {
      case "kayit_listele": return await handleList(toolInput);
      case "kayit_olustur": return await handleCreate(toolInput);
      case "kayit_guncelle": return await handleUpdate(toolInput);
      case "kayit_sil": return await handleDelete(toolInput);
      case "parca_nerede": return await handleParcaNerede(toolInput);
      case "isleme_al": return await handleIslemeAl(toolInput);
      case "durum_degistir": return await handleDurumDegistir(toolInput);
      case "dosya_olustur": return await handleDosyaOlustur(toolInput);
      case "bom_yukle_onizleme": return await handleBomYukleOnizleme(toolInput, ctx.yuklenenDosyalar);
      case "bom_yukle_onayla": return await handleBomYukleOnayla(toolInput, ctx.yuklenenDosyalar);
      default: return { basarili: false, error: "Bilinmeyen araç: " + toolName };
    }
  } catch (err) {
    return { basarili: false, error: "HATA: " + err.message };
  }
}

async function handleList({ tablo, filtre, siralama, maxKayit, alanlar }) {
  const tableName = resolveTableName(tablo);
  const options = {};
  if (filtre) options.filterByFormula = filtre;
  if (siralama) options.sort = siralama;
  if (maxKayit) options.maxRecords = String(maxKayit);
  if (alanlar) options.fields = alanlar;
  const records = await listRecords(tableName, options);
  return { basarili: true, kayitlar: records, toplam: records.length };
}

async function handleCreate({ tablo, alanlar, cokluKayit }) {
  const tableName = resolveTableName(tablo);
  if (cokluKayit && cokluKayit.length > 0) {
    const results = await createRecords(tableName, cokluKayit);
    return { basarili: true, olusturulan: results, toplam: results.length };
  }
  if (alanlar) {
    const result = await createRecord(tableName, alanlar);
    return { basarili: true, olusturulan: result };
  }
  return { basarili: false, error: "alanlar veya cokluKayit gerekli" };
}

async function handleUpdate({ tablo, kayitId, filtre, alanlar }) {
  const tableName = resolveTableName(tablo);
  if (kayitId) {
    const result = await updateRecord(tableName, kayitId, alanlar);
    return { basarili: true, guncellenen: result };
  }
  if (filtre) {
    const records = await listRecords(tableName, { filterByFormula: filtre });
    if (records.length === 0) return { basarili: false, error: "Kayıt bulunamadı" };
    if (records.length === 1) {
      const result = await updateRecord(tableName, records[0].id, alanlar);
      return { basarili: true, guncellenen: result };
    }
    const updates = records.map((r) => ({ id: r.id, fields: alanlar }));
    const results = await updateRecords(tableName, updates.slice(0, 10));
    return { basarili: true, guncellenen: results, toplam: results.length };
  }
  return { basarili: false, error: "kayitId veya filtre gerekli" };
}

async function handleDelete({ tablo, kayitId }) {
  const tableName = resolveTableName(tablo);
  const result = await deleteRecord(tableName, kayitId);
  return { basarili: true, silinen: result };
}

async function handleParcaNerede({ parcaNo, projeAdi }) {
  const filter = projeAdi
    ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`
    : `{Parça No}="${parcaNo}"`;

  const [bom, sa, imalat, kk, depo] = await Promise.all([
    listRecords("BOM", { filterByFormula: filter }).catch(() => []),
    listRecords("Sat\u0131n Alma", { filterByFormula: filter }).catch(() => []),
    listRecords("\u0130malat", { filterByFormula: filter }).catch(() => []),
    listRecords("Kalite Kontrol", { filterByFormula: filter }).catch(() => []),
    listRecords("Depo", { filterByFormula: `{Parça No}="${parcaNo}"` }).catch(() => []),
  ]);

  return {
    basarili: true, parcaNo,
    bom: bom.length > 0 ? bom : null,
    satinAlma: sa.length > 0 ? sa : null,
    imalat: imalat.length > 0 ? imalat : null,
    kaliteKontrol: kk.length > 0 ? kk : null,
    depo: depo.length > 0 ? depo : null,
  };
}

async function handleIslemeAl({ parcaNo, projeAdi }) {
  const bomRecords = await listRecords("BOM", {
    filterByFormula: `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`,
  });
  if (bomRecords.length === 0) {
    return { basarili: false, error: parcaNo + " BOM'da bulunamadı (Proje: " + projeAdi + ")" };
  }

  const bom = bomRecords[0];
  const tip = bom.Tip || "";
  const results = { basarili: true, parcaNo, tip, adimlar: [] };

  // ─────────────────────────────────────────────
  // 1. Tedarik Kuralları tablosundan Yöntem'i çöz
  // ─────────────────────────────────────────────
  let yontem = null;
  try {
    const kurallar = await listRecords("Tedarik Kurallar\u0131", {
      filterByFormula: `{Tip}="${tip}"`,
    });
    if (kurallar.length > 0) {
      yontem = kurallar[0]["Y\u00f6ntem"] || kurallar[0].Yontem || null;
    }
  } catch (e) {
    // Tablo veya alan yoksa varsayılana düş
  }

  // Varsayılan: Tedarik Kuralı yoksa Tip'e göre karar
  if (!yontem) {
    if (tip === "Standart Parça") yontem = "Satın Alma";
    else if (tip === "Montaj") yontem = "Montaj";
    else yontem = "İmalat"; // Torna, Freze, Kaynak, Lazer Kesim, vb.
  }

  results.yontem = yontem;

  // ─────────────────────────────────────────────
  // YOL A — Yöntem: İmalat (Torna, Freze, Kaynak, Lazer Kesim...)
  // ─────────────────────────────────────────────
  if (yontem === "\u0130malat" || yontem === "İmalat" || yontem === "Imalat") {
    // 1. BOM durumu → İmalatta
    await updateRecord("BOM", bom.id, { Durum: "\u0130malatta" });
    results.adimlar.push("BOM: İmalatta");

    // 2. HM- kaydı BOM'a ekle
    const hmNo = "HM-" + parcaNo;
    await createRecord("BOM", {
      "Par\u00e7a No": hmNo,
      "Tan\u0131m": (bom["Tan\u0131m"] || parcaNo) + " Hammaddesi",
      Tip: "Hammadde",
      Miktar: bom.Miktar || 1,
      Malzeme: bom.Malzeme || "",
      Durum: "Sat\u0131n Almada",
      "Proje Ad\u0131": projeAdi,
    });
    results.adimlar.push("BOM'a " + hmNo + " eklendi");

    // 3. HM- SA'ya ekle
    await createRecord("Sat\u0131n Alma", {
      "Par\u00e7a No": hmNo,
      "Tan\u0131m": (bom["Tan\u0131m"] || parcaNo) + " Hammaddesi",
      Miktar: bom.Miktar || 1,
      Durum: "Bekliyor",
      "Proje Ad\u0131": projeAdi,
      Kaynak: "BOM",
    });
    results.adimlar.push("SA'ya " + hmNo + " eklendi: Bekliyor");

    // 4. İmalat kaydı aç — aşamayı Tip'ten çöz
    let asama = "Torna"; // varsayılan
    const tipLower = tip.toLowerCase();
    if (tipLower.includes("freze") && !tipLower.includes("torna")) asama = "Freze";
    else if (tipLower.includes("torna") && tipLower.includes("freze")) asama = "Torna"; // Torna&Freze → önce Torna
    else if (tipLower.includes("lazer")) asama = "Lazer Kesim";
    else if (tipLower.includes("kaynak")) asama = "Kaynak";
    else if (tipLower.includes("torna")) asama = "Torna";
    else if (tipLower.includes("ta\u015flama")) asama = "Taşlama";

    await createRecord("\u0130malat", {
      "Par\u00e7a No": parcaNo,
      "Tan\u0131m": bom["Tan\u0131m"] || "",
      "Proje Ad\u0131": projeAdi,
      "A\u015fama": asama,
      Durum: "Hammadde Bekliyor",
    });
    results.adimlar.push("İmalat kaydı: Hammadde Bekliyor (" + asama + ")");

    return results;
  }

  // ─────────────────────────────────────────────
  // YOL B — Yöntem: Satın Alma (Standart Parça)
  // Hammadde yok, İmalat kaydı yok. Sadece SA'ya direkt parça.
  // ─────────────────────────────────────────────
  if (yontem === "Sat\u0131n Alma" || yontem === "Satın Alma" || yontem === "Satin Alma") {
    // 1. BOM durumu → Satın Almada
    await updateRecord("BOM", bom.id, { Durum: "Sat\u0131n Almada" });
    results.adimlar.push("BOM: Satın Almada");

    // 2. SA tablosunda zaten var mı kontrol et
    const mevcutSA = await listRecords("Sat\u0131n Alma", {
      filterByFormula: `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`,
    }).catch(() => []);

    if (mevcutSA.length > 0) {
      results.adimlar.push("SA'da " + parcaNo + " zaten var, atlandı");
    } else {
      // 3. SA'ya direkt parça (hammadde değil, parça)
      await createRecord("Sat\u0131n Alma", {
        "Par\u00e7a No": parcaNo,
        "Tan\u0131m": bom["Tan\u0131m"] || "",
        Miktar: bom.Miktar || 1,
        Durum: "Bekliyor",
        "Proje Ad\u0131": projeAdi,
        Kaynak: "BOM",
      });
      results.adimlar.push("SA'ya " + parcaNo + " eklendi: Bekliyor");
    }

    return results;
  }

  // ─────────────────────────────────────────────
  // YOL C — Tip: Montaj
  // Hammadde yok, SA yok. Sadece BOM ve İmalat kaydı.
  // ─────────────────────────────────────────────
  if (yontem === "Montaj" || tip === "Montaj") {
    // 1. BOM durumu → İmalatta (montaj da bir tür imalat)
    await updateRecord("BOM", bom.id, { Durum: "\u0130malatta" });
    results.adimlar.push("BOM: İmalatta");

    // 2. İmalat kaydı aç (varsayılan Alt Montaj — kullanıcı sonra değiştirebilir)
    await createRecord("\u0130malat", {
      "Par\u00e7a No": parcaNo,
      "Tan\u0131m": bom["Tan\u0131m"] || "",
      "Proje Ad\u0131": projeAdi,
      "A\u015fama": "Alt Montaj",
      Durum: "Bekliyor",
    });
    results.adimlar.push("İmalat kaydı: Bekliyor (Alt Montaj)");

    return results;
  }

  // Bilinmeyen yöntem
  return {
    basarili: false,
    error: `Bilinmeyen yöntem: "${yontem}". Tedarik Kuralları tablosunda Tip="${tip}" için Yöntem (İmalat/Satın Alma/Montaj) tanımlı değil.`,
    tip, yontem,
  };
}

async function handleDurumDegistir({ tablo, parcaNo, projeAdi, yeniDurum, ekBilgi }) {
  const tableName = resolveTableName(tablo);
  const filter = projeAdi
    ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`
    : `{Parça No}="${parcaNo}"`;

  const records = await listRecords(tableName, { filterByFormula: filter });
  if (records.length === 0) {
    return { basarili: false, error: parcaNo + " " + tableName + "'da bulunamadı" };
  }

  const record = records[0];
  const updateFields = { Durum: yeniDurum };
  if (ekBilgi) Object.assign(updateFields, ekBilgi);

  await updateRecord(tableName, record.id, updateFields);
  const results = { basarili: true, adimlar: [tableName + ": " + yeniDurum] };

  // SA "Teslim Alındı"
  if (tableName === "Sat\u0131n Alma" && yeniDurum === "Teslim Al\u0131nd\u0131") {
    const proje = projeAdi || record["Proje Ad\u0131"] || "";
    await createRecord("Kalite Kontrol", {
      "Par\u00e7a No": parcaNo,
      "Tan\u0131m": record["Tan\u0131m"] || "",
      "Sonu\u00e7": "Bekliyor",
      Durum: "Aktif",
      "Proje Ad\u0131": proje,
      "Kay\u0131t Tarihi": new Date().toISOString().split("T")[0],
    });
    results.adimlar.push("KK kaydı: Bekliyor");

    const bomFilter = proje
      ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${proje}")`
      : `{Parça No}="${parcaNo}"`;
    const bomRecs = await listRecords("BOM", { filterByFormula: bomFilter }).catch(() => []);
    if (bomRecs.length > 0) {
      await updateRecord("BOM", bomRecs[0].id, { Durum: "Kalite Kontrolde" });
      results.adimlar.push("BOM: Kalite Kontrolde");
    }

    if (parcaNo.startsWith("HM-")) {
      const anaParca = parcaNo.replace("HM-", "");
      const imalatFilter = proje
        ? `AND({Parça No}="${anaParca}",{Proje Adı}="${proje}")`
        : `{Parça No}="${anaParca}"`;
      const imalatRecs = await listRecords("\u0130malat", { filterByFormula: imalatFilter }).catch(() => []);
      if (imalatRecs.length > 0) {
        await updateRecord("\u0130malat", imalatRecs[0].id, { Durum: "Devam Ediyor" });
        results.adimlar.push("İmalat: " + anaParca + " Devam Ediyor");
      }
    }
  }

  // İmalat "Tamamlandı"
  if (tableName === "\u0130malat" && yeniDurum === "Tamamland\u0131") {
    const proje = projeAdi || record["Proje Ad\u0131"] || "";
    await createRecord("Kalite Kontrol", {
      "Par\u00e7a No": parcaNo,
      "Tan\u0131m": record["Tan\u0131m"] || "",
      "Sonu\u00e7": "Bekliyor",
      Durum: "Aktif",
      "Proje Ad\u0131": proje,
      "Kay\u0131t Tarihi": new Date().toISOString().split("T")[0],
    });
    results.adimlar.push("KK kaydı: Bekliyor");
    await updateRecord("\u0130malat", record.id, {
      "Ger\u00e7ek Biti\u015f": new Date().toISOString().split("T")[0],
    });
  }

  // KK "Onaylandı"
  if (tableName === "Kalite Kontrol" && (yeniDurum === "Onayland\u0131" || yeniDurum === "Onaylandı")) {
    await updateRecord("Kalite Kontrol", record.id, { "Sonu\u00e7": "Onayland\u0131", Durum: "Tamamland\u0131" });
    const depoRecs = await listRecords("Depo", { filterByFormula: `{Parça No}="${parcaNo}"` }).catch(() => []);
    if (depoRecs.length > 0) {
      const stok = depoRecs[0]["Miktar"] || 0;
      await updateRecord("Depo", depoRecs[0].id, { Miktar: stok + 1, "Son G\u00fcncelleme": new Date().toISOString().split("T")[0] });
      results.adimlar.push("Depo stoku güncellendi");
    } else {
      await createRecord("Depo", { "Par\u00e7a No": parcaNo, "Tan\u0131m": record["Tan\u0131m"] || "", Miktar: 1, "Son G\u00fcncelleme": new Date().toISOString().split("T")[0] });
      results.adimlar.push("Depo kaydı oluşturuldu");
    }
    const proje = projeAdi || record["Proje Ad\u0131"] || "";
    const bomFilter = proje
      ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${proje}")`
      : `{Parça No}="${parcaNo}"`;
    const bomRecs = await listRecords("BOM", { filterByFormula: bomFilter }).catch(() => []);
    if (bomRecs.length > 0) {
      await updateRecord("BOM", bomRecs[0].id, { Durum: "Depoda" });
      results.adimlar.push("BOM: Depoda");
    }
  }

  // KK "Reddedildi"
  if (tableName === "Kalite Kontrol" && (yeniDurum === "Reddedildi" || yeniDurum === "Reddedildi")) {
    await updateRecord("Kalite Kontrol", record.id, { "Sonu\u00e7": "Reddedildi", Durum: "Tamamland\u0131" });
    results.adimlar.push("⚠️ Parça reddedildi");
  }

  return results;
}

// ─────────────────────────────────────────────
// DOSYA OLUŞTURMA (Excel / PDF / Word)
// ─────────────────────────────────────────────
async function handleDosyaOlustur({ tip, dosyaAdi, baslik, sutunlar, satirlar, metin }) {
  try {
    const safeAd = (dosyaAdi || "dosya").replace(/[^a-zA-Z0-9\-_çÇğĞıİöÖşŞüÜ]/g, "_");
    let buffer, mime, uzanti;

    if (tip === "excel") {
      const XLSX = await import("xlsx");
      const wsData = [];
      if (baslik) wsData.push([baslik]);
      if (sutunlar && sutunlar.length) wsData.push(sutunlar);
      if (satirlar && satirlar.length) wsData.push(...satirlar);
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sayfa1");
      buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      uzanti = "xlsx";
    } else if (tip === "pdf") {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Türkçe karakterleri ASCII'ye yaklaştır (StandardFonts WinAnsi destekler ama
      // bazı Türkçe karakterleri tam karşılamaz; en güvenli yol replace)
      const trToAscii = (s) => String(s ?? "")
        .replace(/ı/g, "i").replace(/İ/g, "I")
        .replace(/ş/g, "s").replace(/Ş/g, "S")
        .replace(/ğ/g, "g").replace(/Ğ/g, "G")
        .replace(/ç/g, "c").replace(/Ç/g, "C")
        .replace(/ö/g, "o").replace(/Ö/g, "O")
        .replace(/ü/g, "u").replace(/Ü/g, "U");

      let page = pdfDoc.addPage([595, 842]); // A4
      const pageWidth = 595;
      const margin = 40;
      let y = 800;

      if (baslik) {
        page.drawText(trToAscii(baslik), {
          x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0),
        });
        y -= 30;
      }

      if (satirlar && satirlar.length && sutunlar && sutunlar.length) {
        const colCount = sutunlar.length;
        const colWidth = (pageWidth - 2 * margin) / colCount;

        // Başlık satırı
        sutunlar.forEach((s, i) => {
          page.drawText(trToAscii(s), {
            x: margin + i * colWidth, y, size: 10, font: fontBold,
          });
        });
        y -= 4;
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
        });
        y -= 14;

        // Veri satırları
        for (const row of satirlar) {
          if (y < 40) {
            page = pdfDoc.addPage([595, 842]);
            y = 800;
          }
          row.forEach((v, i) => {
            const text = trToAscii(v).slice(0, 25); // taşmayı önle
            page.drawText(text, {
              x: margin + i * colWidth, y, size: 9, font,
            });
          });
          y -= 14;
        }
      } else if (metin) {
        const lines = trToAscii(metin).split("\n");
        for (const line of lines) {
          if (y < 40) {
            page = pdfDoc.addPage([595, 842]);
            y = 800;
          }
          page.drawText(line.slice(0, 90), { x: margin, y, size: 11, font });
          y -= 14;
        }
      }

      const pdfBytes = await pdfDoc.save();
      buffer = Buffer.from(pdfBytes);
      mime = "application/pdf";
      uzanti = "pdf";
    } else if (tip === "word") {
      const docxLib = await import("docx");
      const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel } = docxLib;

      const children = [];
      if (baslik) {
        children.push(new Paragraph({ text: baslik, heading: HeadingLevel.HEADING_1 }));
      }
      if (satirlar && satirlar.length && sutunlar && sutunlar.length) {
        const headerRow = new TableRow({
          children: sutunlar.map(
            (s) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(s), bold: true })] })],
              })
          ),
        });
        const bodyRows = satirlar.map(
          (row) =>
            new TableRow({
              children: row.map(
                (v) =>
                  new TableCell({
                    children: [new Paragraph(String(v ?? ""))],
                  })
              ),
            })
        );
        children.push(new Table({ rows: [headerRow, ...bodyRows] }));
      } else if (metin) {
        for (const line of String(metin).split("\n")) {
          children.push(new Paragraph(line));
        }
      }
      const doc = new Document({ sections: [{ children }] });
      buffer = await Packer.toBuffer(doc);
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      uzanti = "docx";
    } else {
      return { basarili: false, error: "Geçersiz tip. excel/pdf/word olmalı." };
    }

    const base64 = buffer.toString("base64");
    return {
      basarili: true,
      dosya: {
        ad: `${safeAd}.${uzanti}`,
        mime,
        base64,
        boyut: buffer.length,
      },
      mesaj: `${safeAd}.${uzanti} hazırlandı (${(buffer.length / 1024).toFixed(1)} KB)`,
    };
  } catch (err) {
    return { basarili: false, error: "Dosya oluşturma hatası: " + err.message };
  }
}

// ─────────────────────────────────────────────
// BOM YÜKLEME (SolidWorks Excel/CSV parse)
// ─────────────────────────────────────────────

// Hafıza içi önizleme cache (request-scoped olmadığı için Vercel'de farklı invocation'lar
// arasında kaybolabilir — kullanıcı önizleme + onayı kısa sürede yapacak)
// Production'da daha sağlam çözüm: önizlemeyi Airtable Sohbet Özetleri'ne yaz veya
// onayla aracına satirlar verisini de geçir. Şimdilik basit tutuyoruz.
const _bomOnizlemeCache = new Map();

// String temizleme: \n, fazla boşluk, satır sonu temizle
function _temizle(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

// "224 mm" → 224, "1234,5 mm" → 1234.5, NaN/boş → null
function _sayiCevir(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, "").replace(/mm$/i, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// ÖĞE NO seviyesi: "2.2.6.1" → 4
function _seviye(ogn) {
  if (ogn === null || ogn === undefined) return 0;
  const s = String(ogn).trim();
  if (!s) return 0;
  return s.split(".").length;
}

// "2.2.6.1" → "2.2.6" (parent)
function _parent(ogn) {
  const s = String(ogn).trim();
  const parts = s.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

// Rota oluştur: İmal Usulü + Ek İşlem → "Lazer Kesim, Büküm, Diş, Kaynak, RAL 9006"
// Bölme kuralları: "/" , "+" , "," ile parçala, trim et, boşları at, tekrarları çıkar.
function _rotaOlustur(imalUsulu, ekIslem) {
  const asamalar = [];

  const bol = (s) => {
    if (!s) return [];
    return String(s)
      .replace(/\r?\n/g, " ")
      .split(/[\/+,]/) // / + , karakterleriyle böl
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  };

  // İmal Usulü'ndeki bazı değerler rotaya yazılmaz (standart parça, ham parça vb.)
  const yazilmazUsuller = ["standart", "ham parca", "ham parça", "stnd", "satin alma", "satın alma"];

  const imal = bol(imalUsulu);
  for (const u of imal) {
    const uLower = u.toLowerCase();
    if (yazilmazUsuller.some((x) => uLower === x)) continue;
    // "Standart + İşleme" gibi → "Standart" atlanır, "İşleme" eklenir
    if (yazilmazUsuller.some((x) => uLower.startsWith(x + " "))) {
      const kalan = u.slice(uLower.indexOf(" ") + 1).trim();
      if (kalan) asamalar.push(kalan);
      continue;
    }
    asamalar.push(u);
  }

  const ek = bol(ekIslem);
  for (const e of ek) {
    asamalar.push(e);
  }

  // Tekrarları temizle (büyük/küçük harf duyarsız), sırayı koru
  const gorulen = new Set();
  const benzersiz = [];
  for (const a of asamalar) {
    const key = a.toLowerCase();
    if (gorulen.has(key)) continue;
    gorulen.add(key);
    benzersiz.push(a);
  }

  return benzersiz.join(", ");
}

// Parça No'dan Tip belirleme: Parça Kuralları tablosundan
async function _tipBelirle(parcaNo, kurallar) {
  if (!parcaNo) return "Standart Parça";
  const temizPN = parcaNo.trim();
  // En spesifik (uzun desen) önce eşleşmeli — kuralları desen uzunluğuna göre sırala
  const sirali = [...kurallar].sort((a, b) => {
    const aLen = (a.Desen || "").length;
    const bLen = (b.Desen || "").length;
    return bLen - aLen;
  });
  for (const k of sirali) {
    const desen = k.Desen || "";
    const konum = (k.Konum || "ba\u015flang\u0131\u00e7").toLowerCase();
    if (!desen) continue;
    if (konum === "varsay\u0131lan" || desen === "*") continue; // sona bırak
    if (konum.includes("regex")) {
      try {
        const re = new RegExp(desen);
        if (re.test(temizPN)) return k.Tip || "Standart Parça";
      } catch (e) { /* geçersiz regex, atla */ }
    } else {
      // başlangıç eşleşmesi
      if (temizPN.startsWith(desen)) return k.Tip || "Standart Parça";
    }
  }
  // Varsayılan kural
  const varsayilan = kurallar.find(
    (k) => (k.Konum || "").toLowerCase() === "varsay\u0131lan" || k.Desen === "*"
  );
  if (varsayilan) return varsayilan.Tip || "Standart Parça";
  return "Standart Parça";
}

// Excel/CSV base64'ten satırları parse et
async function _excelParse(base64, dosyaAdi) {
  const XLSX = await import("xlsx");
  const buf = Buffer.from(base64, "base64");
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // header:1 → satırlar dizi olarak gelir (ilk satır başlık)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  return rows;
}

// Sütun adı bul (Türkçe/İngilizce eş anlamlılar)
function _sutunIndex(headers, ...aliaslar) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\.\-_]/g, "");
  const headerNorm = headers.map(norm);
  for (const a of aliaslar) {
    const an = norm(a);
    const idx = headerNorm.indexOf(an);
    if (idx >= 0) return idx;
  }
  return -1;
}

async function handleBomYukleOnizleme({ dosyaAdi, projeAdi }, yuklenenDosyalar) {
  if (!yuklenenDosyalar || yuklenenDosyalar.length === 0) {
    return { basarili: false, error: "Yüklenmiş dosya yok. Kullanıcı önce dosya yüklemiş olmalı." };
  }
  const dosya = yuklenenDosyalar.find(
    (d) => d.ad === dosyaAdi || d.ad.includes(dosyaAdi)
  ) || yuklenenDosyalar[0];

  if (!dosya || !dosya.base64) {
    return { basarili: false, error: `Dosya bulunamadı: ${dosyaAdi}` };
  }

  try {
    const rows = await _excelParse(dosya.base64, dosya.ad);
    if (rows.length < 2) {
      return { basarili: false, error: "Dosyada veri yok veya başlık satırı eksik." };
    }

    // Başlık satırını bul (genellikle ilk satır, ama bazen 2-3. satırda olabilir)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i] || [];
      const joined = row.map((c) => _temizle(c).toLowerCase()).join(" ");
      if (joined.includes("\u00f6\u011fe") || joined.includes("ogn") ||
          joined.includes("par\u00e7a") || joined.includes("parca") ||
          joined.includes("item")) {
        headerIdx = i;
        break;
      }
    }
    const headers = rows[headerIdx].map((c) => _temizle(c));
    const dataRows = rows.slice(headerIdx + 1);

    // Sütun indexleri
    const idxOgn = _sutunIndex(headers, "ÖĞE NO.", "ÖĞE NO", "OGN", "Item No", "Item", "Sıra");
    const idxParcaNo = _sutunIndex(headers, "PARÇA NUMARASI", "Parça No", "Part Number", "Parca No", "Parça");
    const idxEn = _sutunIndex(headers, "En", "Width");
    const idxBoy = _sutunIndex(headers, "Boy", "Length", "Uzunluk");
    const idxYukseklik = _sutunIndex(headers, "Yükseklik", "Yukseklik", "Height");
    const idxCap = _sutunIndex(headers, "Çap", "Cap", "Diameter");
    const idxAgirlik = _sutunIndex(headers, "Ağırlık", "Agirlik", "Weight");
    const idxMalzeme = _sutunIndex(headers, "Malzeme", "Material");
    const idxMiktar = _sutunIndex(headers, "MİKT.", "Miktar", "Qty", "Quantity", "Adet");
    const idxTanim = _sutunIndex(headers, "Tanım", "Tanim", "Description", "Açıklama");
    // YENİ: İmal Usulü + Ek İşlem (rota oluşturmak için)
    const idxImalUsulu = _sutunIndex(headers, "İmal Usulü", "Imal Usulu", "İmal Yöntemi", "Üretim Yöntemi", "Process", "İşlem");
    const idxEkIslem = _sutunIndex(headers, "Ek İşlem", "Ek Islem", "Yan İşlem", "Finishing", "İkincil İşlem");
    const idxKutuk = _sutunIndex(headers, "Kütük Ölçüsü", "Kutuk Olcusu", "Ham Ölçü", "Stock Size");
    const idxTedarikci = _sutunIndex(headers, "Tedarikçi", "Tedarikci", "Supplier", "Tedarik");
    const idxProje = _sutunIndex(headers, "Proje", "Proje Adı", "Project");

    if (idxParcaNo < 0) {
      return {
        basarili: false,
        error: "Parça No sütunu bulunamadı. Beklenen sütun adları: PARÇA NUMARASI, Parça No, Part Number.",
        bulunanBasliklar: headers,
      };
    }

    // Parça Kuralları'nı çek (tip belirleme için)
    let parcaKurallari = [];
    try {
      parcaKurallari = await listRecords("Par\u00e7a Kurallar\u0131", {});
    } catch (e) { /* kurallar yoksa varsayılan kullanılır */ }

    // ÖĞE NO bazlı parça kayıtları
    const kayitlar = []; // { ogn, parcaNo, tanim, miktar, en, boy, yukseklik, cap, agirlik, malzeme, seviye, parentOgn, rota, imalUsulu, ekIslem, kutuk, tedarikci }
    for (const row of dataRows) {
      if (!row || row.length === 0) continue;
      const ogn = idxOgn >= 0 ? _temizle(row[idxOgn]) : "";
      const parcaNoRaw = _temizle(row[idxParcaNo]);
      if (!parcaNoRaw) continue;

      const imalUsulu = idxImalUsulu >= 0 ? _temizle(row[idxImalUsulu]) : "";
      const ekIslem = idxEkIslem >= 0 ? _temizle(row[idxEkIslem]) : "";
      const rota = _rotaOlustur(imalUsulu, ekIslem);

      kayitlar.push({
        ogn,
        parcaNo: parcaNoRaw, // tam haliyle, \n temizlenmiş
        tanim: idxTanim >= 0 ? _temizle(row[idxTanim]) : "",
        miktar: idxMiktar >= 0 ? (_sayiCevir(row[idxMiktar]) || 1) : 1,
        en: idxEn >= 0 ? _sayiCevir(row[idxEn]) : null,
        boy: idxBoy >= 0 ? _sayiCevir(row[idxBoy]) : null,
        yukseklik: idxYukseklik >= 0 ? _sayiCevir(row[idxYukseklik]) : null,
        cap: idxCap >= 0 ? _sayiCevir(row[idxCap]) : null,
        agirlik: idxAgirlik >= 0 ? _sayiCevir(row[idxAgirlik]) : null,
        malzeme: idxMalzeme >= 0 ? _temizle(row[idxMalzeme]) : "",
        // YENİ: rota + kaynak alanlar
        rota,
        imalUsulu,
        ekIslem,
        kutuk: idxKutuk >= 0 ? _temizle(row[idxKutuk]) : "",
        tedarikci: idxTedarikci >= 0 ? _temizle(row[idxTedarikci]) : "",
        seviye: _seviye(ogn),
        parentOgn: _parent(ogn),
      });
    }

    // Montaj tespiti: bir ÖĞE NO'nun altında alt kalem varsa o bir Montaj
    const altKalemSayisi = new Map();
    for (const k of kayitlar) {
      if (k.parentOgn) {
        altKalemSayisi.set(k.parentOgn, (altKalemSayisi.get(k.parentOgn) || 0) + 1);
      }
    }

    // ÖĞE NO → parça No haritası (Üst Montaj alanını parça koduyla doldurmak için)
    const ognToParca = new Map();
    for (const k of kayitlar) {
      if (k.ogn) ognToParca.set(k.ogn, k.parcaNo);
    }

    // Her kayda Tip ve Üst Montaj ata
    for (const k of kayitlar) {
      const altVarMi = (altKalemSayisi.get(k.ogn) || 0) > 0;
      if (altVarMi) {
        k.tip = "Montaj";
        // Aşama hiyerarşiden:
        if (k.seviye === 1) k.asama = "Final Montaj";
        else if (k.seviye === 2) k.asama = "Üst Montaj";
        else k.asama = "Alt Montaj";
      } else {
        k.tip = await _tipBelirle(k.parcaNo, parcaKurallari);
        k.asama = null;
      }
      k.ustMontaj = k.parentOgn ? (ognToParca.get(k.parentOgn) || "") : "";
    }

    // İstatistikler
    const istatistik = {
      toplam: kayitlar.length,
      montaj: kayitlar.filter((k) => k.tip === "Montaj").length,
      finalMontaj: kayitlar.filter((k) => k.asama === "Final Montaj").length,
      ustMontaj: kayitlar.filter((k) => k.asama === "Üst Montaj").length,
      altMontaj: kayitlar.filter((k) => k.asama === "Alt Montaj").length,
      parca: kayitlar.filter((k) => k.tip !== "Montaj").length,
      rotali: kayitlar.filter((k) => k.rota && k.rota.length > 0).length, // YENİ
      cokAsamali: kayitlar.filter((k) => k.rota && k.rota.includes(",")).length, // YENİ: 2+ aşamalı
    };

    // İlk 5 ve son 5 satırın özeti
    const ozetSatir = (k) => ({
      ogn: k.ogn,
      parcaNo: k.parcaNo.length > 50 ? k.parcaNo.slice(0, 50) + "…" : k.parcaNo,
      tip: k.tip,
      asama: k.asama || "-",
      miktar: k.miktar,
      malzeme: k.malzeme || "-",
      ustMontaj: k.ustMontaj || "-",
      rota: k.rota || "-", // YENİ: rotayı önizlemede göster
    });

    const ilkSatirlar = kayitlar.slice(0, 5).map(ozetSatir);
    const sonSatirlar = kayitlar.length > 10 ? kayitlar.slice(-5).map(ozetSatir) : [];

    // Cache'e at (onayla için)
    const cacheKey = `${dosya.ad}::${projeAdi}`;
    _bomOnizlemeCache.set(cacheKey, { kayitlar, projeAdi, dosyaAdi: dosya.ad, zaman: Date.now() });

    return {
      basarili: true,
      dosyaAdi: dosya.ad,
      projeAdi,
      istatistik,
      ilkSatirlar,
      sonSatirlar,
      tumKayitlar: kayitlar.length <= 30 ? kayitlar.map(ozetSatir) : null, // küçükse hepsini ver
      cacheKey,
      mesaj: `${istatistik.toplam} satır okundu. ${istatistik.montaj} montaj, ${istatistik.parca} parça.` +
        (istatistik.cokAsamali > 0 ? ` ${istatistik.cokAsamali} parça çok aşamalı (rotalı).` : "") +
        ` Onaylarsan ${projeAdi} projesine yazacağım.`,
    };
  } catch (err) {
    return { basarili: false, error: "Parse hatası: " + err.message };
  }
}

async function handleBomYukleOnayla({ dosyaAdi, projeAdi }, yuklenenDosyalar) {
  // Cache'e güvenmiyoruz (Vercel serverless izolasyonu). Her seferde sıfırdan parse et.
  // Frontend dosyayı sticky olarak gönderiyor, yani onayla aşamasında da dosya elimizde olmalı.
  const onizleme = await handleBomYukleOnizleme({ dosyaAdi, projeAdi }, yuklenenDosyalar);
  if (!onizleme.basarili) {
    return {
      basarili: false,
      error: "Onaylama için dosya yeniden parse edilemedi: " + (onizleme.error || "bilinmeyen hata"),
    };
  }

  // Cache'ten oku (handleBomYukleOnizleme cache'e yazdı)
  const cacheKey = `${onizleme.dosyaAdi}::${projeAdi}`;
  const veri = _bomOnizlemeCache.get(cacheKey);
  if (!veri) {
    return { basarili: false, error: "Önizleme verisi bulunamadı (cache hatası)." };
  }

  const kayitlar = veri.kayitlar;
  const sonuc = {
    basarili: true,
    projeAdi,
    yazilan: 0,
    atlanan: [],
    hata: [],
  };

  // Mevcut BOM'da o projedeki tüm parça numaralarını çek (mükerrer kontrolü için)
  let mevcutParcaNolar = new Set();
  try {
    const escProje = projeAdi.replace(/"/g, '\\"');
    const mevcutlar = await listRecords("BOM", {
      filterByFormula: `{Proje Adı}="${escProje}"`,
    });
    mevcutParcaNolar = new Set(mevcutlar.map((r) => r["Par\u00e7a No"]));
  } catch (e) { /* tablo boşsa boş kalır */ }

  // 10'arlı batch'ler halinde yaz
  const yazilacaklar = [];
  for (const k of kayitlar) {
    if (mevcutParcaNolar.has(k.parcaNo)) {
      sonuc.atlanan.push(k.parcaNo);
      continue;
    }
    const alanlar = {
      "Par\u00e7a No": k.parcaNo,
      "Proje Ad\u0131": projeAdi,
      "\u00d6\u011fe No": k.ogn || "",
      Tip: k.tip,
      Miktar: k.miktar,
      Durum: "Bekliyor",
    };

    // Tanım: orijinal tanım + kütük ölçüsü (varsa)
    let tanim = k.tanim || "";
    if (k.kutuk) {
      tanim = tanim ? `${tanim} | ${k.kutuk}` : k.kutuk;
    }
    if (tanim) alanlar["Tan\u0131m"] = tanim;

    if (k.malzeme) alanlar.Malzeme = k.malzeme;
    if (k.en !== null) alanlar.En = k.en;
    if (k.boy !== null) alanlar.Boy = k.boy;
    if (k.yukseklik !== null) alanlar["Y\u00fckseklik"] = k.yukseklik;
    if (k.cap !== null) alanlar["\u00c7ap"] = k.cap;
    if (k.agirlik !== null) alanlar["A\u011f\u0131rl\u0131k"] = k.agirlik;
    if (k.ustMontaj) alanlar["\u00dcst Montaj"] = k.ustMontaj;
    // YENİ: Rota alanını yaz (BOM tablosunda Rota alanı olmalı, Long text)
    if (k.rota) alanlar.Rota = k.rota;
    yazilacaklar.push(alanlar);
  }

  // 10'arlı batch yaz
  for (let i = 0; i < yazilacaklar.length; i += 10) {
    const batch = yazilacaklar.slice(i, i + 10);
    try {
      await createRecords("BOM", batch);
      sonuc.yazilan += batch.length;
    } catch (err) {
      // Batch hatası — tek tek dene
      for (const alan of batch) {
        try {
          await createRecord("BOM", alan);
          sonuc.yazilan += 1;
        } catch (e2) {
          sonuc.hata.push({ parcaNo: alan["Par\u00e7a No"], hata: e2.message });
        }
      }
    }
  }

  // Cache'i temizle
  _bomOnizlemeCache.delete(cacheKey);

  sonuc.mesaj = `✅ ${sonuc.yazilan} kayıt BOM'a yazıldı.` +
    (sonuc.atlanan.length > 0 ? ` ${sonuc.atlanan.length} mükerrer atlandı.` : "") +
    (sonuc.hata.length > 0 ? ` ${sonuc.hata.length} kayıt hata aldı.` : "");

  return sonuc;
}
