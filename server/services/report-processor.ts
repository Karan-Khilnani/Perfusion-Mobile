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
  const page = doc.addPage([595, 842]); // A4

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const pageWidth = 595;
  let y = 792;

  const logoBytes = await loadLogoBytes();
  const logoImage = await doc.embedPng(logoBytes);
  const logoAspect = logoImage.width / logoImage.height;
  const logoHeight = 50;
  const logoWidth = logoHeight * logoAspect;

  page.drawImage(logoImage, {
    x: margin,
    y: y - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  page.drawText("Connecting Remote Healthcare.", {
    x: margin + logoWidth + 12,
    y: y - logoHeight + 18,
    size: 10,
    font: fontItalic,
    color: GREY_TEXT,
  });

  y -= logoHeight + 30;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 2,
    color: PERFUSION_RED,
  });

  y -= 40;

  const title = "Diagnostic Report Release";
  const titleWidth = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y,
    size: 22,
    font: fontBold,
    color: DARK_TEXT,
  });

  y -= 22;

  const subtitle = "Processed and delivered via Perfusion Diagnostics Platform.";
  const subtitleWidth = fontItalic.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: (pageWidth - subtitleWidth) / 2,
    y,
    size: 10,
    font: fontItalic,
    color: GREY_TEXT,
  });

  y -= 35;
  drawSectionDivider(page, y, pageWidth, margin);
  y -= 25;

  y = drawSectionTitle(page, "PATIENT INFORMATION", y, margin, fontBold);
  y = drawLabelValue(page, "Patient Name", data.patientName, y, margin, font, fontBold);
  y = drawLabelValue(page, "Age / Gender", `${data.patientAge} / ${data.patientGender}`, y, margin, font, fontBold);
  y = drawLabelValue(page, "Patient ID", data.bookingNumber, y, margin, font, fontBold);

  y -= 10;
  drawSectionDivider(page, y, pageWidth, margin);
  y -= 25;

  y = drawSectionTitle(page, "TEST INFORMATION", y, margin, fontBold);
  y = drawLabelValue(page, "Test Name", data.testName, y, margin, font, fontBold);
  y = drawLabelValue(page, "Expected TAT", data.expectedTAT, y, margin, font, fontBold);
  y = drawLabelValue(page, "Actual TAT", data.actualTAT, y, margin, font, fontBold);

  y -= 10;
  drawSectionDivider(page, y, pageWidth, margin);
  y -= 25;

  y = drawSectionTitle(page, "LABORATORY INFORMATION", y, margin, fontBold);
  y = drawLabelValue(page, "Test Performed At", data.providerLabName, y, margin, font, fontBold);

  y -= 20;
  drawSectionDivider(page, y, pageWidth, margin);
  y -= 20;

  const disclaimerBoxHeight = 95;
  page.drawRectangle({
    x: margin,
    y: y - disclaimerBoxHeight,
    width: pageWidth - 2 * margin,
    height: disclaimerBoxHeight,
    color: LIGHT_GREY_BG,
    borderColor: SECTION_LINE,
    borderWidth: 0.5,
  });

  page.drawText("Important Note", {
    x: margin + 12,
    y: y - 15,
    size: 9.5,
    font: fontBold,
    color: DARK_TEXT,
  });

  const disclaimerText = "The following pages contain the original laboratory report issued by the provider laboratory. Perfusion does not modify diagnostic values, interpretations, or clinical comments contained in the report. Perfusion acts as a logistics and accessibility partner, facilitating sample transport and report delivery to improve turnaround time and expand access to diagnostic services in remote and critical care settings. Quality of reporting is periodically reviewed through random quality checks as part of Perfusion's network quality assurance process.";

  const maxLineWidth = pageWidth - 2 * margin - 24;
  const disclaimerLines = wrapText(disclaimerText, font, 7.5, maxLineWidth);
  let disclaimerY = y - 30;
  for (const line of disclaimerLines) {
    page.drawText(line, {
      x: margin + 12,
      y: disclaimerY,
      size: 7.5,
      font: font,
      color: GREY_TEXT,
    });
    disclaimerY -= 11;
  }

  y -= disclaimerBoxHeight + 25;

  const service1 = '"Advanced laboratory diagnostics at your ICU door for earliest reporting."';
  const service2 = '"Super Specialist consultation at your patient\'s bedside."';

  page.drawText(service1, {
    x: margin + 12,
    y,
    size: 9,
    font: fontItalic,
    color: DARK_TEXT,
  });
  y -= 16;
  page.drawText(service2, {
    x: margin + 12,
    y,
    size: 9,
    font: fontItalic,
    color: DARK_TEXT,
  });

  y -= 30;

  try {
    const qrBytes = await generateQRCodeBytes(data.verificationUrl);
    const qrImage = await doc.embedPng(qrBytes);
    const qrSize = 70;
    page.drawImage(qrImage, {
      x: (pageWidth - qrSize) / 2,
      y: y - qrSize,
      width: qrSize,
      height: qrSize,
    });
    y -= qrSize + 8;

    const qrLabel = "Scan to verify this report.";
    const qrLabelWidth = font.widthOfTextAtSize(qrLabel, 8);
    page.drawText(qrLabel, {
      x: (pageWidth - qrLabelWidth) / 2,
      y,
      size: 8,
      font: font,
      color: GREY_TEXT,
    });
  } catch (err) {
    console.error("[ReportProcessor] QR code generation failed:", err);
  }

  page.drawLine({
    start: { x: margin, y: 50 },
    end: { x: pageWidth - margin, y: 50 },
    thickness: 1,
    color: PERFUSION_RED,
  });

  const footerText = "www.perfusionhealth.com  |  +91 92448 93295";
  const footerWidth = font.widthOfTextAtSize(footerText, 8.5);
  page.drawText(footerText, {
    x: (pageWidth - footerWidth) / 2,
    y: 35,
    size: 8.5,
    font: font,
    color: GREY_TEXT,
  });

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
  const FOOTER_HEIGHT = 35;

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    page.setSize(width, height + FOOTER_HEIGHT);
    page.translateContent(0, FOOTER_HEIGHT);

    const margin = 30;
    const footerY = 10;

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
      thickness: 0.5,
      color: PERFUSION_RED,
    });

    const logoH = 12;
    const logoW = logoH * (logoImage.width / logoImage.height);
    page.drawImage(logoImage, {
      x: margin,
      y: footerY,
      width: logoW,
      height: logoH,
    });

    page.drawText("Connecting Remote Healthcare", {
      x: margin + logoW + 6,
      y: footerY + 2,
      size: 7,
      font: fontItalic,
      color: GREY_TEXT,
    });

    const contactText = "+91 92448 93295";
    const contactWidth = font.widthOfTextAtSize(contactText, 7);
    page.drawText(contactText, {
      x: (width - contactWidth) / 2,
      y: footerY + 2,
      size: 7,
      font: font,
      color: GREY_TEXT,
    });

    const bookingRef = `Ref: ${data.bookingNumber}`;
    const pageNum = `Page ${i + 1} of ${totalPages}`;
    const rightText = `${bookingRef}  |  ${pageNum}`;
    const rightWidth = font.widthOfTextAtSize(rightText, 7);
    page.drawText(rightText, {
      x: width - margin - rightWidth,
      y: footerY + 2,
      size: 7,
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
