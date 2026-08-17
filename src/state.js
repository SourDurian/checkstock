import { readFile, rename, writeFile } from "node:fs/promises";
import { MONITOR_DEFAULTS } from "./config.js";

function initialTargetState() {
  return {
    lastStatus: null,
    lastAvailability: null,
    firstAlertAt: null,
    reminderSent: false,
    consecutiveFailures: 0,
    failureNotified: false,
  };
}

export function createInitialState(targets) {
  return {
    version: 1,
    monitor: { lastHeartbeatAt: null },
    targets: Object.fromEntries(targets.map((target) => [target.id, initialTargetState()])),
  };
}

export function normalizeState(value, targets) {
  const initial = createInitialState(targets);
  if (!value || typeof value !== "object") return initial;

  initial.monitor.lastHeartbeatAt = value.monitor?.lastHeartbeatAt ?? null;
  for (const target of targets) {
    const stored = value.targets?.[target.id];
    if (stored && typeof stored === "object") {
      initial.targets[target.id] = { ...initial.targets[target.id], ...stored };
    }
  }
  return initial;
}

export async function readState(path, targets) {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeState(JSON.parse(raw), targets);
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return createInitialState(targets);
    }
    throw error;
  }
}

export async function writeState(path, state) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function ageMs(timestamp, nowMs) {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? nowMs - parsed : Number.POSITIVE_INFINITY;
}

export function planStateTransition(previous, observations, targets, now = new Date(), options = {}) {
  const settings = { ...MONITOR_DEFAULTS, ...options };
  const next = structuredClone(normalizeState(previous, targets));
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const stockEvents = [];
  const failureEvents = [];
  const recoveryEvents = [];

  for (const target of targets) {
    const observation = observations.find((item) => item.target.id === target.id)?.result
      ?? { status: "unknown", reason: "observation-missing", availability: null };
    const targetState = next.targets[target.id];

    if (observation.status === "unknown") {
      targetState.consecutiveFailures = Math.min(
        targetState.consecutiveFailures + 1,
        settings.failureThreshold,
      );
      if (targetState.consecutiveFailures >= settings.failureThreshold && !targetState.failureNotified) {
        targetState.failureNotified = true;
        failureEvents.push({ target, observation });
      }
      continue;
    }

    if (targetState.failureNotified) {
      recoveryEvents.push({ target, observation });
    }
    targetState.consecutiveFailures = 0;
    targetState.failureNotified = false;

    if (observation.status === "out_of_stock") {
      targetState.lastStatus = "out_of_stock";
      targetState.lastAvailability = observation.availability;
      targetState.firstAlertAt = null;
      targetState.reminderSent = false;
      continue;
    }

    const wasInStock = targetState.lastStatus === "in_stock";
    targetState.lastStatus = "in_stock";
    targetState.lastAvailability = observation.availability;

    if (!wasInStock) {
      targetState.firstAlertAt = nowIso;
      targetState.reminderSent = false;
      stockEvents.push({ kind: "arrival", target, observation });
    } else if (!targetState.reminderSent
      && ageMs(targetState.firstAlertAt, nowMs) >= settings.reminderDelayMs) {
      targetState.reminderSent = true;
      stockEvents.push({ kind: "reminder", target, observation });
    }
  }

  if (ageMs(next.monitor.lastHeartbeatAt, nowMs) >= settings.heartbeatIntervalMs) {
    next.monitor.lastHeartbeatAt = nowIso;
  }

  return {
    nextState: next,
    stockEvents,
    failureEvents,
    recoveryEvents,
    changed: JSON.stringify(next) !== JSON.stringify(normalizeState(previous, targets)),
  };
}
