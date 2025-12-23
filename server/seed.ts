import { db } from "./db";
import {
  labs,
  labTests,
  consultants,
  hospitals,
  criticalCareDoctors,
  referralHospitals,
  transportServices,
} from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Check if data already exists
  const existingLabs = await db.select().from(labs);
  if (existingLabs.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  // Seed Labs
  const labsData = [
    {
      name: "HealthFirst Diagnostics",
      location: "Mumbai",
      description: "State-of-the-art diagnostic center with 24/7 service",
      rating: "4.8",
      isActive: true,
    },
    {
      name: "MedLab Plus",
      location: "Delhi",
      description: "Trusted diagnostics with home sample collection",
      rating: "4.6",
      isActive: true,
    },
    {
      name: "QuickDiagnostics",
      location: "Bangalore",
      description: "Fast and accurate results for urgent cases",
      rating: "4.5",
      isActive: true,
    },
    {
      name: "Premier Path Labs",
      location: "Chennai",
      description: "NABL accredited with international quality standards",
      rating: "4.9",
      isActive: true,
    },
    {
      name: "CityPath Diagnostics",
      location: "Hyderabad",
      description: "Affordable testing with quality assurance",
      rating: "4.4",
      isActive: true,
    },
  ];

  const insertedLabs = await db.insert(labs).values(labsData).returning();
  console.log(`Inserted ${insertedLabs.length} labs`);

  // Seed Lab Tests
  const testsData = [
    { labId: insertedLabs[0].id, testName: "Complete Blood Count (CBC)", cost: "35.00", turnaroundTime: "4 hours", accuracyRating: "4.9" },
    { labId: insertedLabs[0].id, testName: "Lipid Profile", cost: "55.00", turnaroundTime: "6 hours", accuracyRating: "4.8" },
    { labId: insertedLabs[0].id, testName: "Liver Function Test", cost: "65.00", turnaroundTime: "8 hours", accuracyRating: "4.7" },
    { labId: insertedLabs[1].id, testName: "Thyroid Profile (T3, T4, TSH)", cost: "45.00", turnaroundTime: "12 hours", accuracyRating: "4.8" },
    { labId: insertedLabs[1].id, testName: "HbA1c Test", cost: "40.00", turnaroundTime: "6 hours", accuracyRating: "4.9" },
    { labId: insertedLabs[1].id, testName: "Vitamin D Test", cost: "50.00", turnaroundTime: "24 hours", accuracyRating: "4.6" },
    { labId: insertedLabs[2].id, testName: "COVID-19 RT-PCR", cost: "75.00", turnaroundTime: "6 hours", accuracyRating: "4.9" },
    { labId: insertedLabs[2].id, testName: "Dengue NS1 Antigen", cost: "30.00", turnaroundTime: "2 hours", accuracyRating: "4.7" },
    { labId: insertedLabs[2].id, testName: "Malaria Antigen Test", cost: "25.00", turnaroundTime: "1 hour", accuracyRating: "4.6" },
    { labId: insertedLabs[3].id, testName: "Comprehensive Metabolic Panel", cost: "85.00", turnaroundTime: "8 hours", accuracyRating: "4.9" },
    { labId: insertedLabs[3].id, testName: "Kidney Function Test", cost: "60.00", turnaroundTime: "6 hours", accuracyRating: "4.8" },
    { labId: insertedLabs[3].id, testName: "Complete Urine Analysis", cost: "20.00", turnaroundTime: "2 hours", accuracyRating: "4.7" },
    { labId: insertedLabs[4].id, testName: "Iron Studies", cost: "45.00", turnaroundTime: "12 hours", accuracyRating: "4.5" },
    { labId: insertedLabs[4].id, testName: "Electrolyte Panel", cost: "35.00", turnaroundTime: "4 hours", accuracyRating: "4.6" },
  ];

  await db.insert(labTests).values(testsData);
  console.log(`Inserted ${testsData.length} lab tests`);

  // Seed Consultants
  const consultantsData = [
    { name: "Dr. Priya Sharma", qualification: "MD, DM (Cardiology)", specialization: "Cardiology", yearsExperience: 15, rating: "4.9", consultationFee: "150.00", availableSlots: ["Mon 10:00 AM", "Wed 2:00 PM", "Fri 11:00 AM", "Sat 9:00 AM"], isActive: true },
    { name: "Dr. Rajesh Kumar", qualification: "MD, DM (Neurology)", specialization: "Neurology", yearsExperience: 12, rating: "4.8", consultationFee: "120.00", availableSlots: ["Tue 9:00 AM", "Thu 3:00 PM", "Sat 10:00 AM"], isActive: true },
    { name: "Dr. Meera Patel", qualification: "MD (Pulmonology)", specialization: "Pulmonology", yearsExperience: 10, rating: "4.7", consultationFee: "100.00", availableSlots: ["Mon 2:00 PM", "Wed 10:00 AM", "Fri 4:00 PM"], isActive: true },
    { name: "Dr. Sanjay Reddy", qualification: "MS, MCh (Oncology)", specialization: "Oncology", yearsExperience: 18, rating: "4.9", consultationFee: "200.00", availableSlots: ["Tue 11:00 AM", "Thu 9:00 AM"], isActive: true },
    { name: "Dr. Anjali Mehta", qualification: "MD (Nephrology)", specialization: "Nephrology", yearsExperience: 8, rating: "4.6", consultationFee: "110.00", availableSlots: ["Mon 11:00 AM", "Wed 3:00 PM", "Fri 9:00 AM", "Sat 11:00 AM"], isActive: true },
    { name: "Dr. Vikram Singh", qualification: "MD, DM (Gastroenterology)", specialization: "Gastroenterology", yearsExperience: 14, rating: "4.8", consultationFee: "140.00", availableSlots: ["Mon 3:00 PM", "Wed 11:00 AM", "Fri 10:00 AM"], isActive: true },
  ];

  await db.insert(consultants).values(consultantsData);
  console.log(`Inserted ${consultantsData.length} consultants`);

  // Seed Hospitals
  const hospitalsData = [
    { name: "Apollo Critical Care Center", location: "Mumbai", teamStrength: 45, emergencyResponseTime: "15 minutes", rating: "4.9", icuCapability: true, isActive: true },
    { name: "Fortis Emergency Hospital", location: "Delhi", teamStrength: 38, emergencyResponseTime: "20 minutes", rating: "4.8", icuCapability: true, isActive: true },
    { name: "Max Super Specialty", location: "Bangalore", teamStrength: 52, emergencyResponseTime: "12 minutes", rating: "4.7", icuCapability: true, isActive: true },
    { name: "Medanta Critical Care", location: "Chennai", teamStrength: 30, emergencyResponseTime: "25 minutes", rating: "4.6", icuCapability: true, isActive: true },
  ];

  await db.insert(hospitals).values(hospitalsData);
  console.log(`Inserted ${hospitalsData.length} hospitals`);

  // Seed Critical Care Doctors
  const doctorsData = [
    { name: "Dr. Rakesh Gupta", qualification: "MD (Critical Care), FCCP", yearsExperience: 20, responseTime: "10 minutes", rating: "4.9", isActive: true },
    { name: "Dr. Anita Desai", qualification: "MD (Anesthesiology), FNB (Critical Care)", yearsExperience: 15, responseTime: "15 minutes", rating: "4.8", isActive: true },
    { name: "Dr. Suresh Menon", qualification: "MD (Medicine), IDCCM", yearsExperience: 18, responseTime: "12 minutes", rating: "4.7", isActive: true },
    { name: "Dr. Kavitha Nair", qualification: "MD (Pulmonology), FCCP", yearsExperience: 12, responseTime: "20 minutes", rating: "4.6", isActive: true },
  ];

  await db.insert(criticalCareDoctors).values(doctorsData);
  console.log(`Inserted ${doctorsData.length} critical care doctors`);

  // Seed Referral Hospitals
  const referralHospitalsData = [
    { name: "AIIMS Delhi", location: "Delhi", departments: ["Cardiology", "Neurology", "Nephrology", "Oncology", "ICU"], diagnoses: ["Heart Attack", "Stroke", "Kidney Failure", "Cancer", "Trauma"], supportMechanicalVentilation: true, supportEcmo: true, supportCrrt: true, rating: "4.9", contactPhone: "+91-11-26588500", isActive: true },
    { name: "Tata Memorial Hospital", location: "Mumbai", departments: ["Oncology", "Surgery", "Radiation Therapy", "ICU"], diagnoses: ["Cancer", "Tumor", "Lymphoma", "Leukemia"], supportMechanicalVentilation: true, supportEcmo: false, supportCrrt: true, rating: "4.9", contactPhone: "+91-22-24177000", isActive: true },
    { name: "CMC Vellore", location: "Vellore", departments: ["Cardiology", "Neurology", "Gastroenterology", "Nephrology", "ICU"], diagnoses: ["Heart Disease", "Neurological Disorders", "Liver Disease", "Kidney Disease"], supportMechanicalVentilation: true, supportEcmo: true, supportCrrt: true, rating: "4.8", contactPhone: "+91-416-2281000", isActive: true },
    { name: "NIMHANS", location: "Bangalore", departments: ["Neurology", "Psychiatry", "Neurosurgery", "ICU"], diagnoses: ["Stroke", "Brain Tumor", "Epilepsy", "Mental Health Emergencies"], supportMechanicalVentilation: true, supportEcmo: false, supportCrrt: false, rating: "4.8", contactPhone: "+91-80-26995000", isActive: true },
    { name: "Narayana Health", location: "Bangalore", departments: ["Cardiology", "Cardiac Surgery", "Pediatric Cardiology", "ICU"], diagnoses: ["Heart Attack", "Heart Failure", "Congenital Heart Disease", "Valve Disease"], supportMechanicalVentilation: true, supportEcmo: true, supportCrrt: true, rating: "4.7", contactPhone: "+91-80-71222222", isActive: true },
    { name: "Apollo Hospitals Chennai", location: "Chennai", departments: ["Cardiology", "Oncology", "Orthopedics", "Neurology", "ICU"], diagnoses: ["Heart Disease", "Cancer", "Trauma", "Stroke", "Multi-organ Failure"], supportMechanicalVentilation: true, supportEcmo: true, supportCrrt: true, rating: "4.7", contactPhone: "+91-44-28290200", isActive: true },
  ];

  await db.insert(referralHospitals).values(referralHospitalsData);
  console.log(`Inserted ${referralHospitalsData.length} referral hospitals`);

  // Seed Transport Services
  const transportData = [
    { name: "Apollo Ambulance Services", location: "Mumbai", serviceType: "ALS", transportMode: "road", hasCloudPhysician: true, rating: "4.8", baseCost: "2500.00", isActive: true },
    { name: "LifeLine Emergency Transport", location: "Delhi", serviceType: "ALS", transportMode: "road", hasCloudPhysician: true, rating: "4.7", baseCost: "2200.00", isActive: true },
    { name: "MedFlight India", location: "Mumbai", serviceType: "ALS", transportMode: "air", hasCloudPhysician: true, rating: "4.9", baseCost: "150000.00", isActive: true },
    { name: "QuickCare Ambulance", location: "Bangalore", serviceType: "BLS", transportMode: "road", hasCloudPhysician: false, rating: "4.5", baseCost: "1500.00", isActive: true },
    { name: "CriticalCare Transport", location: "Chennai", serviceType: "ALS", transportMode: "road", hasCloudPhysician: true, rating: "4.6", baseCost: "2000.00", isActive: true },
    { name: "Vellore Emergency Services", location: "Vellore", serviceType: "ALS", transportMode: "road", hasCloudPhysician: false, rating: "4.4", baseCost: "1800.00", isActive: true },
    { name: "SkyMed Air Ambulance", location: "Delhi", serviceType: "ALS", transportMode: "air", hasCloudPhysician: true, rating: "4.8", baseCost: "175000.00", isActive: true },
  ];

  await db.insert(transportServices).values(transportData);
  console.log(`Inserted ${transportData.length} transport services`);

  console.log("Database seeding completed!");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  });
