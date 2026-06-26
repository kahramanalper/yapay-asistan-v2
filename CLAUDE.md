# Yapay İmalat v2 — Proje Rehberi

Bu proje makine imalat sektörü için doğal dil ile çalışan bir yapay asistandır. Sektör: Saykar Makine (CNC imalat). Kurucu: Alper Kahraman.

## Teknik Stack
- Frontend: Next.js 14 (App Router) + Tailwind
- Hosting: Vercel (auto-deploy on push to main)
- Veritabanı: Airtable (REST API)
- AI: Claude Haiku 4.5 + Tool Use
- Dosya: Google Drive API
- E-posta: Resend

## Klasör Yapısı
- `src/app/api/chat/route.js` — Ana chat endpoint
- `src/lib/airtable.js` — Airtable REST wrapper
- `src/lib/tools.js` — Claude'un 10 aracı (kayit_listele, kayit_olustur, kayit_guncelle, isleme_al, dosya_olustur, vb.)
- `src/lib/tool-executor.js` — Araçları çalıştıran motor
- `src/lib/system-prompt.js` — Türkçe sistem promptu, tablo kuralları
- `src/lib/model-router.js` — Haiku/Sonnet seçimi
- `src/components/Chat.jsx` — Sohbet UI

## Çalışma Kuralları
1. **Dil:** Türkçe yaz, sade dil, kısa cevap.
2. **Airtable alan adlarında Unicode dikkat:**
   - `İmalat` → `İmalat` (büyük İ)
   - `Satın Alma` → `Satın Alma` (küçük ı)
   - `Parça` → `Parça`
   - `Dökümanlar` → `Dökümanlar`
   - `Görevler` → `Görevler`
   - `Tedarikçiler` → `Tedarikçiler`
3. **Hallüsinasyon yasak:** ASLA araç çağırmadan "kaydedildi" / "güncellendi" deme. Her yazma işlemi gerçek Airtable API çağrısıyla yapılmalı. Her tool sonucu `basarili: true/false` döndürür.
4. **Mükerrer kontrolü:** BOM, SA, İmalat tablolarına kayıt eklerken aynı Parça No + Proje varsa atla.
5. **10'arlı batch:** Airtable API limiti nedeniyle toplu işlemler 10'arlı PATCH/POST ile.
6. **Tablo özel kuralları:**
   - BOM'da Çap/Boy/Tedarik Yöntemi sütunları YOK — Tanım alanına yaz
   - SA'da Malzeme/Çap/Boy sütunları YOK — Tanım alanına yaz
   - İmalat'ta Miktar/Tarih sütunları YOK
   - Tedarikçiler tablosunda alan adı "Tedarikçi Adı" (sadece "Adı" değil)
7. **İşleme Al akışı tip bazlı:**
   - Torna/Freze/Kaynak/Lazer → BOM=İmalatta, HM- kaydı, SA, İmalat kaydı
   - Standart Parça → BOM=Satın Almada, SA direkt, hammadde YOK
   - Montaj → BOM=İmalatta, İmalat kaydı, hammadde YOK

## Test
Manuel test senaryosu: `docs/ATLAS-001-test.md` (varsa). Henüz programatik test yok.

## Önemli
- Production Airtable base: `appPZrgQr38BZUpll` (Saykar). Test için ayrı base kullanılacak (henüz kurulmadı).
- v1 problemleri için bkz: kurulum tarihçesi (Proje Tarifi belgesi).
