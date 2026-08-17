import assert from "node:assert/strict";
import test from "node:test";
import { TARGETS } from "../src/config.js";
import { createInitialState, planStateTransition } from "../src/state.js";

const target = TARGETS[0];
const singleTarget = [target];
const at = (minutes) => new Date(Date.UTC(2026, 7, 17, 12, minutes, 0));

function observations(status, availability = null, reason = null) {
  return [{ target, result: { status, availability, reason } }];
}

test("initial out-of-stock observation does not alert", () => {
  const result = planStateTransition(
    createInitialState(singleTarget),
    observations("out_of_stock", 0),
    singleTarget,
    at(0),
  );
  assert.equal(result.stockEvents.length, 0);
  assert.equal(result.nextState.targets[target.id].lastStatus, "out_of_stock");
});

test("arrival alerts immediately and reminds once on the next cycle", () => {
  const initial = createInitialState(singleTarget);
  initial.targets[target.id].lastStatus = "out_of_stock";

  const arrival = planStateTransition(initial, observations("in_stock", 2), singleTarget, at(0));
  assert.equal(arrival.stockEvents[0].kind, "arrival");

  const reminder = planStateTransition(arrival.nextState, observations("in_stock", 2), singleTarget, at(10));
  assert.equal(reminder.stockEvents[0].kind, "reminder");

  const quiet = planStateTransition(reminder.nextState, observations("in_stock", 2), singleTarget, at(20));
  assert.equal(quiet.stockEvents.length, 0);
});

test("out-of-stock resets notification state for a later restock", () => {
  let state = createInitialState(singleTarget);
  state.targets[target.id].lastStatus = "out_of_stock";
  state = planStateTransition(state, observations("in_stock", 1), singleTarget, at(0)).nextState;
  state = planStateTransition(state, observations("out_of_stock", 0), singleTarget, at(10)).nextState;
  const restock = planStateTransition(state, observations("in_stock", 1), singleTarget, at(20));
  assert.equal(restock.stockEvents[0].kind, "arrival");
});

test("unknown observations preserve valid stock state and alert after three failures", () => {
  let state = createInitialState(singleTarget);
  state.targets[target.id].lastStatus = "out_of_stock";

  const one = planStateTransition(state, observations("unknown", null, "cloudflare-block"), singleTarget, at(0));
  const two = planStateTransition(one.nextState, observations("unknown", null, "cloudflare-block"), singleTarget, at(10));
  const three = planStateTransition(two.nextState, observations("unknown", null, "cloudflare-block"), singleTarget, at(20));

  assert.equal(three.failureEvents.length, 1);
  assert.equal(three.nextState.targets[target.id].lastStatus, "out_of_stock");

  const four = planStateTransition(three.nextState, observations("unknown", null, "cloudflare-block"), singleTarget, at(30));
  assert.equal(four.failureEvents.length, 0);
  assert.equal(four.changed, false);
});

test("a valid observation sends one recovery event", () => {
  const state = createInitialState(singleTarget);
  state.targets[target.id].failureNotified = true;
  state.targets[target.id].consecutiveFailures = 3;
  const recovered = planStateTransition(state, observations("out_of_stock", 0), singleTarget, at(0));
  assert.equal(recovered.recoveryEvents.length, 1);
  assert.equal(recovered.nextState.targets[target.id].failureNotified, false);
});
