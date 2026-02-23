import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  WidthType, AlignmentType, TextRun, BorderStyle, ImageRun,
  VerticalAlign, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  TableLayoutType, convertMillimetersToTwip, TabStopPosition, TabStopType,
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
const TITLE_SIZE = 36;
const SECTION_SIZE = 22;

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const ALL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function txt(text: string, bold?: boolean, size?: number): TextRun {
  return new TextRun({ text, bold, size: size || FONT_SIZE, font: FONT });
}

function borderedCell(
  text: string,
  opts?: {
    bold?: boolean;
    width?: number;
    colSpan?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    shading?: string;
  }
): TableCell {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts?.colSpan,
    shading: opts?.shading ? { fill: opts.shading } : undefined,
    borders: ALL_BORDERS,
    children: [
      new Paragraph({
        alignment: opts?.alignment || AlignmentType.CENTER,
        spacing: { before: 40, after: 40 },
        children: [txt(text, opts?.bold)],
      }),
    ],
  });
}

function headerCell(text: string, width?: number): TableCell {
  return borderedCell(text, { bold: true, width, alignment: AlignmentType.CENTER, shading: "D9E2F3" });
}

function dataCell(text: string, width?: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType]): TableCell {
  return borderedCell(text, { width, alignment: align || AlignmentType.CENTER });
}

function sectionLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [txt(`□ ${text}`, true, SECTION_SIZE)],
  });
}

function contentParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40, line: 340 },
    indent: { left: convertMillimetersToTwip(3) },
    children: [txt(text || "")],
  });
}

function multiLineContent(text: string): Paragraph[] {
  if (!text) return [contentParagraph("")];
  return text.split("\n").map((line) => contentParagraph(line));
}

function emptyLine(height?: number): Paragraph {
  return new Paragraph({ spacing: { before: height || 100 }, children: [] });
}

function getImageType(filePath: string): "jpg" | "png" {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" ? "jpg" : "png";
}

export async function generateAccidentDocx(report: AccidentReport): Promise<Buffer> {
  const occurredDate = report.occurredAt ? new Date(report.occurredAt) : new Date();
  const year = occurredDate.getFullYear();
  const month = String(occurredDate.getMonth() + 1).padStart(2, "0");
  const day = String(occurredDate.getDate()).padStart(2, "0");
  const hour = String(occurredDate.getHours()).padStart(2, "0");
  const minute = String(occurredDate.getMinutes()).padStart(2, "0");
  const dateTimeStr = `${year}. ${month}. ${day}일 ${hour}시${minute}분경`;

  let progressItems: ProgressItem[] = [];
  if (report.progressDetails) {
    try { progressItems = JSON.parse(report.progressDetails); } catch {}
  }

  let imageCaptions: string[] = [];
  if ((report as any).imageCaptions) {
    try { imageCaptions = JSON.parse((report as any).imageCaptions); } catch {}
  }

  const personalInfoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("성명", 14),
          dataCell(report.reporterName || "", 20),
          headerCell("직위", 12),
          dataCell(report.reporterPosition || "", 18),
          headerCell("소속부서", 14),
          dataCell(report.department || "", 22),
        ],
      }),
      new TableRow({
        children: [
          headerCell("동행자", 14),
          dataCell(report.companion || "", 20),
          headerCell("차종/차량번호", 12),
          borderedCell(report.vehicleInfo || "", { colSpan: 3, alignment: AlignmentType.CENTER }),
        ],
      }),
    ],
  });

  const progressRows = [
    new TableRow({
      children: [
        headerCell("NO", 8),
        headerCell("시간", 18),
        headerCell("내용", 74),
      ],
    }),
  ];

  if (progressItems.length > 0) {
    progressItems.forEach((item) => {
      progressRows.push(
        new TableRow({
          children: [
            dataCell(String(item.no), 8),
            dataCell(item.time, 18),
            borderedCell(item.content, { width: 74, alignment: AlignmentType.LEFT }),
          ],
        })
      );
    });
  } else {
    for (let i = 0; i < 4; i++) {
      progressRows.push(
        new TableRow({
          children: [
            dataCell("", 8),
            dataCell("", 18),
            borderedCell("", { width: 74, alignment: AlignmentType.LEFT }),
          ],
        })
      );
    }
  }

  const progressTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: progressRows,
  });

  const createdDate = report.createdAt ? new Date(report.createdAt) : new Date();
  const cYear = createdDate.getFullYear();
  const cMonth = String(createdDate.getMonth() + 1).padStart(2, "0");
  const cDay = String(createdDate.getDate()).padStart(2, "0");

  const sealChildren: (TextRun | ImageRun)[] = [];
  if (report.signature) {
    try {
      const base64Data = report.signature.replace(/^data:image\/\w+;base64,/, "");
      const sigBuffer = Buffer.from(base64Data, "base64");
      sealChildren.push(
        new ImageRun({
          data: sigBuffer,
          transformation: { width: 50, height: 50 },
          type: "png",
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.CHARACTER,
              offset: -200000,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.LINE,
              offset: -280000,
            },
            allowOverlap: true,
            behindDocument: false,
          },
        })
      );
    } catch {}
  }
  sealChildren.push(txt("(인)"));

  interface PhotoInfo {
    data: Buffer;
    type: "jpg" | "png";
    caption: string;
  }

  const photos: PhotoInfo[] = [];
  if (report.images && report.images.length > 0) {
    for (let i = 0; i < report.images.length; i++) {
      const imgPath = report.images[i];
      try {
        let fullPath = imgPath;
        if (imgPath.startsWith("/uploads/")) {
          fullPath = path.join(process.cwd(), imgPath);
        }
        if (fs.existsSync(fullPath)) {
          photos.push({
            data: fs.readFileSync(fullPath),
            type: getImageType(fullPath),
            caption: imageCaptions[i] || `사진 ${i + 1}`,
          });
        }
      } catch {}
    }
  }

  function buildPhotoTable(photoList: PhotoInfo[]): Table {
    const rows: TableRow[] = [];

    for (let i = 0; i < photoList.length; i += 2) {
      const left = photoList[i];
      const right = photoList[i + 1];

      const imgRow = new TableRow({
        height: { value: convertMillimetersToTwip(55), rule: "atLeast" as any },
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [
                  new ImageRun({
                    data: left.data,
                    transformation: { width: 230, height: 170 },
                    type: left.type,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
            children: right
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 60, after: 60 },
                    children: [
                      new ImageRun({
                        data: right.data,
                        transformation: { width: 230, height: 170 },
                        type: right.type,
                      }),
                    ],
                  }),
                ]
              : [new Paragraph({ children: [] })],
          }),
        ],
      });

      const captionRow = new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
            shading: { fill: "F2F2F2" },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 30, after: 30 },
                children: [txt(left.caption, true)],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: ALL_BORDERS,
            shading: right ? { fill: "F2F2F2" } : undefined,
            children: right
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 30, after: 30 },
                    children: [txt(right.caption, true)],
                  }),
                ]
              : [new Paragraph({ children: [] })],
          }),
        ],
      });

      rows.push(imgRow, captionRow);
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows,
    });
  }

  const photoSection: (Paragraph | Table)[] = [];
  if (photos.length > 0) {
    photoSection.push(
      new Paragraph({ children: [], pageBreakBefore: true }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 200, after: 200 },
        children: [txt("별첨: 사진", true, SECTION_SIZE)],
      }),
      emptyLine(100),
      buildPhotoTable(photos),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: FONT_SIZE },
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
            spacing: { before: 400, after: 500 },
            children: [txt("사 고 경 위 서", true, TITLE_SIZE)],
          }),

          new Paragraph({
            spacing: { before: 200, after: 160 },
            children: [
              txt("□ 발생일시: ", true, SECTION_SIZE),
              txt(dateTimeStr, false, FONT_SIZE),
            ],
          }),

          sectionLabel("사고자 인적사항"),
          personalInfoTable,

          sectionLabel("경과 및 조치 사항"),
          progressTable,

          sectionLabel("사고 개요"),
          ...multiLineContent(report.accidentOverview || report.description || ""),

          sectionLabel("사고원인"),
          ...multiLineContent(report.causeDetail || report.cause || ""),

          sectionLabel("사고방지대책"),
          ...multiLineContent(report.preventionPlan || ""),

          emptyLine(600),
          emptyLine(200),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [txt(`${cYear} 년 ${cMonth}월 ${cDay}일`)],
          }),

          emptyLine(200),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [
              txt(`작성자:  ${report.department || ""} ${report.reporterName || ""} `),
              ...sealChildren,
            ],
          }),

          ...photoSection,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
