import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { tools } from "@/lib/tools";
import { executeTool } from "@/lib/tool-executor";
import { selectModel } from "@/lib/model-router";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { messages, activeProject } = await request.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: "Mesaj gerekli" }, { status: 400 });
    }

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    const model = selectModel(lastUserMsg);

    // Aktif proje varsa system prompt'a ekle
    let systemPrompt = SYSTEM_PROMPT;
    if (activeProject) {
      systemPrompt += `\n\n## AKTİF PROJE: ${activeProject}\nKullanıcı proje belirtmezse bu projeyi kullan.`;
    }

    // Claude'a mesaj gönder
    let response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    // Tool use döngüsü — Claude araç çağırabilir, sonucu alıp devam eder
    const allMessages = [...messages];
    let maxIterations = 10;

    while (response.stop_reason === "tool_use" && maxIterations > 0) {
      maxIterations--;

      // Assistant mesajını ekle
      allMessages.push({ role: "assistant", content: response.content });

      // Her tool_use bloğunu işle
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Tool sonuçlarını ekle
      allMessages.push({ role: "user", content: toolResults });

      // Claude'a tekrar sor
      response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages: allMessages,
      });
    }

    // Son cevabı al
    const textBlocks = response.content.filter((b) => b.type === "text");
    const assistantText = textBlocks.map((b) => b.text).join("\n");

    return Response.json({
      message: assistantText,
      model,
      usage: response.usage,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Bir hata oluştu: " + error.message },
      { status: 500 }
    );
  }
}
