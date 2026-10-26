// TEST ONLY. Substitute fixture bindings while executing unchanged validators.
// Never imported by a runtime entrypoint or included in runtime source closure.
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const fixture = JSON.parse(gunzipSync(readFileSync(new URL("./company-bootstrap-arm.json.gz", import.meta.url))));
const predictionHash = createHash("sha256").update(fixture.unresolvedWhatIfRaw).digest("hex");
const subscription = "/subscriptions/891e5e6e-8ae3-4455-9184-8d7606223d91";
const group = `${subscription}/resourceGroups/rg-keyforta-companydev-san`;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
const digest = (v) => createHash("sha256").update(JSON.stringify(sorted(v))).digest("hex");
export const syntheticHistorical = [0, 1, 2, 3].map((n) => {
  const scope = n < 2 ? group : subscription;
  const principalId = n % 2 ? fixture.original.writerPrincipalId : uid(5);
  const roleDefinition = { id: `${subscription}/providers/Microsoft.Authorization/roleDefinitions/${uid(600 + n)}`,
    properties: { type: "CustomRole", roleName: `Synthetic historical ${n}`, assignableScopes: [scope], permissions: [{
      actions: [n % 2 ? "Microsoft.Resources/deployments/write" : "Microsoft.Resources/deployments/whatIf/action"],
      notActions: [], dataActions: [], notDataActions: [],
    }] } };
  const assignment = { id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${uid(700 + n)}`,
    properties: { scope, principalId, principalType: "ServicePrincipal", roleDefinitionId: roleDefinition.id,
      condition: null, description: "Synthetic only" } };
  return { assignment, roleDefinition };
});
const historicalPins = syntheticHistorical.map(({ assignment: a, roleDefinition: d }) => ({
  assignmentId: a.id, assignmentSha256: digest(a), principalId: a.properties.principalId, scope: a.properties.scope,
  roleDefinitionId: d.id, roleDefinitionSha256: digest(d),
}));
export const syntheticInheritedHumans = [0, 1].map((n) => ({
  id: `${subscription}/providers/Microsoft.Authorization/roleAssignments/${uid(900 + n)}`,
  properties: { scope: subscription, principalId: uid(910 + n), principalType: "User",
    roleDefinitionId: `${subscription}/providers/Microsoft.Authorization/roleDefinitions/${uid(920)}`,
    description: "Synthetic inherited human evidence, never caller authority" },
}));
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!/\/scripts\/infra\/company-development-completion(?:-validation)?\.mjs$/.test(url)) return result;
    let source = String(result.source);
    if (url.endsWith("-validation.mjs")) {
      source = source.replace(/export const original = Object\.freeze\(\{[\s\S]*?\n\}\);/,
        `export const original = Object.freeze(${JSON.stringify(fixture.original)});`);
      source = source.replace(/export const historicalAuditGrants = Object\.freeze\(\[[\s\S]*?\n\]\);/,
        `export const historicalAuditGrants = Object.freeze(${JSON.stringify(historicalPins)});`);
      source = source.replace(/export const historicalInheritedHumanHashes = Object\.freeze\(\[[\s\S]*?\n\]\);/,
        `export const historicalInheritedHumanHashes = Object.freeze(${JSON.stringify(syntheticInheritedHumans.map(digest))});`);
    }
    // Inspector CLI pins the already-applied identity/configuration. Only local
    // synthetic CLI processes substitute those pins; production has no hook.
    if (process.env.MOCK_FIXTURE && process.env.INSPECTION_INTENT) {
      const binding = JSON.parse(process.env.INSPECTION_INTENT).observerBinding;
      source = source.replaceAll("142bbb0f-118a-4dea-9f53-69e03d3f308b", binding.clientId)
        .replaceAll("c0f5fe98-9cb7-4a6b-a371-fbe549c6dfc1", binding.principalId)
        .replaceAll("3471916410bbcbf38ba589ced35f3a17760bce2bc493df03d03063b4ee135f25",
          createHash("sha256").update(JSON.stringify(binding)).digest("hex"));
    }
    source = source.replaceAll("dc69598ff7e2cb03a36f91f92100285cce0edfadd1739fac185f3fcfb26253ff", predictionHash);
    return { ...result, source };
  },
});
