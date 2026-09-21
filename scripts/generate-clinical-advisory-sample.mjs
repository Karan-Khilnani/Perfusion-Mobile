import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require("../node_modules/pdf-lib");
const QRCode = require("../node_modules/qrcode");

const W = 595;
const H = 842;
const M = 50;
const CONTENT_W = W - M * 2;
const RED = rgb(0.545, 0, 0);
const DARK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT_GREY = rgb(0.65, 0.65, 0.65);
const SECTION_BG = rgb(0.97, 0.96, 0.95);
const LINE = rgb(0.82, 0.82, 0.82);
const GREEN = rgb(0.1, 0.55, 0.25);
const GREEN_BG = rgb(0.93, 0.98, 0.94);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
const pages = [];
let page = doc.addPage([W, H]);
pages.push(page);
let y = H - 175;

function clean(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u02BB\u02BC\u02BD\u02BE\u02BF\u02C8\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[^\x09\x0A\x20-\x7E\u00A1-\u00FF]/g, "?");
}

function wrap(value, face, size, width) {
  const lines = [];
  for (const paragraph of clean(value).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && face.widthOfTextAtSize(candidate, size) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function line() {
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
}

function section(title) {
  page.drawRectangle({ x: M, y: y - 2, width: CONTENT_W, height: 16, color: SECTION_BG });
  page.drawRectangle({ x: M, y: y - 2, width: 4, height: 16, color: RED });
  page.drawText(title.toUpperCase(), { x: M + 12, y: y + 3, size: 9.5, font: bold, color: RED });
  y -= 22;
}

function field(label, value) {
  page.drawText(label, { x: M + 10, y, size: 9, font, color: GREY });
  const lines = wrap(value || "-", bold, 9, CONTENT_W - 160);
  lines.forEach((text, index) => page.drawText(text, {
    x: M + 150, y: y - index * 13, size: 9, font: bold, color: DARK,
  }));
  y -= Math.max(1, lines.length) * 13 + 2;
}

function block(title, value) {
  if (!value) return;
  if (y < 150) {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - 50;
  }
  section(title);
  for (const text of wrap(value, font, 9, CONTENT_W - 20)) {
    page.drawText(text, { x: M + 10, y, size: 9, font, color: DARK });
    y -= 13;
  }
  y -= 10;
}

const logoPath = path.join(process.cwd(), "attached_assets", "Perfusion_rusty_red_logo_transparent_1779192329721.png");
if (fs.existsSync(logoPath)) {
  const logo = await doc.embedPng(fs.readFileSync(logoPath));
  const logoH = 142;
  page.drawImage(logo, { x: M - 8, y: H - 155, width: logoH * (logo.width / logo.height), height: logoH });
}

page.drawRectangle({ x: 0, y: H - 3, width: W, height: 3, color: RED });
page.drawRectangle({ x: 0, y: H - 160, width: W, height: 160, color: rgb(0.98, 0.975, 0.97), opacity: 0.55 });
const qr = await QRCode.toBuffer("https://perfusion.health/verify/prescription/CLINICAL-ADVISORY-DEMO", {
  width: 90, margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" },
});
const qrImage = await doc.embedPng(qr);
page.drawImage(qrImage, { x: W - M - 64, y: H - 123, width: 64, height: 64 });
page.drawText("Scan to verify", { x: W - M - 61, y: H - 151, size: 6.5, font, color: LIGHT_GREY });

const title = "Digital Clinical Advisory";
page.drawText(title, { x: W - M - 190, y: H - 68, size: 9.5, font: bold, color: DARK });
page.drawText("Summary ID: CA-DEMO-2026-001", { x: W - M - 190, y: H - 82, size: 8, font, color: GREY });
page.drawText("Mode: Teleconsultation", { x: W - M - 190, y: H - 95, size: 8, font, color: GREY });

line();
y -= 18;
page.drawRectangle({ x: M, y: y - 35, width: CONTENT_W, height: 43, color: SECTION_BG });
page.drawText("Referring Facility:", { x: M + 10, y, size: 8.5, font, color: GREY });
page.drawText("Demo Regional Medical Centre", { x: M + 120, y, size: 8.5, font: bold, color: DARK });
y -= 14;
page.drawText("Referring Physician:", { x: M + 10, y, size: 8.5, font, color: GREY });
page.drawText("Dr. A. Mehta", { x: M + 120, y, size: 8.5, font: bold, color: DARK });
y -= 31;

section("Patient Details");
field("Patient Name", "SAMPLE PATIENT (DEMO)");
field("Age / Sex", "42 yrs / Female");
field("UHID / Hospital ID", "DEMO-UHID-001");
field("Contact", "+91 90000 00000");
field("Weight", "62 kg");
field("Allergies", "Not specified");
y -= 8;

section("Consulting Specialist");
field("Doctor Name", "Dr. Riya Sharma");
field("Speciality", "Critical Care Medicine");
field("Qualification", "MBBS, MD");
field("Medical Council Reg. No.", "DEMO-REG-0001");
field("Years of Experience", "14");
field("Affiliated Institution", "Demo Specialist Network");
y -= 8;

block("Clinical History", "Sample clinical history for layout demonstration. This downloadable document is a format preview and does not represent a real patient record.");
block("Examinations", "Sample examination findings and relevant observations are shown here to demonstrate the document structure.");
block("Investigations", "Sample investigation summary, reviewed reports, and relevant findings.");
block("Diagnosis", "Sample working diagnosis for demonstration only.");
block("Physician Notes", "Sample specialist observations and clinical considerations for the treating hospital team.");
block("Suggested Treatment Plan", "The treating hospital physicians should determine and document the appropriate treatment plan based on the complete clinical picture.");
block("Advice", "Sample advisory notes and escalation guidance for the care team.");
block("Follow-up", "Follow up with the treating hospital team as clinically indicated.");

if (y < 210) {
  page = doc.addPage([W, H]);
  pages.push(page);
  y = H - 50;
}
y -= 6;
const legal = "This document is a specialist clinical opinion based on information provided digitally and available records. It is advisory only and is not a prescription or treatment order. Treating hospital physicians retain responsibility for prescribing and treatment decisions. It does not replace emergency care where indicated; seek immediate medical attention if the condition worsens.";
const legalLines = wrap(legal, italic, 7.5, CONTENT_W - 20);
const legalH = legalLines.length * 11 + 24;
page.drawRectangle({ x: M, y: y - legalH, width: CONTENT_W, height: legalH, color: rgb(0.97, 0.97, 0.97) });
page.drawText("Legal & Consent Declaration", { x: M + 10, y: y - 12, size: 8.5, font: bold, color: GREY });
legalLines.forEach((text, index) => page.drawText(text, { x: M + 10, y: y - 24 - index * 11, size: 7.5, font: italic, color: GREY }));
y -= legalH + 20;

page.drawRectangle({ x: M, y: y - 50, width: CONTENT_W, height: 50, color: GREEN_BG });
page.drawLine({ start: { x: M, y }, end: { x: M + CONTENT_W, y }, thickness: 1.5, color: GREEN });
page.drawText("CONFIRMED & SIGNED", { x: M + 12, y: y - 14, size: 11, font: bold, color: GREEN });
page.drawText("Consultant confirmed this Clinical Advisory on:", { x: M + 12, y: y - 28, size: 8, font, color: GREY });
page.drawText("21 September 2026, 15:00 IST", { x: M + 12, y: y - 40, size: 9, font: bold, color: DARK });
y -= 68;
line();
y -= 16;
page.drawText("Dr. Riya Sharma", { x: W - M - 160, y, size: 10, font: bold, color: DARK });
y -= 14;
page.drawText("MD | Critical Care Medicine", { x: W - M - 160, y, size: 8, font, color: GREY });
y -= 12;
page.drawText("Reg. No.: DEMO-REG-0001", { x: W - M - 160, y, size: 8, font, color: GREY });
y -= 12;
page.drawText("Confirmed: 21 September 2026, 15:00 IST", { x: W - M - 160, y, size: 8, font, color: GREEN });

for (let index = 0; index < pages.length; index++) {
  const current = pages[index];
  current.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: RED });
  current.drawText("Perfusion Health Pvt Ltd | Digital Clinical Advisory Platform", { x: M, y: 26, size: 7, font, color: LIGHT_GREY });
  const pageText = `Page ${index + 1} of ${pages.length}`;
  current.drawText(pageText, { x: W - M - font.widthOfTextAtSize(pageText, 7), y: 26, size: 7, font, color: LIGHT_GREY });
  current.drawText("This is a sample format. Scan QR on page 1 to verify.", { x: M, y: 16, size: 7, font: italic, color: LIGHT_GREY });
  current.drawText("Verification: https://perfusion.health/verify/prescription/CLINICAL-ADVISORY-DEMO", { x: M, y: 6, size: 6.5, font, color: LIGHT_GREY });
}

const output = path.join(process.cwd(), "attached_assets", "clinical-advisory-format-sample.pdf");
fs.writeFileSync(output, await doc.save());
console.log(output);