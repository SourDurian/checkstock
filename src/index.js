import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TARGETS } from "./config.js";
import {
  buildHealthMessage,
  buildStockMessage,
  buildTestMessage,
  createMailer,
} from "./mail.js";
import { checkTargets } from "./monitor.js";
import { planStateTransition, readState, writeState } from "./state.js";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function statusLine({ target, result }) {
  const detail = result.status === "unknown"
    ? result.reason
    : `${result.availability} available`;
  return `- P${target.priority} ${target.name}: ${result.status} (${detail})`;
}

async function writeGitHubSummary(observations, checkedAt) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    "## VMISS stock check",
    "",
    `Checked at: ${checkedAt.toISOString()}`,
    "",
    ...observations.map(statusLine),
    "",
  ];
  await appendFile(summaryPath, lines.join("\n"), "utf8");
}

async function main() {
  const argumentsSet = new Set(process.argv.slice(2));
  const testEmail = argumentsSet.has("--test-email") || enabled(process.env.TEST_EMAIL);
  const dryRun = argumentsSet.has("--dry-run") || enabled(process.env.DRY_RUN);
  const checkedAt = new Date();

  if (testEmail) {
    await createMailer().send(buildTestMessage(checkedAt));
    console.log("Test email sent successfully.");
    return;
  }

  const observations = await checkTargets(TARGETS);
  for (const observation of observations) console.log(statusLine(observation));
  await writeGitHubSummary(observations, checkedAt);

  if (dryRun) {
    console.log("Dry run complete; no email or state changes were made.");
    return;
  }

  const statePath = resolve(process.env.MONITOR_STATE_PATH || ".monitor-state.json");
  const previousState = await readState(statePath, TARGETS);
  const transition = planStateTransition(previousState, observations, TARGETS, checkedAt);
  const messages = [];

  if (transition.stockEvents.length > 0) {
    messages.push(buildStockMessage(transition.stockEvents, observations, checkedAt));
  }
  if (transition.failureEvents.length > 0) {
    messages.push(buildHealthMessage(transition.failureEvents, [], checkedAt));
  }
  if (transition.recoveryEvents.length > 0) {
    messages.push(buildHealthMessage([], transition.recoveryEvents, checkedAt));
  }

  if (messages.length > 0) {
    const mailer = createMailer();
    for (const message of messages) await mailer.send(message);
  }

  if (transition.changed) {
    await writeState(statePath, transition.nextState);
    console.log("Monitor state updated.");
  } else {
    console.log("Monitor state unchanged.");
  }
}

main().catch((error) => {
  console.error(`Monitor failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
