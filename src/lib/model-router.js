// Model seçimi: Basit işler → Haiku, Karmaşık işler → güçlü model
const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-20250514",
};

// Güçlü model gerektiren anahtar kelimeler/niyetler
const SMART_TRIGGERS = [
  // Süre tahmini
  "süre tahmin",
  "ne kadar sürer",
  "kaç gün",
  "tamamlanma süresi",
  "bitiş tahmini",
  "proje süresi",
  // Maliyet analizi
  "maliyet",
  "fiyat hesapla",
  "toplam maliyet",
  "bütçe",
  "maliyet analiz",
  // Karşılaştırma / analiz
  "karşılaştır",
  "analiz",
  "performans",
  "verimlilik",
  "rapor hazırla",
  "özet çıkar",
  "detaylı rapor",
  // Mühendislik
  "hesapla",
  "teknik analiz",
  "otomasyon kontrol",
  "şartname analiz",
  "parça analiz",
  // Planlama
  "planlama",
  "önceliklendir",
  "sırala önemine göre",
  "geciken",
  "kritik yol",
];

function selectModel(userMessage) {
  const msg = userMessage.toLowerCase();
  const needsSmart = SMART_TRIGGERS.some((trigger) => msg.includes(trigger));
  return needsSmart ? MODELS.smart : MODELS.fast;
}

module.exports = { selectModel, MODELS };
