import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, PDFImage } from "pdf-lib";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";

export interface BookingReportData {
  bookingNumber: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  testName: string;
  providerLabName: string;
  reportDate: string;
  expectedTAT: string;
  actualTAT: string;
  verificationUrl: string;
}

const PERFUSION_RED = rgb(0.86, 0.15, 0.15);
const DARK_TEXT = rgb(0.1, 0.1, 0.1);
const GREY_TEXT = rgb(0.4, 0.4, 0.4);
const LIGHT_GREY_BG = rgb(0.95, 0.95, 0.95);
const SECTION_LINE = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);

async function loadLogoBytes(): Promise<Uint8Array> {
  const logoPath = path.join(process.cwd(), "attached_assets", "Pitchdeck_logo_1769590061051.png");
  return fs.readFileSync(logoPath);
}

async function generateQRCodeBytes(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, {
    width: 100,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  return new Uint8Array(buffer);
}

function drawSectionDivider(page: PDFPage, y: number, width: number, margin: number) {
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: SECTION_LINE,
  });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, margin: number, fontBold: PDFFont): number {
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: 4,
    height: 14,
    color: PERFUSION_RED,
  });

  page.drawText(title, {
    x: margin + 12,
    y,
    size: 11,
    font: fontBold,
    color: DARK_TEXT,
  });

  return y - 22;
}

function drawLabelValue(page: PDFPage, label: string, value: string, y: number, margin: number, font: PDFFont, fontBold: PDFFont): number {
  page.drawText(label, {
    x: margin + 12,
    y,
    size: 9.5,
    font: fontBold,
    color: GREY_TEXT,
  });

  page.drawText(value || "—",{
    x: margin + 160,
    y,
    size: 9.5,
    font: font,
    color: DARK_TEXT,
  });

  return y - 18;
}

async function createCoverPage(data: BookingReportData): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 55;
  const pageWidth = 595;
  const contentWidth = pageWidth - 2 * margin;
  const labelX = margin;
  const valueX = margin + 155;
  let y = 800;

  const logoBytes = await loadLogoBytes();
  const logoImage = await doc.embedPng(logoBytes);
  const logoAspect = logoImage.width / logoImage.height;
  const logoHeight = 55;
  const logoWidth = logoHeight * logoAspect;

  page.drawImage(logoImage, {
    x: margin,
    y: y - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  page.drawText("Connecting Remote Healthcare.", {
    x: margin,
    y: y - logoHeight - 14,
    size: 9.5,
    font: fontItalic,
    color: GREY_TEXT,
  });

  let qrImage: PDFImage | null = null;
  try {
    const qrBytes = await generateQRCodeBytes(data.verificationUrl);
    qrImage = await doc.embedPng(qrBytes);
    const qrSize = 75;
    const qrX = pageWidth - margin - qrSize;
    page.drawImage(qrImage, {
      x: qrX,
      y: y - qrSize,
      width: qrSize,
      height: qrSize,
    });

    const qrLabel = "Scan to verify this report";
    const qrLabelWidth = font.widthOfTextAtSize(qrLabel, 7);
    page.drawText(qrLabel, {
      x: qrX + (qrSize - qrLabelWidth) / 2,
      y: y - qrSize - 11,
      size: 7,
      font: font,
      color: GREY_TEXT,
    });
  } catch (err) {
    console.error("[ReportProcessor] QR code generation failed:", err);
  }

  y -= logoHeight + 45;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: SECTION_LINE,
  });

  y -= 35;

  page.drawText("Diagnostic Report Release", {
    x: margin,
    y,
    size: 20,
    font: fontBold,
    color: DARK_TEXT,
  });

  y -= 20;

  page.drawText("Delivered via Perfusion Healthcare Platform", {
    x: margin,
    y,
    size: 10,
    font: font,
    color: GREY_TEXT,
  });

  y -= 30;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: SECTION_LINE,
  });

  y -= 25;

  const drawFieldRow = (label: string, value: string, yPos: number, boldValue = false): number => {
    page.drawText(label, {
      x: labelX,
      y: yPos,
      size: 9.5,
      font: font,
      color: GREY_TEXT,
    });

    page.drawText(value || "—", {
      x: valueX,
      y: yPos,
      size: 9.5,
      font: boldValue ? fontBold : font,
      color: DARK_TEXT,
    });

    return yPos - 22;
  };

  y = drawFieldRow("Patient Name:", data.patientName, y, true);
  y = drawFieldRow("Age / Gender:", `${data.patientAge} / ${data.patientGender}`, y, true);
  y = drawFieldRow("Patient ID:", data.bookingNumber, y, true);

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: SECTION_LINE,
  });
  y -= 25;

  y = drawFieldRow("Test Name:", data.testName, y, true);

  const halfWidth = contentWidth / 2;
  page.drawText("Expected Turnaround Time:", {
    x: labelX,
    y,
    size: 9,
    font: font,
    color: GREY_TEXT,
  });
  page.drawText(data.expectedTAT, {
    x: labelX + 145,
    y,
    size: 9,
    font: fontBold,
    color: DARK_TEXT,
  });

  page.drawText("Report Delivered In:", {
    x: margin + halfWidth,
    y,
    size: 9,
    font: font,
    color: GREY_TEXT,
  });
  page.drawText(data.actualTAT, {
    x: margin + halfWidth + 110,
    y,
    size: 9,
    font: fontBold,
    color: DARK_TEXT,
  });
  y -= 22;

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: SECTION_LINE,
  });
  y -= 25;

  page.drawText("Test Performed At:", {
    x: labelX,
    y,
    size: 9.5,
    font: font,
    color: GREY_TEXT,
  });
  page.drawText(data.providerLabName, {
    x: valueX,
    y,
    size: 9.5,
    font: fontBold,
    color: DARK_TEXT,
  });
  y -= 30;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: SECTION_LINE,
  });
  y -= 15;

  const disclaimerBoxX = margin;
  const disclaimerBoxWidth = contentWidth;

  const disclaimerParagraphs = [
    { text: "The following pages contain the ", bold: false },
    { text: "original laboratory report issued by the provider", bold: true },
    { text: " laboratory. ", bold: false },
    { text: "Perfusion", bold: true },
    { text: " does not modify diagnostic values, interpretations, or clinical comments contained in the report.", bold: false },
  ];

  const disclaimerPara2 = [
    { text: "Perfusion acts as a logistics and accessibility partner,", bold: true },
    { text: " facilitating sample transport and report delivery to improve turnaround time and expand access to diagnostic services in remote and critical care settings.", bold: false },
  ];

  const disclaimerPara3 = [
    { text: "Quality of reporting is periodically reviewed through ", bold: false },
    { text: "random quality checks", bold: true },
    { text: " as part of Perfusion's network quality assurance process.", bold: false },
  ];

  const boxPadding = 14;
  const disclaimerLineHeight = 13;
  const fullDisclaimer = "The following pages contain the original laboratory report issued by the provider laboratory. Perfusion does not modify diagnostic values, interpretations, or clinical comments contained in the report.";
  const fullDisclaimer2 = "Perfusion acts as a logistics and accessibility partner, facilitating sample transport and report delivery to improve turnaround time and expand access to diagnostic services in remote and critical care settings.";
  const fullDisclaimer3 = "Quality of reporting is periodically reviewed through random quality checks as part of Perfusion's network quality assurance process.";

  const dLines1 = wrapText(fullDisclaimer, font, 8, disclaimerBoxWidth - 2 * boxPadding);
  const dLines2 = wrapText(fullDisclaimer2, font, 8, disclaimerBoxWidth - 2 * boxPadding);
  const dLines3 = wrapText(fullDisclaimer3, font, 8, disclaimerBoxWidth - 2 * boxPadding);
  const totalDisclaimerLines = dLines1.length + dLines2.length + dLines3.length + 2;
  const disclaimerBoxHeight = totalDisclaimerLines * disclaimerLineHeight + 2 * boxPadding + 20;

  page.drawRectangle({
    x: disclaimerBoxX,
    y: y - disclaimerBoxHeight,
    width: disclaimerBoxWidth,
    height: disclaimerBoxHeight,
    color: LIGHT_GREY_BG,
  });

  let dY = y - boxPadding - 5;

  page.drawText("Important Note", {
    x: disclaimerBoxX + boxPadding,
    y: dY,
    size: 10,
    font: fontBold,
    color: PERFUSION_RED,
  });
  dY -= disclaimerLineHeight + 5;

  for (const line of dLines1) {
    page.drawText(line, {
      x: disclaimerBoxX + boxPadding,
      y: dY,
      size: 8,
      font: font,
      color: rgb(0.25, 0.25, 0.25),
    });
    dY -= disclaimerLineHeight;
  }
  dY -= 5;

  for (const line of dLines2) {
    page.drawText(line, {
      x: disclaimerBoxX + boxPadding,
      y: dY,
      size: 8,
      font: font,
      color: rgb(0.25, 0.25, 0.25),
    });
    dY -= disclaimerLineHeight;
  }
  dY -= 5;

  for (const line of dLines3) {
    page.drawText(line, {
      x: disclaimerBoxX + boxPadding,
      y: dY,
      size: 8,
      font: font,
      color: rgb(0.25, 0.25, 0.25),
    });
    dY -= disclaimerLineHeight;
  }

  y -= disclaimerBoxHeight + 25;

  const service1 = "Advanced laboratory diagnostics at your ICU door for earliest reporting.";
  const service1Width = fontItalic.widthOfTextAtSize(service1, 10);
  page.drawText(service1, {
    x: (pageWidth - service1Width) / 2,
    y,
    size: 10,
    font: fontItalic,
    color: DARK_TEXT,
  });
  y -= 18;

  const service2Pre = "Super Specialist consultation ";
  const service2Post = "at your patient's bedside.";
  const s2PreWidth = fontBold.widthOfTextAtSize(service2Pre, 10);
  const s2PostWidth = fontItalic.widthOfTextAtSize(service2Post, 10);
  const s2TotalWidth = s2PreWidth + s2PostWidth;
  const s2StartX = (pageWidth - s2TotalWidth) / 2;

  page.drawText(service2Pre, {
    x: s2StartX,
    y,
    size: 10,
    font: fontBold,
    color: PERFUSION_RED,
  });
  page.drawText(service2Post, {
    x: s2StartX + s2PreWidth,
    y,
    size: 10,
    font: fontItalic,
    color: DARK_TEXT,
  });

  page.drawLine({
    start: { x: margin, y: 55 },
    end: { x: pageWidth - margin, y: 55 },
    thickness: 0.5,
    color: SECTION_LINE,
  });

  const reachText = "Reach us at:  |  ";
  const websiteText = "www.perfusionhealth.com";
  const separator = "  |  ";
  const phoneText = "+91 92448 93295";

  const reachW = font.widthOfTextAtSize(reachText, 9);
  const webW = fontBold.widthOfTextAtSize(websiteText, 9);
  const sepW = font.widthOfTextAtSize(separator, 9);
  const phoneW = fontBold.widthOfTextAtSize(phoneText, 9);
  const totalFooterW = reachW + webW + sepW + phoneW;
  let fX = (pageWidth - totalFooterW) / 2;

  page.drawText(reachText, { x: fX, y: 38, size: 9, font, color: GREY_TEXT });
  fX += reachW;
  page.drawText(websiteText, { x: fX, y: 38, size: 9, font: fontBold, color: DARK_TEXT });
  fX += webW;
  page.drawText(separator, { x: fX, y: 38, size: 9, font, color: GREY_TEXT });
  fX += sepW;
  page.drawText(phoneText, { x: fX, y: 38, size: 9, font: fontBold, color: DARK_TEXT });

  return doc;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function addFooterToPages(doc: PDFDocument, data: BookingReportData, logoImage: PDFImage, font: PDFFont, fontBold: PDFFont, fontItalic: PDFFont) {
  const pages = doc.getPages();
  const totalPages = pages.length;
  const FOOTER_HEIGHT = 45;

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    page.setSize(width, height + FOOTER_HEIGHT);
    page.translateContent(0, FOOTER_HEIGHT);

    const margin = 35;

    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: FOOTER_HEIGHT,
      color: WHITE,
    });

    page.drawLine({
      start: { x: margin, y: FOOTER_HEIGHT - 2 },
      end: { x: width - margin, y: FOOTER_HEIGHT - 2 },
      thickness: 0.75,
      color: PERFUSION_RED,
    });

    const logoH = 18;
    const logoW = logoH * (logoImage.width / logoImage.height);
    page.drawImage(logoImage, {
      x: margin,
      y: 14,
      width: logoW,
      height: logoH,
    });

    page.drawText("Connecting Remote Healthcare", {
      x: margin + logoW + 8,
      y: 19,
      size: 8,
      font: fontItalic,
      color: GREY_TEXT,
    });

    const contactText = "+91 92448 93295";
    const contactWidth = font.widthOfTextAtSize(contactText, 8.5);
    page.drawText(contactText, {
      x: (width - contactWidth) / 2,
      y: 19,
      size: 8.5,
      font: fontBold,
      color: DARK_TEXT,
    });

    const bookingRef = `Ref: ${data.bookingNumber}`;
    const pageNum = `Page ${i + 1} of ${totalPages}`;
    const rightText = `${bookingRef}  |  ${pageNum}`;
    const rightWidth = font.widthOfTextAtSize(rightText, 8);
    page.drawText(rightText, {
      x: width - margin - rightWidth,
      y: 19,
      size: 8,
      font: font,
      color: GREY_TEXT,
    });
  }
}

export async function processReport(originalFilePath: string, data: BookingReportData): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "uploads", "reports");
  let absolutePath: string;

  if (originalFilePath.startsWith("/uploads/reports/")) {
    absolutePath = path.join(process.cwd(), originalFilePath.slice(1));
  } else if (path.isAbsolute(originalFilePath)) {
    absolutePath = originalFilePath;
  } else {
    absolutePath = path.join(process.cwd(), originalFilePath);
  }

  const resolvedPath = path.resolve(absolutePath);
  if (!resolvedPath.startsWith(uploadsDir)) {
    throw new Error(`Report file path outside allowed directory: ${resolvedPath}`);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Report file not found: ${resolvedPath}`);
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  let originalDoc: PDFDocument;

  if (ext === ".pdf") {
    originalDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } else if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    originalDoc = await PDFDocument.create();
    const page = originalDoc.addPage([595, 842]);

    let image: PDFImage;
    if (ext === ".png") {
      image = await originalDoc.embedPng(fileBuffer);
    } else {
      image = await originalDoc.embedJpg(fileBuffer);
    }

    const imgAspect = image.width / image.height;
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 20;
    const availableWidth = pageWidth - 2 * margin;
    const availableHeight = pageHeight - 2 * margin;

    let drawWidth: number, drawHeight: number;
    if (imgAspect > availableWidth / availableHeight) {
      drawWidth = availableWidth;
      drawHeight = availableWidth / imgAspect;
    } else {
      drawHeight = availableHeight;
      drawWidth = availableHeight * imgAspect;
    }

    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  } else {
    throw new Error(`Unsupported file format for report processing: ${ext}. Supported: PDF, JPG, JPEG, PNG`);
  }

  const logoBytes = await loadLogoBytes();
  const logoImage = await originalDoc.embedPng(logoBytes);
  const font = await originalDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await originalDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await originalDoc.embedFont(StandardFonts.HelveticaOblique);

  await addFooterToPages(originalDoc, data, logoImage, font, fontBold, fontItalic);

  const coverDoc = await createCoverPage(data);

  const finalDoc = await PDFDocument.create();

  const [coverPage] = await finalDoc.copyPages(coverDoc, [0]);
  finalDoc.addPage(coverPage);

  const originalPageIndices = originalDoc.getPageIndices();
  const copiedPages = await finalDoc.copyPages(originalDoc, originalPageIndices);
  for (const p of copiedPages) {
    finalDoc.addPage(p);
  }

  const outputDir = path.join(process.cwd(), "uploads", "reports");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(resolvedPath, ext);
  const outputFileName = `${baseName}-processed.pdf`;
  const outputPath = path.join(outputDir, outputFileName);

  const finalBytes = await finalDoc.save();
  fs.writeFileSync(outputPath, finalBytes);

  console.log(`[ReportProcessor] Processed report saved: ${outputPath}`);
  return `/uploads/reports/${outputFileName}`;
}
