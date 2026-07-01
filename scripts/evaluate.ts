import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API_URL = "http://localhost:3000/api/triage";
const DATA_PATH = resolve(process.cwd(), "data/evaluation.json");

type TestCase = {
  id: number;
  input: string;
  expectedCategory: string;
  expectedNeedsHuman: boolean;
  notes: string;
};

type TriageResult = {
  category: string;
  needs_human: boolean;
};

type Failure = {
  id: number;
  input: string;
  categoryOk: boolean;
  humanOk: boolean;
  expectedCategory: string;
  actualCategory: string;
  expectedNeedsHuman: boolean;
  actualNeedsHuman: boolean;
};

async function triage(message: string): Promise<TriageResult | null> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TriageResult;
  } catch {
    return null;
  }
}

async function main() {
  const cases: TestCase[] = JSON.parse(readFileSync(DATA_PATH, "utf8"));

  let passed = 0;
  let categoryHits = 0;
  let humanHits = 0;
  const failures: Failure[] = [];

  for (const test of cases) {
    const result = await triage(test.input);

    const actualCategory = result?.category ?? "<error>";
    const actualNeedsHuman = result?.needs_human ?? false;

    const categoryOk = actualCategory === test.expectedCategory;
    const humanOk = actualNeedsHuman === test.expectedNeedsHuman;

    if (categoryOk) categoryHits++;
    if (humanOk) humanHits++;
    if (categoryOk && humanOk) {
      passed++;
    } else {
      failures.push({
        id: test.id,
        input: test.input,
        categoryOk,
        humanOk,
        expectedCategory: test.expectedCategory,
        actualCategory,
        expectedNeedsHuman: test.expectedNeedsHuman,
        actualNeedsHuman,
      });
    }
  }

  const total = cases.length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  console.log("\n=== Triage Evaluation ===\n");
  console.log(`Total tests:               ${total}`);
  console.log(`Passed tests:              ${passed} (${pct(passed)})`);
  console.log(`Category accuracy:         ${categoryHits}/${total} (${pct(categoryHits)})`);
  console.log(`Human escalation accuracy: ${humanHits}/${total} (${pct(humanHits)})`);

  if (failures.length === 0) {
    console.log("\nAll tests passed. 🎉\n");
    return;
  }

  console.log(`\n--- Failures (${failures.length}) ---\n`);
  for (const f of failures) {
    const wrong = [
      !f.categoryOk ? `category ${f.expectedCategory} → ${f.actualCategory}` : null,
      !f.humanOk ? `needs_human ${f.expectedNeedsHuman} → ${f.actualNeedsHuman}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`#${f.id}: ${wrong}`);
    console.log(`   "${f.input}"\n`);
  }
}

main().catch((err) => {
  console.error("Evaluation failed to run:", err);
  process.exit(1);
});
