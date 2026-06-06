// api/send-farol-report.js
// Endpoint chamado pelo Vercel Cron (de hora em hora). Para cada empresa, verifica
// se o relatório do Farol DCS está "no horário" conforme a frequência configurada
// e, em caso afirmativo, envia por e-mail (Resend) e registra o envio.
//
// Também aceita chamada manual: /api/send-farol-report?company=<id>&force=1
// (protegida por CRON_SECRET) para teste imediato.

const { Resend } = require("resend");
const { buildFarolReportHTML, buildSummary, FREQ_LABELS } = require("./_report.js");

const FB = process.env.FIREBASE_DB_URL || "https://pm-manager-3c06f-default-rtdb.firebaseio.com";
const TZ = "America/Sao_Paulo";

async function fbGet(path) {
  const r = await fetch(`${FB}/${path}.json`);
  if (!r.ok) throw new Error("Firebase GET falhou: " + path + " (" + r.status + ")");
  return r.json();
}
async function fbPatch(path, obj) {
  const r = await fetch(`${FB}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  return r.ok;
}

// Hora local (São Paulo) atual: {y,m,d,hour, dateStr 'YYYY-MM-DD', epochDay}
function nowSP() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value;
  const y = +get("year"), m = +get("month"), d = +get("day");
  let hour = +get("hour"); if (hour === 24) hour = 0;
  const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const epochDay = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return { y, m, d, hour, dateStr, epochDay };
}

// Decide se deve enviar agora, dada a config.
// No plano Hobby o cron roda 1x/dia, então NÃO exigimos casar a hora exata —
// respeitamos apenas a frequência (em dias). A "hora" configurada é informativa.
function isDue(cfg, now) {
  const emails = (cfg.emails || []).filter(Boolean);
  if (!emails.length) return false;

  // já enviou hoje? (evita duplicar caso o cron rode mais de uma vez no dia)
  if (cfg.lastSentDay === now.epochDay) return false;

  const freq = cfg.freq || "semanal";
  const last = typeof cfg.lastSentDay === "number" ? cfg.lastSentDay : null;
  if (last === null) return true; // nunca enviado → envia na próxima execução diária

  const diff = now.epochDay - last;
  if (freq === "diario") return diff >= 1;
  if (freq === "cada2dias") return diff >= 2;
  if (freq === "semanal") return diff >= 7;
  if (freq === "quinzenal") return diff >= 15;
  if (freq === "mensal") return diff >= 30;
  return diff >= 7;
}

module.exports = async function handler(req, res) {
  // ── Autenticação ──
  const secret = process.env.CRON_SECRET;
  const auth = req.headers["authorization"] || "";
  const qSecret = (req.query && req.query.secret) || "";
  const isVercelCron = !!req.headers["x-vercel-cron"]; // header presente em chamadas do cron
  if (secret) {
    const ok = isVercelCron || auth === `Bearer ${secret}` || qSecret === secret;
    if (!ok) { res.status(401).json({ error: "Não autorizado" }); return; }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.MAIL_FROM || "PM Manager <onboarding@resend.dev>";
  if (!apiKey) { res.status(500).json({ error: "RESEND_API_KEY não configurada" }); return; }
  const resend = new Resend(apiKey);

  const force = req.query && (req.query.force === "1" || req.query.force === "true");
  const onlyCompany = req.query && req.query.company;

  const now = nowSP();
  const results = [];

  try {
    const companies = await fbGet("companies");
    if (!companies) { res.status(200).json({ ok: true, message: "Nenhuma empresa.", now }); return; }

    for (const [cid, comp] of Object.entries(companies)) {
      if (onlyCompany && cid !== onlyCompany) continue;
      const cfg = (comp && comp.dcsmailcfg) || null;
      if (!cfg) { continue; }

      const due = force || isDue(cfg, now);
      if (!due) { results.push({ company: cid, sent: false, reason: "fora do horário/frequência" }); continue; }

      const emails = (cfg.emails || []).filter(Boolean);
      if (!emails.length) { results.push({ company: cid, sent: false, reason: "sem destinatários" }); continue; }

      // dados DCS
      const dcsObj = comp.dcs || {};
      const list = Object.values(dcsObj);
      const html = buildFarolReportHTML(list, comp.name || cid, cfg.freq);
      const summary = buildSummary(list);
      const subject = `Relatório Farol DCS — ${comp.name || cid} — ${now.dateStr}`;

      try {
        // Envia para todos os destinatários (BCC para preservar privacidade da lista)
        const sendRes = await resend.emails.send({
          from: fromEmail,
          to: [fromEmail.match(/<(.+)>/) ? fromEmail.match(/<(.+)>/)[1] : fromEmail], // remetente como "to"
          bcc: emails,
          subject,
          html: `<div style="background:#f8fafc;padding:16px">${html}</div>`,
        });
        if (sendRes && sendRes.error) throw new Error(JSON.stringify(sendRes.error));

        // registra envio
        await fbPatch(`companies/${cid}/dcsmailcfg`, {
          lastSent: new Date().toISOString(),
          lastSentDay: now.epochDay,
        });
        results.push({ company: cid, sent: true, recipients: emails.length, nc: summary.nc, mel: summary.mel });
      } catch (e) {
        results.push({ company: cid, sent: false, error: String(e.message || e) });
      }
    }

    res.status(200).json({ ok: true, now, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), now });
  }
};
