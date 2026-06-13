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

export async function executeTool(toolName, toolInput) {
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
