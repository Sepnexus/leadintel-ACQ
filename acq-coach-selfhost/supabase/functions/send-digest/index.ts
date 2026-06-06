// send-digest — Weekly performance digest email for ACQ Coach.
// POST with { account_id, to_email } → sends one email immediately (test/manual).
// POST with no body (or {}) → batch mode: scans ghl_accounts for digest_settings.enabled=true
//   and emails each account to digest_settings.email.
//
// Email is sent via Resend. Set RESEND_API_KEY + DIGEST_FROM_EMAIL in environment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const FROM_EMAIL = Deno.env.get("DIGEST_FROM_EMAIL") || "digest@acqcoach.com";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let body: { account_id?: string; to_email?: string } = {};
    try {
      body = await req.json();
    } catch (_) { /* no body */ }

    const { account_id, to_email } = body;

    if (account_id && to_email) {
      // ── Single account / test send ──────────────────────────────────────
      const result = await sendDigestForAccount(admin, account_id, to_email, FROM_EMAIL, RESEND_API_KEY);
      return json(result as Record<string, unknown>);
    } else {
      // ── Batch: all accounts with digest enabled ──────────────────────────
      const { data: accounts, error: accErr } = await admin
        .from("ghl_accounts")
        .select("id, digest_settings")
        .not("digest_settings", "is", null);

      if (accErr) throw new Error(`Accounts query error: ${accErr.message}`);

      const results = [];
      for (const acc of accounts || []) {
        const ds = acc.digest_settings as { enabled?: boolean; email?: string } | null;
        if (!ds?.enabled || !ds?.email) continue;
        try {
          const r = await sendDigestForAccount(admin, acc.id, ds.email, FROM_EMAIL, RESEND_API_KEY);
          results.push({ account_id: acc.id, ...(r as Record<string, unknown>) });
        } catch (e) {
          results.push({ account_id: acc.id, error: String(e) });
        }
      }
      return json({ batch: true, sent_count: results.filter((r: any) => r.sent).length, results });
    }
  } catch (e) {
    console.error("send-digest error:", e);
    return json({ error: String(e) }, 500);
  }
});

// ─── Core send logic ─────────────────────────────────────────────────────────

async function sendDigestForAccount(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  toEmail: string,
  fromEmail: string,
  resendKey: string,
) {
  // Last 7 days of scored calls for this account
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: scores, error } = await admin
    .from("call_scores")
    .select("id, rep_id, rep_name, overall_score, grade, scored_at, category_scores")
    .eq("account_id", accountId)
    .gte("scored_at", since)
    .order("scored_at", { ascending: false });

  if (error) throw new Error(`call_scores query failed: ${error.message}`);

  if (!scores || scores.length === 0) {
    return { sent: false, reason: "No calls scored in the last 7 days" };
  }

  const data = buildDigestData(scores);
  const html = buildHtml(data);

  if (!resendKey) {
    // Return preview data so caller can confirm everything except the actual send
    return { sent: false, reason: "RESEND_API_KEY not configured", preview: data };
  }

  const weekLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `ACQ Coach <${fromEmail}>`,
      to: [toEmail],
      subject: `📊 ACQ Coach Weekly Digest — ${weekLabel}`,
      html,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Resend ${resp.status}: ${errBody}`);
  }

  const resendData = await resp.json();
  return { sent: true, message_id: resendData.id, to: toEmail };
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

interface RepStat {
  id: string;
  name: string;
  avg: number;
  calls: number;
  latest: number;
  grade: string;
}

interface DigestData {
  weekOf: string;
  teamAvg: number;
  totalCalls: number;
  topPerformer: RepStat | null;
  repStats: RepStat[];
  belowThreshold: RepStat[];
}

function letterGrade(s: number): string {
  if (s >= 90) return "A+";
  if (s >= 80) return "A";
  if (s >= 70) return "B";
  if (s >= 60) return "C";
  if (s >= 50) return "D";
  return "F";
}

function buildDigestData(scores: any[]): DigestData {
  // Group by rep
  const byRep: Record<string, { name: string; scores: number[] }> = {};
  for (const s of scores) {
    const id = String(s.rep_id || s.rep_name || "unknown");
    if (!byRep[id]) byRep[id] = { name: s.rep_name || id, scores: [] };
    byRep[id].scores.push(Number(s.overall_score) || 0);
  }

  const repStats: RepStat[] = Object.entries(byRep)
    .map(([id, r]) => {
      const avg = Math.round(r.scores.reduce((a, b) => a + b, 0) / r.scores.length);
      return {
        id,
        name: r.name,
        avg,
        calls: r.scores.length,
        latest: r.scores[0] ?? 0,
        grade: letterGrade(avg),
      };
    })
    .sort((a, b) => b.avg - a.avg);

  const allScores = scores.map(s => Number(s.overall_score) || 0);
  const teamAvg = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  return {
    weekOf: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    teamAvg,
    totalCalls: scores.length,
    topPerformer: repStats[0] ?? null,
    repStats,
    belowThreshold: repStats.filter(r => r.avg < 50),
  };
}

// ─── HTML email builder ───────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 70) return "#4e7d3d";
  if (s >= 50) return "#b7860b";
  return "#c0392b";
}

function buildHtml(d: DigestData): string {
  const repRows = d.repStats
    .map(
      (r, i) => `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid #1c1c1c;">
        <span style="display:inline-block;width:26px;height:26px;border-radius:50%;
          background:#1c1c1c;text-align:center;line-height:26px;
          font-size:10px;font-weight:700;color:#999;margin-right:8px;vertical-align:middle;">
          ${r.name.charAt(0).toUpperCase()}
        </span>
        <span style="color:#f4f4f4;font-weight:600;vertical-align:middle;">${r.name}</span>
      </td>
      <td style="padding:11px 16px;border-bottom:1px solid #1c1c1c;text-align:center;">
        <span style="font-size:20px;font-weight:800;color:${scoreColor(r.avg)};">${r.avg}</span>
        <span style="font-size:11px;color:#777;margin-left:3px;">${r.grade}</span>
      </td>
      <td style="padding:11px 16px;border-bottom:1px solid #1c1c1c;text-align:center;
        color:#999;font-size:13px;">${r.calls}</td>
      <td style="padding:11px 16px;border-bottom:1px solid #1c1c1c;text-align:center;">
        ${
          r.avg < 50
            ? `<span style="background:rgba(192,57,43,0.15);color:#c0392b;
               border:1px solid rgba(192,57,43,0.3);border-radius:10px;
               padding:2px 8px;font-size:10px;font-weight:700;">⚠️ Review</span>`
            : i === 0
            ? `<span style="background:rgba(78,125,61,0.15);color:#4e7d3d;
               border:1px solid rgba(78,125,61,0.3);border-radius:10px;
               padding:2px 8px;font-size:10px;font-weight:700;">⭐ Top</span>`
            : ""
        }
      </td>
    </tr>`,
    )
    .join("");

  const alertBlock =
    d.belowThreshold.length > 0
      ? `<div style="background:rgba(192,57,43,0.07);border:1px solid rgba(192,57,43,0.25);
           border-left:3px solid #c0392b;border-radius:8px;padding:14px 18px;margin-bottom:28px;">
          <div style="font-size:12px;font-weight:700;color:#c0392b;margin-bottom:10px;">
            ⚠️ ${d.belowThreshold.length} REP${d.belowThreshold.length > 1 ? "S" : ""} NEED ATTENTION
          </div>
          ${d.belowThreshold
            .map(
              r =>
                `<div style="font-size:12px;color:#f4f4f4;padding:3px 0;">
              ${r.name} — avg score <strong style="color:#c0392b;">${r.avg}</strong>
              across ${r.calls} call${r.calls !== 1 ? "s" : ""}
            </div>`,
            )
            .join("")}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ACQ Coach Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:'Open Sans',Arial,sans-serif;color:#f4f4f4;-webkit-font-smoothing:antialiased;">
  <div style="max-width:620px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="border-bottom:1px solid #1c1c1c;padding-bottom:24px;margin-bottom:28px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2.5px;
        color:#4e7d3d;font-weight:700;margin-bottom:10px;">ACQ COACH</div>
      <div style="font-size:24px;font-weight:800;color:#f4f4f4;line-height:1.2;">
        Weekly Performance Digest
      </div>
      <div style="font-size:12px;color:#555;margin-top:6px;">Week of ${d.weekOf}</div>
    </div>

    <!-- Summary row -->
    <table style="width:100%;border-collapse:separate;border-spacing:10px;margin-bottom:20px;">
      <tr>
        <td style="background:#0d0d0d;border:1px solid #1c1c1c;border-radius:8px;
          padding:18px;text-align:center;width:33%;">
          <div style="font-size:32px;font-weight:800;color:${scoreColor(d.teamAvg)};">
            ${d.teamAvg}
          </div>
          <div style="font-size:10px;color:#555;text-transform:uppercase;
            letter-spacing:1px;margin-top:6px;">Team Average</div>
        </td>
        <td style="background:#0d0d0d;border:1px solid #1c1c1c;border-radius:8px;
          padding:18px;text-align:center;width:33%;">
          <div style="font-size:32px;font-weight:800;color:#f4f4f4;">${d.totalCalls}</div>
          <div style="font-size:10px;color:#555;text-transform:uppercase;
            letter-spacing:1px;margin-top:6px;">Calls Scored</div>
        </td>
        ${
          d.topPerformer
            ? `<td style="background:#0a0f0a;border:1px solid #1c1c1c;
               border-left:3px solid #4e7d3d;border-radius:8px;padding:18px;
               text-align:center;width:33%;">
                <div style="font-size:10px;color:#4e7d3d;font-weight:700;text-transform:uppercase;
                  letter-spacing:1px;margin-bottom:8px;">Top Performer</div>
                <div style="font-size:14px;font-weight:700;color:#f4f4f4;">
                  ${d.topPerformer.name}
                </div>
                <div style="font-size:22px;font-weight:800;color:#4e7d3d;margin-top:4px;">
                  ${d.topPerformer.avg}
                </div>
              </td>`
            : `<td></td>`
        }
      </tr>
    </table>

    ${alertBlock}

    <!-- Rep breakdown -->
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;
      color:#555;font-weight:700;margin-bottom:12px;">Rep Breakdown</div>

    <table style="width:100%;border-collapse:collapse;
      background:#0d0d0d;border:1px solid #1c1c1c;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#141414;">
          <th style="padding:10px 16px;text-align:left;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;color:#555;font-weight:600;">Rep</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;color:#555;font-weight:600;">Avg Score</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;text-transform:uppercase;
            letter-spacing:1px;color:#555;font-weight:600;">Calls</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;
            color:#555;font-weight:600;"></th>
        </tr>
      </thead>
      <tbody>${repRows}</tbody>
    </table>

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1c1c1c;text-align:center;">
      <div style="font-size:11px;color:#444;">
        Sent by ACQ Coach · This email was generated automatically.
      </div>
    </div>

  </div>
</body>
</html>`;
}
