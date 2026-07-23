import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
  confirmKeyboard,
} from "../toolkit/index.js";
import {
  createDomainStore,
  genId,
  now,
  type Report,
  type ReportIndex,
} from "../storage.js";

// Register "Submit Report" in the /start main menu
registerMainMenuItem({ label: "📝 Submit Report", data: "report:start", order: 20 });

const composer = new Composer<Ctx>();

// Persistent stores
const reportStore = createDomainStore<Report>("report");
const reportIndexStore = createDomainStore<ReportIndex>("report_idx");

const REPORT_TYPES = ["Bug", "Vulnerability", "Feature Request", "Other"];

function reportTypeKeyboard(): ReturnType<typeof inlineKeyboard> {
  const rows = REPORT_TYPES.map((t) => [inlineButton(t, `report:type:${t}`)]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

function severityKeyboard(): ReturnType<typeof inlineKeyboard> {
  return inlineKeyboard([
    [inlineButton("Low", "report:severity:low"), inlineButton("Medium", "report:severity:medium")],
    [inlineButton("High", "report:severity:high"), inlineButton("Critical", "report:severity:critical")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
}

// Step 1: Start report submission
composer.callbackQuery("report:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "report:select_type";
  ctx.session.flow_data = {};

  await ctx.editMessageText(
    "📝 Let's submit a report.\n\nWhat type of report is this?",
    { reply_markup: reportTypeKeyboard() },
  );
});

// Step 2: Select report type
composer.callbackQuery(/^report:type:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const reportType = ctx.match![1];
  ctx.session.step = "report:enter_title";
  ctx.session.flow_data = { type: reportType };

  await ctx.editMessageText(
    `Type: ${reportType}\n\nNow, give your report a short title:`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    },
  );
});

// Step 3: Enter title (text message)
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "report:enter_title") return next();

  const title = ctx.message.text.trim();
  if (title.length < 3) {
    await ctx.reply("Title is too short — use at least 3 characters.");
    return;
  }
  if (title.length > 100) {
    await ctx.reply("Title is too long — keep it under 100 characters.");
    return;
  }

  const flowData = (ctx.session.flow_data ?? {}) as { type?: string; title?: string };
  flowData.title = title;
  ctx.session.flow_data = flowData;
  ctx.session.step = "report:enter_steps";

  await ctx.reply(
    `Title: ${title}\n\nDescribe the steps to reproduce this issue:`,
    {
      reply_markup: { force_reply: true, input_field_placeholder: "Describe how to reproduce…" },
    },
  );
});

// Step 4: Enter steps to reproduce (text message)
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "report:enter_steps") return next();

  const steps = ctx.message.text.trim();
  if (steps.length < 10) {
    await ctx.reply("Please provide more detail — at least 10 characters.");
    return;
  }

  const flowData = (ctx.session.flow_data ?? {}) as { type?: string; title?: string; steps_to_reproduce?: string };
  flowData.steps_to_reproduce = steps;
  ctx.session.flow_data = flowData;
  ctx.session.step = "report:select_severity";

  await ctx.reply(
    `Steps to reproduce recorded.\n\nHow severe is this issue?`,
    { reply_markup: severityKeyboard() },
  );
});

// Step 5: Select severity
composer.callbackQuery(/^report:severity:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const severity = ctx.match![1] as "low" | "medium" | "high" | "critical";
  const flowData = (ctx.session.flow_data ?? {}) as {
    type?: string;
    title?: string;
    steps_to_reproduce?: string;
    severity?: string;
  };
  flowData.severity = severity;
  ctx.session.flow_data = flowData;
  ctx.session.step = "report:confirming";

  // Show preview
  const preview =
    `📋 Report Preview\n\n` +
    `Type: ${flowData.type}\n` +
    `Title: ${flowData.title}\n` +
    `Severity: ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n` +
    `Steps to reproduce:\n${flowData.steps_to_reproduce}`;

  await ctx.editMessageText(preview, {
    reply_markup: confirmKeyboard("report:confirm", { yes: "✅ Submit", no: "❌ Cancel" }),
  });
});

// Step 6: Confirm submission
composer.callbackQuery("report:confirm:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const flowData = (ctx.session.flow_data ?? {}) as {
    type?: string;
    title?: string;
    steps_to_reproduce?: string;
    severity?: string;
  };

  if (!flowData.type || !flowData.title || !flowData.steps_to_reproduce || !flowData.severity) {
    await ctx.editMessageText("Report data is incomplete. Please start over.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    ctx.session.step = "idle";
    ctx.session.flow_data = undefined;
    return;
  }

  const reportId = genId("rpt", now());
  const report: Report = {
    id: reportId,
    author_id: ctx.from?.id ?? 0,
    type: flowData.type,
    title: flowData.title,
    description: flowData.steps_to_reproduce,
    steps_to_reproduce: flowData.steps_to_reproduce,
    severity: flowData.severity as "low" | "medium" | "high" | "critical",
    status: "submitted",
    attachments: [],
    created_at: now(),
    updated_at: now(),
  };

  await reportStore.set(reportId, report);

  // Update report index
  const uid = ctx.from?.id ?? 0;
  const reportIdx = (await reportIndexStore.get("all")) ?? { report_ids: [], by_user: {} };
  reportIdx.report_ids.push(reportId);
  if (!reportIdx.by_user[uid]) reportIdx.by_user[uid] = [];
  reportIdx.by_user[uid].push(reportId);
  await reportIndexStore.set("all", reportIdx);

  ctx.session.step = "idle";
  ctx.session.flow_data = undefined;

  await ctx.editMessageText(
    `✅ Report submitted!\n\nTracking ID: ${reportId}\nType: ${report.type}\nSeverity: ${report.severity}\n\nYou can check the status anytime with /my_reports.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📝 Submit another", "report:start")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Cancel report
composer.callbackQuery("report:confirm:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  ctx.session.flow_data = undefined;

  await ctx.editMessageText("Report cancelled. No worries — you can start again anytime.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

export default composer;
