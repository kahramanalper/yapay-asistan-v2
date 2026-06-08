import {
  listRecords,
  createRecord,
  createRecords,
  updateRecord,
  updateRecords,
  deleteRecord,
} from "./airtable.js";

// Tablo adı çözümleme
function resolveTableName(input) {
  const map = {
    projeler: "Projeler",
    proje: "Projeler",
    bom: "BOM",
    "malzeme listesi": "BOM",
    "satın alma": "Sat\u0131n Alma",
    "satin alma": "Sat\u0131n Alma",
    sa: "Sat\u0131n Alma",
    imalat: "\u0130malat",
    "imalat süre": "\u0130malat S\u00fcre Ar\u015fivi",
    "süre arşivi": "\u0130malat S\u00fcre Ar\u015fivi",
    kalite: "Kalite Kontrol",
    "kalite kontrol": "Kalite Kontrol",
    kk: "Kalite Kontrol",
    depo: "Depo",
    stok: "Depo",
    teklifler: "Teklifler",
    teklif: "Teklifler",
    "tedarikçiler": "Tedarik\u00e7iler",
    tedarikciler: "Tedarik\u00e7iler",
    "dökümanlar": "D\u00f6k\u00fcmanlar",
    dokumanlar: "D\u00f6k\u00fcmanlar",
    "görevler": "G\u00f6revler",
    gorevler: "G\u00f6revler",
    notlar: "Notlar",
    not: "Notlar",
    bildirimler: "Bildirimler",
    bildirim: "Bildirimler",
    "kullanıcılar": "Kullan\u0131c\u0131lar",
    kullanicilar: "Kullan\u0131c\u0131lar",
    "parça kuralları": "Par\u00e7a Kurallar\u0131",
    "tedarik kuralları": "Tedarik Kurallar\u0131",
    "test kayıtları": "Test Kay\u0131tlar\u0131",
    test: "Test Kay\u0131tlar\u0131",
    "müşteriler": "M\u00fc\u015fteriler",
    musteriler: "M\u00fc\u015fteriler",
    "sohbet özetleri": "Sohbet \u00d6zetleri",
    token: "TokenKullan\u0131m",
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
      default: return { error: `Bilinmeyen araç: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
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
  return { kayitlar: records, toplam: records.length };
}

async function handleCreate({ tablo, alanlar, cokluKayit }) {
  const tableName = resolveTableName(tablo);
  if (cokluKayit && cokluKayit.length > 0) {
    const results = await createRecords(tableName, cokluKayit);
    return { olusturulan: results, toplam: results.length };
  }
  if (alanlar) {
    const result = await createRecord(tableName, alanlar);
    return { olusturulan: result };
  }
  return { error: "alanlar veya cokluKayit gerekli" };
}

async function handleUpdate({ tablo, kayitId, filtre, alanlar }) {
  const tableName = resolveTableName(tablo);
  if (kayitId) {
    const result = await updateRecord(tableName, kayitId, alanlar);
    return { guncellenen: result };
  }
  if (filtre) {
    const records = await listRecords(tableName, { filterByFormula: filtre });
    if (records.length === 0) return { error: "Kayıt bulunamadı", filtre };
    if (records.length === 1) {
      const result = await updateRecord(tableName, records[0].id, alanlar);
      return { guncellenen: result };
    }
    const updates = records.map((r) => ({ id: r.id, fields: alanlar }));
    const results = await updateRecords(tableName, updates.slice(0, 10));
    return { guncellenen: results, toplam: results.length };
  }
  return { error: "kayitId veya filtre gerekli" };
}

async function handleDelete({ tablo, kayitId }) {
  const tableName = resolveTableName(tablo);
  const result = await deleteRecord(tableName, kayitId);
  return { silinen: result };
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
    parcaNo,
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
    return { error: `${parcaNo} BOM'da bulunamadı (Proje: ${projeAdi})` };
  }

  const bomRecord = bomRecords[0];
  const results = { adimlar: [] };

  await updateRecord("BOM", bomRecord.id, { Durum: "Sat\u0131n Almada" });
  results.adimlar.push("BOM durumu: Satın Almada");

  const hmParcaNo = `HM-${parcaNo}`;
  await createRecord("BOM", {
    "Par\u00e7a No": hmParcaNo,
    "Tan\u0131m": `${bomRecord["Tan\u0131m"] || parcaNo} - Hammadde`,
    Tip: "Hammadde",
    Miktar: bomRecord.Miktar || 1,
    Malzeme: bomRecord.Malzeme || "",
    Durum: "Sat\u0131n Almada",
    "Proje Ad\u0131": projeAdi,
  });
  results.adimlar.push(`HM kaydı eklendi: ${hmParcaNo}`);

  await createRecord("Sat\u0131n Alma", {
    "Par\u00e7a No": hmParcaNo,
    "Tan\u0131m": `${bomRecord["Tan\u0131m"] || parcaNo} - Hammadde`,
    Miktar: bomRecord.Miktar || 1,
    Durum: "Bekliyor",
    "Proje Ad\u0131": projeAdi,
    Kaynak: "Genel",
  });
  results.adimlar.push("SA kaydı: Bekliyor");

  let asama = "Torna";
  if (parcaNo.startsWith("F-")) asama = "Freze";
  else if (parcaNo.startsWith("L-")) asama = "Lazer";
  else if (parcaNo.startsWith("K-")) asama = "Kaynak";

  await createRecord("\u0130malat", {
    "Par\u00e7a No": parcaNo,
    "A\u015fama": asama,
    Durum: "Hammadde Bekliyor",
    "Proje Ad\u0131": projeAdi,
  });
  results.adimlar.push(`İmalat kaydı: Hammadde Bekliyor (${asama})`);

  return results;
}

async function handleDurumDegistir({ tablo, parcaNo, projeAdi, yeniDurum, ekBilgi }) {
  const tableName = resolveTableName(tablo);
  const filter = projeAdi
    ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`
    : `{Parça No}="${parcaNo}"`;

  const records = await listRecords(tableName, { filterByFormula: filter });
  if (records.length === 0) {
    return { error: `${parcaNo} ${tableName}'da bulunamadı` };
  }

  const record = records[0];
  const updateFields = { Durum: yeniDurum };
  if (ekBilgi) Object.assign(updateFields, ekBilgi);

  await updateRecord(tableName, record.id, updateFields);
  const results = { adimlar: [`${tableName}: ${yeniDurum}`] };

  // SA "Teslim Alındı"
  if (tableName === "Sat\u0131n Alma" && yeniDurum === "Teslim Al\u0131nd\u0131") {
    await createRecord("Kalite Kontrol", {
      "Par\u00e7a No": parcaNo,
      "Sonu\u00e7": "Bekliyor",
      "Proje Ad\u0131": projeAdi || record["Proje Ad\u0131"] || "",
    });
    results.adimlar.push("KK kaydı: Bekliyor");

    const bomFilter = projeAdi
      ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`
      : `{Parça No}="${parcaNo}"`;
    const bomRecs = await listRecords("BOM", { filterByFormula: bomFilter }).catch(() => []);
    if (bomRecs.length > 0) {
      await updateRecord("BOM", bomRecs[0].id, { Durum: "Teslim Al\u0131nd\u0131" });
      results.adimlar.push("BOM: Teslim Alındı");
    }

    if (parcaNo.startsWith("HM-")) {
      const anaParca = parcaNo.replace("HM-", "");
      const imalatFilter = projeAdi
        ? `AND({Parça No}="${anaParca}",{Proje Adı}="${projeAdi}")`
        : `{Parça No}="${anaParca}"`;
      const imalatRecs = await listRecords("\u0130malat", { filterByFormula: imalatFilter }).catch(() => []);
      if (imalatRecs.length > 0) {
        await updateRecord("\u0130malat", imalatRecs[0].id, { Durum: "Devam Ediyor" });
        results.adimlar.push(`İmalat: ${anaParca} Devam Ediyor`);
      }
    }
  }

  // İmalat "Tamamlandı"
  if (tableName === "\u0130malat" && yeniDurum === "Tamamland\u0131") {
    await createRecord("Kalite Kontrol", {
      "Par\u00e7a No": parcaNo,
      "Sonu\u00e7": "Bekliyor",
      "Proje Ad\u0131": projeAdi || record["Proje Ad\u0131"] || "",
    });
    results.adimlar.push("KK kaydı: Bekliyor");
    await updateRecord("\u0130malat", record.id, {
      "Ger\u00e7ek Biti\u015f": new Date().toISOString().split("T")[0],
    });
  }

  // KK "Onay"
  if (tableName === "Kalite Kontrol" && yeniDurum === "Onay") {
    await updateRecord("Kalite Kontrol", record.id, { "Sonu\u00e7": "Onay" });
    const depoRecs = await listRecords("Depo", { filterByFormula: `{Parça No}="${parcaNo}"` }).catch(() => []);
    if (depoRecs.length > 0) {
      const mevcutStok = depoRecs[0]["Miktar/Stok"] || 0;
      await updateRecord("Depo", depoRecs[0].id, { "Miktar/Stok": mevcutStok + 1, Durum: "Aktif" });
      results.adimlar.push("Depo stoku güncellendi");
    } else {
      await createRecord("Depo", { "Par\u00e7a No": parcaNo, "Miktar/Stok": 1, Durum: "Aktif" });
      results.adimlar.push("Depo kaydı oluşturuldu");
    }
    const bomFilter2 = projeAdi
      ? `AND({Parça No}="${parcaNo}",{Proje Adı}="${projeAdi}")`
      : `{Parça No}="${parcaNo}"`;
    const bomRecs2 = await listRecords("BOM", { filterByFormula: bomFilter2 }).catch(() => []);
    if (bomRecs2.length > 0) {
      await updateRecord("BOM", bomRecs2[0].id, { Durum: "Depoda" });
      results.adimlar.push("BOM: Depoda");
    }
  }

  // KK "Red"
  if (tableName === "Kalite Kontrol" && yeniDurum === "Red") {
    await updateRecord("Kalite Kontrol", record.id, { "Sonu\u00e7": "Red" });
    results.adimlar.push("⚠️ Parça reddedildi");
  }

  return results;
}
