import { spawnSync } from "node:child_process";

export function skippedGateResults(gates, blocker) {
  return gates.map(([name, command]) => ({
    command,
    detail: `Not run because ${blocker} failed.`,
    name,
    status: "skipped",
  }));
}

export function runGates(gates, spawn = spawnSync) {
  const results = [];
  for (const [index, [name, command]] of gates.entries()) {
    console.log(`\n[verify] ${name}: ${command}`);
    const startedAt = new Date().toISOString();
    const result = spawn(command, {
      encoding: "utf8",
      shell: true,
      stdio: "inherit",
    });
    const completedAt = new Date().toISOString();
    const status = result.status === 0 ? "passed" : "failed";
    results.push({
      command,
      completedAt,
      exitCode: result.status,
      name,
      startedAt,
      status,
    });
    if (status === "failed") {
      results.push(...skippedGateResults(gates.slice(index + 1), name));
      return { failed: true, results };
    }
  }
  return { failed: false, results };
}
