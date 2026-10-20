import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EXPECTED_PROJECT = process.env.FIRESTORE_PROJECT_ID ?? "return-state-team";

function credsPath(): string | null {
  const candidates = [
    process.env.FIRESTORE_CREDENTIALS,
    path.join(homedir(), "secrets", "return-state-team-firebase-adminsdk.json"),
  ];
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (!raw) continue;
    const resolved = path.resolve(raw.replace(/^~(?=\/|$)/, homedir()));
    if (seen.has(resolved) || !existsSync(resolved)) continue;
    seen.add(resolved);
    return resolved;
  }
  return null;
}

/** Firebase Admin Firestore instance (initialized once). */
export function getFirestore(): FirebaseFirestore.Firestore {
  const admin = require("firebase-admin") as typeof import("firebase-admin");
  if (!admin.apps.length) {
    const file = credsPath();
    if (!file) {
      throw new Error(
        "FIRESTORE_CREDENTIALS must be a path to a service account JSON file " +
          "(same as ironflowlive). Example: ~/secrets/return-state-team-firebase-adminsdk.json",
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(file),
      projectId: process.env.FIRESTORE_PROJECT_ID ?? EXPECTED_PROJECT,
    });
  }
  return admin.firestore();
}
