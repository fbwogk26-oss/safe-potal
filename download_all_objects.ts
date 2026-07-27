import { objectStorageClient } from "./server/replit_integrations/object_storage/objectStorage";
import * as fs from "fs";
import * as path from "path";

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const bucket = objectStorageClient.bucket(bucketId);
const OUT = path.join(process.cwd(), "uploads_from_storage");

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  console.log("버킷:", bucketId);
  const [files] = await bucket.getFiles({ maxResults: 2000 });
  console.log("총 파일 수:", files.length);

  let ok = 0, fail = 0, totalBytes = 0;
  for (const file of files) {
    const name = file.name.split("/").pop()!;
    const dest = path.join(OUT, name);
    try {
      await file.download({ destination: dest });
      const size = fs.statSync(dest).size;
      totalBytes += size;
      ok++;
      if (ok % 20 === 0) console.log(`진행: ${ok}/${files.length} (${(totalBytes/1024/1024).toFixed(1)}MB)`);
    } catch (e: any) {
      console.error(`실패: ${file.name} — ${e.message}`);
      fail++;
    }
  }
  console.log(`\n완료: 성공 ${ok}개, 실패 ${fail}개, 총 ${(totalBytes/1024/1024).toFixed(1)}MB`);
}

main().catch(console.error);
