import jsPDF from "jspdf";

interface PrescriptionData {
  prescriptionId: string;
  dateTime: string;
  mode: string;
  referringFacility: string | null;
  referringDoctor: string | null;
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

const COLORS = {
  primary: [139, 0, 0] as [number, number, number],
  dark: [33, 33, 33] as [number, number, number],
  medium: [100, 100, 100] as [number, number, number],
  light: [150, 150, 150] as [number, number, number],
  sectionBg: [248, 245, 242] as [number, number, number],
  headerBg: [139, 0, 0] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  line: [200, 190, 185] as [number, number, number],
  legalBg: [245, 245, 245] as [number, number, number],
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 18;
const MARGIN_RIGHT = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const FOOTER_HEIGHT = 20;

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - FOOTER_HEIGHT - 10) {
    doc.addPage();
    drawPageFooter(doc, doc.getNumberOfPages());
    return 20;
  }
  return y;
}

function drawPageFooter(doc: jsPDF, pageNum: number) {
  const totalPages = doc.getNumberOfPages();
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - FOOTER_HEIGHT, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - FOOTER_HEIGHT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.light);
  doc.text("Perfusion Health Pvt Ltd | Digital Super Speciality Consultation Platform", MARGIN_LEFT, PAGE_HEIGHT - 12);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 12, { align: "right" });
  doc.text("This is a digitally generated clinical advisory.", MARGIN_LEFT, PAGE_HEIGHT - 7);
}

function drawSectionHeader(doc: jsPDF, y: number, title: string): number {
  y = checkPageBreak(doc, y, 12);
  doc.setFillColor(...COLORS.sectionBg);
  doc.roundedRect(MARGIN_LEFT, y, CONTENT_WIDTH, 8, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.primary);
  doc.text(title.toUpperCase(), MARGIN_LEFT + 4, y + 5.5);
  return y + 12;
}

function drawLabelValue(doc: jsPDF, y: number, label: string, value: string, labelWidth = 55): number {
  y = checkPageBreak(doc, y, 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.medium);
  doc.text(label, MARGIN_LEFT + 4, y);
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(value, CONTENT_WIDTH - labelWidth - 8);
  doc.text(lines, MARGIN_LEFT + labelWidth, y);
  return y + (lines.length * 4.5) + 1.5;
}

function drawMultilineContent(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.dark);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 8);
  for (const line of lines) {
    y = checkPageBreak(doc, y, 5);
    doc.text(line, MARGIN_LEFT + 4, y);
    y += 4.2;
  }
  return y + 2;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generatePrescriptionPDF(data: PrescriptionData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 12;

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, PAGE_WIDTH, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.white);
  doc.text("Perfusion Health Pvt Ltd", PAGE_WIDTH / 2, y + 5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 220, 220);
  doc.text("Digital Super Speciality Consultation Platform", PAGE_WIDTH / 2, y + 11, { align: "center" });

  doc.setDrawColor(255, 255, 255, 80);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT + 20, y + 14, PAGE_WIDTH - MARGIN_RIGHT - 20, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 230, 230);
  doc.text(`Clinical Advisory ID: ${data.prescriptionId}`, MARGIN_LEFT + 4, y + 20);
  doc.text(`Date & Time: ${data.dateTime}`, PAGE_WIDTH - MARGIN_RIGHT - 4, y + 20, { align: "right" });
  doc.text(`Mode: ${data.mode}`, MARGIN_LEFT + 4, y + 25);

  y = 44;

  if (data.referringFacility || data.referringDoctor || data.onCallDoctorName) {
    doc.setFillColor(252, 250, 248);
    doc.roundedRect(MARGIN_LEFT, y, CONTENT_WIDTH, data.onCallDoctorName ? 18 : 10, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let hy = y + 4.5;
    if (data.referringFacility) {
      doc.setTextColor(...COLORS.medium);
      doc.text("Referring Facility / Treating Hospital:", MARGIN_LEFT + 4, hy);
      doc.setTextColor(...COLORS.dark);
      doc.setFont("helvetica", "bold");
      doc.text(data.referringFacility, MARGIN_LEFT + 60, hy);
      hy += 5;
    }
    if (data.onCallDoctorName) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.medium);
      doc.text("On-Call Doctor (Case Presenter):", MARGIN_LEFT + 4, hy);
      doc.setTextColor(...COLORS.dark);
      doc.setFont("helvetica", "bold");
      const onCallText = data.onCallDoctorDesignation
        ? `${data.onCallDoctorName} | ${data.onCallDoctorDesignation}`
        : data.onCallDoctorName;
      doc.text(onCallText, MARGIN_LEFT + 52, hy);
      hy += 5;
    }
    y = hy + 3;
  }

  y = drawSectionHeader(doc, y, "Patient Details");
  y = drawLabelValue(doc, y, "Patient Name:", data.patientName);
  const ageGender = [
    data.patientAge ? `${data.patientAge} years` : null,
    data.patientGender ? data.patientGender.charAt(0).toUpperCase() + data.patientGender.slice(1) : null,
  ].filter(Boolean).join(" / ");
  if (ageGender) y = drawLabelValue(doc, y, "Age / Sex:", ageGender);
  if (data.uhidIpNumber) y = drawLabelValue(doc, y, "UHID / Hospital ID:", data.uhidIpNumber);
  if (data.patientContact) y = drawLabelValue(doc, y, "Contact Number:", data.patientContact);
  if (data.patientWeight) y = drawLabelValue(doc, y, "Weight:", `${data.patientWeight} kg`);
  if (data.patientAllergyNotSpecified) {
    y = drawLabelValue(doc, y, "Allergies:", "Not specified");
  } else if (data.patientAllergies) {
    y = drawLabelValue(doc, y, "Allergies:", `Yes — ${data.patientAllergies}`);
  }
  y += 3;

  y = drawSectionHeader(doc, y, "Consulting Super Specialist Details");
  y = drawLabelValue(doc, y, "Doctor Name:", data.consultantName);
  if (data.consultantSpecialization) {
    y = drawLabelValue(doc, y, "Speciality:", data.consultantSpecialization);
  }
  if (data.consultantQualification) {
    y = drawLabelValue(doc, y, "Qualification:", data.consultantQualification);
  }
  if (data.consultantRegistrationNo) {
    y = drawLabelValue(doc, y, "Medical Council Reg. No.:", data.consultantRegistrationNo);
  }
  if (data.consultantYearsExperience) {
    y = drawLabelValue(doc, y, "Years of Experience:", String(data.consultantYearsExperience));
  }
  if (data.consultantAffiliation) {
    y = drawLabelValue(doc, y, "Affiliated Institution:", data.consultantAffiliation);
  }
  y += 3;

  if (data.clinicalHistory) {
    y = drawSectionHeader(doc, y, "Clinical History");
    y = drawMultilineContent(doc, y, data.clinicalHistory);
    y += 2;
  }

  if (data.examination) {
    y = drawSectionHeader(doc, y, "Examinations");
    y = drawMultilineContent(doc, y, data.examination);
    y += 2;
  }

  if (data.investigations) {
    y = drawSectionHeader(doc, y, "Investigations");
    y = drawMultilineContent(doc, y, data.investigations);
    y += 2;
  }

  if (data.diagnosis) {
    y = drawSectionHeader(doc, y, "Diagnosis");
    y = drawMultilineContent(doc, y, data.diagnosis);
    y += 2;
  }

  if (data.physicianNotes) {
    y = drawSectionHeader(doc, y, "Physician Notes");
    y = drawMultilineContent(doc, y, data.physicianNotes);
    y += 2;
  }

  if (data.treatmentPlan) {
    y = drawSectionHeader(doc, y, "Clinical Advisory");
    y = drawMultilineContent(doc, y, data.treatmentPlan);
    y += 2;
  }

  if (data.followUp) {
    y = checkPageBreak(doc, y, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.primary);
    doc.text("Follow-up:", MARGIN_LEFT + 4, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(data.followUp, MARGIN_LEFT + 25, y);
    y += 8;
  }

  y = checkPageBreak(doc, y, 30);
  doc.setFillColor(...COLORS.legalBg);
  doc.roundedRect(MARGIN_LEFT, y, CONTENT_WIDTH, 22, 1, 1, "F");
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN_LEFT, y, CONTENT_WIDTH, 22, 1, 1, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.medium);
  doc.text("Legal & Consent Declaration", MARGIN_LEFT + 4, y + 5);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.medium);
  const legalLines = doc.splitTextToSize(
    "This document is a specialist clinical opinion, not a prescription or treatment order. Treating hospital physicians retain responsibility for prescribing and treatment decisions. It is based on information provided digitally and available records and does not replace emergency care where indicated.",
    CONTENT_WIDTH - 8
  );
  doc.text(legalLines, MARGIN_LEFT + 4, y + 10);
  y += 28;

  y = checkPageBreak(doc, y, 40);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 5;

  const sigX = PAGE_WIDTH - MARGIN_RIGHT - 70;

  if (data.consultantSignatureUrl) {
    try {
      const sigBase64 = await loadImageAsBase64(data.consultantSignatureUrl);
      if (sigBase64) {
        doc.addImage(sigBase64, "PNG", sigX, y, 50, 18);
        y += 20;
      }
    } catch {
      y += 2;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  doc.text(`Dr. ${data.consultantName}`, sigX, y);
  y += 4.5;

  if (data.consultantQualification) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.medium);
    const qualSpec = [data.consultantQualification, data.consultantSpecialization].filter(Boolean).join(" | ");
    doc.text(qualSpec, sigX, y);
    y += 4;
  }

  if (data.consultantRegistrationNo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.medium);
    doc.text(`Medical Council Reg. No.: ${data.consultantRegistrationNo}`, sigX, y);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageFooter(doc, i);
  }

  doc.save(`Clinical_Advisory_${data.prescriptionId}.pdf`);
}
