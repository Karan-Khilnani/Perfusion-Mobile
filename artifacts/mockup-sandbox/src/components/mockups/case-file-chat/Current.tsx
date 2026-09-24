import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Edit3,
  FileText,
  Paperclip,
  Phone,
  Send,
  Video,
} from "lucide-react";
import "./_group.css";

const Vital = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <div className="min-w-0 flex-1">
    <div className="text-[9px] font-medium text-[#7A7F8A]">{label}</div>
    <div className="mt-0.5 text-[15px] font-bold text-[#2A2A2A]">{value}</div>
    <div className="mt-0.5 truncate text-[9px] text-[#7A7F8A]">{detail}</div>
  </div>
);

export function Current() {
  return (
    <main className="case-file-mockup flex h-screen min-h-[760px] flex-col overflow-hidden">
      <header className="flex min-h-16 items-center border-b border-[#ECEDF0] bg-white px-2.5 pt-2">
        <button className="grid h-10 w-10 place-items-center" aria-label="Back">
          <ArrowLeft size={21} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-[#F0F1F4] text-[11px] font-bold">
            54M
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">Ramesh Kumar</div>
            <div className="mt-0.5 truncate text-[11px] text-[#7A7F8A]">
              Critical Care · PHC/2026-27/06/C00105
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 px-2">
          <Phone size={18} />
          <Video size={19} />
        </div>
      </header>

      <div className="flex h-[34px] items-center gap-1.5 border-b border-[#ECEDF0] bg-white px-4">
        <span className="h-2 w-2 rounded-full bg-[#8C5B6E]" />
        <span className="text-xs font-semibold text-[#8C5B6E]">Ongoing</span>
        <span className="ml-auto text-[11px] font-medium text-[#7A7F8A]">Case File</span>
      </div>

      <section className="border-b border-[#ECEDF0] bg-white">
        <div className="flex gap-1.5 overflow-hidden px-3.5 py-2">
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#DB284128] bg-[#DB28410D] px-2.5 py-1 text-[11px] font-semibold text-[#DB2841]">
            <AlertTriangle size={12} /> Penicillin
          </span>
          <span className="shrink-0 rounded-full border border-[#ECEDF0] bg-[#F0F1F4] px-2.5 py-1 text-[11px] font-semibold">
            Diabetes
          </span>
          <span className="shrink-0 rounded-full border border-[#ECEDF0] bg-[#F0F1F4] px-2.5 py-1 text-[11px] font-semibold">
            Hypertension
          </span>
        </div>
        <div className="flex items-center gap-2 border-t border-[#ECEDF0] px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold tracking-[0.08em] text-[#7A7F8A]">PRESENTING COMPLAINT</div>
            <div className="mt-1 line-clamp-2 text-xs font-medium leading-[17px]">
              Worsening breathlessness and reduced urine output since morning.
            </div>
          </div>
          <ChevronRight size={17} className="text-[#7A7F8A]" />
        </div>
      </section>

      <section className="flex min-h-[94px] border-b border-[#ECEDF0] bg-white px-3.5 py-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#E08A2E]" />
            <span className="text-[9px] font-bold tracking-[0.08em] text-[#7A7F8A]">LATEST VITALS · I/O · GCS</span>
            <span className="ml-auto text-[10px] font-semibold underline">Full chart</span>
          </div>
          <div className="mt-2 flex">
            <Vital label="Vitals" value="96/62" detail="HR 112 · RR 26" />
            <Vital label="Intake / Output" value="-340 mL" detail="UO 18 mL/hr" />
            <Vital label="GCS" value="14 / 15" detail="4:35 PM" />
          </div>
        </div>
        <button className="ml-1 self-center rounded-full bg-[#DB2841] p-2 text-white">+</button>
      </section>

      <section className="flex flex-1 flex-col-reverse gap-2 overflow-hidden px-3.5 py-3">
        <div className="ml-auto max-w-[84%] rounded-2xl border border-[#2A2A2A] bg-[#2A2A2A] px-3 py-2.5 text-white">
          <div className="text-[13px] leading-[19px]">Uploading the latest ABG and chest X-ray now.</div>
          <div className="mt-1 text-right text-[9px] text-white/60">4:42 PM</div>
        </div>
        <div className="max-w-[84%] rounded-2xl border border-[#ECEDF0] bg-white px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <FileText size={17} />
            <span className="text-xs font-semibold">ABG_24Sep.pdf</span>
          </div>
          <div className="text-[13px] leading-[19px]">Latest arterial blood gas report.</div>
          <div className="mt-1 text-right text-[9px] text-[#7A7F8A]">4:44 PM</div>
        </div>
        <div className="max-w-[84%] rounded-2xl border border-[#8C5B6E50] bg-[#8C5B6E0E] px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[#8C5B6E]">
            <Edit3 size={15} />
            <span className="text-xs font-bold">Clinical Advisory</span>
          </div>
          <div className="text-[13px] leading-[19px]">
            Review fluid balance and consider vasopressor support if MAP remains below target.
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-[#8C5B6E]">View full advisory →</div>
          <div className="mt-1 text-right text-[9px] text-[#7A7F8A]">4:48 PM</div>
        </div>
      </section>

      <footer className="flex items-end gap-2 border-t border-[#ECEDF0] bg-white px-2.5 pb-4 pt-2">
        <button className="grid h-10 w-8 place-items-center"><Paperclip size={20} /></button>
        <button className="grid h-10 w-8 place-items-center"><Edit3 size={19} /></button>
        <div className="min-h-10 flex-1 rounded-full border border-[#ECEDF0] bg-[#F7F7F9] px-3.5 py-2.5 text-[13px] text-[#7A7F8A]">
          Message or attach a report…
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full bg-[#ECEDF0] text-[#7A7F8A]"><Send size={18} /></button>
      </footer>
    </main>
  );
}