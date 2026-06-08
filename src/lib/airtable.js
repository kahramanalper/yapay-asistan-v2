// Airtable REST API wrapper
const BASE_URL = "https://api.airtable.com/v0";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getBaseId() {
  return process.env.AIRTABLE_BASE_ID;
}

// Tablo adları (Türkçe karakter dikkat)
const TABLE_NAMES = {
  projeler: "Projeler",
  bom: "BOM",
  satinAlma: "Sat\u0131n Alma",
  imalat: "\u0130malat",
  imalatSureArsivi: "\u0130malat S\u00fcre Ar\u015fivi",
  kaliteKontrol: "Kalite Kontrol",
  depo: "Depo",
  teklifler: "Teklifler",
  tedarikciler: "Tedarik\u00e7iler",
  dokumanlar: "D\u00f6k\u00fcmanlar",
  gorevler: "G\u00f6revler",
  notlar: "Notlar",
  bildirimler: "Bildirimler",
  kullanicilar: "Kullan\u0131c\u0131lar",
  parcaKurallari: "Par\u00e7a Kurallar\u0131",
  tedarikKurallari: "Tedarik Kurallar\u0131",
  testKayitlari: "Test Kay\u0131tlar\u0131",
  musteriler: "M\u00fc\u015fteriler",
  sohbetOzetleri: "Sohbet \u00d6zetleri",
  tokenKullanim: "TokenKullan\u0131m",
};

// Kayıt listele (filtre ve sıralama opsiyonel)
async function listRecords(tableName, options = {}) {
  const params = new URLSearchParams();
  if (options.filterByFormula) params.append("filterByFormula", options.filterByFormula);
  if (options.sort) {
    options.sort.forEach((s, i) => {
      params.append(`sort[${i}][field]`, s.field);
      params.append(`sort[${i}][direction]`, s.direction || "asc");
    });
  }
  if (options.maxRecords) params.append("maxRecords", options.maxRecords);
  if (options.fields) {
    options.fields.forEach((f) => params.append("fields[]", f));
  }

  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}?${params}`;
  const res = await fetch(url, { headers: getHeaders() });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }
  
  const data = await res.json();
  return data.records.map((r) => ({ id: r.id, ...r.fields }));
}

// Tek kayıt oluştur
async function createRecord(tableName, fields) {
  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return { id: data.id, ...data.fields };
}

// Birden fazla kayıt oluştur (max 10)
async function createRecords(tableName, recordsArray) {
  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      records: recordsArray.map((fields) => ({ fields })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.records.map((r) => ({ id: r.id, ...r.fields }));
}

// Kayıt güncelle
async function updateRecord(tableName, recordId, fields) {
  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return { id: data.id, ...data.fields };
}

// Birden fazla kayıt güncelle (max 10)
async function updateRecords(tableName, recordsArray) {
  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      records: recordsArray.map((r) => ({ id: r.id, fields: r.fields })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.records.map((r) => ({ id: r.id, ...r.fields }));
}

// Kayıt sil
async function deleteRecord(tableName, recordId) {
  const url = `${BASE_URL}/${getBaseId()}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Airtable hata (${res.status}): ${JSON.stringify(err)}`);
  }

  return { deleted: true, id: recordId };
}

module.exports = {
  TABLE_NAMES,
  listRecords,
  createRecord,
  createRecords,
  updateRecord,
  updateRecords,
  deleteRecord,
};
