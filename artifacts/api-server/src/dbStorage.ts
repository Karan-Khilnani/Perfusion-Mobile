import { randomUUID } from "crypto";
import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  buildConsultationCaseFileSummaryValues,
  type ConsultationClinicalFields,
} from "./services/consultation-clinical-information";
import {
  labs,
  labTests,
  consultants,
  radiologyModalities,
  hospitals,
  criticalCareDoctors,
  referralHospitals,
  transportServices,
  bookings,
  caseFileSummaries,
  providers,
  users,
  type Lab,
  type LabTest,
  type Consultant,
  type RadiologyModality,
  type Hospital,
  type CriticalCareDoctor,
  type ReferralHospital,
  type TransportService,
  type Booking,
  type Provider,
  type User,
  type InsertLab,
  type InsertLabTest,
  type InsertConsultant,
  type InsertRadiologyModality,
  type InsertHospital,
  type InsertCriticalCareDoctor,
  type InsertReferralHospital,
  type InsertTransportService,
  type InsertBooking,
  type InsertProvider,
  type BookingStatus,
  type ProviderStatus,
} from "@workspace/db";
import type { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // Labs
  async getLabs(): Promise<(Lab & { tests: LabTest[] })[]> {
    const allLabs = await db.select().from(labs).where(eq(labs.isActive, true));
    const allTests = await db.select().from(labTests);
    
    return allLabs.map((lab) => ({
      ...lab,
      tests: allTests.filter((t) => t.labId === lab.id),
    }));
  }

  async getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined> {
    const [lab] = await db.select().from(labs).where(eq(labs.id, id));
    if (!lab) return undefined;
    
    const tests = await db.select().from(labTests).where(eq(labTests.labId, id));
    return { ...lab, tests };
  }

  async createLab(insertLab: InsertLab): Promise<Lab> {
    const [lab] = await db.insert(labs).values(insertLab).returning();
    return lab;
  }

  async getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]> {
    const providerLabs = await db.select().from(labs).where(eq(labs.providerId, providerId));
    
    // For each lab, fetch its tests
    const result = await Promise.all(providerLabs.map(async (lab) => {
      const labTestsForLab = await db.select().from(labTests).where(eq(labTests.labId, lab.id));
      return {
        ...lab,
        tests: labTestsForLab,
      };
    }));
    
    return result;
  }

  async updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined> {
    const [lab] = await db.update(labs).set(data).where(eq(labs.id, id)).returning();
    return lab;
  }

  async deleteLab(id: string): Promise<boolean> {
    const result = await db.update(labs).set({ isActive: false }).where(eq(labs.id, id)).returning();
    return result.length > 0;
  }

  // Lab Tests
  async getLabTests(): Promise<LabTest[]> {
    return db.select().from(labTests).orderBy(desc(labTests.createdAt));
  }

  async getActiveLabTests(): Promise<LabTest[]> {
    return db.select().from(labTests).where(eq(labTests.status, "active")).orderBy(labTests.category, labTests.testName);
  }

  async getLabTestById(id: string): Promise<LabTest | undefined> {
    const [test] = await db.select().from(labTests).where(eq(labTests.id, id));
    return test;
  }

  async createLabTest(insertTest: InsertLabTest): Promise<LabTest> {
    const [test] = await db.insert(labTests).values(insertTest as any).returning();
    return test;
  }

  async getTestsByLabId(labId: string): Promise<LabTest[]> {
    return db.select().from(labTests).where(eq(labTests.labId, labId));
  }

  async updateLabTest(id: string, data: Partial<InsertLabTest>): Promise<LabTest | undefined> {
    const [test] = await db.update(labTests).set(data as any).where(eq(labTests.id, id)).returning();
    return test;
  }

  async updateLabTestStatus(id: string, status: string): Promise<LabTest | undefined> {
    const [test] = await db.update(labTests).set({ status: status as any }).where(eq(labTests.id, id)).returning();
    return test;
  }

  async deleteLabTest(id: string): Promise<boolean> {
    const result = await db.delete(labTests).where(eq(labTests.id, id)).returning();
    return result.length > 0;
  }

  // Consultants
  async getConsultants(): Promise<Consultant[]> {
    return db.select().from(consultants);
  }

  async getActiveConsultants(): Promise<Consultant[]> {
    return db.select().from(consultants).where(eq(consultants.status, "active"));
  }

  async getConsultantById(id: string): Promise<Consultant | undefined> {
    const [consultant] = await db.select().from(consultants).where(eq(consultants.id, id));
    return consultant;
  }

  async createConsultant(insertConsultant: InsertConsultant): Promise<Consultant> {
    const [consultant] = await db.insert(consultants).values(insertConsultant as any).returning();
    return consultant;
  }

  async updateConsultant(id: string, data: Partial<InsertConsultant>): Promise<Consultant | undefined> {
    const [consultant] = await db.update(consultants).set(data as any).where(eq(consultants.id, id)).returning();
    return consultant;
  }

  async updateConsultantStatus(id: string, status: string): Promise<Consultant | undefined> {
    const [consultant] = await db.update(consultants).set({ status: status as any }).where(eq(consultants.id, id)).returning();
    return consultant;
  }

  async deleteConsultant(id: string): Promise<boolean> {
    const result = await db.update(consultants).set({ status: "deleted" as any }).where(eq(consultants.id, id)).returning();
    return result.length > 0;
  }

  async getConsultantsByProvider(providerId: string): Promise<Consultant[]> {
    return db.select().from(consultants).where(eq(consultants.providerId, providerId));
  }

  // Radiology Modalities
  async getRadiologyModalities(): Promise<RadiologyModality[]> {
    return db.select().from(radiologyModalities).orderBy(desc(radiologyModalities.createdAt));
  }

  async getActiveRadiologyModalities(): Promise<RadiologyModality[]> {
    return db.select().from(radiologyModalities).where(eq(radiologyModalities.status, "active")).orderBy(radiologyModalities.name);
  }

  async getRadiologyModalityById(id: string): Promise<RadiologyModality | undefined> {
    const [modality] = await db.select().from(radiologyModalities).where(eq(radiologyModalities.id, id));
    return modality;
  }

  async createRadiologyModality(insertModality: InsertRadiologyModality): Promise<RadiologyModality> {
    const [modality] = await db.insert(radiologyModalities).values(insertModality as any).returning();
    return modality;
  }

  async updateRadiologyModality(id: string, data: Partial<InsertRadiologyModality>): Promise<RadiologyModality | undefined> {
    const [modality] = await db.update(radiologyModalities).set(data as any).where(eq(radiologyModalities.id, id)).returning();
    return modality;
  }

  async updateRadiologyModalityStatus(id: string, status: string): Promise<RadiologyModality | undefined> {
    const [modality] = await db.update(radiologyModalities).set({ status: status as any }).where(eq(radiologyModalities.id, id)).returning();
    return modality;
  }

  async deleteRadiologyModality(id: string): Promise<boolean> {
    const result = await db.delete(radiologyModalities).where(eq(radiologyModalities.id, id)).returning();
    return result.length > 0;
  }

  // Hospitals
  async getHospitals(): Promise<Hospital[]> {
    return db.select().from(hospitals).where(eq(hospitals.isActive, true));
  }

  async getHospitalById(id: string): Promise<Hospital | undefined> {
    const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, id));
    return hospital;
  }

  async createHospital(insertHospital: InsertHospital): Promise<Hospital> {
    const [hospital] = await db.insert(hospitals).values(insertHospital).returning();
    return hospital;
  }

  async updateHospital(id: string, data: Partial<InsertHospital>): Promise<Hospital | undefined> {
    const [hospital] = await db.update(hospitals).set(data).where(eq(hospitals.id, id)).returning();
    return hospital;
  }

  async deleteHospital(id: string): Promise<boolean> {
    const result = await db.update(hospitals).set({ isActive: false }).where(eq(hospitals.id, id)).returning();
    return result.length > 0;
  }

  // Critical Care Doctors
  async getCriticalCareDoctors(): Promise<CriticalCareDoctor[]> {
    return db.select().from(criticalCareDoctors).where(eq(criticalCareDoctors.isActive, true));
  }

  async getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined> {
    const [doctor] = await db.select().from(criticalCareDoctors).where(eq(criticalCareDoctors.id, id));
    return doctor;
  }

  async createCriticalCareDoctor(insertDoctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor> {
    const [doctor] = await db.insert(criticalCareDoctors).values(insertDoctor).returning();
    return doctor;
  }

  // Referral Hospitals
  async getReferralHospitals(): Promise<ReferralHospital[]> {
    return db.select().from(referralHospitals).where(eq(referralHospitals.isActive, true));
  }

  async getReferralHospitalById(id: string): Promise<ReferralHospital | undefined> {
    const [hospital] = await db.select().from(referralHospitals).where(eq(referralHospitals.id, id));
    return hospital;
  }

  async createReferralHospital(insertHospital: InsertReferralHospital): Promise<ReferralHospital> {
    const [hospital] = await db.insert(referralHospitals).values(insertHospital).returning();
    return hospital;
  }

  // Transport Services
  async getTransportServices(): Promise<TransportService[]> {
    return db.select().from(transportServices).where(eq(transportServices.isActive, true));
  }

  async getTransportServiceById(id: string): Promise<TransportService | undefined> {
    const [service] = await db.select().from(transportServices).where(eq(transportServices.id, id));
    return service;
  }

  async getTransportServicesByLocation(location: string): Promise<TransportService[]> {
    const allServices = await db.select().from(transportServices).where(eq(transportServices.isActive, true));
    return allServices.filter(
      (s) => s.location.toLowerCase() === location.toLowerCase() || 
             s.location.toLowerCase().includes(location.toLowerCase())
    );
  }

  async createTransportService(insertService: InsertTransportService): Promise<TransportService> {
    const [service] = await db.insert(transportServices).values(insertService).returning();
    return service;
  }

  // Bookings
  async getBookingsByUserId(userId: string): Promise<Booking[]> {
    return db.select().from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt));
  }

  async getBookingById(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(insertBooking as any).returning();
    return booking;
  }

  async createConsultationBooking(insertBooking: InsertBooking, clinicalFields: ConsultationClinicalFields): Promise<Booking> {
    return db.transaction(async (tx) => {
      const [booking] = await tx.insert(bookings).values(insertBooking as any).returning();
      await tx.insert(caseFileSummaries).values({
        id: randomUUID(),
        bookingId: booking.id,
        ...buildConsultationCaseFileSummaryValues(booking, clinicalFields),
      });
      return booking;
    });
  }

  async updateBooking(id: string, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings)
      .set({ status, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async getAllBookings(): Promise<Booking[]> {
    return db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }

  async getBookingsByProviderId(providerId: string): Promise<Booking[]> {
    return db.select().from(bookings)
      .where(eq(bookings.providerId, providerId))
      .orderBy(desc(bookings.createdAt));
  }

  // Providers
  async getProviders(): Promise<Provider[]> {
    return db.select().from(providers);
  }

  async getProviderById(id: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider;
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const [provider] = await db.insert(providers).values(insertProvider as any).returning();
    return provider;
  }

  async updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined> {
    const [provider] = await db.update(providers)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(providers.id, id))
      .returning();
    return provider;
  }

  async updateProviderStatus(id: string, status: ProviderStatus, notes?: string): Promise<Provider | undefined> {
    const [provider] = await db.update(providers)
      .set({ verificationStatus: status, verificationNotes: notes, updatedAt: new Date() })
      .where(eq(providers.id, id))
      .returning();
    return provider;
  }

  async getProvidersByStatus(status: ProviderStatus): Promise<Provider[]> {
    return db.select().from(providers).where(eq(providers.verificationStatus, status));
  }

  // Users
  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserRole(id: string, role: "care_seeker" | "provider" | "admin"): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserActive(id: string, isActive: boolean): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}

export const dbStorage = new DatabaseStorage();
