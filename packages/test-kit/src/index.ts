export const testKitBoundary = "test-kit";
export { createTwoUserContext } from "./auth/two-user-context.js";
export type {
  SyntheticAuthUser,
  TwoUserContext,
} from "./auth/two-user-context.js";
export {
  normalizeUatSyn01Fixture,
  uatSyn01Fixture,
} from "./fixtures/uat-syn-01.js";
export { uatSyn01Expected } from "./fixtures/uat-syn-01.expected.js";
export { uatSyn01Schema } from "./contracts/uat-syn-01.schema.js";
export type { UatSyn01Fixture } from "./contracts/uat-syn-01.schema.js";
