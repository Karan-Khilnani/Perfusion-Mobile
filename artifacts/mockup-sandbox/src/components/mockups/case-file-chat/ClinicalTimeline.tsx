import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  FileText,
  LockKeyhole,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useState } from "react";
import "./_group.css";

type TimelineItem = {
  id: string;
  time: string;
  author: string;
  role: string;
  kind: "message" | "file" | "advisory";
  body: string;
  mine?: boolean;
  fileMeta?: string;
};

const initialTimeline: TimelineItem[] = [
  {
    id: "m1",
    time: "4:18 PM",
    author: "Dr. Meera Shah",
    role: "Critical Care · Consultant",
    kind: "message",
    body: "I’m reviewing Ramesh’s current fluid balance now. Please share the latest ABG when available.",
  },
  {
    id: "m2",
    time: "4:31 PM",
    author: "Anil Rao",
    role: "Treating team · Ward 4B",
    kind: "message",
    body: "Breathlessness has worsened over the last hour. Urine output remains low despite the fluid challenge.",
    mine: true,
  },
  {
    id: "m3",
    time: "4:42 PM",
    author: "Anil Rao",
    role: "Treating team · Ward 4B",
    kind: "file",
    body: "ABG_24Sep.pdf",
    fileMeta: "Arterial blood gas · 248 KB",
    mine: true,
  },
  {
    id: "m4",
    time: "4:48 PM",
    author: "Dr. Meera Shah",
    role: "Critical Care · Consultant",
    kind: "advisory",
    body: "Review fluid balance and consider vasopressor support if MAP remains below target. Repeat ABG in 30 minutes.",
  },
];

function VitalCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 flex-1 border-l border-[#D9E1DE] pl-2.5 first:border-l-0 first:pl-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#70807C]">{label}</div>
      <div className="mt-1 font-mono text-[15px] font-semibold text-[#173A38]">{value}</div>
      <div className="mt-0.5 truncate text-[9px] text-[#70807C]">{detail}</div>
    </div>
  );
}

export function ClinicalTimeline() {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [message, setMessage] = useState("");
  const [contextOpen, setContextOpen] = useState(true);
  const [notice, setNotice] = useState("");

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const sendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setTimeline((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        time: "Now",
        author: "Anil Rao",
        role: "Treating team · Ward 4B",
        kind: "message",
        body: trimmed,
        mine: true,
      },
    ]);
    setMessage("");
  };

  return (
    <main className="case-file-mockup flex h-screen min-h-[760px] flex-col overflow-hidden bg-[#F3F7F5]">
      <header className="flex min-h-[66px] items-center border-b border-[#DCE5E1] bg-[#FBFDFC] px-2.5 pt-1">
        <button onClick={() => notify("Returning to Case Files")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#E8F0ED]" aria-label="Back">
          <ArrowLeft size={20} strokeWidth={1.8} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="grid h-[39px] w-[39px] shrink-0 place-items-center rounded-full bg-[#D8E8E2] font-mono text-[11px] font-bold text-[#1F5A55]">54M</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#173A38]">Ramesh Kumar</div>
            <div className="mt-0.5 truncate text-[10px] text-[#70807C]">Critical Care · PHC/2026-27/06/C00105</div>
          </div>
        </div>
        <div className="flex items-center gap-3.5 px-2 text-[#315A56]">
          <button onClick={() => notify("Voice call unavailable in preview")} aria-label="Call Ramesh"><Phone size={18} strokeWidth={1.8} /></button>
          <button onClick={() => notify("Video call unavailable in preview")} aria-label="Video call Ramesh"><Video size={19} strokeWidth={1.8} /></button>
        </div>
      </header>

      <div className="flex h-[35px] items-center border-b border-[#DCE5E1] bg-[#F8FBF9] px-4">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-[#B77931]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#916022]">Ongoing consultation</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-[#82908C]">CASE FILE</span>
      </div>

      <section className="border-b border-[#DCE5E1] bg-[#FBFDFC]">
        <button onClick={() => setContextOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#56736E]">
            <ShieldCheck size={14} className="text-[#287E76]" /> Clinical context
          </span>
          <ChevronDown size={16} className={`text-[#70807C] transition-transform ${contextOpen ? "" : "-rotate-90"}`} />
        </button>
        {contextOpen && (
          <div className="border-t border-[#E5ECE9] px-4 pb-3">
            <div className="flex gap-1.5 overflow-hidden py-2">
              <span className="flex shrink-0 items-center gap-1 rounded-md border border-[#D99A9B] bg-[#FFF4F2] px-2 py-1 text-[10px] font-bold text-[#A13C43]"><AlertTriangle size={11} /> Penicillin</span>
              <span className="shrink-0 rounded-md border border-[#DCE5E1] bg-[#EEF4F1] px-2 py-1 text-[10px] font-semibold text-[#355A55]">Diabetes</span>
              <span className="shrink-0 rounded-md border border-[#DCE5E1] bg-[#EEF4F1] px-2 py-1 text-[10px] font-semibold text-[#355A55]">Hypertension</span>
            </div>
            <div className="border-t border-[#E5ECE9] pt-2">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#82908C]">Presenting complaint</div>
              <div className="mt-1 text-[11px] font-medium leading-[16px] text-[#244441]">Worsening breathlessness and reduced urine output since morning.</div>
            </div>
          </div>
        )}
      </section>

      <section className="border-b border-[#D4E2DD] bg-[#E8F2EE] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#287E76]" />
          <span className="text-[9px] font-bold uppercase tracking-[0.11em] text-[#56736E]">Latest clinical observations</span>
          <button onClick={() => notify("Full chart opened")} className="ml-auto text-[10px] font-semibold text-[#1F6962] underline underline-offset-2">Full chart</button>
        </div>
        <div className="mt-2 flex gap-2">
          <VitalCell label="BP · HR" value="96/62" detail="112 bpm · RR 26" />
          <VitalCell label="I/O balance" value="-340 mL" detail="UO 18 mL/hr" />
          <VitalCell label="GCS" value="14 / 15" detail="Observed 4:35 PM" />
        </div>
      </section>

      <section className="relative flex-1 overflow-hidden px-4 py-3">
        <div className="absolute bottom-0 left-[29px] top-0 w-px bg-[#D7E2DE]" />
        <div className="relative space-y-3 overflow-y-auto pb-2">
          <div className="mb-1 flex items-center gap-2 pl-[26px]">
            <span className="bg-[#F3F7F5] px-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#82908C]">Today · 24 Sep 2026</span>
          </div>
          {timeline.map((item) => (
            <article key={item.id} className={`relative flex gap-2 ${item.mine ? "flex-row-reverse" : ""}`}>
              <div className={`z-10 mt-2 h-2 w-2 shrink-0 rounded-full border-2 border-[#F3F7F5] ${item.kind === "advisory" ? "bg-[#287E76] ring-2 ring-[#A9D1C6]" : item.kind === "file" ? "bg-[#B77931]" : "bg-[#8EA9A3]"}`} />
              <div className={`min-w-0 max-w-[84%] ${item.mine ? "text-right" : ""}`}>
                <div className={`mb-1 flex items-baseline gap-1.5 ${item.mine ? "justify-end" : ""}`}>
                  <span className="text-[10px] font-bold text-[#315A56]">{item.author}</span>
                  <span className="font-mono text-[9px] text-[#82908C]">{item.time}</span>
                </div>
                {item.kind === "advisory" ? (
                  <div className="rounded-[10px] border border-[#7BB3A6] bg-[#E7F4EF] p-3 text-left shadow-[0_2px_0_rgba(40,126,118,.08)]">
                    <div className="flex items-start gap-2 border-b border-[#C5E1D8] pb-2">
                      <BadgeCheck size={18} className="shrink-0 text-[#287E76]" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1F6962]">Clinical Advisory</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[9px] text-[#5C7C75]"><LockKeyhole size={10} /> Signed · permanent record</div>
                      </div>
                    </div>
                    <p className="mt-2 text-[12px] leading-[18px] text-[#214A45]">{item.body}</p>
                    <button onClick={() => notify("Opening signed advisory trail")} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#1F6962]">View advisory trail <ChevronRight size={13} /></button>
                  </div>
                ) : item.kind === "file" ? (
                  <button onClick={() => notify("Opening ABG_24Sep.pdf")} className="w-full rounded-[10px] border border-[#D5DCD9] bg-[#FBFDFC] p-2.5 text-left shadow-[0_1px_2px_rgba(23,58,56,.04)]">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-md bg-[#F6EBDD] text-[#A66728]"><FileText size={17} /></div>
                      <div className="min-w-0"><div className="truncate text-[11px] font-bold text-[#244441]">{item.body}</div><div className="mt-0.5 text-[9px] text-[#82908C]">{item.fileMeta}</div></div>
                      <ChevronRight size={15} className="ml-auto shrink-0 text-[#82908C]" />
                    </div>
                  </button>
                ) : (
                  <div className={`rounded-[10px] border px-3 py-2.5 text-left ${item.mine ? "border-[#315A56] bg-[#315A56] text-[#F4FAF7]" : "border-[#D5DCD9] bg-[#FBFDFC] text-[#244441]"}`}>
                    <p className="text-[12px] leading-[18px]">{item.body}</p>
                  </div>
                )}
                {item.kind === "advisory" && <div className="mt-1 text-right text-[9px] text-[#82908C]">Authenticated by Dr. Meera Shah</div>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#DCE5E1] bg-[#FBFDFC] px-2.5 pb-4 pt-2">
        <div className="flex items-end gap-2">
          <button onClick={() => notify("Attachment picker opened")} className="grid h-10 w-8 place-items-center text-[#315A56]" aria-label="Attach clinical file"><Paperclip size={19} /></button>
          <div className="flex min-h-10 flex-1 items-center rounded-[10px] border border-[#D5E0DC] bg-[#F3F7F5] px-3">
            <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} className="w-full bg-transparent text-[12px] text-[#244441] outline-none placeholder:text-[#8A9995]" placeholder="Add to clinical exchange…" aria-label="Message" />
          </div>
          <button onClick={sendMessage} disabled={!message.trim()} className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#287E76] text-white disabled:bg-[#DCE5E1] disabled:text-[#82908C]" aria-label="Send message"><Send size={17} /></button>
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-1 text-[8px] text-[#82908C]"><LockKeyhole size={10} /> Messages are part of the Case File record</div>
      </footer>
      {notice && <div className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#173A38] px-3 py-2 text-[10px] font-semibold text-white shadow-lg">{notice}</div>}
    </main>
  );
}