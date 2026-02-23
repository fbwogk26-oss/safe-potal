import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  WidthType, AlignmentType, TextRun, BorderStyle, HeadingLevel,
  ImageRun, VerticalAlign,
} from "docx";
import type { AccidentReport } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

interface ProgressItem {
  no: number;
  time: string;
  content: string;
}

function cell(text: string, options?: { bold?: boolean; width?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType]; shading?: string }): TableCell {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: options?.shading ? { fill: options.shading } : undefined,
    children: [
      new Paragraph({
        alignment: options?.alignment || AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text, bold: options?.bold, size: 20, font: "맑은 고딕" }),
        ],
      }),
    ],
  });
}

function headerCell(text: string, width?: number): TableCell {
  return cell(text, { bold: true, width, alignment: AlignmentType.CENTER, shading: "D9E2F3" });
}

function createBorderedTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export async function generateAccidentDocx(report: AccidentReport): Promise<Buffer> {
  const occurredDate = report.occurredAt ? new Date(report.occurredAt) : new Date();
  const year = occurredDate.getFullYear();
  const month = String(occurredDate.getMonth() + 1).padStart(2, "0");
  const day = String(occurredDate.getDate()).padStart(2, "0");
  const hour = String(occurredDate.getHours()).padStart(2, "0");
  const minute = String(occurredDate.getMinutes()).padStart(2, "0");
  const dateStr = `${year}. ${month}. ${day}일 ${hour}시${minute}분경`;

  let progressItems: ProgressItem[] = [];
  if (report.progressDetails) {
    try {
      progressItems = JSON.parse(report.progressDetails);
    } catch { }
  }

  const personalInfoTable = createBorderedTable([
    new TableRow({
      children: [
        headerCell("성명", 15),
        cell(report.reporterName || "", { width: 18 }),
        headerCell("직위", 15),
        cell(report.reporterPosition || "", { width: 18 }),
        headerCell("소속부서", 15),
        cell(report.department || "", { width: 19 }),
      ],
    }),
    new TableRow({
      children: [
        headerCell("동행자", 15),
        cell(report.companion || "", { width: 18 }),
        headerCell("차종/차량번호", 15),
        new TableCell({
          columnSpan: 3,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: report.vehicleInfo || "", size: 20, font: "맑은 고딕" })],
            }),
          ],
        }),
      ],
    }),
  ]);

  const progressRows = [
    new TableRow({
      children: [
        headerCell("NO", 10),
        headerCell("시간", 20),
        headerCell("내용", 70),
      ],
    }),
    ...progressItems.map((item) =>
      new TableRow({
        children: [
          cell(String(item.no), { alignment: AlignmentType.CENTER, width: 10 }),
          cell(item.time, { alignment: AlignmentType.CENTER, width: 20 }),
          cell(item.content, { width: 70 }),
        ],
      })
    ),
  ];

  if (progressItems.length === 0) {
    progressRows.push(
      new TableRow({
        children: [
          cell("", { alignment: AlignmentType.CENTER, width: 10 }),
          cell("", { alignment: AlignmentType.CENTER, width: 20 }),
          cell("", { width: 70 }),
        ],
      })
    );
  }

  const progressTable = createBorderedTable(progressRows);

  const photoImages: Paragraph[] = [];
  if (report.images && report.images.length > 0) {
    for (const imgPath of report.images) {
      try {
        let fullPath = imgPath;
        if (imgPath.startsWith("/uploads/")) {
          fullPath = path.join(process.cwd(), imgPath);
        }
        if (fs.existsSync(fullPath)) {
          const imgData = fs.readFileSync(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const imgType = ext === ".jpg" || ext === ".jpeg" ? "jpg" : "png";
          photoImages.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
              children: [
                new ImageRun({
                  data: imgData,
                  transformation: { width: 250, height: 180 },
                  type: imgType,
                }),
              ],
            })
          );
        }
      } catch { }
    }
  }

  const signatureImages: Paragraph[] = [];
  if (report.signature) {
    try {
      const base64Data = report.signature.replace(/^data:image\/\w+;base64,/, "");
      const sigBuffer = Buffer.from(base64Data, "base64");
      signatureImages.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 100 },
          children: [
            new ImageRun({
              data: sigBuffer,
              transformation: { width: 150, height: 60 },
              type: "png",
            }),
          ],
        })
      );
    } catch { }
  }

  const createdDate = report.createdAt ? new Date(report.createdAt) : new Date();
  const cYear = createdDate.getFullYear();
  const cMonth = String(createdDate.getMonth() + 1).padStart(2, "0");
  const cDay = String(createdDate.getDate()).padStart(2, "0");

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({ text: "사 고 경 위 서", bold: true, size: 36, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({ text: "□ 발생일시: ", bold: true, size: 22, font: "맑은 고딕" }),
              new TextRun({ text: dateStr, size: 22, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({ text: "□ 사고자 인적사항", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),
          personalInfoTable,

          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({ text: "□ 경과 및 조치 사항", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),
          progressTable,

          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({ text: "□ 사고 개요", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),
          new Paragraph({
            spacing: { before: 50, after: 50 },
            children: [
              new TextRun({ text: report.accidentOverview || report.description || "", size: 20, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({ text: "□ 사고원인", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),
          new Paragraph({
            spacing: { before: 50, after: 50 },
            children: [
              new TextRun({ text: report.causeDetail || report.cause || "", size: 20, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({ text: "□ 사고방지대책", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),
          new Paragraph({
            spacing: { before: 50, after: 50 },
            children: [
              new TextRun({ text: report.preventionPlan || "", size: 20, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({ spacing: { before: 400 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200 },
            children: [
              new TextRun({ text: `${cYear} 년 ${cMonth}월 ${cDay}일`, size: 20, font: "맑은 고딕" }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 100, after: 50 },
            children: [
              new TextRun({
                text: `작성자:  ${report.department || ""} ${report.reporterName || ""} (인)`,
                size: 20,
                font: "맑은 고딕",
              }),
            ],
          }),

          ...signatureImages,

          new Paragraph({
            spacing: { before: 400, after: 100 },
            children: [
              new TextRun({ text: "별첨: 사진", bold: true, size: 22, font: "맑은 고딕" }),
            ],
          }),

          ...photoImages,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
