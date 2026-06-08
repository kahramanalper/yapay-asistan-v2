// Claude Tool Use tanımları — Airtable CRUD
export const tools = [
  {
    name: "kayit_listele",
    description:
      "Airtable tablosundan kayıtları listeler. Filtre ve sıralama yapabilir. Tablo adları: Projeler, BOM, Satın Alma, İmalat, İmalat Süre Arşivi, Kalite Kontrol, Depo, Teklifler, Tedarikçiler, Dökümanlar, Görevler, Notlar, Bildirimler, Kullanıcılar, Parça Kuralları, Tedarik Kuralları, Test Kayıtları, Müşteriler, Sohbet Özetleri, TokenKullanım",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı (ör: Projeler, BOM, Satın Alma)" },
        filtre: { type: "string", description: 'Airtable filterByFormula (ör: {Proje Adı}="SK-2602")' },
        siralama: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
          },
          description: "Sıralama",
        },
        maxKayit: { type: "number", description: "Maksimum kayıt sayısı" },
        alanlar: { type: "array", items: { type: "string" }, description: "Sadece bu alanları getir" },
      },
      required: ["tablo"],
    },
  },
  {
    name: "kayit_olustur",
    description: "Airtable tablosuna yeni kayıt ekler.",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı" },
        alanlar: { type: "object", description: 'Eklenecek alanlar (ör: {"Parça No": "T-104", "Proje Adı": "SK-2602"})' },
        cokluKayit: { type: "array", items: { type: "object" }, description: "Birden fazla kayıt (max 10)" },
      },
      required: ["tablo"],
    },
  },
  {
    name: "kayit_guncelle",
    description: "Airtable tablosundaki mevcut kaydı günceller.",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı" },
        kayitId: { type: "string", description: "Airtable record ID" },
        filtre: { type: "string", description: "Record ID yoksa filtre ile bul" },
        alanlar: { type: "object", description: 'Güncellenecek alanlar (ör: {"Durum": "Tamamlandı"})' },
      },
      required: ["tablo", "alanlar"],
    },
  },
  {
    name: "kayit_sil",
    description: "Airtable tablosundan kayıt siler. Çift onay gerektirir.",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı" },
        kayitId: { type: "string", description: "Silinecek kaydın record ID'si" },
      },
      required: ["tablo", "kayitId"],
    },
  },
  {
    name: "parca_nerede",
    description: "Bir parçanın mevcut durumunu tüm tablolardan sorgular (BOM, SA, İmalat, KK, Depo).",
    input_schema: {
      type: "object",
      properties: {
        parcaNo: { type: "string", description: "Parça numarası (ör: T-104)" },
        projeAdi: { type: "string", description: "Proje adı (opsiyonel)" },
      },
      required: ["parcaNo"],
    },
  },
  {
    name: "isleme_al",
    description: "Bir parçayı imalata alır. BOM günceller, HM- kaydı ekler, SA'ya ekler, İmalat kaydı açar.",
    input_schema: {
      type: "object",
      properties: {
        parcaNo: { type: "string", description: "Parça numarası" },
        projeAdi: { type: "string", description: "Proje adı" },
      },
      required: ["parcaNo", "projeAdi"],
    },
  },
  {
    name: "durum_degistir",
    description: "Bir kaydın durumunu değiştirir ve zincirleme güncellemeleri yapar.",
    input_schema: {
      type: "object",
      properties: {
        tablo: { type: "string", description: "Tablo adı" },
        parcaNo: { type: "string", description: "Parça numarası" },
        projeAdi: { type: "string", description: "Proje adı" },
        yeniDurum: { type: "string", description: "Yeni durum değeri" },
        ekBilgi: { type: "object", description: "Ek bilgiler" },
      },
      required: ["tablo", "parcaNo", "yeniDurum"],
    },
  },
];
