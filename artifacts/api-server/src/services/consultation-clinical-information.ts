export type ConsultationClinicalFields = {
  comorbidities: string | null;
  presentingComplaint: string | null;
  presentIllness: string | null;
};

type BookingClinicalSource = {
  patientAllergyNotSpecified?: boolean | null;
  patientAllergies?: string | null;
  provisionalDiagnosis?: string | null;
  clinicalSummary?: string | null;
  userId: string;
};

export function buildConsultationCaseFileSummaryValues(
  booking: BookingClinicalSource,
  fields: ConsultationClinicalFields,
) {
  return {
    allergies: booking.patientAllergyNotSpecified ? null : booking.patientAllergies ?? null,
    comorbidities: fields.comorbidities,
    presentingComplaint: fields.presentingComplaint,
    presentIllness: fields.presentIllness,
    workingDiagnosis: booking.provisionalDiagnosis ?? null,
    // Keep pre-structure summaries readable, without reusing them as complaints or illness history.
    clinicalHistory: booking.clinicalSummary ?? null,
    submittedByUserId: booking.userId,
  };
}