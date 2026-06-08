// Claude Tool Use tanımları — Airtable CRUD
const tools = [
  {
    name: "kayit_listele",
    description:
      "Airtable tablosundan kayıtları listeler. Filtre ve sıralama yapabilir. Tablo adları: Projeler, BOM, Satın Alma, İmalat, İmalat Süre Arşivi, Kalite Kontrol, Depo, Teklifler, Tedarikçiler, Dökümanlar, Görevler, Notlar, Bildirimler, Kullanıcılar, Parça Kuralları, Tedarik Kuralları, Test Kayıtları, Müşteriler, Sohbet Özetleri, TokenKullanım",
    input_schema: {
      type: "object",
      properties: {
        tablo: {
          type: "string",
          description: "Tablo adı (ör: Projeler, BOM, Satın Alma)",
        },
        filtre: {
          type: "string",
          description:
            'Airtable filterByFormula (ör: {Proje Adı}="SK-2602", {Durum}="Bekliyor", AND({Proje Adı}="SK-2602",{Tip}="Torna"))',
        },
        siralama: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
          },
          description: "Sıralama (ör: [{field: 'Proje Adı', direction: 'asc'}])",
        },
        maxKayit: {
          type: "number",
          description: "Maksimum kayıt sayısı (varsayılan: tümü)",
        },
        alanlar: {
          type: "array",
          items: { type: "string" },
          description: "Sadece bu alanları getir (ör: ['Parça No', 'Durum'])",
        },
      },
      required: ["tablo"],
    },
  },
  {
    name: "kayit_olustur",
    description:
      "Airtable tablosuna yeni kayıt ekler. Tek veya birden fazla kayıt ekleyebilir.",
    input_schema: {
      type: "object",
      properties: {
        tablo: {
          type: "string",
          description: "Tablo adı",
        },
        alanlar: {
          type: "object",
          description:
            'Eklenecek alanlar (ör: {"Parça No": "T-104", "Tanım": "Mil Ø50x200 St37", "Tip": "Torna", "Miktar": 1, "Proje Adı": "SK-2602"})',
        },
        cokluKayit: {
          type: "array",
          items: { type: "object" },
          description: "Birden fazla kayıt eklemek için (max 10). Her biri alanlar objesi.",
        },
      },
      required: ["tablo"],
    },
  },
  {
    name: "kayit_guncelle",
    description:
      "Airtable tablosundaki mevcut kaydı günceller. Record ID veya filtre ile bulur.",
    input_schema: {
      type: "object",
      properties: {
        tablo: {
          type: "string",
          description: "Tablo adı",
        },
        kayitId: {
          type: "string",
          description: "Airtable record ID (rec... ile başlar)",
        },
        filtre: {
          type: "string",
          description:
            "Record ID yoksa filtre ile bul (ör: AND({Parça No}=\"T-104\",{Proje Adı}=\"SK-2602\"))",
        },
        alanlar: {
          type: "object",
          description: 'Güncellenecek alanlar (ör: {"Durum": "Tamamlandı"})',
        },
      },
      required: ["tablo", "alanlar"],
    },
  },
  {
    name: "kayit_sil",
    description:
      "Airtable tablosundan kayıt siler. DİKKAT: Geri alınamaz. Çift onay gerektirir.",
    input_schema: {
      type: "object",
      properties: {
        tablo: {
          type: "string",
          description: "Tablo adı",
        },
        kayitId: {
          type: "string",
          description: "Silinecek kaydın Airtable record ID'si",
        },
      },
      required: ["tablo", "kayitId"],
    },
  },
  {
    name: "parca_nerede",
    description:
      "Bir parçanın mevcut durumunu tüm tablolardan sorgular (BOM, Satın Alma, İmalat, Kalite Kontrol, Depo). Tek sorguda parçanın tam hayat döngüsünü gösterir.",
    input_schema: {
      type: "object",
      properties: {
        parcaNo: {
          type: "string",
          description: "Parça numarası (ör: T-104)",
        },
        projeAdi: {
          type: "string",
          description: "Proje adı (ör: SK-2602). Belirtilmezse tüm projelerde arar.",
        },
      },
      required: ["parcaNo"],
    },
  },
  {
    name: "isleme_al",
    description:
      "Bir parçayı imalata alır. Otomatik olarak: 1) BOM'da durumu günceller, 2) Hammadde (HM-) kaydı BOM'a ekler, 3) Hammadde SA'ya ekler, 4) İmalat kaydı açar.",
    input_schema: {
      type: "object",
      properties: {
        parcaNo: {
          type: "string",
          description: "Parça numarası (ör: T-104)",
        },
        projeAdi: {
          type: "string",
          description: "Proje adı (ör: SK-2602)",
        },
      },
      required: ["parcaNo", "projeAdi"],
    },
  },
  {
    name: "durum_degistir",
    description:
      "Bir kaydın durumunu değiştirir ve ilgili zincirleme güncellemeleri yapar. Örneğin SA 'Teslim Alındı' olduğunda KK kaydı açılır, İmalat tetiklenir vb.",
    input_schema: {
      type: "object",
      properties: {
        tablo: {
          type: "string",
          description: "Tablo adı (BOM, Satın Alma, İmalat, Kalite Kontrol)",
        },
        parcaNo: {
          type: "string",
          description: "Parça numarası",
        },
        projeAdi: {
          type: "string",
          description: "Proje adı",
        },
        yeniDurum: {
          type: "string",
          description: "Yeni durum değeri",
        },
        ekBilgi: {
          type: "object",
          description: "Ek bilgiler (ör: kontrol eden, süre vb.)",
        },
      },
      required: ["tablo", "parcaNo", "yeniDurum"],
    },
  },
];

module.exports = { tools };
