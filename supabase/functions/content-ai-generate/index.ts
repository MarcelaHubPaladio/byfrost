import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText, fallbackCaption, fallbackStoryPack } from "../_shared/llm.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
}

function safeParseJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

serve(async (req) => {
  const fn = "content-ai-generate";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const publicationId = String(body?.publicationId ?? "").trim();
    const kind = String(body?.kind ?? "").trim(); // caption | story_pack

    if (!tenantId) return err("missing_tenantId", 400);
    if (!publicationId) return err("missing_publicationId", 400);
    if (kind !== "caption" && kind !== "story_pack") return err("invalid_kind", 400);

    const supabase = createSupabaseAdmin();

    // Manual auth (verify_jwt is false)
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      console.error(`[${fn}] auth.getUser failed`, { error: userErr?.message });
      return err("unauthorized", 401);
    }

    const userId = userRes.user.id;

    // Tenant membership check (multi-tenant boundary)
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (memErr || (!membership && !isSuperAdmin)) return err("forbidden", 403);

    // Load publication + content item
    const { data: pub, error: pubErr } = await supabase
      .from("content_publications")
      .select(
        "id,tenant_id,case_id,channel,caption_text,creative_type,media_storage_paths,publish_status,content_items(theme_title,client_name,script_text,references_notes,tags)"
      )
      .eq("id", publicationId)
      .maybeSingle();

    if (pubErr || !pub) return err("publication_not_found", 404);

    const row: any = pub;

    if (row.tenant_id !== tenantId) return err("tenant_mismatch", 403);

    const ci = row.content_items ?? null;
    const themeTitle = String(ci?.theme_title ?? "").trim() || "seu tema";
    const clientName = String(ci?.client_name ?? "").trim();
    const tags = Array.isArray(ci?.tags) ? (ci.tags as any[]).map((t) => String(t)).filter(Boolean) : [];
    const scriptText = String(ci?.script_text ?? "").trim();
    const refs = String(ci?.references_notes ?? "").trim();

    if (kind === "caption") {
      // Approval boundary: generating a draft is allowed; we only write into caption_text as a user-requested action.
      const sys =
        "Você é um especialista em social media. Gere uma legenda em PT-BR com: gancho, valor, CTA e hashtags. " +
        "Evite promessas médicas/financeiras. Seja direto. Use quebras de linha.";

      const user =
        `Canal: ${row.channel}\n` +
        `Cliente: ${clientName || "(não informado)"}\n` +
        `Tema: ${themeTitle}\n` +
        (scriptText ? `Roteiro/base:\n${scriptText}\n` : "") +
        (refs ? `Referências:\n${refs}\n` : "") +
        (tags.length ? `Tags base: ${tags.join(", ")}\n` : "");

      const out = await generateText({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        fallback: () => fallbackCaption({ themeTitle, clientName, tags }),
      });

      const caption = out.text.trim();

      const agentKey = "reels_caption_agent";
      const { data: agent } = await supabase.from("agents").select("id").eq("key", agentKey).limit(1).maybeSingle();

      await supabase
        .from("content_publications")
        .update({
          caption_text: caption,
          ai_caption_json: {
            kind: "caption",
            provider: out.provider,
            agent_key: agentKey,
            input: { theme_title: themeTitle, client_name: clientName, tags },
            output: { caption },
          },
          ai_generated_at: new Date().toISOString(),
          ai_generated_by_user_id: userId,
        })
        .eq("tenant_id", tenantId)
        .eq("id", publicationId);

      if (agent?.id && row.case_id) {
        await supabase.from("decision_logs").insert({
          tenant_id: tenantId,
          case_id: row.case_id,
          agent_id: agent.id,
          input_summary: `Gerar legenda (${row.channel})`,
          output_summary: "Legenda gerada e salva na publicação",
          reasoning_public: caption,
          why_json: { kind: "caption", publication_id: publicationId, provider: out.provider },
          confidence_json: { overall: 0.7, method: out.provider === "fallback" ? "template" : out.provider },
          occurred_at: new Date().toISOString(),
        });
      }

      return json({ ok: true, kind, caption, provider: out.provider });
    }

    // story_pack
    const sys =
      "Você é um estrategista de IG Stories. Gere um Story Pack (4 a 6 slides) em JSON válido." +
      " Cada slide deve conter: slide, headline, on_screen_text, notes." +
      " O texto deve ser curto. Inclua 1 CTA com sticker sugestão.";

    const user =
      `Cliente: ${clientName || "(não informado)"}\n` +
      `Tema: ${themeTitle}\n` +
      (scriptText ? `Roteiro/base:\n${scriptText}\n` : "") +
      (refs ? `Referências:\n${refs}\n` : "") +
      (tags.length ? `Tags base: ${tags.join(", ")}\n` : "");

    const out = await generateText({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      fallback: () => fallbackStoryPack({ themeTitle, clientName }),
    });

    const parsed = safeParseJson(out.text.trim());
    const storyPack = parsed && typeof parsed === "object" ? parsed : safeParseJson(fallbackStoryPack({ themeTitle, clientName }));

    const agentKey = "stories_creator_agent";
    const { data: agent } = await supabase.from("agents").select("id").eq("key", agentKey).limit(1).maybeSingle();

    await supabase
      .from("content_publications")
      .update({
        ai_story_pack_json: {
          ...(storyPack ?? {}),
          provider: out.provider,
          agent_key: agentKey,
          input: { theme_title: themeTitle, client_name: clientName, tags },
        },
        ai_generated_at: new Date().toISOString(),
        ai_generated_by_user_id: userId,
      })
      .eq("tenant_id", tenantId)
      .eq("id", publicationId);

    if (agent?.id && row.case_id) {
      await supabase.from("decision_logs").insert({
        tenant_id: tenantId,
        case_id: row.case_id,
        agent_id: agent.id,
        input_summary: `Gerar Story Pack (${row.channel})`,
        output_summary: "Story Pack gerado e salvo na publicação",
        reasoning_public: JSON.stringify(storyPack ?? {}, null, 2),
        why_json: { kind: "story_pack", publication_id: publicationId, provider: out.provider },
        confidence_json: { overall: 0.68, method: out.provider === "fallback" ? "template" : out.provider },
        occurred_at: new Date().toISOString(),
      });
    }

    return json({ ok: true, kind, story_pack: storyPack, provider: out.provider });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
