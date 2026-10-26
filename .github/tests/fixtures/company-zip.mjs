import { execFileSync } from "node:child_process";

export function zipFixture(files, { symlink } = {}) {
  return execFileSync("python3", ["-c", `
import io,sys,json,base64,zipfile
f=json.load(sys.stdin); b=io.BytesIO()
with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for name,data in sorted(f['files'].items()):
  i=zipfile.ZipInfo(name); i.compress_type=zipfile.ZIP_DEFLATED
  i.create_system=3; i.external_attr=(0o100644 << 16)
  if name==f.get('symlink'): i.external_attr=(0o120777 << 16)
  z.writestr(i,base64.b64decode(data))
sys.stdout.buffer.write(b.getvalue())
`], { input: JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([p, b]) => [p, Buffer.from(b).toString("base64")])), symlink }),
    maxBuffer: 16 * 1024 * 1024 });
}
