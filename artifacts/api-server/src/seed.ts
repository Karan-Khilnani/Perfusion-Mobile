import { db } from "./db";
import {
  labTests,
  radiologyModalities,
  consultants,
  platformSettings,
} from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "admin@perfusion.test";
const ADMIN_PASSWORD = "Admin@123";

// Radiology modalities extracted from the PDF (names only, no prices as per requirements)
const radiologyModalitiesData = [
  { name: "X-Ray Plain (per view)", category: "X-Ray" },
  { name: "Special Procedures (HSG, Fluoro, Barium, MCU, RGU)", category: "Special Procedures" },
  { name: "Mammogram - each side", category: "Mammography" },
  { name: "Mammogram - both sides", category: "Mammography" },
  { name: "OPG & Cephalometry", category: "Dental Imaging" },
  { name: "CT Brain / PNS / Orbit - Plain", category: "CT Scan" },
  { name: "CT Maxillofacial / Temporal Bone", category: "CT Scan" },
  { name: "CT Chest / Neck", category: "CT Scan" },
  { name: "CT KUB / Pelvis", category: "CT Scan" },
  { name: "CT Spine (C / T / L)", category: "CT Scan" },
  { name: "CT Abdomen & Pelvis / Uro / Extremities", category: "CT Scan" },
  { name: "CT Angiography (Cerebral / Pulmonary / Neck)", category: "CT Angiography" },
  { name: "CT Angiography (Peripheral / Aorta / Abdomen)", category: "CT Angiography" },
  { name: "CT Any Region + 3D Reconstruction", category: "CT Scan" },
  { name: "CT Others", category: "CT Scan" },
  { name: "CT Contrast (add-on)", category: "CT Scan" },
  { name: "MRI Brain - Plain", category: "MRI" },
  { name: "MRI Brain + MRA / MRV / Spectro", category: "MRI" },
  { name: "MRI Neck", category: "MRI" },
  { name: "MRI Abdomen & Pelvis", category: "MRI" },
  { name: "MRI Pelvis", category: "MRI" },
  { name: "MRI Extremities / Joints (MSK)", category: "MRI" },
  { name: "MRI Spine (C / T / L)", category: "MRI" },
  { name: "MRI Screening (3 sequences)", category: "MRI" },
  { name: "MRCP", category: "MRI" },
  { name: "MRI Cardiac / Special Studies", category: "MRI" },
  { name: "MRI Peripheral Angio (Dedicated)", category: "MRI Angiography" },
  { name: "MRI Others", category: "MRI" },
];

// Sample lab tests (categorized by department)
const labTestsData = [
  // Hematology
  { testName: "Complete Blood Count (CBC)", category: "Hematology", cost: "250.00", turnaroundTime: "4 hours" },
  { testName: "Hemoglobin (Hb)", category: "Hematology", cost: "100.00", turnaroundTime: "2 hours" },
  { testName: "ESR (Erythrocyte Sedimentation Rate)", category: "Hematology", cost: "120.00", turnaroundTime: "2 hours" },
  { testName: "Platelet Count", category: "Hematology", cost: "150.00", turnaroundTime: "2 hours" },
  { testName: "Peripheral Blood Smear", category: "Hematology", cost: "200.00", turnaroundTime: "4 hours" },
  { testName: "Reticulocyte Count", category: "Hematology", cost: "180.00", turnaroundTime: "4 hours" },
  { testName: "PT/INR (Prothrombin Time)", category: "Hematology", cost: "350.00", turnaroundTime: "4 hours" },
  { testName: "APTT (Activated Partial Thromboplastin Time)", category: "Hematology", cost: "400.00", turnaroundTime: "4 hours" },
  
  // Biochemistry
  { testName: "Blood Glucose Fasting", category: "Biochemistry", cost: "80.00", turnaroundTime: "2 hours" },
  { testName: "Blood Glucose PP (Post Prandial)", category: "Biochemistry", cost: "80.00", turnaroundTime: "2 hours" },
  { testName: "HbA1c (Glycated Hemoglobin)", category: "Biochemistry", cost: "450.00", turnaroundTime: "6 hours" },
  { testName: "Lipid Profile", category: "Biochemistry", cost: "500.00", turnaroundTime: "6 hours" },
  { testName: "Liver Function Test (LFT)", category: "Biochemistry", cost: "550.00", turnaroundTime: "6 hours" },
  { testName: "Kidney Function Test (KFT/RFT)", category: "Biochemistry", cost: "500.00", turnaroundTime: "6 hours" },
  { testName: "Serum Creatinine", category: "Biochemistry", cost: "150.00", turnaroundTime: "4 hours" },
  { testName: "Blood Urea", category: "Biochemistry", cost: "120.00", turnaroundTime: "4 hours" },
  { testName: "Serum Uric Acid", category: "Biochemistry", cost: "150.00", turnaroundTime: "4 hours" },
  { testName: "Serum Electrolytes (Na, K, Cl)", category: "Biochemistry", cost: "350.00", turnaroundTime: "4 hours" },
  { testName: "Calcium", category: "Biochemistry", cost: "150.00", turnaroundTime: "4 hours" },
  { testName: "Phosphorus", category: "Biochemistry", cost: "150.00", turnaroundTime: "4 hours" },
  { testName: "Magnesium", category: "Biochemistry", cost: "200.00", turnaroundTime: "4 hours" },
  
  // Thyroid
  { testName: "TSH (Thyroid Stimulating Hormone)", category: "Thyroid", cost: "300.00", turnaroundTime: "6 hours" },
  { testName: "T3 (Triiodothyronine)", category: "Thyroid", cost: "250.00", turnaroundTime: "6 hours" },
  { testName: "T4 (Thyroxine)", category: "Thyroid", cost: "250.00", turnaroundTime: "6 hours" },
  { testName: "Free T3", category: "Thyroid", cost: "300.00", turnaroundTime: "6 hours" },
  { testName: "Free T4", category: "Thyroid", cost: "300.00", turnaroundTime: "6 hours" },
  { testName: "Thyroid Profile (T3, T4, TSH)", category: "Thyroid", cost: "650.00", turnaroundTime: "6 hours" },
  
  // Cardiac Markers
  { testName: "Troponin I", category: "Cardiac Markers", cost: "800.00", turnaroundTime: "2 hours" },
  { testName: "Troponin T", category: "Cardiac Markers", cost: "850.00", turnaroundTime: "2 hours" },
  { testName: "CPK-MB", category: "Cardiac Markers", cost: "450.00", turnaroundTime: "4 hours" },
  { testName: "NT-proBNP", category: "Cardiac Markers", cost: "1500.00", turnaroundTime: "6 hours" },
  { testName: "D-Dimer", category: "Cardiac Markers", cost: "800.00", turnaroundTime: "4 hours" },
  
  // Vitamins & Minerals
  { testName: "Vitamin D (25-OH)", category: "Vitamins & Minerals", cost: "1200.00", turnaroundTime: "24 hours" },
  { testName: "Vitamin B12", category: "Vitamins & Minerals", cost: "800.00", turnaroundTime: "24 hours" },
  { testName: "Folic Acid", category: "Vitamins & Minerals", cost: "600.00", turnaroundTime: "24 hours" },
  { testName: "Iron Studies (Serum Iron, TIBC, Ferritin)", category: "Vitamins & Minerals", cost: "900.00", turnaroundTime: "6 hours" },
  
  // Urine
  { testName: "Urine Routine & Microscopy", category: "Urine", cost: "100.00", turnaroundTime: "2 hours" },
  { testName: "Urine Culture & Sensitivity", category: "Urine", cost: "450.00", turnaroundTime: "48 hours" },
  { testName: "24-Hour Urine Protein", category: "Urine", cost: "350.00", turnaroundTime: "24 hours" },
  { testName: "Urine Microalbumin", category: "Urine", cost: "400.00", turnaroundTime: "6 hours" },
  
  // Serology
  { testName: "HIV 1 & 2 Antibodies", category: "Serology", cost: "400.00", turnaroundTime: "6 hours" },
  { testName: "HBsAg (Hepatitis B Surface Antigen)", category: "Serology", cost: "350.00", turnaroundTime: "6 hours" },
  { testName: "Anti-HCV (Hepatitis C Antibodies)", category: "Serology", cost: "500.00", turnaroundTime: "6 hours" },
  { testName: "VDRL/RPR (Syphilis)", category: "Serology", cost: "200.00", turnaroundTime: "4 hours" },
  { testName: "Dengue NS1 Antigen", category: "Serology", cost: "600.00", turnaroundTime: "4 hours" },
  { testName: "Dengue IgM/IgG", category: "Serology", cost: "700.00", turnaroundTime: "4 hours" },
  { testName: "Malaria Antigen (Rapid)", category: "Serology", cost: "350.00", turnaroundTime: "2 hours" },
  { testName: "Typhoid (Widal Test)", category: "Serology", cost: "250.00", turnaroundTime: "4 hours" },
  { testName: "CRP (C-Reactive Protein)", category: "Serology", cost: "400.00", turnaroundTime: "4 hours" },
  { testName: "RA Factor (Rheumatoid Factor)", category: "Serology", cost: "400.00", turnaroundTime: "4 hours" },
  { testName: "ASO Titre", category: "Serology", cost: "350.00", turnaroundTime: "4 hours" },
  
  // Hormones
  { testName: "Prolactin", category: "Hormones", cost: "500.00", turnaroundTime: "6 hours" },
  { testName: "FSH (Follicle Stimulating Hormone)", category: "Hormones", cost: "450.00", turnaroundTime: "6 hours" },
  { testName: "LH (Luteinizing Hormone)", category: "Hormones", cost: "450.00", turnaroundTime: "6 hours" },
  { testName: "Testosterone", category: "Hormones", cost: "600.00", turnaroundTime: "6 hours" },
  { testName: "Estradiol (E2)", category: "Hormones", cost: "550.00", turnaroundTime: "6 hours" },
  { testName: "Cortisol (Morning)", category: "Hormones", cost: "500.00", turnaroundTime: "6 hours" },
  { testName: "Insulin Fasting", category: "Hormones", cost: "600.00", turnaroundTime: "6 hours" },
  { testName: "Beta HCG", category: "Hormones", cost: "550.00", turnaroundTime: "6 hours" },
  
  // Tumor Markers
  { testName: "PSA (Prostate Specific Antigen)", category: "Tumor Markers", cost: "800.00", turnaroundTime: "24 hours" },
  { testName: "CA-125", category: "Tumor Markers", cost: "1200.00", turnaroundTime: "24 hours" },
  { testName: "CA 19-9", category: "Tumor Markers", cost: "1200.00", turnaroundTime: "24 hours" },
  { testName: "CEA (Carcinoembryonic Antigen)", category: "Tumor Markers", cost: "900.00", turnaroundTime: "24 hours" },
  { testName: "AFP (Alpha Fetoprotein)", category: "Tumor Markers", cost: "800.00", turnaroundTime: "24 hours" },
];

// Sample consultants — Raipur specialists
const consultantsData = [
  {
    name: "Dr. Arvind Sharma",
    qualification: "MBBS, MD (Cardiology), DM (Interventional Cardiology)",
    specialization: "Cardiology",
    yearsExperience: 18,
    rating: "4.8",
    consultationFee: "1200.00",
    availableSlots: ["Mon 9am-1pm", "Wed 9am-1pm", "Fri 9am-1pm"],
    registrationNumber: "MCI-2006-CG-08741",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Ramkrishna Care Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Priya Mehta",
    qualification: "MBBS, MD (Neurology), DM (Neurology)",
    specialization: "Neurology",
    yearsExperience: 14,
    rating: "4.7",
    consultationFee: "1100.00",
    availableSlots: ["Tue 10am-2pm", "Thu 10am-2pm", "Sat 9am-12pm"],
    registrationNumber: "MCI-2010-CG-14532",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "AIIMS Raipur",
    status: "active",
  },
  {
    name: "Dr. Rajesh Tiwari",
    qualification: "MBBS, MS (Orthopaedics), MCh (Joint Replacement)",
    specialization: "Orthopaedics",
    yearsExperience: 20,
    rating: "4.9",
    consultationFee: "1000.00",
    availableSlots: ["Mon 2pm-6pm", "Wed 2pm-6pm", "Fri 2pm-5pm"],
    registrationNumber: "MCI-2004-CG-05219",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Apollo BSR Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Sunita Agrawal",
    qualification: "MBBS, MD (Obstetrics & Gynaecology)",
    specialization: "Obstetrics & Gynaecology",
    yearsExperience: 16,
    rating: "4.6",
    consultationFee: "900.00",
    availableSlots: ["Mon 10am-1pm", "Tue 3pm-6pm", "Thu 3pm-6pm", "Sat 9am-12pm"],
    registrationNumber: "MCI-2008-CG-11204",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Shri Narayana Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Manoj Dubey",
    qualification: "MBBS, MD (Pulmonology), FCCP",
    specialization: "Pulmonology & Respiratory Medicine",
    yearsExperience: 12,
    rating: "4.5",
    consultationFee: "950.00",
    availableSlots: ["Tue 9am-12pm", "Thu 9am-12pm", "Sat 10am-1pm"],
    registrationNumber: "MCI-2012-CG-18765",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "NMC Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Kavita Sahu",
    qualification: "MBBS, MD (Nephrology), DM (Nephrology)",
    specialization: "Nephrology",
    yearsExperience: 11,
    rating: "4.7",
    consultationFee: "1050.00",
    availableSlots: ["Mon 3pm-6pm", "Wed 3pm-6pm", "Fri 3pm-6pm"],
    registrationNumber: "MCI-2013-CG-20341",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Ramkrishna Care Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Anil Patel",
    qualification: "MBBS, MD (Gastroenterology), DM (Gastroenterology)",
    specialization: "Gastroenterology",
    yearsExperience: 15,
    rating: "4.8",
    consultationFee: "1100.00",
    availableSlots: ["Mon 9am-12pm", "Thu 9am-12pm", "Sat 9am-11am"],
    registrationNumber: "MCI-2009-CG-12887",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "AIIMS Raipur",
    status: "active",
  },
  {
    name: "Dr. Deepak Verma",
    qualification: "MBBS, MD (Endocrinology), DM (Endocrinology)",
    specialization: "Endocrinology & Diabetology",
    yearsExperience: 13,
    rating: "4.6",
    consultationFee: "980.00",
    availableSlots: ["Tue 2pm-5pm", "Thu 2pm-5pm", "Sat 2pm-4pm"],
    registrationNumber: "MCI-2011-CG-16754",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Care CHL Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Ritu Chandrakar",
    qualification: "MBBS, MD (Dermatology, Venereology & Leprosy)",
    specialization: "Dermatology",
    yearsExperience: 9,
    rating: "4.5",
    consultationFee: "800.00",
    availableSlots: ["Mon 11am-2pm", "Wed 11am-2pm", "Fri 11am-2pm", "Sat 10am-12pm"],
    registrationNumber: "MCI-2015-CG-24109",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Shri Narayana Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Suresh Kumar Jha",
    qualification: "MBBS, MS (Ophthalmology), FRCS (Ophth)",
    specialization: "Ophthalmology",
    yearsExperience: 17,
    rating: "4.9",
    consultationFee: "850.00",
    availableSlots: ["Tue 9am-1pm", "Thu 9am-1pm", "Sat 9am-12pm"],
    registrationNumber: "MCI-2007-CG-09643",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "ICARE Eye Hospital, Raipur",
    status: "active",
  },
  {
    name: "Dr. Neha Bansod",
    qualification: "MBBS, MD (Psychiatry)",
    specialization: "Psychiatry",
    yearsExperience: 8,
    rating: "4.4",
    consultationFee: "900.00",
    availableSlots: ["Mon 3pm-6pm", "Wed 3pm-6pm", "Fri 3pm-6pm"],
    registrationNumber: "MCI-2016-CG-26543",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "AIIMS Raipur",
    status: "active",
  },
  {
    name: "Dr. Prakash Nair",
    qualification: "MBBS, MCh (Urology)",
    specialization: "Urology",
    yearsExperience: 19,
    rating: "4.8",
    consultationFee: "1150.00",
    availableSlots: ["Tue 10am-1pm", "Thu 10am-1pm", "Sat 10am-12pm"],
    registrationNumber: "MCI-2005-CG-06872",
    registeredOrganization: "Medical Council of India",
    affiliatedInstitution: "Apollo BSR Hospital, Raipur",
    status: "active",
  },
];

export async function seedDatabase() {
  console.log("Starting database seed...");

  try {
    // Seed admin account
    console.log("Checking admin account...");
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL));

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    
    if (!existingAdmin) {
      await db.insert(users).values({
        email: ADMIN_EMAIL,
        password: hashedPassword,
        firstName: "System",
        lastName: "Admin",
        role: "admin",
        isActive: true,
        emailVerified: true,
        approvalStatus: "approved",
      });
      console.log("Admin account created: admin@perfusion.test / Admin@123");
    } else {
      await db
        .update(users)
        .set({ password: hashedPassword, emailVerified: true, approvalStatus: "approved" as any })
        .where(eq(users.email, ADMIN_EMAIL));
      console.log("Admin password reset: admin@perfusion.test / Admin@123");
    }

    // Seed radiology modalities
    const existingModalities = await db.select().from(radiologyModalities);
    if (existingModalities.length === 0) {
      console.log("Seeding radiology modalities...");
      for (const modality of radiologyModalitiesData) {
        await db.insert(radiologyModalities).values([{
          name: modality.name,
          category: modality.category,
          status: "active",
        } as any]);
      }
      console.log(`Seeded ${radiologyModalitiesData.length} radiology modalities`);
    } else {
      console.log(`Skipping radiology modalities (${existingModalities.length} already exist)`);
    }

    // Seed lab tests
    const existingTests = await db.select().from(labTests);
    if (existingTests.length === 0) {
      console.log("Seeding lab tests...");
      for (const test of labTestsData) {
        await db.insert(labTests).values([{
          testName: test.testName,
          category: test.category,
          cost: test.cost,
          turnaroundTime: test.turnaroundTime,
          status: "active",
        } as any]);
      }
      console.log(`Seeded ${labTestsData.length} lab tests`);
    } else {
      console.log(`Skipping lab tests (${existingTests.length} already exist)`);
    }

    // Seed consultants
    const existingConsultants = await db.select().from(consultants);
    if (existingConsultants.length === 0) {
      console.log("Seeding consultants...");
      for (const consultant of consultantsData) {
        await db.insert(consultants).values([{ ...consultant, approvalStatus: "approved" } as any]);
      }
      console.log(`Seeded ${consultantsData.length} consultants`);
    } else {
      console.log(`Skipping consultants (${existingConsultants.length} already exist)`);
    }

    // Seed default platform settings
    const existingSettings = await db.select().from(platformSettings);
    if (existingSettings.length === 0) {
      await db.insert(platformSettings).values({
        settingKey: "default_margin_percent",
        settingValue: "15",
      });
      console.log("Seeded default platform settings (15% margin)");
    } else {
      console.log(`Skipping platform settings (${existingSettings.length} already exist)`);
    }

    console.log("Database seed completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

// Export for use in server startup
