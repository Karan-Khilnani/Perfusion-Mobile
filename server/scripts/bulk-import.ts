import fs from "fs";
import path from "path";

const PROVIDER_ID = "8bcae973-ea30-49d9-a062-8f3e4c88e162";
const API_URL = process.env.API_URL || "http://localhost:5000";

async function main() {
  const testDataPath = path.join(process.cwd(), "server/data/ganga-lab-tests.json");
  const importTests: { name: string; price: number }[] = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));
  console.log(`Loaded ${importTests.length} tests from JSON file`);

  const sessionCookie = process.env.SESSION_COOKIE;
  if (!sessionCookie) {
    console.error("SESSION_COOKIE env var required (copy from browser after admin login)");
    process.exit(1);
  }

  const response = await fetch(`${API_URL}/api/admin/bulk-import-lab-tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": sessionCookie,
    },
    body: JSON.stringify({ providerId: PROVIDER_ID, tests: importTests }),
  });

  if (!response.ok) {
    console.error(`API error: ${response.status} ${response.statusText}`);
    const body = await response.text();
    console.error(body);
    process.exit(1);
  }

  const result = await response.json();
  console.log("\nImport result:", JSON.stringify(result, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
