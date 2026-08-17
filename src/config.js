export const TARGETS = Object.freeze([
  Object.freeze({
    id: "tri-dc2-basic",
    priority: 1,
    name: "US.LA.TRI.DC2.Basic",
    price: "$5.00 CAD",
    cycle: "Monthly",
    catalogUrl: "https://app.vmiss.com/store/us-los-angeles-bgp",
    orderUrl: "https://app.vmiss.com/store/us-los-angeles-bgp/basic",
  }),
  Object.freeze({
    id: "tri-basic",
    priority: 2,
    name: "US.LA.TRI.Basic",
    price: "$5.00 CAD",
    cycle: "Monthly",
    catalogUrl: "https://app.vmiss.com/store/us-los-angeles-tri",
    orderUrl: "https://app.vmiss.com/store/us-los-angeles-tri/basic",
  }),
  Object.freeze({
    id: "cn2-basic",
    priority: 3,
    name: "US.LA.CN2.Basic",
    price: "$6.00 CAD",
    cycle: "Monthly",
    catalogUrl: "https://app.vmiss.com/store/us-los-angeles-cn2",
    orderUrl: "https://app.vmiss.com/store/us-los-angeles-cn2/basic",
  }),
]);

export const MONITOR_DEFAULTS = Object.freeze({
  navigationTimeoutMs: 45_000,
  challengeWaitMs: 30_000,
  minDelayMs: 20_000,
  maxDelayMs: 35_000,
  reminderDelayMs: 8 * 60_000,
  failureThreshold: 3,
  heartbeatIntervalMs: 30 * 24 * 60 * 60_000,
});
