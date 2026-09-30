import assert from "node:assert/strict";
import test from "node:test";

import { buildIncomingCallTokenLookup } from "../src/services/mobile-call-push";

test("limits provider-to-seeker incoming calls to the selected installation", () => {
  assert.deepEqual(
    buildIncomingCallTokenLookup("seeker-1", "provider", "installation-42"),
    {
      query: "SELECT token, platform, token_type, device_id FROM mobile_push_tokens WHERE user_id = $1 AND device_id = $2",
      values: ["seeker-1", "installation-42"],
    },
  );
});

test("fails closed for provider-to-seeker calls without a nonblank selected installation", () => {
  assert.equal(buildIncomingCallTokenLookup("seeker-1", "provider", null), null);
  assert.equal(buildIncomingCallTokenLookup("seeker-1", "provider", undefined), null);
  assert.equal(buildIncomingCallTokenLookup("seeker-1", "provider", " \t "), null);
});

test("keeps seeker-to-provider incoming calls account-wide", () => {
  assert.deepEqual(
    buildIncomingCallTokenLookup("provider-1", "seeker"),
    {
      query: "SELECT token, platform, token_type, device_id FROM mobile_push_tokens WHERE user_id = $1",
      values: ["provider-1"],
    },
  );
});