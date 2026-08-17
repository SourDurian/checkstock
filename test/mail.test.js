import assert from "node:assert/strict";
import test from "node:test";
import { buildTestMessage, createMailer, resolveMailConfiguration } from "../src/mail.js";

test("configures implicit TLS for a generic SMTP server on port 465", () => {
  const configuration = resolveMailConfiguration({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "sender@example.com",
    SMTP_PASSWORD: "secret code",
    ALERT_TO: "receiver@example.net",
  });

  assert.deepEqual(configuration.transportOptions, {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: { user: "sender@example.com", pass: "secretcode" },
  });
  assert.equal(configuration.recipient, "receiver@example.net");
});

test("configures STARTTLS-style SMTP on port 587", () => {
  const configuration = resolveMailConfiguration({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "sender@example.com",
    SMTP_PASSWORD: "secret",
  });

  assert.equal(configuration.transportOptions.secure, false);
  assert.equal(configuration.recipient, "sender@example.com");
});

test("keeps compatibility with Gmail-specific secrets", () => {
  const configuration = resolveMailConfiguration({
    GMAIL_USER: "sender@gmail.com",
    GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
  });

  assert.deepEqual(configuration.transportOptions, {
    service: "gmail",
    auth: { user: "sender@gmail.com", pass: "abcdefghijklmnop" },
  });
});

test("rejects incomplete generic SMTP settings", () => {
  assert.throws(
    () => resolveMailConfiguration({ SMTP_USER: "sender@example.com", SMTP_PASSWORD: "secret" }),
    /SMTP_HOST is required/,
  );
});

test("does not mix generic SMTP and Gmail compatibility credentials", () => {
  assert.throws(
    () => resolveMailConfiguration({
      SMTP_HOST: "smtp.example.com",
      GMAIL_USER: "sender@gmail.com",
      GMAIL_APP_PASSWORD: "legacy-secret",
    }),
    /SMTP_USER and SMTP_PASSWORD are required/,
  );
});

test("keeps Chinese test-email content intact", () => {
  const message = buildTestMessage(new Date("2026-08-17T12:00:00Z"));
  assert.match(message.subject, /测试邮件/);
  assert.match(message.text, /邮件通知配置正常/);
});

test("passes the resolved envelope and message to the SMTP transport", async () => {
  let transportOptions;
  let sentMessage;
  const mailer = createMailer({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_USER: "sender@example.com",
    SMTP_PASSWORD: "secret",
    MAIL_FROM: "Stock Alerts <alerts@example.com>",
    ALERT_TO: "receiver@example.net",
  }, (options) => {
    transportOptions = options;
    return {
      async sendMail(message) {
        sentMessage = message;
        return { messageId: "test-message" };
      },
    };
  });

  await mailer.send({ subject: "Test", text: "plain", html: "<p>html</p>" });

  assert.equal(transportOptions.host, "smtp.example.com");
  assert.deepEqual(sentMessage, {
    from: "Stock Alerts <alerts@example.com>",
    to: "receiver@example.net",
    subject: "Test",
    text: "plain",
    html: "<p>html</p>",
  });
});
