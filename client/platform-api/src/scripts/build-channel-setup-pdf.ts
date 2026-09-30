/**
 * Build a styled PDF from docs/CHANNEL_SETUP_GUIDE.md
 * Output: apps/platform-api/public/docs/channel-setup-guide.pdf
 *
 * Usage: npm run docs:pdf  (from apps/platform-api)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const mdPath = path.join(repoRoot, "docs", "CHANNEL_SETUP_GUIDE.md");
const outDir = path.join(apiRoot, "public", "docs");
const outPath = path.join(outDir, "channel-setup-guide.pdf");

const C = {
  navy: "#0F2C4C",
  navyDeep: "#0A1F36",
  teal: "#0D9488",
  tealSoft: "#CCFBF1",
  ink: "#1E293B",
  muted: "#64748B",
  line: "#E2E8F0",
  rowAlt: "#F8FAFC",
  white: "#FFFFFF",
  codeBg: "#F1F5F9",
};

const PAGE = { margin: 48, footerBand: 40 };

function cleanInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[→⟶➜➔➞]/g, ">")
    .replace(/[←⟵⬅]/g, "<")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE.margin - PAGE.footerBand;
}

function ensureSpace(doc: PDFKit.PDFDocument, need: number) {
  if (doc.y + need > contentBottom(doc)) doc.addPage();
}

/** Drawing in margin/footer must not trip PDFKit auto page-break. */
function withOpenMargins(doc: PDFKit.PDFDocument, fn: () => void) {
  const prev = { ...doc.page.margins };
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    fn();
  } finally {
    doc.page.margins = prev;
  }
}

function drawHeaderBar(doc: PDFKit.PDFDocument) {
  withOpenMargins(doc, () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 8).fill(C.teal);
    doc.restore();
  });
}

function drawFooter(doc: PDFKit.PDFDocument, pageNo: number) {
  withOpenMargins(doc, () => {
    const { width, height } = doc.page;
    const y = height - 28;
    doc.save();
    doc.moveTo(PAGE.margin, y - 10).lineTo(width - PAGE.margin, y - 10).strokeColor(C.line).lineWidth(0.8).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted);
    doc.text("FyBud CEP · Channel setup", PAGE.margin, y, {
      width: 240,
      lineBreak: false,
    });
    doc.text(`Page ${pageNo}`, width - PAGE.margin - 80, y, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
    doc.restore();
  });
}

function drawCover(doc: PDFKit.PDFDocument) {
  const { width, height } = doc.page;
  const textW = width - PAGE.margin * 2;
  const x = PAGE.margin;
  const cx = width / 2;
  const brandY = height / 2 - 48;

  withOpenMargins(doc, () => {
    doc.save();
    doc.rect(0, 0, width, 6).fill(C.teal);
    doc.rect(0, height - 6, width, 6).fill(C.navy);
    doc.restore();

    doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(32);
    doc.text("FyBud", x, brandY, { width: textW, align: "center", lineBreak: false });

    const ruleW = 48;
    const ruleY = brandY + 44;
    doc.save();
    doc.moveTo(cx - ruleW / 2, ruleY).lineTo(cx + ruleW / 2, ruleY).strokeColor(C.teal).lineWidth(2).stroke();
    doc.restore();

    doc.fillColor(C.navy).font("Helvetica").fontSize(16);
    doc.text("Channel setup guide", x, ruleY + 18, { width: textW, align: "center", lineBreak: false });

    doc.fillColor(C.muted).font("Helvetica").fontSize(11);
    doc.text("WhatsApp   Instagram   Gmail   Shopify", x, ruleY + 46, {
      width: textW,
      align: "center",
      lineBreak: false,
    });
  });

  doc.addPage();
}

function sectionBanner(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 42);
  const x = PAGE.margin;
  const w = doc.page.width - PAGE.margin * 2;
  const y = doc.y + 6;
  doc.save();
  doc.roundedRect(x, y, w, 28, 5).fill(C.navy);
  doc.rect(x, y, 5, 28).fill(C.teal);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(12);
  doc.text(title, x + 16, y + 8, { width: w - 24, lineBreak: false });
  doc.restore();
  doc.x = PAGE.margin;
  doc.y = y + 36;
}

function subheading(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 28);
  const y = doc.y + 6;
  doc.save();
  doc.circle(PAGE.margin + 4, y + 6, 3).fill(C.teal);
  doc.restore();
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(11).text(title, PAGE.margin + 14, y, {
    width: doc.page.width - PAGE.margin * 2 - 14,
  });
  doc.x = PAGE.margin;
  doc.y = Math.max(doc.y, y + 18);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, opts?: { indent?: number }) {
  const cleaned = cleanInline(text);
  if (!cleaned) return;
  ensureSpace(doc, 18);
  const indent = opts?.indent ?? 0;
  const width = doc.page.width - PAGE.margin * 2 - indent;
  doc.fillColor(C.ink).font("Helvetica").fontSize(9.5);
  const h = doc.heightOfString(cleaned, { width, lineGap: 2.5 });
  ensureSpace(doc, h + 4);
  const y = doc.y;
  doc.text(cleaned, PAGE.margin + indent, y, { width, lineGap: 2.5 });
  doc.x = PAGE.margin;
  doc.y = y + h + 6;
}

function bullet(doc: PDFKit.PDFDocument, text: string, level = 0) {
  const cleaned = cleanInline(text);
  const indent = 8 + level * 12;
  const x = PAGE.margin + indent;
  const width = doc.page.width - PAGE.margin - x - 10;
  doc.font("Helvetica").fontSize(9.5);
  const h = doc.heightOfString(cleaned, { width, lineGap: 2 });
  ensureSpace(doc, h + 6);
  const y = doc.y;
  doc.save();
  doc.circle(x, y + 5, 1.6).fill(C.teal);
  doc.restore();
  doc.fillColor(C.ink).text(cleaned, x + 10, y, { width, lineGap: 2 });
  doc.x = PAGE.margin;
  doc.y = y + h + 5;
}

function numbered(doc: PDFKit.PDFDocument, n: string, text: string) {
  const cleaned = cleanInline(text);
  const box = 14;
  const width = doc.page.width - PAGE.margin * 2 - box - 8;
  doc.font("Helvetica").fontSize(9.5);
  const h = Math.max(box, doc.heightOfString(cleaned, { width, lineGap: 2 }));
  ensureSpace(doc, h + 8);
  const y = doc.y;
  doc.save();
  doc.roundedRect(PAGE.margin, y, box, box, 3).fill(C.tealSoft);
  doc.fillColor(C.teal).font("Helvetica-Bold").fontSize(8)
    .text(n.replace(".", ""), PAGE.margin, y + 3, { width: box, align: "center", lineBreak: false });
  doc.restore();
  doc.fillColor(C.ink).font("Helvetica").fontSize(9.5).text(cleaned, PAGE.margin + box + 8, y + 1, {
    width,
    lineGap: 2,
  });
  doc.x = PAGE.margin;
  doc.y = y + h + 6;
}

function codeBlock(doc: PDFKit.PDFDocument, lines: string[]) {
  const pad = 10;
  const contentH = Math.max(18, lines.length * 11 + pad * 2);
  ensureSpace(doc, contentH + 12);
  const x = PAGE.margin;
  const w = doc.page.width - PAGE.margin * 2;
  const y = doc.y + 4;
  doc.save();
  doc.roundedRect(x, y, w, contentH, 6).fill(C.codeBg);
  doc.rect(x, y, 4, contentH).fill(C.teal);
  doc.fillColor(C.navy).font("Courier").fontSize(8);
  let ty = y + pad;
  for (const line of lines) {
    doc.text(line || " ", x + 14, ty, { width: w - 24, lineBreak: false });
    ty += 11;
  }
  doc.restore();
  doc.x = PAGE.margin;
  doc.y = y + contentH + 8;
}

function urlCallout(doc: PDFKit.PDFDocument, label: string, url: string) {
  ensureSpace(doc, 48);
  const x = PAGE.margin;
  const w = doc.page.width - PAGE.margin * 2;
  const y = doc.y + 2;
  doc.save();
  doc.roundedRect(x, y, w, 36, 6).fill(C.tealSoft);
  doc.fillColor(C.muted).font("Helvetica").fontSize(8).text(label, x + 12, y + 7, { lineBreak: false });
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(9).text(url, x + 12, y + 19, {
    width: w - 24,
    lineBreak: false,
  });
  doc.restore();
  doc.x = PAGE.margin;
  doc.y = y + 44;
}

function drawTable(doc: PDFKit.PDFDocument, rows: string[][]) {
  if (!rows.length) return;
  const colCount = Math.max(...rows.map((r) => r.length));
  const x0 = PAGE.margin;
  const usable = doc.page.width - PAGE.margin * 2;
  const widths =
    colCount === 2
      ? [usable * 0.34, usable * 0.66]
      : Array.from({ length: colCount }, () => usable / colCount);

  const padX = 8;
  const padY = 6;
  const fontSize = 8.5;
  const maxRowH = contentBottom(doc) - PAGE.margin - 20;

  const measureRow = (cells: string[], header: boolean) => {
    let max = 0;
    for (let i = 0; i < colCount; i++) {
      const text = cells[i] ?? "";
      doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      const th = doc.heightOfString(text, { width: widths[i]! - padX * 2 });
      max = Math.max(max, th);
    }
    return Math.min(maxRowH, Math.max(22, max + padY * 2));
  };

  rows.forEach((cells, idx) => {
    const header = idx === 0;
    const h = measureRow(cells, header);
    ensureSpace(doc, h + 2);
    const y = doc.y;
    let x = x0;
    for (let i = 0; i < colCount; i++) {
      const w = widths[i]!;
      const bg = header ? C.navy : idx % 2 === 0 ? C.white : C.rowAlt;
      doc.save();
      doc.rect(x, y, w, h).fill(bg);
      if (!header) {
        doc.rect(x, y, w, h).strokeColor(C.line).lineWidth(0.4).stroke();
      }
      doc.fillColor(header ? C.white : C.ink)
        .font(header ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize)
        .text(cells[i] ?? "", x + padX, y + padY, {
          width: w - padX * 2,
          height: h - padY * 2,
          ellipsis: true,
        });
      doc.restore();
      x += w;
    }
    doc.x = PAGE.margin;
    doc.y = y + h;
  });
  doc.moveDown(0.35);
}

function parseTableBlock(lines: string[], start: number): { rows: string[][]; next: number } {
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length && lines[i]!.trim().startsWith("|")) {
    const line = lines[i]!.trim();
    if (/^\|\s*-+/.test(line)) {
      i++;
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => cleanInline(c));
    rows.push(cells);
    i++;
  }
  return { rows, next: i };
}

function renderMarkdown(doc: PDFKit.PDFDocument, md: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let inCode = false;
  const codeBuf: string[] = [];
  let skipFirstH1 = true;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim().startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeBuf.length = 0;
      } else {
        inCode = false;
        if (codeBuf.every((l) => !l.trim() || l.includes("http") || l.startsWith("https://"))) {
          for (const l of codeBuf.filter((x) => x.trim())) {
            urlCallout(doc, "Copy this URL", l.trim());
          }
        } else {
          codeBlock(doc, codeBuf);
        }
      }
      i++;
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    if (!line.trim() || /^---+$/.test(line.trim())) {
      if (doc.y + 10 < contentBottom(doc)) doc.y += 6;
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      if (skipFirstH1) {
        skipFirstH1 = false;
        i++;
        continue;
      }
      sectionBanner(doc, cleanInline(line.slice(2)));
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      sectionBanner(doc, cleanInline(line.slice(3)));
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      subheading(doc, cleanInline(line.slice(4)));
      i++;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const { rows, next } = parseTableBlock(lines, i);
      drawTable(doc, rows);
      i = next;
      continue;
    }

    const num = /^(\d+)\.\s+(.*)$/.exec(line.trim());
    if (num) {
      numbered(doc, num[1]!, num[2]!);
      i++;
      continue;
    }

    const bul = /^[-*]\s+(.*)$/.exec(line.trim());
    if (bul) {
      bullet(doc, bul[1]!);
      i++;
      continue;
    }

    if (/^https?:\/\/\S+$/.test(line.trim())) {
      urlCallout(doc, "URL", line.trim());
      i++;
      continue;
    }

    paragraph(doc, line);
    i++;
  }
}

async function main() {
  if (!fs.existsSync(mdPath)) throw new Error(`Missing guide: ${mdPath}`);
  const md = fs.readFileSync(mdPath, "utf8");
  fs.mkdirSync(outDir, { recursive: true });

  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    autoFirstPage: true,
    margins: {
      top: PAGE.margin + 8,
      bottom: PAGE.margin + PAGE.footerBand,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    info: {
      Title: "CEP Channel Setup Guide",
      Author: "FyBud",
      Subject: "WhatsApp, Instagram, Gmail, Shopify setup",
    },
  });

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.on("pageAdded", () => {
    drawHeaderBar(doc);
    doc.x = PAGE.margin;
    doc.y = PAGE.margin + 12;
  });

  drawCover(doc);
  // first content page already created by addPage in cover; header drawn by pageAdded
  if (doc.y < PAGE.margin + 12) doc.y = PAGE.margin + 12;

  const ix = PAGE.margin;
  const iy = doc.y;
  const iw = doc.page.width - PAGE.margin * 2;
  doc.save();
  doc.roundedRect(ix, iy, iw, 52, 6).fill(C.tealSoft);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(10)
    .text("How to use this guide", ix + 14, iy + 10, { lineBreak: false });
  doc.fillColor(C.ink).font("Helvetica").fontSize(9)
    .text(
      "Copy URLs from Settings > Callback URLs into Meta or Google. Complete each provider console step, then Connect in Settings.",
      ix + 14,
      iy + 24,
      { width: iw - 28 },
    );
  doc.restore();
  doc.x = PAGE.margin;
  doc.y = iy + 64;

  renderMarkdown(doc, md);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    const pageIndex = range.start + i;
    doc.switchToPage(pageIndex);
    if (i === 0) continue; // cover
    drawFooter(doc, i + 1);
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  const pageCount = range.count;
  console.log(`[docs:pdf] wrote ${outPath} (${pageCount} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
