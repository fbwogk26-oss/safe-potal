import ExcelJS from "exceljs";
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/tmp/report_verify4.xlsx");
  const ws = wb.getWorksheet("현황");
  for (let r = 1; r <= 40; r++) {
    const row = ws!.getRow(r);
    const vals: string[] = [];
    for (let c = 1; c <= 10; c++) {
      const v = row.getCell(c).value;
      if (v !== null && v !== undefined && v !== '') vals.push(`${c}:${v}`);
    }
    if (vals.length) console.log(r, vals.join(' | '));
  }
})();
