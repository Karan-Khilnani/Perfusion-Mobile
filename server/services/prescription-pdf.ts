import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { uploadFile as supabaseUpload } from "./supabase-storage";

export interface PrescriptionPdfData {
  bookingId: string;
  bookingNumber: string;
  approvedAt: Date;
  approverIp: string;
  referringFacility: string | null;
  referringPhysician: string | null;
  onCallDoctorName: string | null;
  onCallDoctorDesignation: string | null;
  patientName: string;
  patientAge: number;
  patientGender: string | null;
  uhidIpNumber: string | null;
  patientContact: string | null;
  patientWeight: string | null;
  patientAllergies: string | null;
  patientAllergyNotSpecified: boolean;
  consultantName: string;
  consultantSpecialization: string | null;
  consultantQualification: string | null;
  consultantRegistrationNo: string | null;
  consultantYearsExperience: number | null;
  consultantAffiliation: string | null;
  consultantSignatureUrl: string | null;
  clinicalHistory: string | null;
  examination: string | null;
  investigations: string | null;
  diagnosis: string | null;
  physicianNotes: string | null;
  treatmentPlan: string | null;
  followUp: string | null;
}

const RED = rgb(0.545, 0, 0);
const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT_GREY = rgb(0.65, 0.65, 0.65);
const SECTION_BG = rgb(0.97, 0.96, 0.95);
const LINE_COLOR = rgb(0.82, 0.82, 0.82);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.1, 0.55, 0.25);
const GREEN_BG = rgb(0.93, 0.98, 0.94);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;

/** Strip any leading "Dr." prefix so we never output "Dr. Dr. Name" */
function cleanDrPrefix(name: string): string {
  return name.replace(/^dr\.\s*/i, "").trim();
}

function sanitize(text: string): string {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function sanitizeOneLine(text: string): string {
  return sanitize(text).replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const clean = sanitize(text);
  const paragraphs = clean.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para.trim() === "") { lines.push(""); continue; }
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function drawHLine(page: PDFPage, y: number, color = LINE_COLOR, thickness = 0.5) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness, color });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, font: PDFFont): number {
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 16, color: SECTION_BG });
  page.drawRectangle({ x: MARGIN, y: y - 2, width: 4, height: 16, color: RED });
  page.drawText(title, { x: MARGIN + 12, y: y + 3, size: 9.5, font, color: RED });
  return y - 22;
}

function drawLabelValue(
  page: PDFPage, label: string, value: string, y: number,
  fontNorm: PDFFont, fontBold: PDFFont, labelW = 150
): number {
  page.drawText(label, { x: MARGIN + 10, y, size: 9, font: fontNorm, color: GREY });
  const wrapped = wrapText(value || "-", fontNorm, 9, CONTENT_W - labelW - 10);
  for (let i = 0; i < wrapped.length; i++) {
    page.drawText(wrapped[i], { x: MARGIN + labelW, y: y - i * 13, size: 9, font: fontBold, color: DARK });
  }
  return y - Math.max(1, wrapped.length) * 13 - 2;
}

function drawMultilineText(page: PDFPage, text: string, y: number, font: PDFFont): number {
  const lines = wrapText(text, font, 9, CONTENT_W - 20);
  for (const line of lines) {
    page.drawText(line, { x: MARGIN + 10, y, size: 9, font, color: DARK });
    y -= 13;
  }
  return y - 4;
}

async function loadLogoBytes(): Promise<Uint8Array | null> {
  const logoPath = path.join(process.cwd(), "attached_assets", "Pitchdeck_logo_1769590061051.png");
  if (fs.existsSync(logoPath)) return fs.readFileSync(logoPath);
  return null;
}

async function generateQRCodeBytes(url: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(url, { width: 90, margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" } });
  return new Uint8Array(buf);
}

function needsNewPage(doc: PDFDocument, pages: PDFPage[], curPage: PDFPage, y: number, needed: number): [PDFPage, number] {
  if (y - needed < 60) {
    const newPage = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(newPage);
    return [newPage, PAGE_H - 40];
  }
  return [curPage, y];
}

export async function generateAndStorePrescriptionPdf(data: PrescriptionPdfData, verificationBaseUrl: string): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const verificationUrl = `${verificationBaseUrl}/verify/prescription/${data.bookingId}`;
  const approvalDateStr = data.approvedAt.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Kolkata" });
  const summaryId = data.bookingNumber || `PFN-${data.bookingId.substring(0, 8).toUpperCase()}`;

  // Consultant name without duplicate "Dr." prefix
  const consultantDisplayName = `Dr. ${cleanDrPrefix(data.consultantName)}`;

  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);

  // ── Header band ──────────────────────────────────────────────────────────────
  // 80px tall red band. QR code sits inside the band on the far right.
  const HEADER_H = 80;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: RED });

  // QR code inside header (right side), 56×56
  const QR_SIZE = 56;
  const QR_X = PAGE_W - MARGIN - QR_SIZE;
  const QR_Y = PAGE_H - HEADER_H + (HEADER_H - QR_SIZE) / 2; // vertically centred in header

  try {
    const qrBytes = await generateQRCodeBytes(verificationUrl);
    const qrImg = await doc.embedPng(qrBytes);
    page.drawImage(qrImg, { x: QR_X, y: QR_Y, width: QR_SIZE, height: QR_SIZE });
    const qrLabel = "Scan to verify";
    const qrLW = font.widthOfTextAtSize(qrLabel, 6.5);
    page.drawText(qrLabel, { x: QR_X + (QR_SIZE - qrLW) / 2, y: PAGE_H - HEADER_H + 3, size: 6.5, font, color: rgb(1, 0.85, 0.85) });
  } catch (err) {
    console.error("[ConsultationSummaryPDF] Failed to generate QR code:", err);
  }

  // Logo (left side of header)
  const logoBytes = await loadLogoBytes();
  if (logoBytes) {
    try {
      const logo = await doc.embedPng(logoBytes);
      const lh = 40;
      const lw = lh * (logo.width / logo.height);
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - HEADER_H + (HEADER_H - lh) / 2, width: lw, height: lh });
    } catch (err) {
      console.error("[ConsultationSummaryPDF] Failed to embed logo:", err);
      page.drawText("Perfusion Health Pvt Ltd", { x: MARGIN, y: PAGE_H - 45, size: 14, font: fontBold, color: WHITE });
    }
  } else {
    page.drawText("Perfusion Health Pvt Ltd", { x: MARGIN, y: PAGE_H - 45, size: 14, font: fontBold, color: WHITE });
  }

  // Title text block (right of logo, left of QR)
  const titleTextX = PAGE_W - MARGIN - QR_SIZE - 14; // right-align before QR
  const titleText = "Digital Speciality Consultation Summary";
  const titleW = fontBold.widthOfTextAtSize(titleText, 9.5);
  page.drawText(titleText, { x: titleTextX - titleW, y: PAGE_H - 36, size: 9.5, font: fontBold, color: WHITE });
  const idText = sanitizeOneLine(`Summary ID: ${summaryId}`);
  const idW = font.widthOfTextAtSize(idText, 8);
  page.drawText(idText, { x: titleTextX - idW, y: PAGE_H - 50, size: 8, font, color: rgb(1, 0.85, 0.85) });
  const modeText = "Mode: Teleconsultation";
  const modeW = font.widthOfTextAtSize(modeText, 8);
  page.drawText(modeText, { x: titleTextX - modeW, y: PAGE_H - 63, size: 8, font, color: rgb(1, 0.85, 0.85) });

  let y = PAGE_H - HEADER_H - 16;

  drawHLine(page, y);
  y -= 18;

  // ── Referring info ────────────────────────────────────────────────────────────
  if (data.referringFacility || data.referringPhysician || data.onCallDoctorName) {
    const lineCount = (data.referringFacility ? 1 : 0) + (data.referringPhysician ? 1 : 0) + (data.onCallDoctorName ? 1 : 0);
    const blockH = lineCount * 14 + 8;
    page.drawRectangle({ x: MARGIN, y: y - blockH + 10, width: CONTENT_W, height: blockH, color: SECTION_BG });
    const rx = MARGIN + 10;
    if (data.referringFacility) {
      page.drawText("Referring Facility:", { x: rx, y, size: 8.5, font, color: GREY });
      page.drawText(sanitizeOneLine(data.referringFacility), { x: rx + 110, y, size: 8.5, font: fontBold, color: DARK });
      y -= 14;
    }
    if (data.referringPhysician) {
      page.drawText("Referring Physician:", { x: rx, y, size: 8.5, font, color: GREY });
      page.drawText(sanitizeOneLine(data.referringPhysician), { x: rx + 110, y, size: 8.5, font: fontBold, color: DARK });
      y -= 14;
    }
    if (data.onCallDoctorName) {
      page.drawText("Call Facilitator:", { x: rx, y, size: 8.5, font, color: GREY });
      const facilText = data.onCallDoctorDesignation
        ? `${data.onCallDoctorName} (${data.onCallDoctorDesignation})`
        : data.onCallDoctorName;
      page.drawText(sanitizeOneLine(facilText), { x: rx + 110, y, size: 8.5, font: fontBold, color: DARK });
      y -= 14;
    }
    y -= 8;
  }

  // ── Patient details ───────────────────────────────────────────────────────────
  y = drawSectionTitle(page, "PATIENT DETAILS", y, fontBold);
  y = drawLabelValue(page, "Patient Name", data.patientName, y, font, fontBold);
  const ageGender = [data.patientAge ? `${data.patientAge} yrs` : null, data.patientGender].filter(Boolean).join(" / ");
  if (ageGender) y = drawLabelValue(page, "Age / Sex", ageGender, y, font, fontBold);
  if (data.uhidIpNumber) y = drawLabelValue(page, "UHID / Hospital ID", data.uhidIpNumber, y, font, fontBold);
  if (data.patientContact) y = drawLabelValue(page, "Contact", data.patientContact, y, font, fontBold);
  if (data.patientWeight) y = drawLabelValue(page, "Weight", `${data.patientWeight} kg`, y, font, fontBold);
  if (data.patientAllergyNotSpecified) {
    y = drawLabelValue(page, "Allergies", "Not specified", y, font, fontBold);
  } else if (data.patientAllergies) {
    y = drawLabelValue(page, "Allergies", `Yes - ${data.patientAllergies}`, y, font, fontBold);
  }
  y -= 8;

  // ── Consultant details ────────────────────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, page, y, 80);
  y = drawSectionTitle(page, "CONSULTING SPECIALIST", y, fontBold);
  y = drawLabelValue(page, "Doctor Name", consultantDisplayName, y, font, fontBold);
  if (data.consultantSpecialization) y = drawLabelValue(page, "Speciality", data.consultantSpecialization, y, font, fontBold);
  if (data.consultantQualification) y = drawLabelValue(page, "Qualification", data.consultantQualification, y, font, fontBold);
  if (data.consultantRegistrationNo) y = drawLabelValue(page, "Medical Council Reg. No.", data.consultantRegistrationNo, y, font, fontBold);
  if (data.consultantYearsExperience) y = drawLabelValue(page, "Years of Experience", String(data.consultantYearsExperience), y, font, fontBold);
  if (data.consultantAffiliation) y = drawLabelValue(page, "Affiliated Institution", data.consultantAffiliation, y, font, fontBold);
  y -= 8;

  // ── Clinical sections ─────────────────────────────────────────────────────────
  if (data.clinicalHistory) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "CLINICAL HISTORY", y, fontBold);
    y = drawMultilineText(page, data.clinicalHistory, y, font);
    y -= 4;
  }

  if (data.examination) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "EXAMINATIONS", y, fontBold);
    y = drawMultilineText(page, data.examination, y, font);
    y -= 4;
  }

  if (data.investigations) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "INVESTIGATIONS", y, fontBold);
    y = drawMultilineText(page, data.investigations, y, font);
    y -= 4;
  }

  if (data.diagnosis) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "DIAGNOSIS", y, fontBold);
    y = drawMultilineText(page, data.diagnosis, y, font);
    y -= 4;
  }

  if (data.physicianNotes) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "PHYSICIAN NOTES", y, fontBold);
    y = drawMultilineText(page, data.physicianNotes, y, font);
    y -= 4;
  }

  if (data.treatmentPlan) {
    [page, y] = needsNewPage(doc, pages, page, y, 50);
    y = drawSectionTitle(page, "SUGGESTED TREATMENT PLAN", y, fontBold);
    y = drawMultilineText(page, data.treatmentPlan, y, font);
    y -= 4;
  }

  if (data.followUp) {
    [page, y] = needsNewPage(doc, pages, page, y, 30);
    page.drawText("Follow-up: ", { x: MARGIN + 10, y, size: 9, font: fontBold, color: RED });
    const followLines = wrapText(data.followUp, font, 9, CONTENT_W - 75);
    for (let i = 0; i < followLines.length; i++) {
      page.drawText(followLines[i], { x: MARGIN + 65, y: y - i * 13, size: 9, font, color: DARK });
    }
    y -= Math.max(1, followLines.length) * 13 + 5;
  }

  // ── Legal disclaimer ──────────────────────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, page, y, 60);
  y -= 6;
  const legalText = "This consultation is based on information provided digitally and available records. Treatment advice is given in good faith and does not replace emergency care where indicated. Patient/referring team advised to seek immediate medical attention if condition worsens.";
  const legalLines = wrapText(legalText, fontItalic, 7.5, CONTENT_W - 20);
  const legalH = legalLines.length * 11 + 24;
  page.drawRectangle({ x: MARGIN, y: y - legalH, width: CONTENT_W, height: legalH, color: rgb(0.97, 0.97, 0.97) });
  page.drawText("Legal & Consent Declaration", { x: MARGIN + 10, y: y - 12, size: 8.5, font: fontBold, color: GREY });
  let ly = y - 24;
  for (const line of legalLines) {
    page.drawText(line, { x: MARGIN + 10, y: ly, size: 7.5, font: fontItalic, color: GREY });
    ly -= 11;
  }
  y -= legalH + 20;

  // ── CONFIRMED & SIGNED seal (at end, above signature) ─────────────────────────
  [page, y] = needsNewPage(doc, pages, page, y, 70);
  const SEAL_H = 50;
  page.drawRectangle({ x: MARGIN, y: y - SEAL_H, width: CONTENT_W, height: SEAL_H, color: GREEN_BG });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1.5, color: GREEN });
  page.drawText("CONFIRMED & SIGNED", { x: MARGIN + 12, y: y - 14, size: 11, font: fontBold, color: GREEN });
  page.drawText("Consultant confirmed this consultation summary on:", { x: MARGIN + 12, y: y - 28, size: 8, font, color: GREY });
  page.drawText(approvalDateStr, { x: MARGIN + 12, y: y - 40, size: 9, font: fontBold, color: DARK });
  y -= SEAL_H + 18;

  // ── Signature block ───────────────────────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, page, y, 80);
  drawHLine(page, y);
  y -= 12;

  const sigX = PAGE_W - MARGIN - 160;

  if (data.consultantSignatureUrl) {
    try {
      const sigPath = data.consultantSignatureUrl.startsWith("/")
        ? path.join(process.cwd(), data.consultantSignatureUrl)
        : null;
      if (sigPath && fs.existsSync(sigPath)) {
        const sigBytes = fs.readFileSync(sigPath);
        const sigImg = await doc.embedPng(sigBytes);
        page.drawImage(sigImg, { x: sigX, y: y - 36, width: 120, height: 36 });
        y -= 40;
      }
    } catch (err) {
      console.error("[ConsultationSummaryPDF] Failed to embed consultant signature:", err);
    }
  }

  page.drawText(sanitizeOneLine(consultantDisplayName), { x: sigX, y, size: 10, font: fontBold, color: DARK });
  y -= 14;
  if (data.consultantQualification || data.consultantSpecialization) {
    const cred = [data.consultantQualification, data.consultantSpecialization].filter(Boolean).join(" | ");
    page.drawText(sanitizeOneLine(cred), { x: sigX, y, size: 8, font, color: GREY });
    y -= 12;
  }
  if (data.consultantRegistrationNo) {
    page.drawText(sanitizeOneLine(`Reg. No.: ${data.consultantRegistrationNo}`), { x: sigX, y, size: 8, font, color: GREY });
    y -= 12;
  }
  page.drawText(`Confirmed: ${approvalDateStr}`, { x: sigX, y, size: 8, font, color: GREEN });

  // ── Page footers ──────────────────────────────────────────────────────────────
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const p = pages[i];
    p.drawLine({ start: { x: MARGIN, y: 38 }, end: { x: PAGE_W - MARGIN, y: 38 }, thickness: 0.5, color: RED });
    p.drawText("Perfusion Health Pvt Ltd | Digital Speciality Consultation Platform", { x: MARGIN, y: 26, size: 7, font, color: LIGHT_GREY });
    const pageNumText = `Page ${i + 1} of ${total}`;
    const pw = font.widthOfTextAtSize(pageNumText, 7);
    p.drawText(pageNumText, { x: PAGE_W - MARGIN - pw, y: 26, size: 7, font, color: LIGHT_GREY });
    p.drawText("This is a digitally confirmed consultation summary. Scan QR on page 1 to verify.", { x: MARGIN, y: 16, size: 7, font: fontItalic, color: LIGHT_GREY });
    p.drawText(sanitizeOneLine(`Verification: ${verificationUrl}`), { x: MARGIN, y: 6, size: 6.5, font, color: LIGHT_GREY });
  }

  const pdfBytes = await doc.save();
  const fileName = `consultation-summary-${data.bookingId}-${Date.now()}.pdf`;
  const buffer = Buffer.from(pdfBytes);

  const publicUrl = await supabaseUpload(buffer, fileName, "prescriptions", "application/pdf");
  console.log(`[ConsultationSummaryPDF] Uploaded to Supabase: ${publicUrl}`);
  return publicUrl;
}
