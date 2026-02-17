import { eq, and, desc, gte, lte, or, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  labs,
  labTests,
  consultants,
  radiologyModalities,
  providerLabTests,
  suggestedLabTests,
  providerModalities,
  suggestedModalities,
  hospitals,
  criticalCareDoctors,
  referralHospitals,
  transportServices,
  bookings,
  providers,
  users,
  platformSettings,
  auditLog,
  type Lab,
  type LabTest,
  type Consultant,
  type RadiologyModality,
  type ProviderLabTest,
  type SuggestedLabTest,
  type ProviderModality,
  type SuggestedModality,
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
  type InsertProviderLabTest,
  type InsertSuggestedLabTest,
  type InsertProviderModality,
  type InsertSuggestedModality,
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
  type SuggestionStatus,
  type PlatformSetting,
  type InsertPlatformSetting,
  type AuditLog,
  type InsertAuditLog,
  type PaymentStatus,
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
  
  // Provider Lab Tests (junction table)
  getProviderLabTests(): Promise<ProviderLabTest[]>;
  getProviderLabTestsByProvider(providerId: string): Promise<ProviderLabTest[]>;
  getProviderLabTestsByTest(labTestId: string): Promise<ProviderLabTest[]>;
  getEnabledProviderForTest(labTestId: string): Promise<ProviderLabTest | undefined>;
  createProviderLabTest(data: InsertProviderLabTest): Promise<ProviderLabTest>;
  updateProviderLabTest(id: string, data: Partial<InsertProviderLabTest>): Promise<ProviderLabTest | undefined>;
  deleteProviderLabTest(id: string): Promise<boolean>;
  
  // Suggested Lab Tests
  getSuggestedLabTests(): Promise<SuggestedLabTest[]>;
  getSuggestedLabTestsByProvider(providerId: string): Promise<SuggestedLabTest[]>;
  getPendingSuggestedLabTests(): Promise<SuggestedLabTest[]>;
  createSuggestedLabTest(data: InsertSuggestedLabTest): Promise<SuggestedLabTest>;
  updateSuggestedLabTestStatus(id: string, status: SuggestionStatus, adminNotes?: string): Promise<SuggestedLabTest | undefined>;
  
  // Provider Modalities (junction table)
  getProviderModalities(): Promise<ProviderModality[]>;
  getProviderModalitiesByProvider(providerId: string): Promise<ProviderModality[]>;
  getProviderModalitiesByModality(modalityId: string): Promise<ProviderModality[]>;
  getEnabledProviderForModality(modalityId: string): Promise<ProviderModality | undefined>;
  createProviderModality(data: InsertProviderModality): Promise<ProviderModality>;
  updateProviderModality(id: string, data: Partial<InsertProviderModality>): Promise<ProviderModality | undefined>;
  deleteProviderModality(id: string): Promise<boolean>;
  
  // Suggested Modalities
  getSuggestedModalities(): Promise<SuggestedModality[]>;
  getSuggestedModalitiesByProvider(providerId: string): Promise<SuggestedModality[]>;
  getPendingSuggestedModalities(): Promise<SuggestedModality[]>;
  createSuggestedModality(data: InsertSuggestedModality): Promise<SuggestedModality>;
  updateSuggestedModalityStatus(id: string, status: SuggestionStatus, adminNotes?: string): Promise<SuggestedModality | undefined>;
  
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
  
  // Registration & Service Approvals
  getPendingRegistrations(): Promise<User[]>;
  updateUserApproval(id: string, status: "approved" | "rejected", notes?: string): Promise<User | undefined>;
  getPendingLabs(): Promise<Lab[]>;
  getPendingConsultants(): Promise<Consultant[]>;
  getPendingProviderLabTests(): Promise<ProviderLabTest[]>;
  getPendingProviderModalities(): Promise<ProviderModality[]>;
  updateLabApproval(id: string, status: "approved" | "rejected"): Promise<Lab | undefined>;
  updateConsultantApproval(id: string, status: "approved" | "rejected"): Promise<Consultant | undefined>;
  updateProviderLabTestApproval(id: string, status: "approved" | "rejected"): Promise<ProviderLabTest | undefined>;
  updateProviderModalityApproval(id: string, status: "approved" | "rejected"): Promise<ProviderModality | undefined>;
  
  // Labs (legacy - kept for backward compatibility)
  getLabs(): Promise<(Lab & { tests: LabTest[] })[]>;
  getLabById(id: string): Promise<(Lab & { tests: LabTest[] }) | undefined>;
  createLab(lab: InsertLab): Promise<Lab>;
  getLabsByProvider(providerId: string): Promise<(Lab & { tests: LabTest[] })[]>;
  updateLab(id: string, data: Partial<InsertLab>): Promise<Lab | undefined>;
  deleteLab(id: string): Promise<boolean>;

  // User update (generic)
  updateUser(id: string, data: Partial<any>): Promise<User | undefined>;

  // Platform Settings
  getPlatformSetting(key: string): Promise<PlatformSetting | undefined>;
  upsertPlatformSetting(key: string, value: string): Promise<PlatformSetting>;

  // Audit Log
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { entityType?: string; entityId?: string; userId?: string }): Promise<AuditLog[]>;

  // Billing
  getBookingsByDateRange(startDate: Date, endDate: Date, filters?: { userId?: string; providerId?: string; paymentStatus?: string }): Promise<Booking[]>;
  recordPayment(bookingId: string, amount: number, method: string): Promise<Booking | undefined>;
  getOverdueBookings(): Promise<Booking[]>;
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
    return await db.select().from(consultants)
      .where(and(eq(consultants.status, "active"), eq(consultants.approvalStatus, "approved")))
      .orderBy(consultants.name);
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

  // Provider Lab Tests
  async getProviderLabTests(): Promise<ProviderLabTest[]> {
    return await db.select().from(providerLabTests).orderBy(desc(providerLabTests.createdAt));
  }

  async getProviderLabTestsByProvider(providerId: string): Promise<ProviderLabTest[]> {
    return await db.select().from(providerLabTests).where(eq(providerLabTests.providerId, providerId));
  }

  async getProviderLabTestsByTest(labTestId: string): Promise<ProviderLabTest[]> {
    return await db.select().from(providerLabTests).where(eq(providerLabTests.labTestId, labTestId));
  }

  async getEnabledProviderForTest(labTestId: string): Promise<ProviderLabTest | undefined> {
    const [result] = await db.select().from(providerLabTests)
      .where(and(eq(providerLabTests.labTestId, labTestId), eq(providerLabTests.isActive, true)));
    return result;
  }

  async createProviderLabTest(data: InsertProviderLabTest): Promise<ProviderLabTest> {
    const [created] = await db.insert(providerLabTests).values([data as any]).returning();
    return created;
  }

  async updateProviderLabTest(id: string, data: Partial<InsertProviderLabTest>): Promise<ProviderLabTest | undefined> {
    const [updated] = await db.update(providerLabTests).set(data as any).where(eq(providerLabTests.id, id)).returning();
    return updated;
  }

  async deleteProviderLabTest(id: string): Promise<boolean> {
    await db.delete(providerLabTests).where(eq(providerLabTests.id, id));
    return true;
  }

  // Suggested Lab Tests
  async getSuggestedLabTests(): Promise<SuggestedLabTest[]> {
    return await db.select().from(suggestedLabTests).orderBy(desc(suggestedLabTests.createdAt));
  }

  async getSuggestedLabTestsByProvider(providerId: string): Promise<SuggestedLabTest[]> {
    return await db.select().from(suggestedLabTests).where(eq(suggestedLabTests.providerId, providerId));
  }

  async getPendingSuggestedLabTests(): Promise<SuggestedLabTest[]> {
    return await db.select().from(suggestedLabTests).where(eq(suggestedLabTests.status, "pending"));
  }

  async createSuggestedLabTest(data: InsertSuggestedLabTest): Promise<SuggestedLabTest> {
    const [created] = await db.insert(suggestedLabTests).values([data as any]).returning();
    return created;
  }

  async updateSuggestedLabTestStatus(id: string, status: SuggestionStatus, adminNotes?: string): Promise<SuggestedLabTest | undefined> {
    const [updated] = await db.update(suggestedLabTests)
      .set({ status, adminNotes, reviewedAt: new Date() } as any)
      .where(eq(suggestedLabTests.id, id)).returning();
    return updated;
  }

  // Provider Modalities
  async getProviderModalities(): Promise<ProviderModality[]> {
    return await db.select().from(providerModalities).orderBy(desc(providerModalities.createdAt));
  }

  async getProviderModalitiesByProvider(providerId: string): Promise<ProviderModality[]> {
    return await db.select().from(providerModalities).where(eq(providerModalities.providerId, providerId));
  }

  async getProviderModalitiesByModality(modalityId: string): Promise<ProviderModality[]> {
    return await db.select().from(providerModalities).where(eq(providerModalities.modalityId, modalityId));
  }

  async getEnabledProviderForModality(modalityId: string): Promise<ProviderModality | undefined> {
    const [result] = await db.select().from(providerModalities)
      .where(and(eq(providerModalities.modalityId, modalityId), eq(providerModalities.isActive, true)));
    return result;
  }

  async createProviderModality(data: InsertProviderModality): Promise<ProviderModality> {
    const [created] = await db.insert(providerModalities).values([data as any]).returning();
    return created;
  }

  async updateProviderModality(id: string, data: Partial<InsertProviderModality>): Promise<ProviderModality | undefined> {
    const [updated] = await db.update(providerModalities).set(data as any).where(eq(providerModalities.id, id)).returning();
    return updated;
  }

  async deleteProviderModality(id: string): Promise<boolean> {
    await db.delete(providerModalities).where(eq(providerModalities.id, id));
    return true;
  }

  // Suggested Modalities
  async getSuggestedModalities(): Promise<SuggestedModality[]> {
    return await db.select().from(suggestedModalities).orderBy(desc(suggestedModalities.createdAt));
  }

  async getSuggestedModalitiesByProvider(providerId: string): Promise<SuggestedModality[]> {
    return await db.select().from(suggestedModalities).where(eq(suggestedModalities.providerId, providerId));
  }

  async getPendingSuggestedModalities(): Promise<SuggestedModality[]> {
    return await db.select().from(suggestedModalities).where(eq(suggestedModalities.status, "pending"));
  }

  async createSuggestedModality(data: InsertSuggestedModality): Promise<SuggestedModality> {
    const [created] = await db.insert(suggestedModalities).values([data as any]).returning();
    return created;
  }

  async updateSuggestedModalityStatus(id: string, status: SuggestionStatus, adminNotes?: string): Promise<SuggestedModality | undefined> {
    const [updated] = await db.update(suggestedModalities)
      .set({ status, adminNotes, reviewedAt: new Date() } as any)
      .where(eq(suggestedModalities.id, id)).returning();
    return updated;
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

  // Registration & Service Approvals
  async getPendingRegistrations(): Promise<User[]> {
    return await db.select().from(users)
      .where(and(eq(users.approvalStatus, "pending"), eq(users.isActive, true)))
      .orderBy(desc(users.createdAt));
  }

  async updateUserApproval(id: string, status: "approved" | "rejected", notes?: string): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ approvalStatus: status as any, approvalNotes: notes || null })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getPendingLabs(): Promise<Lab[]> {
    return await db.select().from(labs).where(eq(labs.approvalStatus, "pending"));
  }

  async getPendingConsultants(): Promise<Consultant[]> {
    return await db.select().from(consultants).where(eq(consultants.approvalStatus, "pending"));
  }

  async getPendingProviderLabTests(): Promise<ProviderLabTest[]> {
    return await db.select().from(providerLabTests).where(eq(providerLabTests.approvalStatus, "pending"));
  }

  async getPendingProviderModalities(): Promise<ProviderModality[]> {
    return await db.select().from(providerModalities).where(eq(providerModalities.approvalStatus, "pending"));
  }

  async updateLabApproval(id: string, status: "approved" | "rejected"): Promise<Lab | undefined> {
    const [updated] = await db.update(labs)
      .set({ approvalStatus: status as any })
      .where(eq(labs.id, id))
      .returning();
    return updated;
  }

  async updateConsultantApproval(id: string, status: "approved" | "rejected"): Promise<Consultant | undefined> {
    const [updated] = await db.update(consultants)
      .set({ approvalStatus: status as any })
      .where(eq(consultants.id, id))
      .returning();
    return updated;
  }

  async updateProviderLabTestApproval(id: string, status: "approved" | "rejected"): Promise<ProviderLabTest | undefined> {
    const [updated] = await db.update(providerLabTests)
      .set({ approvalStatus: status as any })
      .where(eq(providerLabTests.id, id))
      .returning();
    return updated;
  }

  async updateProviderModalityApproval(id: string, status: "approved" | "rejected"): Promise<ProviderModality | undefined> {
    const [updated] = await db.update(providerModalities)
      .set({ approvalStatus: status as any })
      .where(eq(providerModalities.id, id))
      .returning();
    return updated;
  }

  // User update (generic)
  async updateUser(id: string, data: Partial<any>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  // Platform Settings
  async getPlatformSetting(key: string): Promise<PlatformSetting | undefined> {
    const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.settingKey, key));
    return setting;
  }

  async upsertPlatformSetting(key: string, value: string): Promise<PlatformSetting> {
    const existing = await this.getPlatformSetting(key);
    if (existing) {
      const [updated] = await db.update(platformSettings)
        .set({ settingValue: value, updatedAt: new Date() })
        .where(eq(platformSettings.settingKey, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(platformSettings)
        .values({ settingKey: key, settingValue: value })
        .returning();
      return created;
    }
  }

  // Audit Log
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLog).values(log as any).returning();
    return created;
  }

  async getAuditLogs(filters?: { entityType?: string; entityId?: string; userId?: string }): Promise<AuditLog[]> {
    const conditions: any[] = [];
    if (filters?.entityType) conditions.push(eq(auditLog.entityType, filters.entityType));
    if (filters?.entityId) conditions.push(eq(auditLog.entityId, filters.entityId));
    if (filters?.userId) conditions.push(eq(auditLog.userId, filters.userId));
    
    if (conditions.length > 0) {
      return await db.select().from(auditLog).where(and(...conditions)).orderBy(desc(auditLog.createdAt));
    }
    return await db.select().from(auditLog).orderBy(desc(auditLog.createdAt));
  }

  // Billing
  async getBookingsByDateRange(startDate: Date, endDate: Date, filters?: { userId?: string; providerId?: string; paymentStatus?: string }): Promise<Booking[]> {
    const conditions: any[] = [
      gte(bookings.createdAt, startDate),
      lte(bookings.createdAt, endDate),
    ];
    if (filters?.userId) conditions.push(eq(bookings.userId, filters.userId));
    if (filters?.providerId) conditions.push(eq(bookings.providerId, filters.providerId));
    if (filters?.paymentStatus) conditions.push(eq(bookings.paymentStatus, filters.paymentStatus as any));
    
    return await db.select().from(bookings).where(and(...conditions)).orderBy(desc(bookings.createdAt));
  }

  async recordPayment(bookingId: string, amount: number, method: string): Promise<Booking | undefined> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) return undefined;

    const existingPaid = parseFloat(booking.amountPaid || "0");
    const newAmountPaid = existingPaid + amount;
    const totalAmount = parseFloat(booking.amount || "0");

    let paymentStatus: PaymentStatus = "partial";
    let paidAt: Date | null = null;
    if (newAmountPaid >= totalAmount) {
      paymentStatus = "paid";
      paidAt = new Date();
    } else if (newAmountPaid > 0) {
      paymentStatus = "partial";
    }

    const [updated] = await db.update(bookings)
      .set({
        amountPaid: newAmountPaid.toFixed(2),
        paymentStatus,
        paymentMethod: method,
        paidAt,
        updatedAt: new Date(),
      } as any)
      .where(eq(bookings.id, bookingId))
      .returning();
    return updated;
  }

  async getOverdueBookings(): Promise<Booking[]> {
    return await db.select().from(bookings)
      .where(
        and(
          lte(bookings.dueDate, new Date()),
          inArray(bookings.paymentStatus, ["pending", "partial"])
        )
      )
      .orderBy(desc(bookings.createdAt));
  }
}

export const storage = new DatabaseStorage();
