import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import fs from "fs";
import path from "path";
import { uploadFile as supabaseUpload } from "./supabase-storage";
import { AGREEMENT_FULL_TEXT, AGREEMENT_VERSION, partnerTypeLabel } from "./agreement-text";

export interface AgreementPdfData {
  uniqueRef: string;
  partyName: string;
  organizationName: string;
  email: string;
  phone: string;
  role: string;
  providerType?: string | null;
  signedAt: Date;
  ipAddress: string;
  userAgent: string;
}

const RED = rgb(0.545, 0, 0);
const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT_GREY = rgb(0.65, 0.65, 0.65);
const LINE_COLOR = rgb(0.82, 0.82, 0.82);
const GREEN = rgb(0.1, 0.55, 0.25);
const GREEN_BG = rgb(0.93, 0.98, 0.94);
const SECTION_BG = rgb(0.97, 0.96, 0.95);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function sanitize(text: string): string {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/[\u2018\u2019\u02BB\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x20-\x7E\u00A1-\u00FF]/g, "?");
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

function needsNewPage(doc: PDFDocument, pages: PDFPage[], y: number, needed: number): [PDFPage, number] {
  if (y - needed < 60) {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(p);
    return [p, PAGE_H - 50];
  }
  return [pages[pages.length - 1], y];
}

async function loadLogoBytes(): Promise<Uint8Array | null> {
  const preferred = path.join(process.cwd(), "attached_assets", "Perfusion_rusty_red_logo_transparent_1779192329721.png");
  if (fs.existsSync(preferred)) return fs.readFileSync(preferred);
  const fallback = path.join(process.cwd(), "attached_assets", "Pitchdeck_logo_1769590061051.png");
  if (fs.existsSync(fallback)) return fs.readFileSync(fallback);
  return null;
}

function drawPageHeader(page: PDFPage, font: PDFFont, fontBold: PDFFont) {
  const HEADER_H = 70;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: rgb(0.98, 0.975, 0.97) });
  page.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: RED });
  page.drawLine({ start: { x: 0, y: PAGE_H - HEADER_H }, end: { x: PAGE_W, y: PAGE_H - HEADER_H }, thickness: 0.75, color: LINE_COLOR });
  page.drawText("Perfusion Healthcare Private Limited", { x: MARGIN, y: PAGE_H - 28, size: 12, font: fontBold, color: RED });
  page.drawText("CIN: U86900CT2026PTC020133  |  Healthcare Partner Platform Services Agreement", { x: MARGIN, y: PAGE_H - 44, size: 7.5, font, color: GREY });
}

function drawPageFooter(page: PDFPage, font: PDFFont, fontItalic: PDFFont, pageNum: number, total: number) {
  page.drawLine({ start: { x: MARGIN, y: 38 }, end: { x: PAGE_W - MARGIN, y: 38 }, thickness: 0.5, color: RED });
  page.drawText("Perfusion Healthcare Private Limited | Healthcare Partner Platform Services Agreement", { x: MARGIN, y: 26, size: 6.5, font, color: LIGHT_GREY });
  const pageNumText = `Page ${pageNum} of ${total}`;
  const pw = font.widthOfTextAtSize(pageNumText, 6.5);
  page.drawText(pageNumText, { x: PAGE_W - MARGIN - pw, y: 26, size: 6.5, font, color: LIGHT_GREY });
  page.drawText(`Version: ${AGREEMENT_VERSION}  |  This is a system-generated Agreement record.`, { x: MARGIN, y: 14, size: 6, font: fontItalic, color: LIGHT_GREY });
}

export async function generateAndStoreAgreementPdf(data: AgreementPdfData): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);

  const signedAtStr = data.signedAt.toLocaleString("en-IN", {
    dateStyle: "long", timeStyle: "long", timeZone: "Asia/Kolkata"
  });

  const roleLabel = partnerTypeLabel(data.role, data.providerType);

  drawPageHeader(page, font, fontBold);
  const HEADER_H = 70;

  // Logo
  const logoBytes = await loadLogoBytes();
  if (logoBytes) {
    try {
      const logo = await doc.embedPng(logoBytes);
      const lh = 50;
      const lw = lh * (logo.width / logo.height);
      page.drawImage(logo, { x: PAGE_W - MARGIN - lw, y: PAGE_H - HEADER_H + 8, width: lw, height: lh });
    } catch { /* ignore */ }
  }

  let y = PAGE_H - HEADER_H - 20;

  // ── Cover Section ─────────────────────────────────────────────────────────────
  page.drawText("HEALTHCARE PARTNER PLATFORM SERVICES AGREEMENT", { x: MARGIN, y, size: 11, font: fontBold, color: DARK });
  y -= 16;
  page.drawText("Electronic Acceptance Record  |  Agreement Version: " + AGREEMENT_VERSION, { x: MARGIN, y, size: 8.5, font, color: GREY });
  y -= 20;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE_COLOR });
  y -= 16;

  // ── Pre-populated Partner Details ─────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 14, color: SECTION_BG });
  page.drawRectangle({ x: MARGIN, y: y - 2, width: 4, height: 14, color: RED });
  page.drawText("ELECTRONIC ACCEPTANCE RECORD", { x: MARGIN + 12, y: y + 2, size: 9, font: fontBold, color: RED });
  y -= 20;

  const fields: [string, string][] = [
    ["Healthcare Partner Entity", data.organizationName || "-"],
    ["Authorised Representative", data.partyName],
    ["Nature of Partner", roleLabel],
    ["Registered Email Address", data.email],
    ["Registered Mobile Number", data.phone || "-"],
    ["Date & Time of Acceptance (IST)", signedAtStr],
    ["IP Address of Device", data.ipAddress],
    ["Device / Browser Fingerprint", data.userAgent ? data.userAgent.substring(0, 120) : "-"],
    ["Agreement Version", AGREEMENT_VERSION],
    ["Unique Acceptance Ref.", data.uniqueRef],
  ];

  for (const [label, value] of fields) {
    page.drawText(label + ":", { x: MARGIN + 10, y, size: 8.5, font, color: GREY });
    const valLines = wrapText(value, fontBold, 8.5, CONTENT_W - 200);
    for (let i = 0; i < valLines.length; i++) {
      page.drawText(valLines[i], { x: MARGIN + 195, y: y - i * 12, size: 8.5, font: fontBold, color: DARK });
    }
    y -= Math.max(1, valLines.length) * 12 + 3;
  }

  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE_COLOR });
  y -= 14;

  // ── Acceptance Declaration ─────────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 14, color: SECTION_BG });
  page.drawRectangle({ x: MARGIN, y: y - 2, width: 4, height: 14, color: RED });
  page.drawText("ACCEPTANCE DECLARATION", { x: MARGIN + 12, y: y + 2, size: 9, font: fontBold, color: RED });
  y -= 20;

  const declaration = `I, ${sanitizeOneLine(data.partyName)}, the authorised representative of ${sanitizeOneLine(data.organizationName || data.partyName)}, hereby confirm that I have read and understood the Healthcare Partner Platform Services Agreement of Perfusion Healthcare Private Limited in its entirety; that I am duly authorised to accept this Agreement on behalf of the Healthcare Partner; that the Healthcare Partner holds all valid licences and registrations required under applicable law; that informed patient consent will be obtained prior to initiating each tele-consultation or laboratory service through the Platform; that I understand the Platform is a digital facilitation service only and that all clinical responsibility for patient care remains with the Healthcare Partner's treating team; and that I agree to be fully bound by all terms of this Agreement and the Privacy Policy of Perfusion Healthcare Private Limited, with effect from ${signedAtStr}.`;

  const declLines = wrapText(declaration, fontItalic, 8.5, CONTENT_W - 20);
  const declH = declLines.length * 12 + 20;
  page.drawRectangle({ x: MARGIN, y: y - declH, width: CONTENT_W, height: declH, color: rgb(0.97, 0.98, 0.97) });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: GREEN });
  let dy = y - 12;
  for (const line of declLines) {
    page.drawText(line, { x: MARGIN + 10, y: dy, size: 8.5, font: fontItalic, color: DARK });
    dy -= 12;
  }
  y -= declH + 12;

  // ── ACCEPTED seal ─────────────────────────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, y, 60);
  const SEAL_H = 52;
  page.drawRectangle({ x: MARGIN, y: y - SEAL_H, width: CONTENT_W, height: SEAL_H, color: GREEN_BG });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1.5, color: GREEN });
  page.drawText("ELECTRONICALLY ACCEPTED", { x: MARGIN + 12, y: y - 14, size: 11, font: fontBold, color: GREEN });
  page.drawText("Accepted by: " + sanitizeOneLine(data.partyName) + " on behalf of " + sanitizeOneLine(data.organizationName || data.partyName), { x: MARGIN + 12, y: y - 28, size: 8, font, color: GREY });
  page.drawText("Date & Time (IST): " + signedAtStr, { x: MARGIN + 12, y: y - 40, size: 8.5, font: fontBold, color: DARK });
  y -= SEAL_H + 20;

  // ── Company Signatory ─────────────────────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, y, 50);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE_COLOR });
  y -= 12;
  page.drawText("For: PERFUSION HEALTHCARE PRIVATE LIMITED", { x: MARGIN, y, size: 9, font: fontBold, color: DARK });
  y -= 13;
  page.drawText("CIN: U86900CT2026PTC020133", { x: MARGIN, y, size: 8, font, color: GREY });
  y -= 13;
  page.drawText("Authorised Signatory: Tesu Kesharwani, Director (DIN: 08469006)", { x: MARGIN, y, size: 8, font, color: GREY });
  y -= 13;
  page.drawText("This agreement is valid without a physical signature. Acceptance is constituted by the Healthcare Partner's Electronic Acceptance as recorded above.", { x: MARGIN, y, size: 7, font: fontItalic, color: GREY });
  y -= 24;

  // ── Full Agreement Text (paginated) ──────────────────────────────────────────
  [page, y] = needsNewPage(doc, pages, y, 30);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LINE_COLOR });
  y -= 14;
  page.drawText("FULL AGREEMENT TEXT", { x: MARGIN, y, size: 9, font: fontBold, color: DARK });
  y -= 14;

  const agreementParagraphs = AGREEMENT_FULL_TEXT.split("\n");
  for (const para of agreementParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      y -= 4;
      continue;
    }

    // Determine style
    const isHeading = /^\d+\.\s+[A-Z]/.test(trimmed) || /^[A-Z][A-Z\s]+$/.test(trimmed);
    const isSubClause = /^\d+\.\d+\s/.test(trimmed);
    const chosenFont = isHeading ? fontBold : font;
    const chosenSize = isHeading ? 8.5 : 7.5;
    const chosenColor = isHeading ? DARK : GREY;
    const indent = isSubClause ? 16 : 0;

    const lines = wrapText(trimmed, chosenFont, chosenSize, CONTENT_W - 20 - indent);
    const blockH = lines.length * 11 + (isHeading ? 6 : 2);

    [page, y] = needsNewPage(doc, pages, y, blockH + 4);

    if (isHeading && !trimmed.startsWith("1.") && !trimmed.includes("|")) {
      y -= 4;
    }

    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 10 + indent, y, size: chosenSize, font: chosenFont, color: chosenColor });
      y -= 11;
    }
    y -= isHeading ? 3 : 0;
  }

  // ── Page footers (apply after all pages known) ─────────────────────────────────
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    if (i > 0) drawPageHeader(pages[i], font, fontBold);
    drawPageFooter(pages[i], font, fontItalic, i + 1, total);
  }

  const pdfBytes = await doc.save();
  const fileName = `agreement-${data.uniqueRef}-${Date.now()}.pdf`;
  const buffer = Buffer.from(pdfBytes);
  const publicUrl = await supabaseUpload(buffer, fileName, "agreements", "application/pdf");
  return publicUrl;
}
