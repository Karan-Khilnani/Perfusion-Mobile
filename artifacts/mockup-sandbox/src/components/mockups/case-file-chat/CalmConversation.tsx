import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useState } from "react";
import "./_group.css";

const vitals = [
  { label: "BP", value: "96/62", detail: "mmHg" },
  { label: "HR", value: "112", detail: "bpm" },
  { label: "RR", value: "26", detail: "per min" },
  { label: "GCS", value: "14/15", detail: "4:35 PM" },
];

export function CalmConversation() {
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [attached, setAttached] = useState(false);
  const [advisoryOpen, setAdvisoryOpen] = useState(false);

  const sendMessage = () => {
    const next = message.trim();
    if (!next) return;
    setSentMessages((current) => [...current, next]);
    setMessage("");
  };

  return (
    <main className="case-file-mockup flex h-[844px] w-[390px] flex-col overflow-hidden bg-[#f6f8f8] text-[#183c3d]">
      <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-[#dfe9e7] bg-[#fbfcfb] px-3 pt-1">
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#386263] transition hover:bg-[#eaf2f0]" aria-label="Back">
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#dcece8] text-[11px] font-bold text-[#24615e]">54M</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">Ramesh Kumar</div>
          <div className="mt-0.5 truncate text-[10px] text-[#718887]">Critical Care · PHC/2026-27/06/C00105</div>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full text-[#386263] hover:bg-[#eaf2f0]" aria-label="Call care team"><Phone size={17} strokeWidth={1.8} /></button>
        <button className="grid h-9 w-9 place-items-center rounded-full text-[#386263] hover:bg-[#eaf2f0]" aria-label="Start video consultation"><Video size={18} strokeWidth={1.8} /></button>
      </header>

      <div className="flex h-[35px] shrink-0 items-center gap-2 border-b border-[#dfe9e7] bg-[#f4faf8] px-5">
        <span className="h-2 w-2 rounded-full bg-[#2b9a82]" />
        <span className="text-[11px] font-semibold text-[#287b6c]">Ongoing consultation</span>
        <span className="ml-auto text-[10px] font-medium text-[#819695]">Case File</span>
      </div>

      <section className="shrink-0 border-b border-[#dfe9e7] bg-[#fbfcfb] px-4 py-2.5">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#e6b9b5] bg-[#fff7f5] px-2.5 py-1 text-[10px] font-semibold text-[#b4504a]"><AlertTriangle size={11} /> Penicillin</span>
          <span className="shrink-0 rounded-full border border-[#dfe9e7] bg-[#eff5f3] px-2.5 py-1 text-[10px] font-semibold text-[#527170]">Diabetes</span>
          <span className="shrink-0 rounded-full border border-[#dfe9e7] bg-[#eff5f3] px-2.5 py-1 text-[10px] font-semibold text-[#527170]">Hypertension</span>
          <ChevronDown size={14} className="ml-auto shrink-0 text-[#76908e]" />
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#f1f7f5] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[8px] font-bold tracking-[0.12em] text-[#76908e]">PRESENTING COMPLAINT</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-[#31595a]">Worsening breathlessness and reduced urine output since morning.</div>
          </div>
          <span className="text-[15px] text-[#91aaa7]">›</span>
        </div>
      </section>

      <section className="shrink-0 border-b border-[#dfe9e7] bg-[#fbfcfb] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Clock3 size={12} className="text-[#c78339]" />
          <span className="text-[9px] font-bold tracking-[0.12em] text-[#718887]">LATEST VITALS</span>
          <span className="ml-auto text-[9px] font-semibold text-[#527170] underline">View chart</span>
        </div>
        <div className="mt-2 grid grid-cols-4 divide-x divide-[#dfe9e7]">
          {vitals.map((item) => (
            <div key={item.label} className="pl-2 first:pl-0">
              <div className="text-[8px] text-[#8aa09e]">{item.label}</div>
              <div className="mt-0.5 text-[14px] font-bold tracking-[-0.02em] text-[#244f50]">{item.value}</div>
              <div className="text-[8px] text-[#8aa09e]">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-[9px] font-medium text-[#91a4a2]"><span className="h-px w-10 bg-[#dfe9e7]" /> TODAY, 24 SEP <span className="h-px w-10 bg-[#dfe9e7]" /></div>
        <div className="max-w-[286px] self-start">
          <div className="mb-1 flex items-center gap-1.5 pl-1 text-[9px] font-semibold text-[#678280]"><span className="grid h-4 w-4 place-items-center rounded-full bg-[#d9ebe7] text-[7px] text-[#2b7d70]">SC</span> Dr. Sana Chatterjee · 4:39 PM</div>
          <div className="rounded-[4px_16px_16px_16px] border border-[#dfe9e7] bg-[#fbfcfb] px-3 py-2.5 shadow-[0_1px_2px_rgba(47,88,86,.04)]">
            <p className="text-[12px] leading-[18px] text-[#31595a]">He is becoming more tachypnoeic. Could you review the fluid balance and latest blood gas?</p>
            <div className="mt-1 flex items-center gap-1 text-[9px] text-[#8aa09e]"><CheckCheck size={12} className="text-[#49a88e]" /> Read</div>
          </div>
        </div>

        <div className="max-w-[286px] self-end">
          <div className="mb-1 text-right text-[9px] font-semibold text-[#678280]">You · 4:42 PM</div>
          <div className="rounded-[16px_4px_16px_16px] bg-[#286866] px-3 py-2.5 text-[#f5fbf9] shadow-[0_2px_5px_rgba(40,104,102,.14)]">
            <p className="text-[12px] leading-[18px]">I’m reviewing the trends now. Please send the most recent ABG and chest X-ray.</p>
            <div className="mt-1 text-right text-[9px] text-[#b8d9d3]">4:42 PM · <CheckCheck size={11} className="inline" /></div>
          </div>
        </div>

        <button onClick={() => setAttached(!attached)} className="max-w-[286px] self-start rounded-[4px_16px_16px_16px] border border-[#d8e6e2] bg-[#fbfcfb] px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(47,88,86,.04)]">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eaf3f0] text-[#347a73]"><FileText size={16} /></span><span><span className="block text-[11px] font-semibold text-[#31595a]">ABG_24Sep.pdf</span><span className="block text-[9px] text-[#8aa09e]">{attached ? "Opened just now" : "Latest arterial blood gas · 248 KB"}</span></span><MoreHorizontal size={15} className="ml-auto text-[#829a97]" /></div>
          <div className="mt-2 text-[10px] font-semibold text-[#397b74]">{attached ? "Attachment opened" : "Tap to preview"}</div>
        </button>

        <button onClick={() => setAdvisoryOpen(!advisoryOpen)} className="relative max-w-[316px] self-start rounded-xl border border-[#d4b893] bg-[#fffaf2] px-3.5 py-3 text-left shadow-[0_2px_5px_rgba(133,95,40,.07)]">
          <div className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-[#ca914b]" />
          <div className="flex items-center gap-2 pl-1"><ShieldCheck size={16} className="text-[#ae7534]" /><span className="text-[11px] font-bold text-[#93642c]">Clinical Advisory</span><span className="ml-auto rounded-full bg-[#f5e8d1] px-1.5 py-0.5 text-[8px] font-bold text-[#9a6b35]">SIGNED</span></div>
          <p className="mt-2 pl-1 text-[11px] leading-[17px] text-[#5d513f]">Review fluid balance and consider vasopressor support if MAP remains below target.</p>
          <div className="mt-2 flex items-center gap-1.5 pl-1 text-[9px] font-semibold text-[#a27339]"><LockKeyhole size={11} /> Signed by Dr. Sana Chatterjee · 4:48 PM <span className="ml-auto underline">{advisoryOpen ? "Close" : "View full"}</span></div>
          {advisoryOpen && <div className="mt-2 border-t border-[#ead9bf] pt-2 pl-1 text-[10px] leading-4 text-[#806c50]">Permanent record · This Clinical Advisory cannot be edited or deleted after signing.</div>}
        </button>
        {sentMessages.map((item, index) => <div key={`${item}-${index}`} className="max-w-[286px] self-end rounded-[16px_4px_16px_16px] bg-[#286866] px-3 py-2.5 text-[12px] leading-[18px] text-[#f5fbf9]">{item}<div className="mt-1 text-right text-[9px] text-[#b8d9d3]">Now · <Check size={11} className="inline" /></div></div>)}
      </section>

      <footer className="flex shrink-0 items-end gap-1.5 border-t border-[#dfe9e7] bg-[#fbfcfb] px-3 pb-4 pt-2.5">
        <button onClick={() => setAttached(true)} className="grid h-10 w-8 place-items-center text-[#47716f] hover:text-[#286866]" aria-label="Attach report"><Paperclip size={19} strokeWidth={1.8} /></button>
        <div className="flex min-h-10 flex-1 items-center rounded-[20px] border border-[#d5e3e0] bg-[#f3f7f6] px-3.5">
          <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder="Message care team…" className="w-full bg-transparent text-[12px] text-[#31595a] outline-none placeholder:text-[#8ba09e]" aria-label="Message care team" />
        </div>
        <button onClick={sendMessage} disabled={!message.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-[#286866] text-white transition hover:bg-[#1e5957] disabled:bg-[#d9e5e2] disabled:text-[#92a8a5]" aria-label="Send message"><Send size={17} /></button>
      </footer>
    </main>
  );
}