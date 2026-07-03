import { buildAisExcelReportBuffer } from "./server/aisExcelReport";
import { writeFileSync } from "fs";
(async () => {
  try {
    const { buffer, fileName, recordCount, badCount } = await buildAisExcelReportBuffer();
    console.log("OK", fileName, "size=", buffer.length, "records=", recordCount, "bad=", badCount);
    writeFileSync("/tmp/report_verify4.xlsx", buffer);
  } catch (e: any) {
    console.error("FAIL", e.stack || e.message);
    process.exit(1);
  }
})();
