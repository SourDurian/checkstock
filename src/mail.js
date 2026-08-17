import nodemailer from "nodemailer";

const htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
}

function hktTime(date) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

function statusText(result) {
  if (result.status === "in_stock") return `有货 (${result.availability})`;
  if (result.status === "out_of_stock") return "无货";
  return `检查失败 (${result.reason})`;
}

function renderCurrentStatuses(observations) {
  const rows = [...observations]
    .sort((a, b) => a.target.priority - b.target.priority)
    .map(({ target, result }) => ({
      text: `优先级 ${target.priority} - ${target.name}: ${statusText(result)}`,
      html: `<li><strong>优先级 ${target.priority}</strong> - ${escapeHtml(target.name)}: ${escapeHtml(statusText(result))}</li>`,
    }));
  return {
    text: rows.map((row) => row.text).join("\n"),
    html: `<ul>${rows.map((row) => row.html).join("")}</ul>`,
  };
}

export function buildStockMessage(events, observations, checkedAt) {
  const sorted = [...events].sort((a, b) => a.target.priority - b.target.priority);
  const first = sorted[0];
  const label = first.kind === "arrival" ? "到货" : "仍有货";
  const subject = `[VMISS${label}][优先级${first.target.priority}] ${first.target.name}`;
  const lines = sorted.map(({ kind, target, observation }) =>
    `${kind === "arrival" ? "到货" : "再次提醒"}: ${target.name} | ${target.price} ${target.cycle} | 库存 ${observation.availability} | ${target.orderUrl}`);
  const items = sorted.map(({ kind, target, observation }) => `
    <li>
      <strong>${kind === "arrival" ? "到货" : "再次提醒"}: ${escapeHtml(target.name)}</strong><br>
      ${escapeHtml(target.price)} ${escapeHtml(target.cycle)}，库存 ${observation.availability}<br>
      <a href="${escapeHtml(target.orderUrl)}">立即打开购买页面</a>
    </li>`).join("");
  const statuses = renderCurrentStatuses(observations);

  return {
    subject,
    text: `${lines.join("\n")}\n\n检查时间: ${hktTime(checkedAt)}\n\n全部目标状态:\n${statuses.text}`,
    html: `<h2>VMISS 库存提醒</h2><ul>${items}</ul><p>检查时间（香港）: ${escapeHtml(hktTime(checkedAt))}</p><h3>全部目标状态</h3>${statuses.html}`,
  };
}

export function buildHealthMessage(failures, recoveries, checkedAt) {
  const hasFailures = failures.length > 0;
  const subject = hasFailures ? "[VMISS监控异常] 连续检查失败" : "[VMISS监控恢复] 页面检查已恢复";
  const entries = [
    ...failures.map(({ target, observation }) => `异常: ${target.name} (${observation.reason})`),
    ...recoveries.map(({ target }) => `恢复: ${target.name}`),
  ];
  const htmlEntries = entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  return {
    subject,
    text: `${entries.join("\n")}\n\n检查时间: ${hktTime(checkedAt)}`,
    html: `<h2>${hasFailures ? "VMISS 监控异常" : "VMISS 监控恢复"}</h2><ul>${htmlEntries}</ul><p>检查时间（香港）: ${escapeHtml(hktTime(checkedAt))}</p>`,
  };
}

export function buildTestMessage(now = new Date()) {
  return {
    subject: "[VMISS监控] 测试邮件",
    text: `邮件通知配置正常。测试时间（香港）: ${hktTime(now)}`,
    html: `<h2>VMISS 监控测试成功</h2><p>邮件通知配置正常。</p><p>测试时间（香港）: ${escapeHtml(hktTime(now))}</p>`,
  };
}

export function createMailer(environment = process.env) {
  const user = environment.GMAIL_USER?.trim();
  const password = environment.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const recipient = environment.ALERT_TO?.trim() || user;
  if (!user || !password || !recipient) {
    throw new Error("Missing GMAIL_USER, GMAIL_APP_PASSWORD, or ALERT_TO email configuration");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password },
  });

  return {
    async send(message) {
      return transporter.sendMail({
        from: `VMISS Stock Monitor <${user}>`,
        to: recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
