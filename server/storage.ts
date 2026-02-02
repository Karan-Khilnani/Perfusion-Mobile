import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
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
  type UserRole,
  type ServiceStatus,
} from "@shared/schema";

export interface IStorage {
  // Lab Tests (direct catalog - no providers)
  getLabTests(): Promise<LabTest[]>;
  getActiveLabTests(): Promise<LabTest[]>;
  getLabTestById(id: string): Promise<LabTest | undefined>;
  createLabTest(test: InsertLabTest): Promise<LabTest>;
  updateLabTest(id: string, data: Partial<InsertLabTest>): Promise<LabTest | undefined>;
  updateLabTestStatus(id: string, status: ServiceStatus): Promise<LabTest | undefined>;
  deleteLabTest(id: string): Promise<boolean>;
  
  // Consultants
  getConsultants(): Promise<Consultant[]>;
  getActiveConsultants(): Promise<Consultant[]>;
  getConsultantById(id: string): Promise<Consultant | undefined>;
  createConsultant(consultant: InsertConsultant): Promise<Consultant>;
  updateConsultant(id: string, data: Partial<InsertConsultant>): Promise<Consultant | undefined>;
  updateConsultantStatus(id: string, status: ServiceStatus): Promise<Consultant | undefined>;
  deleteConsultant(id: string): Promise<boolean>;
  getConsultantsByProvider(providerId: string): Promise<Consultant[]>;
  
  // Radiology Modalities
  getRadiologyModalities(): Promise<RadiologyModality[]>;
  getActiveRadiologyModalities(): Promise<RadiologyModality[]>;
  getRadiologyModalityById(id: string): Promise<RadiologyModality | undefined>;
  createRadiologyModality(modality: InsertRadiologyModality): Promise<RadiologyModality>;
  updateRadiologyModality(id: string, data: Partial<InsertRadiologyModality>): Promise<RadiologyModality | undefined>;
  updateRadiologyModalityStatus(id: string, status: ServiceStatus): Promise<RadiologyModality | undefined>;
  deleteRadiologyModality(id: string): Promise<boolean>;
  
  // Hospitals (legacy - kept for data integrity)
  getHospitals(): Promise<Hospital[]>;
  getHospitalById(id: string): Promise<Hospital | undefined>;
  createHospital(hospital: InsertHospital): Promise<Hospital>;
  updateHospital(id: string, data: Partial<InsertHospital>): Promise<Hospital | undefined>;
  deleteHospital(id: string): Promise<boolean>;
  
  // Critical Care Doctors (legacy)
  getCriticalCareDoctors(): Promise<CriticalCareDoctor[]>;
  getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined>;
  createCriticalCareDoctor(doctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor>;
  
  // Referral Hospitals (legacy)
  getReferralHospitals(): Promise<ReferralHospital[]>;
  getReferralHospitalById(id: string): Promise<ReferralHospital | undefined>;
  createReferralHospital(hospital: InsertReferralHospital): Promise<ReferralHospital>;
  
  // Transport Services (legacy)
  getTransportServices(): Promise<TransportService[]>;
  getTransportServiceById(id: string): Promise<TransportService | undefined>;
  getTransportServicesByLocation(location: string): Promise<TransportService[]>;
  createTransportService(service: InsertTransportService): Promise<TransportService>;
  
  // Bookings
  getBookingsByUserId(userId: string): Promise<Booking[]>;
  getBookingById(id: string): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, data: Partial<InsertBooking>): Promise<Booking | undefined>;
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
  
  // Labs (legacy - kept for backward compatibility)
  getLabs(): Promise<(Lab & { tests: LabTest[] })[]>;
  getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined>;
  createLab(lab: InsertLab): Promise<Lab>;
  getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]>;
  updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined>;
  deleteLab(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Lab Tests
  async getLabTests(): Promise<LabTest[]> {
    return await db.select().from(labTests).orderBy(desc(labTests.createdAt));
  }

  async getActiveLabTests(): Promise<LabTest[]> {
    return await db.select().from(labTests).where(eq(labTests.status, "active")).orderBy(labTests.category, labTests.testName);
  }

  async getLabTestById(id: string): Promise<LabTest | undefined> {
    const [test] = await db.select().from(labTests).where(eq(labTests.id, id));
    return test;
  }

  async createLabTest(test: InsertLabTest): Promise<LabTest> {
    const [created] = await db.insert(labTests).values([test as any]).returning();
    return created;
  }

  async updateLabTest(id: string, data: Partial<InsertLabTest>): Promise<LabTest | undefined> {
    const [updated] = await db.update(labTests).set(data as any).where(eq(labTests.id, id)).returning();
    return updated;
  }

  async updateLabTestStatus(id: string, status: ServiceStatus): Promise<LabTest | undefined> {
    const [updated] = await db.update(labTests).set({ status }).where(eq(labTests.id, id)).returning();
    return updated;
  }

  async deleteLabTest(id: string): Promise<boolean> {
    const result = await db.delete(labTests).where(eq(labTests.id, id));
    return true;
  }

  // Consultants
  async getConsultants(): Promise<Consultant[]> {
    return await db.select().from(consultants).orderBy(desc(consultants.createdAt));
  }

  async getActiveConsultants(): Promise<Consultant[]> {
    return await db.select().from(consultants).where(eq(consultants.status, "active")).orderBy(consultants.name);
  }

  async getConsultantById(id: string): Promise<Consultant | undefined> {
    const [consultant] = await db.select().from(consultants).where(eq(consultants.id, id));
    return consultant;
  }

  async createConsultant(consultant: InsertConsultant): Promise<Consultant> {
    const [created] = await db.insert(consultants).values([consultant as any]).returning();
    return created;
  }

  async updateConsultant(id: string, data: Partial<InsertConsultant>): Promise<Consultant | undefined> {
    const [updated] = await db.update(consultants).set(data as any).where(eq(consultants.id, id)).returning();
    return updated;
  }

  async updateConsultantStatus(id: string, status: ServiceStatus): Promise<Consultant | undefined> {
    const [updated] = await db.update(consultants).set({ status }).where(eq(consultants.id, id)).returning();
    return updated;
  }

  async deleteConsultant(id: string): Promise<boolean> {
    await db.delete(consultants).where(eq(consultants.id, id));
    return true;
  }

  async getConsultantsByProvider(providerId: string): Promise<Consultant[]> {
    return await db.select().from(consultants).where(eq(consultants.providerId, providerId));
  }

  // Radiology Modalities
  async getRadiologyModalities(): Promise<RadiologyModality[]> {
    return await db.select().from(radiologyModalities).orderBy(desc(radiologyModalities.createdAt));
  }

  async getActiveRadiologyModalities(): Promise<RadiologyModality[]> {
    return await db.select().from(radiologyModalities).where(eq(radiologyModalities.status, "active")).orderBy(radiologyModalities.name);
  }

  async getRadiologyModalityById(id: string): Promise<RadiologyModality | undefined> {
    const [modality] = await db.select().from(radiologyModalities).where(eq(radiologyModalities.id, id));
    return modality;
  }

  async createRadiologyModality(modality: InsertRadiologyModality): Promise<RadiologyModality> {
    const [created] = await db.insert(radiologyModalities).values([modality as any]).returning();
    return created;
  }

  async updateRadiologyModality(id: string, data: Partial<InsertRadiologyModality>): Promise<RadiologyModality | undefined> {
    const [updated] = await db.update(radiologyModalities).set(data as any).where(eq(radiologyModalities.id, id)).returning();
    return updated;
  }

  async updateRadiologyModalityStatus(id: string, status: ServiceStatus): Promise<RadiologyModality | undefined> {
    const [updated] = await db.update(radiologyModalities).set({ status }).where(eq(radiologyModalities.id, id)).returning();
    return updated;
  }

  async deleteRadiologyModality(id: string): Promise<boolean> {
    await db.delete(radiologyModalities).where(eq(radiologyModalities.id, id));
    return true;
  }

  // Hospitals
  async getHospitals(): Promise<Hospital[]> {
    return await db.select().from(hospitals);
  }

  async getHospitalById(id: string): Promise<Hospital | undefined> {
    const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, id));
    return hospital;
  }

  async createHospital(hospital: InsertHospital): Promise<Hospital> {
    const [created] = await db.insert(hospitals).values(hospital).returning();
    return created;
  }

  async updateHospital(id: string, data: Partial<InsertHospital>): Promise<Hospital | undefined> {
    const [updated] = await db.update(hospitals).set(data).where(eq(hospitals.id, id)).returning();
    return updated;
  }

  async deleteHospital(id: string): Promise<boolean> {
    await db.delete(hospitals).where(eq(hospitals.id, id));
    return true;
  }

  // Critical Care Doctors
  async getCriticalCareDoctors(): Promise<CriticalCareDoctor[]> {
    return await db.select().from(criticalCareDoctors);
  }

  async getCriticalCareDoctorById(id: string): Promise<CriticalCareDoctor | undefined> {
    const [doctor] = await db.select().from(criticalCareDoctors).where(eq(criticalCareDoctors.id, id));
    return doctor;
  }

  async createCriticalCareDoctor(doctor: InsertCriticalCareDoctor): Promise<CriticalCareDoctor> {
    const [created] = await db.insert(criticalCareDoctors).values(doctor).returning();
    return created;
  }

  // Referral Hospitals
  async getReferralHospitals(): Promise<ReferralHospital[]> {
    return await db.select().from(referralHospitals);
  }

  async getReferralHospitalById(id: string): Promise<ReferralHospital | undefined> {
    const [hospital] = await db.select().from(referralHospitals).where(eq(referralHospitals.id, id));
    return hospital;
  }

  async createReferralHospital(hospital: InsertReferralHospital): Promise<ReferralHospital> {
    const [created] = await db.insert(referralHospitals).values(hospital).returning();
    return created;
  }

  // Transport Services
  async getTransportServices(): Promise<TransportService[]> {
    return await db.select().from(transportServices);
  }

  async getTransportServiceById(id: string): Promise<TransportService | undefined> {
    const [service] = await db.select().from(transportServices).where(eq(transportServices.id, id));
    return service;
  }

  async getTransportServicesByLocation(location: string): Promise<TransportService[]> {
    return await db.select().from(transportServices).where(eq(transportServices.location, location));
  }

  async createTransportService(service: InsertTransportService): Promise<TransportService> {
    const [created] = await db.insert(transportServices).values(service).returning();
    return created;
  }

  // Bookings
  async getBookingsByUserId(userId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.createdAt));
  }

  async getBookingById(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    const [created] = await db.insert(bookings).values([booking as any]).returning();
    return created;
  }

  async updateBooking(id: string, data: Partial<InsertBooking>): Promise<Booking | undefined> {
    const [updated] = await db.update(bookings).set({ ...data, updatedAt: new Date() } as any).where(eq(bookings.id, id)).returning();
    return updated;
  }

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | undefined> {
    const [updated] = await db.update(bookings).set({ status, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return updated;
  }

  async getAllBookings(): Promise<Booking[]> {
    return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }

  async getBookingsByProviderId(providerId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.providerId, providerId)).orderBy(desc(bookings.createdAt));
  }

  // Providers
  async getProviders(): Promise<Provider[]> {
    return await db.select().from(providers);
  }

  async getProviderById(id: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider;
  }

  async createProvider(provider: InsertProvider): Promise<Provider> {
    const [created] = await db.insert(providers).values([provider as any]).returning();
    return created;
  }

  async updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined> {
    const [updated] = await db.update(providers).set({ ...data, updatedAt: new Date() } as any).where(eq(providers.id, id)).returning();
    return updated;
  }

  async updateProviderStatus(id: string, status: ProviderStatus, notes?: string): Promise<Provider | undefined> {
    const [updated] = await db.update(providers).set({ 
      verificationStatus: status, 
      verificationNotes: notes, 
      updatedAt: new Date() 
    }).where(eq(providers.id, id)).returning();
    return updated;
  }

  async getProvidersByStatus(status: ProviderStatus): Promise<Provider[]> {
    return await db.select().from(providers).where(eq(providers.verificationStatus, status));
  }

  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserRole(id: string, role: UserRole): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserActive(id: string, isActive: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ isActive }).where(eq(users.id, id)).returning();
    return updated;
  }

  // Labs (legacy)
  async getLabs(): Promise<(Lab & { tests: LabTest[] })[]> {
    const allLabs = await db.select().from(labs);
    const allTests = await db.select().from(labTests);
    return allLabs.map(lab => ({
      ...lab,
      tests: allTests.filter(t => false) // No longer linked
    }));
  }

  async getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined> {
    const [lab] = await db.select().from(labs).where(eq(labs.id, id));
    if (!lab) return undefined;
    return { ...lab, tests: [] };
  }

  async createLab(lab: InsertLab): Promise<Lab> {
    const [created] = await db.insert(labs).values(lab).returning();
    return created;
  }

  async getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]> {
    const providerLabs = await db.select().from(labs).where(eq(labs.providerId, providerId));
    
    // Fetch tests for each lab
    const result = await Promise.all(providerLabs.map(async (lab) => {
      const testsForLab = await db.select().from(labTests).where(eq(labTests.labId, lab.id));
      return { ...lab, tests: testsForLab };
    }));
    
    return result;
  }

  async updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined> {
    const [updated] = await db.update(labs).set(data).where(eq(labs.id, id)).returning();
    return updated;
  }

  async deleteLab(id: string): Promise<boolean> {
    await db.delete(labs).where(eq(labs.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
