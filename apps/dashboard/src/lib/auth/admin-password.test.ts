import { deepStrictEqual } from "node:assert";
import { scryptSync } from "node:crypto";
import { test } from "node:test";

import { verifyAdminPassword } from "./admin-password";

test("admin password verification rejects invalid credentials and configuration", async () => {
  const salt = Buffer.alloc(32, 7);
  const password = "a-test-password-that-is-not-a-production-secret";
  const key = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const encoded = `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
  deepStrictEqual(
    await Promise.all([
      verifyAdminPassword(password, encoded),
      verifyAdminPassword("incorrect", encoded),
      verifyAdminPassword(undefined, encoded),
      verifyAdminPassword("x".repeat(257), encoded),
      verifyAdminPassword(password, undefined),
      verifyAdminPassword(password, "scrypt:bad:bad"),
      verifyAdminPassword(password, encoded.replace("scrypt", "plaintext")),
    ]),
    [true, false, false, false, false, false, false],
  );
});
