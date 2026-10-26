// TEST ONLY. Substitute fixture bindings while executing unchanged validators.
// Never imported by a runtime entrypoint or included in runtime source closure.
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const fixture = JSON.parse(gunzipSync(readFileSync(new URL("./company-bootstrap-arm.json.gz", import.meta.url))));
const predictionHash = createHash("sha256").update(fixture.unresolvedWhatIfRaw).digest("hex");
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!/\/scripts\/infra\/company-development-completion(?:-validation)?\.mjs$/.test(url)) return result;
    let source = String(result.source);
    if (url.endsWith("-validation.mjs")) {
      source = source.replace(/export const original = Object\.freeze\(\{[\s\S]*?\n\}\);/,
        `export const original = Object.freeze(${JSON.stringify(fixture.original)});`);
    }
    source = source.replaceAll("dc69598ff7e2cb03a36f91f92100285cce0edfadd1739fac185f3fcfb26253ff", predictionHash);
    return { ...result, source };
  },
});
