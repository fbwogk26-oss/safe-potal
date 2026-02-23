import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  WidthType, AlignmentType, TextRun, BorderStyle, ImageRun,
  VerticalAlign, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  HorizontalPositionAlign, VerticalPositionAlign, TableLayoutType,
  convertMillimetersToTwip,
} from "docx";
import type { AccidentReport } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

interface ProgressItem {
  no: number;
  time: string;
  content: string;
}

const FONT = "바탕";
const FONT_SIZE = 20;
const TITLE_SIZE = 32;
const SECTION_SIZE = 22;
const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "000000",
};
const ALL_BORDERS = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
};

function makeCell(
  text: string,
  opts?: {
    bold?: boolean;
    width?: number;
    colSpan?: number;
    rowSpan?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    shading?: string;
    fontSize?: number;
    children?: (TextRun | ImageRun)[];
  }
): TableCell {
  const children = opts?.children
    ? [
        new Paragraph({
          alignment: opts?.alignment || AlignmentType.CENTER,
          spacing: { before: 30, after: 30, line: 276 },
          children: opts.children,
        }),
      ]
    : [
        new Paragraph({
          alignment: opts?.alignment || AlignmentType.CENTER,
          spacing: { before: 30, after: 30, line: 276 },
          children: [
            new TextRun({
              text,
              bold: opts?.bold,
              size: opts?.fontSize || FONT_SIZE,
              font: FONT,
            }),
          ],
        }),
      ];

  return new TableCell({
    width: opts?.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts?.colSpan,
    rowSpan: opts?.rowSpan,
    shading: opts?.shading ? { fill: opts.shading } : undefined,
    borders: ALL_BORDERS,
    children,
  });
}

function hdrCell(text: string, width?: number): TableCell {
  return makeCell(text, {
    bold: true,
    width,
    alignment: AlignmentType.CENTER,
    shading: "D9E2F3",
  });
}

function valCell(text: string, width?: number, alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]): TableCell {
  return makeCell(text, {
    width,
    alignment: alignment || AlignmentType.LEFT,
  });
}

function createTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120, line: 276 },
    children: [
      new TextRun({
        text: `□ ${text}`,
        bold: true,
        size: SECTION_SIZE,
        font: FONT,
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 360 },
    indent: { left: convertMillimetersToTwip(5) },
    children: [
      new TextRun({
        text: text || "",
        size: FONT_SIZE,
        font: FONT,
      }),
    ],
  });
}

function multiLineParagraphs(text: string): Paragraph[] {
  if (!text) return [bodyParagraph("")];
  const lines = text.split("\n");
  return lines.map((line) => bodyParagraph(line));
}

export async function generateAccidentDocx(report: AccidentReport): Promise<Buffer> {
  const occurredDate = report.occurredAt ? new Date(report.occurredAt) : new Date();
  const year = occurredDate.getFullYear();
  const month = String(occurredDate.getMonth() + 1).padStart(2, "0");
  const day = String(occurredDate.getDate()).padStart(2, "0");
  const hour = String(occurredDate.getHours()).padStart(2, "0");
  const minute = String(occurredDate.getMinutes()).padStart(2, "0");
  const dateStr = `${year}. ${month}. ${day}일  ${hour}시 ${minute}분경`;

  let progressItems: ProgressItem[] = [];
  if (report.progressDetails) {
    try {
      progressItems = JSON.parse(report.progressDetails);
    } catch {}
  }

  const personalInfoTable = createTable([
    new TableRow({
      children: [
        hdrCell("성  명", 15),
        valCell(report.reporterName || "", 20, AlignmentType.CENTER),
        hdrCell("직  위", 13),
        valCell(report.reporterPosition || "", 17, AlignmentType.CENTER),
        hdrCell("소속부서", 15),
        valCell(report.department || "", 20, AlignmentType.CENTER),
      ],
    }),
    new TableRow({
      children: [
        hdrCell("동행자", 15),
        valCell(report.companion || "", 20, AlignmentType.CENTER),
        hdrCell("차종/차량번호", 13),
        makeCell(report.vehicleInfo || "", {
          colSpan: 3,
          alignment: AlignmentType.CENTER,
        }),
      ],
    }),
  ]);

  const progressRows = [
    new TableRow({
      children: [
        hdrCell("NO", 10),
        hdrCell("시 간", 25),
        hdrCell("내        용", 65),
      ],
    }),
  ];

  if (progressItems.length > 0) {
    progressItems.forEach((item) => {
      progressRows.push(
        new TableRow({
          children: [
            valCell(String(item.no), 10, AlignmentType.CENTER),
            valCell(item.time, 25, AlignmentType.CENTER),
            valCell(item.content, 65, AlignmentType.LEFT),
          ],
        })
      );
    });
  } else {
    for (let i = 0; i < 3; i++) {
      progressRows.push(
        new TableRow({
          children: [
            valCell("", 10, AlignmentType.CENTER),
            valCell("", 25, AlignmentType.CENTER),
            valCell("", 65, AlignmentType.LEFT),
          ],
        })
      );
    }
  }

  const progressTable = createTable(progressRows);

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
              spacing: { before: 120, after: 120 },
              children: [
                new ImageRun({
                  data: imgData,
                  transformation: { width: 400, height: 300 },
                  type: imgType,
                }),
              ],
            })
          );
        }
      } catch {}
    }
  }

  const createdDate = report.createdAt ? new Date(report.createdAt) : new Date();
  const cYear = createdDate.getFullYear();
  const cMonth = String(createdDate.getMonth() + 1).padStart(2, "0");
  const cDay = String(createdDate.getDate()).padStart(2, "0");

  const sealCellChildren: (TextRun | ImageRun)[] = [];
  if (report.signature) {
    try {
      const base64Data = report.signature.replace(/^data:image\/\w+;base64,/, "");
      const sigBuffer = Buffer.from(base64Data, "base64");
      sealCellChildren.push(
        new ImageRun({
          data: sigBuffer,
          transformation: { width: 55, height: 55 },
          type: "png",
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.CHARACTER,
              offset: -250000,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.LINE,
              offset: -350000,
            },
            allowOverlap: true,
            behindDocument: false,
          },
        })
      );
    } catch {}
  }
  sealCellChildren.push(
    new TextRun({
      text: "(인)",
      size: FONT_SIZE,
      font: FONT,
    })
  );

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `작성자:  ${report.department || ""}   ${report.reporterName || ""}`,
                    size: FONT_SIZE,
                    font: FONT,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: sealCellChildren,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: FONT_SIZE,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 400, line: 276 },
            children: [
              new TextRun({
                text: "사  고  경  위  서",
                bold: true,
                size: TITLE_SIZE,
                font: FONT,
              }),
            ],
          }),

          sectionTitle("발생일시"),
          new Paragraph({
            spacing: { before: 60, after: 120, line: 276 },
            indent: { left: convertMillimetersToTwip(5) },
            children: [
              new TextRun({
                text: `- ${dateStr}`,
                size: FONT_SIZE,
                font: FONT,
              }),
            ],
          }),

          sectionTitle("사고자 인적사항"),
          personalInfoTable,

          sectionTitle("경과 및 조치 사항"),
          progressTable,

          sectionTitle("사고 개요"),
          ...multiLineParagraphs(report.accidentOverview || report.description || ""),

          sectionTitle("사고원인"),
          ...multiLineParagraphs(report.causeDetail || report.cause || ""),

          sectionTitle("사고방지대책"),
          ...multiLineParagraphs(report.preventionPlan || ""),

          new Paragraph({ spacing: { before: 600 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, line: 276 },
            children: [
              new TextRun({
                text: `${cYear} 년   ${cMonth} 월   ${cDay} 일`,
                size: FONT_SIZE,
                font: FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 }, children: [] }),

          signatureTable,

          ...(photoImages.length > 0
            ? [
                new Paragraph({ children: [], pageBreakBefore: true }),
                new Paragraph({
                  spacing: { before: 200, after: 200, line: 276 },
                  children: [
                    new TextRun({
                      text: "[ 별첨: 현장 사진 ]",
                      bold: true,
                      size: SECTION_SIZE,
                      font: FONT,
                    }),
                  ],
                }),
                ...photoImages,
              ]
            : []),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
