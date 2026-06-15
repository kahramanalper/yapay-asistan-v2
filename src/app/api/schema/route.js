export async function GET() {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const apiKey = process.env.AIRTABLE_API_KEY;

    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return Response.json({ error: err }, { status: res.status });
    }

    const data = await res.json();

    // Sadece tablo adları, alan adları ve select seçeneklerini çek
    const schema = data.tables.map((table) => ({
      tablo: table.name,
      alanlar: table.fields.map((f) => ({
        ad: f.name,
        tip: f.type,
        ...(f.options?.choices
          ? { secenekler: f.options.choices.map((c) => c.name) }
          : {}),
      })),
    }));

    return Response.json(schema, { status: 200 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
