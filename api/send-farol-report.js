// api/send-farol-report.js
// Endpoint chamado pelo Vercel Cron (de hora em hora). Para cada empresa, verifica
// se o relatório do Farol DCS está "no horário" conforme a frequência configurada
// e, em caso afirmativo, envia por e-mail (Resend) e registra o envio.
//
// Também aceita chamada manual: /api/send-farol-report?company=<id>&force=1
// (protegida por CRON_SECRET) para teste imediato.

const { Resend } = require("resend");

// ─────────────────────────────────────────────────────────────
// Gerador do relatório (inline — sem depender de outro arquivo)
// ─────────────────────────────────────────────────────────────
const FREQ_LABELS = { diario: "Diário", cada2dias: "A cada 2 dias", semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };

function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function ncRaw(d) {
  const q = parseInt(d.quantidade) || 0;
  const n = (d.qtdNaoConforme !== undefined && d.qtdNaoConforme !== "") ? (parseInt(d.qtdNaoConforme) || 0) : (d.status === "Conforme" ? 0 : q);
  return Math.min(n, q);
}

function buildFarolReportHTML(list, companyName, freq) {
  list = Array.isArray(list) ? list : [];
  const terms = [...new Set(list.map(d => d.terminal || "—"))].sort();
  const byT = {};
  list.forEach(d => {
    const t = d.terminal || "—"; if (!byT[t]) byT[t] = { conf: 0, nc: 0, mel: 0 };
    const q = parseInt(d.quantidade) || 0; const n = ncRaw(d);
    if (d.status === "Conforme") byT[t].conf += q;
    else if (d.status === "Não Conforme") { byT[t].nc += n; byT[t].conf += (q - n); }
    else if (d.status === "Melhoria Necessária") byT[t].mel += n;
  });
  const tipos = [...new Set(list.map(d => d.tipo || "—"))].sort();
  const byTp = {};
  list.forEach(d => {
    const t = d.tipo || "—"; if (!byTp[t]) byTp[t] = { conf: 0, nc: 0, mel: 0 };
    const q = parseInt(d.quantidade) || 0; const n = ncRaw(d);
    if (d.status === "Conforme") byTp[t].conf += q;
    else if (d.status === "Não Conforme") { byTp[t].nc += n; byTp[t].conf += (q - n); }
    else if (d.status === "Melhoria Necessária") byTp[t].mel += n;
  });
  const totC = Object.values(byT).reduce((s, v) => s + v.conf, 0);
  const totN = Object.values(byT).reduce((s, v) => s + v.nc, 0);
  const totM = Object.values(byT).reduce((s, v) => s + v.mel, 0);
  const ncList = list.filter(d => d.status === "Não Conforme");
  const melList = list.filter(d => d.status === "Melhoria Necessária");

  const sumRows = (obj, keys) => keys.map(k => `<tr><td style="padding:6px 10px;border:1px solid #d4dae6;font-weight:600">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #d4dae6;text-align:right;color:#15803d">${obj[k].conf}</td><td style="padding:6px 10px;border:1px solid #d4dae6;text-align:right;color:#b91c1c">${obj[k].nc}</td><td style="padding:6px 10px;border:1px solid #d4dae6;text-align:right;color:#b45309">${obj[k].mel}</td></tr>`).join("");
  const detHead = `<tr style="background:#1e3a5f;color:#fff"><th style="padding:6px 8px;border:1px solid #d4dae6">ID</th><th style="padding:6px 8px;border:1px solid #d4dae6">Terminal</th><th style="padding:6px 8px;border:1px solid #d4dae6">Área</th><th style="padding:6px 8px;border:1px solid #d4dae6">Sub Área</th><th style="padding:6px 8px;border:1px solid #d4dae6">Local de Instalação</th><th style="padding:6px 8px;border:1px solid #d4dae6">Sistema</th><th style="padding:6px 8px;border:1px solid #d4dae6">Denominação do Objeto Técnico</th><th style="padding:6px 8px;border:1px solid #d4dae6">Tipo DCS</th><th style="padding:6px 8px;border:1px solid #d4dae6">TAG campo?</th><th style="padding:6px 8px;border:1px solid #d4dae6">TAG superv.?</th><th style="padding:6px 8px;border:1px solid #d4dae6">Cód. TAG</th><th style="padding:6px 8px;border:1px solid #d4dae6">Qtd Inst./Melhoria</th><th style="padding:6px 8px;border:1px solid #d4dae6">Instalado?</th><th style="padding:6px 8px;border:1px solid #d4dae6">Status</th><th style="padding:6px 8px;border:1px solid #d4dae6">Qtd Não Conf./Pend.</th><th style="padding:6px 8px;border:1px solid #d4dae6">Solic.?</th><th style="padding:6px 8px;border:1px solid #d4dae6">Nº Solic.</th><th style="padding:6px 8px;border:1px solid #d4dae6">Data Planejada</th><th style="padding:6px 8px;border:1px solid #d4dae6">O que precisa fazer?</th><th style="padding:6px 8px;border:1px solid #d4dae6">O que falta para executar?</th><th style="padding:6px 8px;border:1px solid #d4dae6">Medida de Contenção</th></tr>`;
  const detRows = (arr) => arr.length ? arr.map(d => `<tr><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.uid || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.terminal)}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.area || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.subArea || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.local || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.sistema || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.denominacao || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.tipo || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.temTagCampo || "Não")}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.temTagSupervisorio || "Não")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.tag || "⚠ Sem TAG")}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.quantidade || 0)}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.instalado || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.status || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(ncRaw(d))}</td><td style="padding:5px 8px;border:1px solid #d4dae6;text-align:center">${esc(d.temSolicitacao || "Não")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.numSolicitacao || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.dataPlanejada || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.oQueFazer || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.oQueFalta || "")}</td><td style="padding:5px 8px;border:1px solid #d4dae6">${esc(d.medidaContencao || "")}</td></tr>`).join("") : `<tr><td colspan="21" style="padding:10px;text-align:center;color:#64748b;border:1px solid #d4dae6">Nenhum registro.</td></tr>`;

  const total = totC + totN + totM;
  const pct = total ? Math.round(totC / total * 100) : 0;
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:1400px;margin:0 auto;color:#0f172a">
<div style="background:#0B1929;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">
<h2 style="margin:0;font-size:20px">🚦 Relatório Farol DCS — Dispositivos Críticos de Segurança</h2>
<div style="font-size:13px;color:#94a3b8;margin-top:4px">${esc(companyName || "")} · ${now} · Conformidade geral: <b style="color:#22c55e">${pct}%</b></div>
</div>
<div style="border:1px solid #d4dae6;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px">
<div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
<div style="flex:1;min-width:120px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#15803d">${totC}</div><div style="font-size:11px;color:#475569">Conformes</div></div>
<div style="flex:1;min-width:120px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#b91c1c">${totN}</div><div style="font-size:11px;color:#475569">Não Conformes</div></div>
<div style="flex:1;min-width:120px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#b45309">${totM}</div><div style="font-size:11px;color:#475569">Melhoria</div></div>
</div>
<h3 style="font-size:15px;margin:18px 0 8px">Resumo por Terminal (unidades)</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#f1f5f9"><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:left">Terminal</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Conforme</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Não Conforme</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Melhoria</th></tr>${sumRows(byT, terms)}</table>
<h3 style="font-size:15px;margin:18px 0 8px">Resumo por Tipo de DCS (unidades)</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#f1f5f9"><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:left">Tipo de DCS</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Conforme</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Não Conforme</th><th style="padding:6px 10px;border:1px solid #d4dae6;text-align:right">Melhoria</th></tr>${sumRows(byTp, tipos)}</table>
<h3 style="font-size:15px;margin:22px 0 8px;color:#b91c1c">⚠ Detalhamento — DCS Não Conformes (${ncList.length})</h3>
<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap">${detHead}${detRows(ncList)}</table></div>
<h3 style="font-size:15px;margin:22px 0 8px;color:#b45309">🔧 Detalhamento — DCS para Melhoria (${melList.length})</h3>
<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap">${detHead}${detRows(melList)}</table></div>
<p style="font-size:11px;color:#94a3b8;margin-top:18px">Relatório gerado automaticamente pelo PM Manager · Frequência configurada: ${FREQ_LABELS[freq] || freq || ""}</p>
</div></div>`;
}

// Resumo simples (texto) para fallback/log
function buildSummary(list) {
  list = Array.isArray(list) ? list : [];
  const nc = list.filter(d => d.status === "Não Conforme").length;
  const mel = list.filter(d => d.status === "Melhoria Necessária").length;
  return { nc, mel, total: list.length };
}
// ─────────────────────────────────────────────────────────────


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
