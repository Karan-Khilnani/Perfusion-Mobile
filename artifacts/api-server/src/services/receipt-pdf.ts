import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";

export type ReceiptType = "seeker" | "provider";

export interface ReceiptData {
  receiptType: ReceiptType;
  bookingNumber: string;
  bookingId: string;
  bookingType: "consultation" | "lab" | "teleradiology";
  status: string;
  createdAt: Date;
  patientName: string;
  patientAge: number;
  patientGender: string | null;
  patientContact: string | null;
  uhidIpNumber: string | null;
  ipdNumber: string | null;
  serviceName: string;
  providerName: string | null;
  appointmentSlot: string | null;
  modalityName: string | null;
  urgency: string | null;
  accessionNumber: string | null;
  provisionalDiagnosis: string | null;
  fullAmount: number;
  basePrice: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  amountPaid: number;
  paymentStatus: string;
  paymentMethod: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  paidAt: Date | null;
  dueDate: Date | null;
}

const BLUE       = rgb(0.08, 0.18, 0.48);
const BLUE_LIGHT = rgb(0.93, 0.95, 0.99);
const BLUE_MID   = rgb(0.70, 0.78, 0.94);
const DARK       = rgb(0.10, 0.10, 0.10);
const GREY       = rgb(0.45, 0.45, 0.45);
const LIGHT      = rgb(0.65, 0.65, 0.65);
const WHITE      = rgb(1, 1, 1);
const GREEN      = rgb(0.10, 0.50, 0.22);
const GREEN_BG   = rgb(0.92, 0.98, 0.93);
const AMBER_BG   = rgb(0.99, 0.96, 0.88);
const AMBER      = rgb(0.65, 0.45, 0.05);
const LINE       = rgb(0.85, 0.87, 0.93);
const RED        = rgb(0.70, 0.10, 0.10);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CW     = PAGE_W - 2 * MARGIN;

function sanitize(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function fmt(n: number): string {
  return `INR ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(t: string): string {
  if (t === "consultation") return "Consultation";
  if (t === "lab") return "Lab Test";
  if (t === "teleradiology") return "Teleradiology";
  return t;
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color = LINE, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
}

function txt(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb> = DARK) {
  const safe = sanitize(s);
  if (!safe) return;
  page.drawText(safe, { x, y, font, size, color });
}

function txtRight(page: PDFPage, s: string, rightEdge: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb> = DARK) {
  const safe = sanitize(s);
  if (!safe) return;
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: rightEdge - w, y, font, size, color });
}

function txtCenter(page: PDFPage, s: string, cx: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb> = DARK) {
  const safe = sanitize(s);
  if (!safe) return;
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: cx - w / 2, y, font, size, color });
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE_H - MARGIN;

  // ── Header bar ────────────────────────────────────────────────────────────
  drawRect(page, 0, PAGE_H - 80, PAGE_W, 80, BLUE);
  txt(page, "PERFUSION", MARGIN, PAGE_H - 28, bold, 22, WHITE);
  txt(page, "HEALTHCARE", MARGIN, PAGE_H - 46, regular, 11, BLUE_MID);
  txt(page, "Connecting Care. Across India.", MARGIN, PAGE_H - 62, oblique, 8.5, BLUE_MID);

  const copyLabel = data.receiptType === "provider" ? "PARTNER PAYMENT RECEIPT" : "PATIENT RECEIPT";
  const labelW = bold.widthOfTextAtSize(copyLabel, 10);
  drawRect(page, PAGE_W - MARGIN - labelW - 24, PAGE_H - 58, labelW + 24, 28, rgb(0.18, 0.30, 0.60));
  txt(page, copyLabel, PAGE_W - MARGIN - labelW - 12, PAGE_H - 47, bold, 10, WHITE);

  y = PAGE_H - 80 - 16;

  // ── Receipt meta strip ────────────────────────────────────────────────────
  drawRect(page, 0, y - 30, PAGE_W, 30, BLUE_LIGHT);
  const bn = data.bookingNumber || data.bookingId.slice(0, 12).toUpperCase();
  txt(page, `Receipt No: ${bn}`, MARGIN, y - 18, bold, 9.5, BLUE);
  txtRight(page, `Issued: ${fmtDateTime(new Date())}`, PAGE_W - MARGIN, y - 18, regular, 8.5, GREY);
  y -= 30 + 14;

  const col1x = MARGIN;
  const col2x = MARGIN + CW / 2 + 8;

  function sectionHeader(label: string) {
    drawRect(page, MARGIN, y - 16, CW, 18, BLUE);
    txt(page, label.toUpperCase(), MARGIN + 8, y - 11, bold, 8, WHITE);
    y -= 18 + 6;
  }

  function kvRow(label: string, value: string, labelW = 120) {
    if (!value || value === "—") {
      txt(page, `${label}:`, col1x, y, regular, 8.5, LIGHT);
      txt(page, "—", col1x + labelW, y, regular, 8.5, LIGHT);
    } else {
      txt(page, `${label}:`, col1x, y, regular, 8.5, GREY);
      txt(page, sanitize(value), col1x + labelW, y, regular, 8.5, DARK);
    }
    y -= 14;
  }

  function twoCol(l1: string, v1: string, l2: string, v2: string) {
    txt(page, `${l1}:`, col1x, y, regular, 8.5, GREY);
    txt(page, sanitize(v1) || "—", col1x + 90, y, regular, 8.5, DARK);
    txt(page, `${l2}:`, col2x, y, regular, 8.5, GREY);
    txt(page, sanitize(v2) || "—", col2x + 90, y, regular, 8.5, DARK);
    y -= 14;
  }

  // ── Booking Details ───────────────────────────────────────────────────────
  sectionHeader("Booking Details");
  twoCol("Booking Ref", data.bookingNumber || "—", "Service Type", typeLabel(data.bookingType));
  twoCol("Booked On", fmtDate(new Date(data.createdAt)), "Status", data.status.replace(/_/g, " ").toUpperCase());
  if (data.appointmentSlot && data.bookingType === "consultation") {
    twoCol("Appointment Slot", data.appointmentSlot, "Urgency", "—");
  }
  if (data.bookingType === "teleradiology") {
    twoCol("Urgency", data.urgency || "—", "Accession #", data.accessionNumber || "—");
  }
  y -= 4;

  // ── Patient Details ───────────────────────────────────────────────────────
  sectionHeader("Patient Details");
  twoCol("Patient Name", data.patientName, "Age / Gender", `${data.patientAge}Y / ${data.patientGender || "—"}`);
  twoCol("Contact", data.patientContact || "—", "UHID / IPD", data.uhidIpNumber || data.ipdNumber || "—");
  y -= 4;

  // ── Service Details ───────────────────────────────────────────────────────
  sectionHeader("Service Details");
  if (data.bookingType === "consultation") {
    kvRow("Consultant", data.serviceName);
    if (data.providerName) kvRow("Specialisation", data.providerName);
    if (data.provisionalDiagnosis) kvRow("Diagnosis", data.provisionalDiagnosis.slice(0, 80));
  } else if (data.bookingType === "lab") {
    kvRow("Test Name", data.serviceName);
    if (data.providerName) kvRow("Lab / Provider", data.providerName);
  } else {
    kvRow("Modality", data.modalityName || data.serviceName);
    if (data.providerName) kvRow("Radiology Provider", data.providerName);
  }
  y -= 4;

  // ── Payment Summary ───────────────────────────────────────────────────────
  sectionHeader(data.receiptType === "provider" ? "Partner Payment Summary" : "Payment Summary");

  const tX = MARGIN;
  const tW = CW;

  function payRow(
    label: string, value: string,
    isTotal = false, valueBold = false,
    bg?: ReturnType<typeof rgb>, lColor = DARK, vColor = DARK
  ) {
    const rowH = 18;
    if (bg) drawRect(page, tX, y - rowH + 4, tW, rowH, bg);
    const lF = isTotal ? bold : regular;
    const vF = (isTotal || valueBold) ? bold : regular;
    const sz = isTotal ? 9.5 : 9;
    txt(page, label, tX + 8, y - 3, lF, sz, isTotal ? BLUE : lColor);
    txtRight(page, value, tX + tW - 8, y - 3, vF, sz, isTotal ? BLUE : vColor);
    drawLine(page, tX, y - rowH + 4, tX + tW, y - rowH + 4, LINE, 0.4);
    y -= rowH;
  }

  drawRect(page, tX, y + 4, tW, 18, BLUE);
  txt(page, "Description", tX + 8, y + 9, bold, 8.5, WHITE);
  txtRight(page, "Amount", tX + tW - 8, y + 9, bold, 8.5, WHITE);
  y -= 18;

  if (data.receiptType === "seeker") {
    payRow("Service Fee", fmt(data.fullAmount));
    payRow("Total Payable", fmt(data.fullAmount), true, false, BLUE_LIGHT);
    payRow("Amount Paid", fmt(data.amountPaid), false, true);
    const balance = data.fullAmount - data.amountPaid;
    if (balance > 0.01) {
      payRow("Balance Due", fmt(balance), false, true, AMBER_BG, AMBER, AMBER);
    } else {
      payRow("Balance Due", "NIL", false, false, GREEN_BG, GREEN, GREEN);
    }
  } else {
    const base   = data.basePrice ?? (data.fullAmount - (data.marginAmount ?? 0));
    const margin = data.marginAmount ?? (data.fullAmount - base);
    const pct    = data.marginPercent ?? 15;
    payRow("Service Amount (Billed to Patient)", fmt(data.fullAmount));
    payRow(`Perfusion Platform Fee (${pct}%)`, `- ${fmt(margin)}`, false, false, undefined, RED, RED);
    payRow("Partner Payment Amount", fmt(base), true, false, BLUE_LIGHT);
    payRow("Amount Collected", fmt(data.amountPaid), false, true);
  }

  y -= 6;

  // ── Payment Info ──────────────────────────────────────────────────────────
  sectionHeader("Payment Information");

  const statusColor = data.paymentStatus === "paid" ? GREEN : data.paymentStatus === "pending" ? AMBER : RED;
  const statusBg    = data.paymentStatus === "paid" ? GREEN_BG : data.paymentStatus === "pending" ? AMBER_BG : rgb(0.99, 0.93, 0.93);
  drawRect(page, MARGIN, y - 14, 90, 16, statusBg);
  txtCenter(page, data.paymentStatus.toUpperCase(), MARGIN + 45, y - 10, bold, 8, statusColor);
  y -= 22;

  twoCol("Payment Method", data.paymentMethod ? data.paymentMethod.replace(/_/g, " ") : "—", "Paid On", data.paidAt ? fmtDate(data.paidAt) : "—");
  if (data.razorpayPaymentId) kvRow("Transaction ID", data.razorpayPaymentId);
  if (data.razorpayOrderId) kvRow("Razorpay Order ID", data.razorpayOrderId);
  if (data.dueDate && data.paymentStatus !== "paid") kvRow("Due Date", fmtDate(data.dueDate));

  // ── Footer ────────────────────────────────────────────────────────────────
  drawRect(page, 0, 0, PAGE_W, 50, BLUE_LIGHT);
  drawLine(page, MARGIN, 50, PAGE_W - MARGIN, 50, BLUE_MID, 0.5);
  txtCenter(page, "This is a computer-generated receipt and does not require a signature.", PAGE_W / 2, 36, oblique, 7.5, GREY);
  txtCenter(page, "Perfusion Healthcare  |  perfusionhealth.in", PAGE_W / 2, 24, regular, 7.5, LIGHT);
  txtCenter(page, `Generated: ${fmtDateTime(new Date())}`, PAGE_W / 2, 12, regular, 7, LIGHT);

  return doc.save();
}
