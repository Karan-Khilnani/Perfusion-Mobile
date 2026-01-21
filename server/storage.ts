import { randomUUID } from "crypto";
import type {
  Lab,
  LabTest,
  Consultant,
  Hospital,
  CriticalCareDoctor,
  ReferralHospital,
  TransportService,
  Booking,
  Provider,
  User,
  InsertLab,
  InsertLabTest,
  InsertConsultant,
  InsertHospital,
  InsertCriticalCareDoctor,
  InsertReferralHospital,
  InsertTransportService,
  InsertBooking,
  InsertProvider,
  BookingStatus,
  ProviderStatus,
  UserRole,
} from "@shared/schema";

export interface IStorage {
  // Labs
  getLabs(): Promise<(Lab & { tests: LabTest[] })[]>;
  getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined>;
  createLab(lab: InsertLab): Promise<Lab>;
  getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]>;
  updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined>;
  deleteLab(id: string): Promise<boolean>;
  
  // Lab Tests
  createLabTest(test: InsertLabTest): Promise<LabTest>;
  getTestsByLabId(labId: string): Promise<LabTest[]>;
  updateLabTest(id: string, data: Partial<InsertLabTest>): Promise<LabTest | undefined>;
  deleteLabTest(id: string): Promise<boolean>;
  
  // Consultants
  getConsultants(): Promise<Consultant[]>;
  getConsultantById(id: string): Promise<Consultant | undefined>;
  createConsultant(consultant: InsertConsultant): Promise<Consultant>;
  updateConsultant(id: string, data: Partial<InsertConsultant>): Promise<Consultant | undefined>;
  deleteConsultant(id: string): Promise<boolean>;
  getConsultantsByProvider(providerId: string): Promise<Consultant[]>;
  
  // Hospitals
  getHospitals(): Promise<Hospital[]>;
  getHospitalById(id: string): Promise<Hospital | undefined>;
  createHospital(hospital: InsertHospital): Promise<Hospital>;
  updateHospital(id: string, data: Partial<InsertHospital>): Promise<Hospital | undefined>;
  deleteHospital(id: string): Promise<boolean>;
  
  // Critical Care Doctors
  getCriticalCareDoctors(): Promise<CriticalCareDoctor[]>;
  getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined>;
  createCriticalCareDoctor(doctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor>;
  
  // Referral Hospitals
  getReferralHospitals(): Promise<ReferralHospital[]>;
  getReferralHospitalById(id: string): Promise<ReferralHospital | undefined>;
  createReferralHospital(hospital: InsertReferralHospital): Promise<ReferralHospital>;
  
  // Transport Services
  getTransportServices(): Promise<TransportService[]>;
  getTransportServiceById(id: string): Promise<TransportService | undefined>;
  getTransportServicesByLocation(location: string): Promise<TransportService[]>;
  createTransportService(service: InsertTransportService): Promise<TransportService>;
  
  // Bookings
  getBookingsByUserId(userId: string): Promise<Booking[]>;
  getBookingById(id: string): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | undefined>;
  getAllBookings(): Promise<Booking[]>;
  getBookingsByProviderId(providerId: string): Promise<Booking[]>;
  
  // Providers
  getProviders(): Promise<Provider[]>;
  getProviderById(id: string): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined>;
  updateProviderStatus(id: string, status: ProviderStatus, notes?: string): Promise<Provider | undefined>;
  getProvidersByStatus(status: ProviderStatus): Promise<Provider[]>;
  
  // Users
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  updateUserRole(id: string, role: UserRole): Promise<User | undefined>;
  updateUserActive(id: string, isActive: boolean): Promise<User | undefined>;
}

export class MemStorage implements IStorage {
  private labs: Map<string, Lab>;
  private labTests: Map<string, LabTest>;
  private consultants: Map<string, Consultant>;
  private hospitals: Map<string, Hospital>;
  private criticalCareDoctors: Map<string, CriticalCareDoctor>;
  private referralHospitals: Map<string, ReferralHospital>;
  private transportServices: Map<string, TransportService>;
  private bookings: Map<string, Booking>;

  constructor() {
    this.labs = new Map();
    this.labTests = new Map();
    this.consultants = new Map();
    this.hospitals = new Map();
    this.criticalCareDoctors = new Map();
    this.referralHospitals = new Map();
    this.transportServices = new Map();
    this.bookings = new Map();
    
    this.seedData();
  }

  private seedData() {
    // Seed Labs
    const labsData: (Lab & { testsData: Omit<InsertLabTest, "labId">[] })[] = [
      {
        id: randomUUID(),
        providerId: null,
        name: "HealthFirst Diagnostics",
        location: "Mumbai",
        description: "State-of-the-art diagnostic center with 24/7 service",
        rating: "4.8",
        isActive: true,
        testsData: [
          { testName: "Complete Blood Count (CBC)", cost: "35.00", turnaroundTime: "4 hours", accuracyRating: "4.9" },
          { testName: "Lipid Profile", cost: "55.00", turnaroundTime: "6 hours", accuracyRating: "4.8" },
          { testName: "Liver Function Test", cost: "65.00", turnaroundTime: "8 hours", accuracyRating: "4.7" },
        ],
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "MedLab Plus",
        location: "Delhi",
        description: "Trusted diagnostics with home sample collection",
        rating: "4.6",
        isActive: true,
        testsData: [
          { testName: "Thyroid Profile (T3, T4, TSH)", cost: "45.00", turnaroundTime: "12 hours", accuracyRating: "4.8" },
          { testName: "HbA1c Test", cost: "40.00", turnaroundTime: "6 hours", accuracyRating: "4.9" },
          { testName: "Vitamin D Test", cost: "50.00", turnaroundTime: "24 hours", accuracyRating: "4.6" },
        ],
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "QuickDiagnostics",
        location: "Bangalore",
        description: "Fast and accurate results for urgent cases",
        rating: "4.5",
        isActive: true,
        testsData: [
          { testName: "COVID-19 RT-PCR", cost: "75.00", turnaroundTime: "6 hours", accuracyRating: "4.9" },
          { testName: "Dengue NS1 Antigen", cost: "30.00", turnaroundTime: "2 hours", accuracyRating: "4.7" },
          { testName: "Malaria Antigen Test", cost: "25.00", turnaroundTime: "1 hour", accuracyRating: "4.6" },
        ],
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Premier Path Labs",
        location: "Chennai",
        description: "NABL accredited with international quality standards",
        rating: "4.9",
        isActive: true,
        testsData: [
          { testName: "Comprehensive Metabolic Panel", cost: "85.00", turnaroundTime: "8 hours", accuracyRating: "4.9" },
          { testName: "Kidney Function Test", cost: "60.00", turnaroundTime: "6 hours", accuracyRating: "4.8" },
          { testName: "Complete Urine Analysis", cost: "20.00", turnaroundTime: "2 hours", accuracyRating: "4.7" },
        ],
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "CityPath Diagnostics",
        location: "Hyderabad",
        description: "Affordable testing with quality assurance",
        rating: "4.4",
        isActive: true,
        testsData: [
          { testName: "Iron Studies", cost: "45.00", turnaroundTime: "12 hours", accuracyRating: "4.5" },
          { testName: "Electrolyte Panel", cost: "35.00", turnaroundTime: "4 hours", accuracyRating: "4.6" },
        ],
      },
    ];

    labsData.forEach((labData) => {
      const { testsData, ...lab } = labData;
      this.labs.set(lab.id, lab);
      
      testsData.forEach((testData) => {
        const test: LabTest = {
          id: randomUUID(),
          labId: lab.id,
          ...testData,
        };
        this.labTests.set(test.id, test);
      });
    });

    // Seed Consultants
    const consultantsData: Consultant[] = [
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Priya Sharma",
        qualification: "MD, DM (Cardiology)",
        specialization: "Cardiology",
        yearsExperience: 15,
        rating: "4.9",
        consultationFee: "150.00",
        availableSlots: ["Mon 10:00 AM", "Wed 2:00 PM", "Fri 11:00 AM", "Sat 9:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Rajesh Kumar",
        qualification: "MD, DM (Neurology)",
        specialization: "Neurology",
        yearsExperience: 12,
        rating: "4.8",
        consultationFee: "120.00",
        availableSlots: ["Tue 9:00 AM", "Thu 3:00 PM", "Sat 10:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Meera Patel",
        qualification: "MD (Pulmonology)",
        specialization: "Pulmonology",
        yearsExperience: 10,
        rating: "4.7",
        consultationFee: "100.00",
        availableSlots: ["Mon 2:00 PM", "Wed 10:00 AM", "Fri 4:00 PM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Sanjay Reddy",
        qualification: "MS, MCh (Oncology)",
        specialization: "Oncology",
        yearsExperience: 18,
        rating: "4.9",
        consultationFee: "200.00",
        availableSlots: ["Tue 11:00 AM", "Thu 9:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Anjali Mehta",
        qualification: "MD (Nephrology)",
        specialization: "Nephrology",
        yearsExperience: 8,
        rating: "4.6",
        consultationFee: "110.00",
        availableSlots: ["Mon 11:00 AM", "Wed 3:00 PM", "Fri 9:00 AM", "Sat 11:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Vikram Singh",
        qualification: "MD, DM (Gastroenterology)",
        specialization: "Gastroenterology",
        yearsExperience: 14,
        rating: "4.8",
        consultationFee: "140.00",
        availableSlots: ["Mon 3:00 PM", "Wed 11:00 AM", "Fri 10:00 AM"],
        isActive: true,
      },
    ];

    consultantsData.forEach((consultant) => {
      this.consultants.set(consultant.id, consultant);
    });

    // Seed Hospitals
    const hospitalsData: Hospital[] = [
      {
        id: randomUUID(),
        providerId: null,
        name: "Apollo Critical Care Center",
        location: "Mumbai",
        teamStrength: 45,
        emergencyResponseTime: "15 minutes",
        rating: "4.9",
        icuCapability: true,
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Fortis Emergency Hospital",
        location: "Delhi",
        teamStrength: 38,
        emergencyResponseTime: "20 minutes",
        rating: "4.8",
        icuCapability: true,
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Max Super Specialty",
        location: "Bangalore",
        teamStrength: 52,
        emergencyResponseTime: "12 minutes",
        rating: "4.7",
        icuCapability: true,
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Medanta Critical Care",
        location: "Chennai",
        teamStrength: 30,
        emergencyResponseTime: "25 minutes",
        rating: "4.6",
        icuCapability: true,
        isActive: true,
      },
    ];

    hospitalsData.forEach((hospital) => {
      this.hospitals.set(hospital.id, hospital);
    });

    // Seed Critical Care Doctors
    const criticalCareDoctorsData: CriticalCareDoctor[] = [
      {
        id: randomUUID(),
        hospitalId: null,
        name: "Dr. Rakesh Gupta",
        qualification: "MD (Critical Care), FCCP",
        yearsExperience: 20,
        responseTime: "10 minutes",
        rating: "4.9",
        isActive: true,
      },
      {
        id: randomUUID(),
        hospitalId: null,
        name: "Dr. Anita Desai",
        qualification: "MD (Anesthesiology), FNB (Critical Care)",
        yearsExperience: 15,
        responseTime: "15 minutes",
        rating: "4.8",
        isActive: true,
      },
      {
        id: randomUUID(),
        hospitalId: null,
        name: "Dr. Suresh Menon",
        qualification: "MD (Medicine), IDCCM",
        yearsExperience: 18,
        responseTime: "12 minutes",
        rating: "4.7",
        isActive: true,
      },
      {
        id: randomUUID(),
        hospitalId: null,
        name: "Dr. Kavitha Nair",
        qualification: "MD (Pulmonology), FCCP",
        yearsExperience: 12,
        responseTime: "20 minutes",
        rating: "4.6",
        isActive: true,
      },
    ];

    criticalCareDoctorsData.forEach((doctor) => {
      this.criticalCareDoctors.set(doctor.id, doctor);
    });

    // Seed Referral Hospitals
    const referralHospitalsData: ReferralHospital[] = [
      {
        id: randomUUID(),
        name: "AIIMS Delhi",
        location: "Delhi",
        departments: ["Cardiology", "Neurology", "Nephrology", "Oncology", "ICU"],
        diagnoses: ["Heart Attack", "Stroke", "Kidney Failure", "Cancer", "Trauma"],
        supportMechanicalVentilation: true,
        supportEcmo: true,
        supportCrrt: true,
        rating: "4.9",
        contactPhone: "+91-11-26588500",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Tata Memorial Hospital",
        location: "Mumbai",
        departments: ["Oncology", "Surgery", "Radiation Therapy", "ICU"],
        diagnoses: ["Cancer", "Tumor", "Lymphoma", "Leukemia"],
        supportMechanicalVentilation: true,
        supportEcmo: false,
        supportCrrt: true,
        rating: "4.9",
        contactPhone: "+91-22-24177000",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "CMC Vellore",
        location: "Vellore",
        departments: ["Cardiology", "Neurology", "Gastroenterology", "Nephrology", "ICU"],
        diagnoses: ["Heart Disease", "Neurological Disorders", "Liver Disease", "Kidney Disease"],
        supportMechanicalVentilation: true,
        supportEcmo: true,
        supportCrrt: true,
        rating: "4.8",
        contactPhone: "+91-416-2281000",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "NIMHANS",
        location: "Bangalore",
        departments: ["Neurology", "Psychiatry", "Neurosurgery", "ICU"],
        diagnoses: ["Stroke", "Brain Tumor", "Epilepsy", "Mental Health Emergencies"],
        supportMechanicalVentilation: true,
        supportEcmo: false,
        supportCrrt: false,
        rating: "4.8",
        contactPhone: "+91-80-26995000",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Narayana Health",
        location: "Bangalore",
        departments: ["Cardiology", "Cardiac Surgery", "Pediatric Cardiology", "ICU"],
        diagnoses: ["Heart Attack", "Heart Failure", "Congenital Heart Disease", "Valve Disease"],
        supportMechanicalVentilation: true,
        supportEcmo: true,
        supportCrrt: true,
        rating: "4.7",
        contactPhone: "+91-80-71222222",
        isActive: true,
      },
      {
        id: randomUUID(),
        name: "Apollo Hospitals Chennai",
        location: "Chennai",
        departments: ["Cardiology", "Oncology", "Orthopedics", "Neurology", "ICU"],
        diagnoses: ["Heart Disease", "Cancer", "Trauma", "Stroke", "Multi-organ Failure"],
        supportMechanicalVentilation: true,
        supportEcmo: true,
        supportCrrt: true,
        rating: "4.7",
        contactPhone: "+91-44-28290200",
        isActive: true,
      },
    ];

    referralHospitalsData.forEach((hospital) => {
      this.referralHospitals.set(hospital.id, hospital);
    });

    // Seed Transport Services
    const transportServicesData: TransportService[] = [
      {
        id: randomUUID(),
        providerId: null,
        name: "Apollo Ambulance Services",
        location: "Mumbai",
        serviceType: "ALS",
        transportMode: "road",
        hasCloudPhysician: true,
        rating: "4.8",
        baseCost: "2500.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "LifeLine Emergency Transport",
        location: "Delhi",
        serviceType: "ALS",
        transportMode: "road",
        hasCloudPhysician: true,
        rating: "4.7",
        baseCost: "2200.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "MedFlight India",
        location: "Mumbai",
        serviceType: "ALS",
        transportMode: "air",
        hasCloudPhysician: true,
        rating: "4.9",
        baseCost: "150000.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "QuickCare Ambulance",
        location: "Bangalore",
        serviceType: "BLS",
        transportMode: "road",
        hasCloudPhysician: false,
        rating: "4.5",
        baseCost: "1500.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "CriticalCare Transport",
        location: "Chennai",
        serviceType: "ALS",
        transportMode: "road",
        hasCloudPhysician: true,
        rating: "4.6",
        baseCost: "2000.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Vellore Emergency Services",
        location: "Vellore",
        serviceType: "ALS",
        transportMode: "road",
        hasCloudPhysician: false,
        rating: "4.4",
        baseCost: "1800.00",
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "SkyMed Air Ambulance",
        location: "Delhi",
        serviceType: "ALS",
        transportMode: "air",
        hasCloudPhysician: true,
        rating: "4.8",
        baseCost: "175000.00",
        isActive: true,
      },
    ];

    transportServicesData.forEach((service) => {
      this.transportServices.set(service.id, service);
    });
  }

  // Labs
  async getLabs(): Promise<(Lab & { tests: LabTest[] })[]> {
    const labs = Array.from(this.labs.values());
    return labs.map((lab) => ({
      ...lab,
      tests: Array.from(this.labTests.values()).filter((t) => t.labId === lab.id),
    }));
  }

  async getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined> {
    const lab = this.labs.get(id);
    if (!lab) return undefined;
    return {
      ...lab,
      tests: Array.from(this.labTests.values()).filter((t) => t.labId === lab.id),
    };
  }

  async createLab(insertLab: InsertLab): Promise<Lab> {
    const id = randomUUID();
    const lab: Lab = { ...insertLab, id };
    this.labs.set(id, lab);
    return lab;
  }

  async getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]> {
    const labs = Array.from(this.labs.values()).filter((l) => l.providerId === providerId);
    return labs.map((lab) => ({
      ...lab,
      tests: Array.from(this.labTests.values()).filter((t) => t.labId === lab.id),
    }));
  }

  // Lab Tests
  async createLabTest(insertTest: InsertLabTest): Promise<LabTest> {
    const id = randomUUID();
    const test: LabTest = { ...insertTest, id };
    this.labTests.set(id, test);
    return test;
  }

  async getTestsByLabId(labId: string): Promise<LabTest[]> {
    return Array.from(this.labTests.values()).filter((t) => t.labId === labId);
  }

  // Consultants
  async getConsultants(): Promise<Consultant[]> {
    return Array.from(this.consultants.values());
  }

  async getConsultantById(id: string): Promise<Consultant | undefined> {
    return this.consultants.get(id);
  }

  async createConsultant(insertConsultant: InsertConsultant): Promise<Consultant> {
    const id = randomUUID();
    const consultant: Consultant = { ...insertConsultant, id };
    this.consultants.set(id, consultant);
    return consultant;
  }

  // Hospitals
  async getHospitals(): Promise<Hospital[]> {
    return Array.from(this.hospitals.values());
  }

  async getHospitalById(id: string): Promise<Hospital | undefined> {
    return this.hospitals.get(id);
  }

  async createHospital(insertHospital: InsertHospital): Promise<Hospital> {
    const id = randomUUID();
    const hospital: Hospital = { ...insertHospital, id };
    this.hospitals.set(id, hospital);
    return hospital;
  }

  // Critical Care Doctors
  async getCriticalCareDoctors(): Promise<CriticalCareDoctor[]> {
    return Array.from(this.criticalCareDoctors.values());
  }

  async getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined> {
    return this.criticalCareDoctors.get(id);
  }

  async createCriticalCareDoctor(insertDoctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor> {
    const id = randomUUID();
    const doctor: CriticalCareDoctor = { ...insertDoctor, id };
    this.criticalCareDoctors.set(id, doctor);
    return doctor;
  }

  // Referral Hospitals
  async getReferralHospitals(): Promise<ReferralHospital[]> {
    return Array.from(this.referralHospitals.values());
  }

  async getReferralHospitalById(id: string): Promise<ReferralHospital | undefined> {
    return this.referralHospitals.get(id);
  }

  async createReferralHospital(insertHospital: InsertReferralHospital): Promise<ReferralHospital> {
    const id = randomUUID();
    const hospital: ReferralHospital = { ...insertHospital, id };
    this.referralHospitals.set(id, hospital);
    return hospital;
  }

  // Transport Services
  async getTransportServices(): Promise<TransportService[]> {
    return Array.from(this.transportServices.values());
  }

  async getTransportServiceById(id: string): Promise<TransportService | undefined> {
    return this.transportServices.get(id);
  }

  async getTransportServicesByLocation(location: string): Promise<TransportService[]> {
    return Array.from(this.transportServices.values()).filter(
      (s) => s.location.toLowerCase() === location.toLowerCase() || s.location.toLowerCase().includes(location.toLowerCase())
    );
  }

  async createTransportService(insertService: InsertTransportService): Promise<TransportService> {
    const id = randomUUID();
    const service: TransportService = { ...insertService, id };
    this.transportServices.set(id, service);
    return service;
  }

  // Bookings
  async getBookingsByUserId(userId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values())
      .filter((b) => b.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getBookingById(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const now = new Date();
    const booking: Booking = {
      ...insertBooking,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    
    const updated: Booking = {
      ...booking,
      status,
      updatedAt: new Date(),
    };
    this.bookings.set(id, updated);
    return updated;
  }

  async getAllBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getBookingsByProviderId(providerId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values())
      .filter((b) => b.serviceId === providerId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  // Additional methods for interface compliance
  async updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined> {
    const lab = this.labs.get(id);
    if (!lab) return undefined;
    const updated = { ...lab, ...data };
    this.labs.set(id, updated);
    return updated;
  }

  async deleteLab(id: string): Promise<boolean> {
    const lab = this.labs.get(id);
    if (!lab) return false;
    lab.isActive = false;
    this.labs.set(id, lab);
    return true;
  }

  async updateLabTest(id: string, data: Partial<InsertLabTest>): Promise<LabTest | undefined> {
    const test = this.labTests.get(id);
    if (!test) return undefined;
    const updated = { ...test, ...data };
    this.labTests.set(id, updated);
    return updated;
  }

  async deleteLabTest(id: string): Promise<boolean> {
    return this.labTests.delete(id);
  }

  async updateConsultant(id: string, data: Partial<InsertConsultant>): Promise<Consultant | undefined> {
    const consultant = this.consultants.get(id);
    if (!consultant) return undefined;
    const updated = { ...consultant, ...data };
    this.consultants.set(id, updated);
    return updated;
  }

  async deleteConsultant(id: string): Promise<boolean> {
    const consultant = this.consultants.get(id);
    if (!consultant) return false;
    consultant.isActive = false;
    this.consultants.set(id, consultant);
    return true;
  }

  async getConsultantsByProvider(providerId: string): Promise<Consultant[]> {
    return Array.from(this.consultants.values()).filter((c) => c.providerId === providerId);
  }

  async updateHospital(id: string, data: Partial<InsertHospital>): Promise<Hospital | undefined> {
    const hospital = this.hospitals.get(id);
    if (!hospital) return undefined;
    const updated = { ...hospital, ...data };
    this.hospitals.set(id, updated);
    return updated;
  }

  async deleteHospital(id: string): Promise<boolean> {
    const hospital = this.hospitals.get(id);
    if (!hospital) return false;
    hospital.isActive = false;
    this.hospitals.set(id, hospital);
    return true;
  }

  // Provider methods - stub implementations for MemStorage
  async getProviders(): Promise<Provider[]> {
    return [];
  }

  async getProviderById(id: string): Promise<Provider | undefined> {
    return undefined;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    return undefined;
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    throw new Error("Provider operations require database storage");
  }

  async updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined> {
    return undefined;
  }

  async updateProviderStatus(id: string, status: ProviderStatus, notes?: string): Promise<Provider | undefined> {
    return undefined;
  }

  async getProvidersByStatus(status: ProviderStatus): Promise<Provider[]> {
    return [];
  }

  // User methods - stub implementations for MemStorage
  async getUsers(): Promise<User[]> {
    return [];
  }

  async getUserById(id: string): Promise<User | undefined> {
    return undefined;
  }

  async updateUserRole(id: string, role: UserRole): Promise<User | undefined> {
    return undefined;
  }

  async updateUserActive(id: string, isActive: boolean): Promise<User | undefined> {
    return undefined;
  }
}

// Use database storage for production
import { dbStorage } from "./dbStorage";
export const storage: IStorage = dbStorage;
