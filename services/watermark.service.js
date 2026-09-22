import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const DEFAULT_WATERMARK_TEXT = process.env.WATERMARK_TEXT || "nitkkrpyqs.in";

const MIN_OPACITY = 0.14;
const MAX_OPACITY = 0.28;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 18;
const MIN_ROTATION_DEG = -35;
const MAX_ROTATION_DEG = 35;
const PAGE_MARGIN_RATIO = 0.03;
const MIN_ANCHOR_TEXT_LEN = 2;
const A4_AREA = 595 * 842;

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

async function extractTextAnchorsByPage(pdfBytes) {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const anchorsByPage = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const anchors = [];
      for (const item of textContent.items) {
        if (!item.str || item.str.trim().length < MIN_ANCHOR_TEXT_LEN) continue;
        const [a, b, , , x, y] = item.transform;
        const width = item.width || Math.abs(a) * item.str.length * 0.5;
        const height = item.height || Math.max(8, Math.abs(b) || 10);
        anchors.push({ x, y, width, height });
      }
      anchorsByPage.push(anchors);
      page.cleanup?.();
    }
  } finally {
    await doc.destroy();
  }
  return anchorsByPage;
}

const countForPage = (width, height) => {
  const area = width * height;
  return Math.max(4, Math.round(8 * (area / A4_AREA)));
};

function buildPositions({ width, height, anchors, count }) {
  const marginX = width * PAGE_MARGIN_RATIO;
  const marginY = height * PAGE_MARGIN_RATIO;

  const positions = [];

  if (anchors.length) {
    const anchoredCount = Math.min(anchors.length, Math.max(1, Math.round(count * 0.3)));
    const pool = [...anchors];
    for (let i = 0; i < anchoredCount; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const anchor = pool.splice(idx, 1)[0];
      const x = clamp(anchor.x + rand(-anchor.width * 0.2, anchor.width * 0.2), marginX, width - marginX);
      const y = clamp(anchor.y + rand(-anchor.height * 0.3, anchor.height * 0.3), marginY, height - marginY);
      positions.push({ x, y });
    }
  }

  while (positions.length < count) {
    positions.push({ x: rand(marginX, width - marginX), y: rand(marginY, height - marginY) });
  }

  return positions;
}

export async function watermarkPdfBuffer(pdfBytes, { text = DEFAULT_WATERMARK_TEXT } = {}) {
  const bytes = new Uint8Array(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength);

  let anchorsByPage = [];
  try {
    anchorsByPage = await extractTextAnchorsByPage(bytes);
  } catch (err) {
    console.error("watermark: text-position extraction failed, falling back to pure random placement:", err.message);
  }

  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const marginX = width * PAGE_MARGIN_RATIO;
    const marginY = height * PAGE_MARGIN_RATIO;
    const anchors = anchorsByPage[idx] || [];
    const count = countForPage(width, height);
    const positions = buildPositions({ width, height, anchors, count });

    for (const pos of positions) {
      const size = randInt(MIN_FONT_SIZE, MAX_FONT_SIZE);
      const textWidth = font.widthOfTextAtSize(text, size);
      const x = clamp(pos.x, marginX, Math.max(marginX, width - marginX - textWidth));
      const y = clamp(pos.y, marginY, Math.max(marginY, height - marginY - size));

      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.45, 0.45, 0.45),
        opacity: rand(MIN_OPACITY, MAX_OPACITY),
        rotate: degrees(randInt(MIN_ROTATION_DEG, MAX_ROTATION_DEG)),
      });
    }
  });

  const out = await pdfDoc.save();
  return Buffer.from(out);
}
