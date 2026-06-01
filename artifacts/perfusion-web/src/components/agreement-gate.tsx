import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Shield, FileText, CheckCircle2 } from "lucide-react";

const AGREEMENT_VERSION = "v1.0";

const AGREEMENT_TEXT = `PERFUSION HEALTHCARE PRIVATE LIMITED
CIN: U86900CT2026PTC020133 | Regd. Office: House No. 45, Sunder Nagar, Rajendra Nagar, Raipur – 492001, Chhattisgarh

HEALTHCARE PARTNER PLATFORM SERVICES AGREEMENT
(Clickwrap Agreement – Electronic Acceptance)

IMPORTANT – PLEASE READ CAREFULLY BEFORE PROCEEDING

This Healthcare Partner Platform Services Agreement ("Agreement") is a legally binding contract between Perfusion Healthcare Private Limited ("Company" / "Platform") and the entity or individual accessing the Platform ("Healthcare Partner"). By clicking the "I ACCEPT" button or by accessing or using the Platform in any manner, you confirm that you have read, understood, and agree to be bound by all terms of this Agreement.

This acceptance constitutes an electronic record and a valid, binding contract under Section 10A of the Information Technology Act, 2000 (as amended) and the Indian Contract Act, 1872.

1. DEFINITIONS

1.1 "Platform" means the technology-enabled digital application, website, portal, and/or software operated by the Company for facilitating healthcare services, including IPD tele-consultation and doorstep laboratory sample collection coordination.

1.2 "Healthcare Partner" means any hospital, healthcare institution, medical practitioner, diagnostic centre, laboratory, logistics provider, or allied healthcare service provider that registers on and uses the Platform.

1.3 "Seeker Partner" means a Healthcare Partner (typically a peripheral or rural hospital or healthcare facility) that uses the Platform to request specialist consultations or laboratory services for its admitted or registered patients.

1.4 "Provider Partner" means a Healthcare Partner (typically a specialist physician or tertiary-care institution) that uses the Platform to provide remote specialist consultations or clinical opinions.

1.5 "Electronic Acceptance" means the act of clicking 'I ACCEPT', ticking an acceptance checkbox, or otherwise affirmatively indicating consent to this Agreement through the Platform's digital interface.

1.6 "Acceptance Record" means the electronic log maintained by the Platform capturing the Healthcare Partner's name, authorised representative's name, date and time (IST) of Electronic Acceptance, and IP address.

1.7 "Consultation Summary" means the written specialist opinion delivered through the Platform following a tele-consultation session, which is advisory in nature.

1.8 "Effective Date" means the date on which the Healthcare Partner completes Electronic Acceptance of this Agreement.

2. ELECTRONIC ACCEPTANCE AND LEGAL VALIDITY

2.1 The Healthcare Partner agrees that Electronic Acceptance of this Agreement constitutes a legally valid, binding, and enforceable contract between the Parties, equivalent in all respects to a physically executed agreement, in accordance with Section 10A of the Information Technology Act, 2000 and the Indian Contract Act, 1872.

2.2 The person completing Electronic Acceptance on behalf of the Healthcare Partner represents and warrants that they have the legal authority and requisite internal authorisation to bind the Healthcare Partner to this Agreement.

2.3 The Company shall maintain an Acceptance Record for each Healthcare Partner. The Acceptance Record shall be admissible as evidence in any legal, regulatory, or arbitral proceeding.

2.4 The Healthcare Partner acknowledges that it cannot retract or deny Electronic Acceptance on the grounds that no physical signature was affixed, and expressly waives any such defence.

2.5 This Agreement shall come into effect on the Effective Date and shall remain in force for one (1) year, automatically renewable for successive one (1) year periods unless either Party provides thirty (30) days' written notice of non-renewal.

3. PLATFORM – NATURE AND SCOPE OF SERVICES

3.1 The Platform is a digital technology facilitation and coordination platform only. The Company is not a hospital, clinic, diagnostic laboratory, pharmacy, medical establishment, or direct medical service provider.

3.2 Services facilitated through the Platform may include: (a) IPD tele-consultation between admitted patients and specialist physicians; (b) specialist consultation coordination for hospitalised patients; (c) laboratory test booking and sample collection coordination; (d) patient record and report transmission (subject to consent); and (e) such other allied services as may be notified by the Company from time to time.

3.3 The Company does not guarantee any medical outcome, treatment result, diagnosis accuracy, recovery, cure, or availability of any particular doctor, hospital, or laboratory through the Platform.

4. TELE-CONSULTATION – TERMS OF USE

4.1 Nature of Consultation: All Consultation Summaries and specialist opinions delivered through the Platform are advisory in nature only. They do not constitute direct prescriptions, treatment orders, or binding clinical directives. The ultimate clinical responsibility for acceptance, modification, or rejection of any specialist opinion shall rest with the primary/attending consultant at the Seeker Partner's facility.

4.2 Consultant Liability Carve-Out: The Provider Partner's opinion is based solely on the clinical information, investigations, and data submitted by the Seeker Partner at the time of consultation. The Provider Partner shall not be held liable for adverse outcomes arising from incomplete, inaccurate, delayed, or misleading information furnished by the Seeker Partner.

4.3 IPD Emergency Escalation: Where the Platform is used for IPD tele-consultation, the Seeker Partner's on-site treating team shall not await a remote specialist's response before initiating emergency clinical intervention in the event of acute clinical deterioration.

4.4 Responsibility of Treating Doctor: The Seeker Partner's healthcare establishment remains solely responsible for all in-patient care, including monitoring, treatment, medication, nursing, emergency response, and discharge management.

5. PATIENT CONSENT

5.1 The Seeker Partner shall be solely responsible for obtaining valid informed consent from the patient or their legally authorised representative before initiating any tele-consultation or laboratory service through the Platform.

5.2 The Platform shall require the Seeker Partner to make a digital declaration confirming patient consent has been obtained before each consultation session is initiated.

5.3 The Healthcare Partner acknowledges that tele-consultation has inherent limitations and that a physical examination may be required in certain cases. Patients experiencing medical emergencies must be referred to appropriate on-site or nearby emergency care facilities immediately.

6. DATA PROTECTION AND PRIVACY

6.1 Both Parties shall process patient data only for lawful, specific, and necessary purposes directly connected with the services facilitated through the Platform.

6.2 Patient data, medical records, prescriptions, consultation notes, and identity details shall be kept strictly confidential and protected against unauthorised access, disclosure, alteration, or misuse.

6.3 The Healthcare Partner shall not use patient data for marketing, solicitation, cross-selling, profiling, research, or any purpose not expressly consented to by the patient or permitted by applicable law.

6.4 Both Parties shall implement reasonable security safeguards including access controls, encryption where applicable, staff confidentiality obligations, and breach response mechanisms.

6.5 In the event of any data breach or unauthorised disclosure, the discovering Party shall immediately notify the other Party and cooperate in remediation, user notification, and regulatory compliance.

6.6 All personal data processing shall be conducted in compliance with the Digital Personal Data Protection Act, 2023, and applicable rules thereunder.

7. CONFIDENTIALITY AND NON-CIRCUMVENTION

7.1 Each Party shall keep confidential all business, technical, operational, clinical, financial, and proprietary information received from the other Party.

7.2 Patient data and medical records shall be treated as the highest category of confidential information. Confidentiality obligations shall survive termination of this Agreement for five (5) years.

7.3 The Healthcare Partner shall not, directly or indirectly, bypass, circumvent, or divert the Platform in relation to any contacts, specialists, laboratories, or services sourced through or negotiated by the Company. Any such circumvention shall constitute a material breach of this Agreement.

7.4 During the term of this Agreement and for one (1) year thereafter, the Healthcare Partner shall not directly solicit, poach, or engage any employees, consultants, logistics partners, or service providers introduced through the Platform, without the Company's prior written consent.

8. REPRESENTATIONS AND WARRANTIES

By completing Electronic Acceptance, the Healthcare Partner represents and warrants that:

8.1 It holds all necessary licences, registrations, and qualifications to provide the healthcare or diagnostic services it offers through the Platform.

8.2 All medical practitioners made available through the Platform are duly qualified and registered with the relevant statutory body.

8.3 It shall not make any false, misleading, or exaggerated claims through the Platform.

8.4 It shall be solely responsible for medical advice, diagnoses, consultation summaries, test reports, treatment decisions, and clinical outcomes.

8.5 It shall comply with all applicable NMC guidelines, Telemedicine Practice Guidelines of India 2020, and all professional, ethical, statutory, and regulatory standards.

8.6 It shall not misuse the Platform, patient data, or any proprietary material of the Company.

9. PAYMENT TERMS

9.1 The fees, payment schedule, mode of payment, invoicing procedures, and applicable taxes (including GST) shall be as specified in the Schedule of Fees published on the Platform or as separately communicated to the Healthcare Partner in writing.

9.2 In the event of non-payment of dues beyond the period specified in the Schedule of Fees, the Company reserves the right to suspend the Healthcare Partner's access to the Platform until such dues are cleared.

10. LIMITATION OF LIABILITY AND INDEMNITY

10.1 The Company shall not be liable for any medical negligence, wrong diagnosis, incorrect prescription, hospital service deficiency, sample contamination, in-patient complications, third-party fraud, or misconduct of any Healthcare Partner.

10.2 The Healthcare Partner shall indemnify, defend, and hold harmless the Company, its directors, employees, officers, and agents from and against all claims, losses, damages, penalties, costs, and proceedings arising from: (a) medical negligence or clinical error; (b) breach of patient confidentiality; (c) absence or expiry of any required licence or registration; (d) misconduct of the Healthcare Partner or its staff; or (e) any breach of this Agreement.

10.3 The indemnity obligations in this clause shall survive termination of this Agreement.

11. PROFESSIONAL INDEMNITY INSURANCE

11.1 Provider Partners are strongly recommended to maintain valid professional indemnity insurance for the duration of their engagement on the Platform. Where such insurance is mandated by applicable law or regulatory guidelines, it shall be a condition of continued registration.

12. TERMINATION

12.1 Either Party may terminate this Agreement without cause by providing thirty (30) days' prior written notice to the other Party.

12.2 The Company may immediately suspend or terminate a Healthcare Partner's access upon: (a) material breach of this Agreement; (b) loss of any required licence or registration; (c) repeated complaints or patient safety concerns; (d) regulatory risk to the Company; or (e) any act of fraud, misrepresentation, or wilful misconduct.

12.3 Upon termination, all Platform access shall cease. Any ongoing patient consultations shall be safely completed or handed over by the Seeker Partner's treating team. Accrued payment obligations shall remain binding.

13. DISPUTE RESOLUTION AND GOVERNING LAW

13.1 This Agreement shall be governed by and construed in accordance with the laws of India.

13.2 Any dispute arising out of or in connection with this Agreement shall first be attempted to be resolved through good-faith discussions between the Parties within thirty (30) days of written notice of the dispute.

13.3 If unresolved, disputes shall be referred to binding arbitration under the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Raipur, Chhattisgarh.

13.4 Subject to the foregoing arbitration provisions, the courts at Raipur, Chhattisgarh shall have exclusive jurisdiction.

14. INTELLECTUAL PROPERTY

14.1 All intellectual property rights in the Platform, including its software, trademarks, trade name, source code, user interface, business model, and technology tools, belong exclusively to the Company.

14.2 The Healthcare Partner shall not copy, reverse-engineer, replicate, or commercially exploit the Platform or any proprietary material of the Company.

15. FORCE MAJEURE

Neither Party shall be liable for failure or delay in performance caused by events beyond its reasonable control, including acts of God, natural disasters, war, civil disturbances, epidemics, or governmental actions.

16. AMENDMENTS AND UPDATES TO THIS AGREEMENT

16.1 The Company reserves the right to update or modify the terms of this Agreement at any time. The Healthcare Partner will be notified of material changes via the Platform or by email.

16.2 Continued use of the Platform following notification of any amendment shall constitute the Healthcare Partner's acceptance of the revised terms.

16.3 If the Healthcare Partner does not agree to the revised terms, it must discontinue use of the Platform and notify the Company in writing within thirty (30) days of the notification.

17. GENERAL PROVISIONS

17.1 Severability: If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.

17.2 Entire Agreement: This Agreement, together with any applicable Schedule of Fees and the Acceptance Record, constitutes the entire agreement between the Parties and supersedes all prior understandings.

17.3 Notices: All formal notices shall be in writing and delivered to the registered contact details of each Party as recorded on the Platform.

────────────────────────────────────────────────────────────────────
For: PERFUSION HEALTHCARE PRIVATE LIMITED
CIN: U86900CT2026PTC020133
Authorised Signatory: Tesu Kesharwani, Director (DIN: 08469006)

This agreement is valid without a physical signature. Acceptance is constituted by the Healthcare Partner's Electronic Acceptance as recorded in the Acceptance Record.`;

interface AgreementCheckResponse {
  signed: boolean;
  version?: string;
  signedAt?: string;
}

interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  hospitalName?: string;
  registeredOrganization?: string;
  approvalStatus?: string;
}

export function AgreementGate({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: user } = useQuery<UserInfo | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: check, isLoading: checkLoading } = useQuery<AgreementCheckResponse>({
    queryKey: ["/api/agreements/check"],
    enabled: !!user && user.approvalStatus === "approved",
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agreements/sign", {
        version: AGREEMENT_VERSION,
      });
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/agreements/check"] });
      }, 1200);
    },
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setHasScrolled(true);
    }
  };

  const handleSign = async () => {
    if (!accepted || !hasScrolled || signing) return;
    setSigning(true);
    try {
      await signMutation.mutateAsync();
    } finally {
      setSigning(false);
    }
  };

  // Not logged in, or admin (skip gate), or check loading, or already signed
  if (!user) return <>{children}</>;
  if (user.role === "admin") return <>{children}</>;
  if (user.approvalStatus !== "approved") return <>{children}</>;
  if (checkLoading) return <>{children}</>;
  if (check?.signed) return <>{children}</>;
  if (done && check?.signed) return <>{children}</>;

  // Show the agreement modal (full-screen gate)
  const orgName = user.hospitalName || (user as any).registeredOrganization || "";
  const partyName = `${user.firstName} ${user.lastName}`.trim();
  const roleLabel =
    user.role === "care_seeker" ? "Seeker Hospital / Healthcare Facility" :
    user.role === "provider" ? "Provider Specialist / Healthcare Provider" :
    user.role;

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-4">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
        <h2 className="text-2xl font-bold text-gray-900">Agreement Signed</h2>
        <p className="text-gray-600 text-center max-w-md">
          Your signed agreement has been recorded. A PDF copy is being generated and stored for your records.
        </p>
        <p className="text-sm text-gray-400">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-red-700 text-white px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <Shield className="w-6 h-6" />
          <div className="flex-1">
            <h2 className="font-bold text-lg leading-tight">Healthcare Partner Platform Services Agreement</h2>
            <p className="text-red-200 text-xs mt-0.5">Please read the full agreement before proceeding</p>
          </div>
          <Badge variant="outline" className="border-red-300 text-red-100 text-xs">{AGREEMENT_VERSION}</Badge>
        </div>

        {/* Pre-populated details */}
        <div className="px-6 py-3 bg-gray-50 border-b flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Your Details (Pre-populated)</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium">{partyName}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium">{user.email}</span></div>
            {orgName && <div><span className="text-gray-500">Organisation:</span> <span className="font-medium">{orgName}</span></div>}
            <div><span className="text-gray-500">Role:</span> <span className="font-medium">{roleLabel}</span></div>
          </div>
        </div>

        {/* Agreement text scroll area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4 text-sm text-gray-700 leading-relaxed font-mono whitespace-pre-wrap bg-white min-h-0"
          style={{ fontFamily: "Georgia, serif", fontSize: "13px", lineHeight: "1.7" }}
        >
          {AGREEMENT_TEXT}
        </div>

        {/* Scroll prompt */}
        {!hasScrolled && (
          <div className="px-6 py-1.5 bg-amber-50 border-t border-amber-200 flex-shrink-0">
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Please scroll to the bottom to read the full agreement before accepting.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex-shrink-0 space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="accept-checkbox"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              disabled={!hasScrolled}
              className="mt-0.5"
            />
            <label
              htmlFor="accept-checkbox"
              className={`text-sm leading-snug cursor-pointer select-none ${!hasScrolled ? "text-gray-400" : "text-gray-700"}`}
            >
              I, <strong>{partyName}</strong>, confirm that I have read and understood this Agreement in its entirety, that I am duly authorised to accept this Agreement on behalf of <strong>{orgName || partyName}</strong>, and I agree to be fully bound by all its terms with effect from today.
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSign}
              disabled={!accepted || !hasScrolled || signing}
              className="bg-red-700 hover:bg-red-800 text-white font-bold px-8 py-2.5 flex-1"
            >
              {signing ? "Recording Acceptance…" : "I ACCEPT — Proceed to Platform"}
            </Button>
            <p className="text-xs text-gray-400 max-w-xs">
              This constitutes a legally binding electronic signature under the IT Act, 2000.
            </p>
          </div>

          {signMutation.isError && (
            <p className="text-sm text-red-600">
              Failed to record your acceptance. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
