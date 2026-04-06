import { db } from "../db.js";
import { labTests, providerLabTests } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const PROVIDER_ID = "8bcae973-ea30-49d9-a062-8f3e4c88e162";

async function main() {
  const testDataPath = path.join(process.cwd(), "server/data/ganga-lab-tests.json");
  const importTests: { name: string; price: number }[] = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));
  console.log(`Loaded ${importTests.length} tests from JSON file`);

  const existingTests = await db.select().from(labTests);
  console.log(`Found ${existingTests.length} existing lab tests in DB`);

  const existingByName = new Map<string, typeof existingTests[0]>();
  for (const t of existingTests) {
    existingByName.set(t.testName.toLowerCase().trim(), t);
  }

  const existingPLTs = await db.select().from(providerLabTests).where(eq(providerLabTests.providerId, PROVIDER_ID));
  console.log(`Found ${existingPLTs.length} existing provider-lab-test assignments`);
  const existingPLTByTestId = new Set(existingPLTs.map(plt => plt.labTestId));

  let testsCreated = 0;
  let assignmentsCreated = 0;
  let skippedDuplicates = 0;

  for (const item of importTests) {
    const normalizedName = item.name.toLowerCase().trim();
    let labTest = existingByName.get(normalizedName);

    if (!labTest) {
      const [created] = await db.insert(labTests).values({
        testName: item.name,
        cost: item.price.toFixed(2),
        turnaroundTime: "As per lab",
        status: "active",
      }).returning();
      labTest = created;
      existingByName.set(normalizedName, labTest);
      testsCreated++;
    }

    if (!existingPLTByTestId.has(labTest.id)) {
      await db.insert(providerLabTests).values({
        providerId: PROVIDER_ID,
        labTestId: labTest.id,
        price: item.price.toFixed(2),
        approvalStatus: "approved",
        isActive: true,
      });
      existingPLTByTestId.add(labTest.id);
      assignmentsCreated++;
    } else {
      skippedDuplicates++;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Tests created: ${testsCreated}`);
  console.log(`Provider assignments created: ${assignmentsCreated}`);
  console.log(`Skipped (already assigned): ${skippedDuplicates}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
