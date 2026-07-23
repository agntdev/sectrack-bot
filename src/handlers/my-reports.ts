import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  createDomainStore,
  type Report,
  type ReportIndex,
} from "../storage.js";

const composer = new Composer<Ctx>();

// Persistent stores
const reportStore = createDomainStore<Report>("report");
const reportIndexStore = createDomainStore<ReportIndex>("report_idx");

/** Format a report status for display. */
function formatStatus(status: string): string {
  switch (status) {
    case "submitted":
      return "📤 Submitted";
    case "under_review":
      return "🔍 Under Review";
    case "resolved":
      return "✅ Resolved";
    case "closed":
      return "🔒 Closed";
    default:
      return status;
  }
}

/** Format a report summary for display. */
function formatReportSummary(report: Report): string {
  const severityEmoji =
    report.severity === "critical"
      ? "🔴"
      : report.severity === "high"
        ? "🟠"
        : report.severity === "medium"
          ? "🟡"
          : "🟢";
  return `${severityEmoji} ${report.title}\nType: ${report.type} | Status: ${formatStatus(report.status)}\nID: ${report.id}`;
}

// /my_reports command — view submission history
composer.command("my_reports", async (ctx) => {
  const uid = ctx.from?.id ?? 0;
  const reportIdx = (await reportIndexStore.get("all")) ?? { report_ids: [], by_user: {} };
  const userReportIds = reportIdx.by_user[uid] ?? [];

  if (userReportIds.length === 0) {
    await ctx.reply(
      "📋 You haven't submitted any reports yet.\n\nTap 📝 Submit Report to create one.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📝 Submit Report", "report:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // Fetch reports (most recent first)
  const reports: Report[] = [];
  for (const id of userReportIds) {
    const report = await reportStore.get(id);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => b.created_at - a.created_at);

  // Build summary text
  const lines = reports.map((r) => formatReportSummary(r));
  const text = `📋 Your Reports (${reports.length})\n\n${lines.join("\n\n")}`;

  // Build keyboard with report detail buttons
  const rows = reports.map((r) => [
    inlineButton(`${r.title.slice(0, 30)}…`, `report:detail:${r.id}`),
  ]);
  rows.push([inlineButton("📝 Submit new report", "report:start")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
});

// Report detail view
composer.callbackQuery(/^report:detail:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const reportId = ctx.match![1];
  const report = await reportStore.get(reportId);

  if (!report) {
    await ctx.reply("Report not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const severityEmoji =
    report.severity === "critical"
      ? "🔴"
      : report.severity === "high"
        ? "🟠"
        : report.severity === "medium"
          ? "🟡"
          : "🟢";

  const text =
    `📋 Report: ${report.title}\n\n` +
    `Type: ${report.type}\n` +
    `Severity: ${severityEmoji} ${report.severity.charAt(0).toUpperCase() + report.severity.slice(1)}\n` +
    `Status: ${formatStatus(report.status)}\n` +
    `ID: ${report.id}\n\n` +
    `Steps to reproduce:\n${report.steps_to_reproduce}`;

  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to reports", "report:list")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Back to report list
composer.callbackQuery("report:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  // Re-trigger the command logic
  const uid = ctx.from?.id ?? 0;
  const reportIdx = (await reportIndexStore.get("all")) ?? { report_ids: [], by_user: {} };
  const userReportIds = reportIdx.by_user[uid] ?? [];

  if (userReportIds.length === 0) {
    await ctx.editMessageText(
      "📋 You haven't submitted any reports yet.\n\nTap 📝 Submit Report to create one.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📝 Submit Report", "report:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const reports: Report[] = [];
  for (const id of userReportIds) {
    const report = await reportStore.get(id);
    if (report) reports.push(report);
  }
  reports.sort((a, b) => b.created_at - a.created_at);

  const lines = reports.map((r) => formatReportSummary(r));
  const text = `📋 Your Reports (${reports.length})\n\n${lines.join("\n\n")}`;

  const rows = reports.map((r) => [
    inlineButton(`${r.title.slice(0, 30)}…`, `report:detail:${r.id}`),
  ]);
  rows.push([inlineButton("📝 Submit new report", "report:start")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
});

export default composer;
