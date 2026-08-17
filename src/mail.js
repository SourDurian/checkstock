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

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseSecure(value, port) {
  if (value === undefined || String(value).trim() === "") return port === 465;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error("SMTP_SECURE must be true or false");
}

export function resolveMailConfiguration(environment = process.env) {
  const host = environment.SMTP_HOST?.trim();
  let user;
  let password;
  let transportOptions;
  if (host) {
    user = environment.SMTP_USER?.trim();
    password = environment.SMTP_PASSWORD?.replace(/\s+/g, "");
    if (!user || !password) {
      throw new Error("SMTP_USER and SMTP_PASSWORD are required with SMTP_HOST");
    }
    const port = parsePort(environment.SMTP_PORT?.trim() || "465");
    transportOptions = {
      host,
      port,
      secure: parseSecure(environment.SMTP_SECURE, port),
      auth: { user, pass: password },
    };
  } else if (environment.GMAIL_USER?.trim() && environment.GMAIL_APP_PASSWORD) {
    user = environment.GMAIL_USER.trim();
    password = environment.GMAIL_APP_PASSWORD.replace(/\s+/g, "");
    transportOptions = { service: "gmail", auth: { user, pass: password } };
  } else if (environment.SMTP_USER || environment.SMTP_PASSWORD) {
    throw new Error("SMTP_HOST is required when SMTP_USER or SMTP_PASSWORD is set");
  } else {
    throw new Error("Configure SMTP_HOST/SMTP_USER/SMTP_PASSWORD or Gmail compatibility secrets");
  }

  const recipient = environment.ALERT_TO?.trim() || user;
  return {
    transportOptions,
    from: environment.MAIL_FROM?.trim() || `VMISS Stock Monitor <${user}>`,
    recipient,
  };
}

export function createMailer(environment = process.env, createTransport = nodemailer.createTransport) {
  const configuration = resolveMailConfiguration(environment);
  const transporter = createTransport(configuration.transportOptions);

  return {
    async send(message) {
      return transporter.sendMail({
        from: configuration.from,
        to: configuration.recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
