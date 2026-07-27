import { objectStorageClient } from "./server/replit_integrations/object_storage/objectStorage";
import * as fs from "fs";
import * as path from "path";

const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const bucket = objectStorageClient.bucket(bucketId);
const OUT = path.join(process.cwd(), "uploads_from_storage");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const CONCURRENCY = 20;

async function main() {
  console.log("버킷:", bucketId);
  let allFiles: any[] = [];
  let pageToken: string | undefined;
  
  // 전체 목록 수집
  do {
    const [files, , res] = await bucket.getFiles({ maxResults: 1000, pageToken });
    allFiles = allFiles.concat(files);
    pageToken = (res as any)?.nextPageToken;
    console.log(`목록 수집: ${allFiles.length}개...`);
  } while (pageToken);

  console.log(`\n총 ${allFiles.length}개 다운로드 시작 (동시 ${CONCURRENCY}개)\n`);

  let ok = 0, fail = 0, totalBytes = 0;

  // CONCURRENCY 개씩 병렬 처리
  for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
    const batch = allFiles.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (file) => {
      const name = file.name.replace(/\//g, "_");
      const dest = path.join(OUT, name);
      if (fs.existsSync(dest)) { ok++; return; }
      try {
        await file.download({ destination: dest });
        totalBytes += fs.statSync(dest).size;
        ok++;
      } catch (e: any) {
        fail++;
      }
    }));
    process.stdout.write(`\r진행: ${ok+fail}/${allFiles.length} ✅${ok} ❌${fail} ${(totalBytes/1024/1024).toFixed(0)}MB`);
  }

  console.log(`\n\n완료! 성공:${ok} 실패:${fail} 총:${(totalBytes/1024/1024).toFixed(1)}MB`);
}
main().catch(console.error);
