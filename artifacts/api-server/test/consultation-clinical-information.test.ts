import assert from "node:assert/strict";
import test from "node:test";
import { buildConsultationCaseFileSummaryValues } from "../src/services/consultation-clinical-information";

test("keeps complaint, present illness, diagnosis, and legacy summary separate", () => {
  const result = buildConsultationCaseFileSummaryValues(
    {
      userId: "seeker-1",
      patientAllergyNotSpecified: false,
      patientAllergies: "Penicillin",
      provisionalDiagnosis: "? ACS",
      clinicalSummary: null,
    },
    {
      comorbidities: "Type 2 Diabetes",
      presentingComplaint: "Acute chest pain",
      presentIllness: "Pain started two days ago with breathlessness.",
    },
  );

  assert.equal(result.comorbidities, "Type 2 Diabetes");
  assert.equal(result.presentingComplaint, "Acute chest pain");
  assert.equal(result.presentIllness, "Pain started two days ago with breathlessness.");
  assert.equal(result.workingDiagnosis, "? ACS");
  assert.equal(result.clinicalHistory, null);
  assert.equal(result.allergies, "Penicillin");
});

test("does not invent complaint or illness values for older bookings", () => {
  const result = buildConsultationCaseFileSummaryValues(
    {
      userId: "seeker-2",
      patientAllergyNotSpecified: true,
      patientAllergies: "Should not be copied",
      provisionalDiagnosis: null,
      clinicalSummary: "Legacy summary remains available.",
    },
    {
      comorbidities: null,
      presentingComplaint: null,
      presentIllness: null,
    },
  );

  assert.equal(result.presentingComplaint, null);
  assert.equal(result.presentIllness, null);
  assert.equal(result.clinicalHistory, "Legacy summary remains available.");
  assert.equal(result.allergies, null);
});