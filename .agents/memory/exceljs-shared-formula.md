---
name: ExcelJS shared formula 주입 패턴
description: ExcelJS 템플릿 파일 셀 값 주입 시 shared formula master 손상 방지법
---

## 규칙

Excel 템플릿 시트의 수식 셀에 값을 주입할 때 `cell.value = 숫자` 로 직접 교체하면 안 된다.
대신 수식/sharedFormula 구조를 유지하면서 `result`(cachedValue)만 업데이트해야 한다.

```typescript
const setCached = (cell: any, val: number) => {
  const v = cell.value;
  if (v && typeof v === 'object') {
    if ('formula' in v)            cell.value = { formula: v.formula, result: val };
    else if ('sharedFormula' in v) cell.value = { sharedFormula: v.sharedFormula, result: val };
  }
  if (val) cell.numFmt = '#,##0';
};
```

**Why:** safety_cost_template.xlsx의 1.지출통계 시트에서 O열이 `O44: formula=SUM(C44:N44)` (master) + `O45~O52: sharedFormula=O44` (clone) 구조다. R44 행의 C열 셀에 숫자를 직접 주입하면 ExcelJS 내부에서 O44 master formula가 손상되고, writeBuffer 시 "Shared Formula master must exist above and or left of clone for cell O45" 오류가 발생한다.

**How to apply:** export-template 라우트에서 1.지출통계, 3.예산대비_지출통계, 2.예산입력 시트에 값 주입할 때 setCached 패턴 사용. 2.예산입력의 C/D/E열처럼 수식이 없는 셀에는 직접 숫자 주입 가능.
