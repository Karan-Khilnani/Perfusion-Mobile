import { randomUUID } from "crypto";
import type {
  Lab,
  LabTest,
  Consultant,
  Hospital,
  CriticalCareDoctor,
  Booking,
  InsertLab,
  InsertLabTest,
  InsertConsultant,
  InsertHospital,
  InsertCriticalCareDoctor,
  InsertBooking,
  BookingStatus,
} from "@shared/schema";

export interface IStorage {
  // Labs
  getLabs(): Promise<(Lab & { tests: LabTest[] })[]>;
  getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined>;
  createLab(lab: InsertLab): Promise<Lab>;
  getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]>;
  
  // Lab Tests
  createLabTest(test: InsertLabTest): Promise<LabTest>;
  getTestsByLabId(labId: string): Promise<LabTest[]>;
  
  // Consultants
  getConsultants(): Promise<Consultant[]>;
  getConsultantById(id: string): Promise<Consultant | undefined>;
  createConsultant(consultant: InsertConsultant): Promise<Consultant>;
  
  // Hospitals
  getHospitals(): Promise<Hospital[]>;
  getHospitalById(id: string): Promise<Hospital | undefined>;
  createHospital(hospital: InsertHospital): Promise<Hospital>;
  
  // Critical Care Doctors
  getCriticalCareDoctors(): Promise<CriticalCareDoctor[]>;
  getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined>;
  createCriticalCareDoctor(doctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor>;
  
  // Bookings
  getBookingsByUserId(userId: string): Promise<Booking[]>;
  getBookingById(id: string): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | undefined>;
  getAllBookings(): Promise<Booking[]>;
}

export class MemStorage implements IStorage {
  private labs: Map<string, Lab>;
  private labTests: Map<string, LabTest>;
  private consultants: Map<string, Consultant>;
  private hospitals: Map<string, Hospital>;
  private criticalCareDoctors: Map<string, CriticalCareDoctor>;
  private bookings: Map<string, Booking>;

  constructor() {
    this.labs = new Map();
    this.labTests = new Map();
    this.consultants = new Map();
    this.hospitals = new Map();
    this.criticalCareDoctors = new Map();
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
        consultationFee: "130.00",
        availableSlots: ["Tue 9:00 AM", "Thu 3:00 PM", "Sat 10:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Meera Patel",
        qualification: "MD (Pediatrics), DCH",
        specialization: "Pediatrics",
        yearsExperience: 10,
        rating: "4.7",
        consultationFee: "100.00",
        availableSlots: ["Mon 9:00 AM", "Tue 2:00 PM", "Wed 10:00 AM", "Thu 4:00 PM", "Fri 9:00 AM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Anil Verma",
        qualification: "MS (Orthopedics)",
        specialization: "Orthopedics",
        yearsExperience: 18,
        rating: "4.6",
        consultationFee: "120.00",
        availableSlots: ["Mon 11:00 AM", "Wed 9:00 AM", "Fri 2:00 PM"],
        isActive: true,
      },
      {
        id: randomUUID(),
        providerId: null,
        name: "Dr. Sunita Reddy",
        qualification: "MD (Dermatology)",
        specialization: "Dermatology",
        yearsExperience: 8,
        rating: "4.5",
        consultationFee: "90.00",
        availableSlots: ["Tue 10:00 AM", "Thu 11:00 AM", "Sat 9:00 AM", "Sat 2:00 PM"],
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
}

export const storage = new MemStorage();
