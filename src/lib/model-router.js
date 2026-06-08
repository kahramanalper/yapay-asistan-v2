// Model seçimi: Basit işler → Haiku, Karmaşık işler → güçlü model
export const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-20250514",
};

const SMART_TRIGGERS = [
  "süre tahmin", "ne kadar sürer", "kaç gün", "tamamlanma süresi", "bitiş tahmini", "proje süresi",
  "maliyet", "fiyat hesapla", "toplam maliyet", "bütçe", "maliyet analiz",
  "karşılaştır", "analiz", "performans", "verimlilik", "rapor hazırla", "özet çıkar", "detaylı rapor",
  "hesapla", "teknik analiz", "otomasyon kontrol", "şartname analiz", "parça analiz",
  "planlama", "önceliklendir", "sırala önemine göre", "geciken", "kritik yol",
];

export function selectModel(userMessage) {
  const msg = userMessage.toLowerCase();
  const needsSmart = SMART_TRIGGERS.some((trigger) => msg.includes(trigger));
  return needsSmart ? MODELS.smart : MODELS.fast;
}
