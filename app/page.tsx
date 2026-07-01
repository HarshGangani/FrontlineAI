"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import type { TriageResult } from "@/lib/schema";
import evaluationRaw from "@/data/evaluation.json";

/* =========================================================================
   Types
   ========================================================================= */

type InputRow = { id: string | number; message: string };
type ResultRow = InputRow & { result: TriageResult | null; failed: boolean };

const EVAL_CASES = evaluationRaw as { id: number; input: string }[];

/* =========================================================================
   API + helpers
   ========================================================================= */

async function triage(message: string): Promise<TriageResult | null> {
  try {
    const res = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TriageResult;
  } catch {
    return null;
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const cur = idx++;
      await fn(items[cur], cur);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* ---- file parsing (json + csv) ---- */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function rowsFromCSV(text: string): InputRow[] {
  const grid = parseCSV(text);
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const msgIdx = header.findIndex((h) => ["message", "text", "input", "body"].includes(h));
  const idIdx = header.findIndex((h) => h === "id");
  if (msgIdx === -1) return grid.map((r, i) => ({ id: i + 1, message: (r[0] ?? "").trim() }));
  return grid.slice(1).map((r, i) => ({
    id: idIdx !== -1 ? (r[idIdx] ?? i + 1) : i + 1,
    message: (r[msgIdx] ?? "").trim(),
  }));
}

function rowsFromJSON(text: string): InputRow[] {
  const raw = JSON.parse(text);
  const arr: unknown[] = Array.isArray(raw) ? raw : (raw?.messages ?? []);
  return arr.map((item, i) => {
    if (typeof item === "string") return { id: i + 1, message: item };
    const o = item as Record<string, unknown>;
    return {
      id: (o.id as string | number) ?? i + 1,
      message: String(o.message ?? o.text ?? o.input ?? ""),
    };
  });
}

async function parseFile(file: File): Promise<InputRow[]> {
  const text = await file.text();
  const rows = file.name.toLowerCase().endsWith(".csv") ? rowsFromCSV(text) : rowsFromJSON(text);
  return rows.filter((r) => r.message.trim().length > 0);
}

/* =========================================================================
   Styling maps
   ========================================================================= */

const PRIORITY_STYLES: Record<string, string> = {
  P0: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  P1: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  P2: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  P3: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

const CATEGORY_STYLES: Record<string, string> = {
  billing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  technical: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  shipping: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  refund: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  account: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  complaint: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  feature_request: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function CategoryBadge({ value }: { value: string }) {
  return <Badge className={CATEGORY_STYLES[value] ?? CATEGORY_STYLES.other}>{value}</Badge>;
}
function PriorityBadge({ value }: { value: string }) {
  return <Badge className={PRIORITY_STYLES[value] ?? PRIORITY_STYLES.P3}>{value}</Badge>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? "bg-emerald-500" : value >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 tabular-nums text-slate-600 dark:text-slate-300">{value.toFixed(2)}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function statusOf(row: ResultRow) {
  if (row.failed || !row.result) return { label: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" };
  if (row.result.needs_human) return { label: "Success (Flagged)", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
  return { label: "Success", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
}

/* =========================================================================
   Icons (inline, dependency-free)
   ========================================================================= */

type IconProps = { className?: string };
const Ico = (d: string) => ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);
const IconChat = Ico("M8 10h8M8 14h5M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z");
const IconBrain = Ico("M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 5 1 3 3 0 0 0 5-1 3 3 0 0 0 2-5.2A3 3 0 0 0 18 6a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 3ZM12 5v13");
const IconList = Ico("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01");
const IconUser = Ico("M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z");
const IconTarget = Ico("M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12h.01");
const IconBolt = Ico("M13 3 4 14h7l-1 7 9-11h-7l1-7Z");
const IconShield = Ico("M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z");
const IconGlobe = Ico("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z");
const IconArrow = Ico("M5 12h14M13 6l6 6-6 6");
const IconSparkle = Ico("M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z");
const IconCheck = Ico("M20 6 9 17l-5-5");
const IconUpload = Ico("M12 16V4M7 9l5-5 5 5M4 20h16");
const IconMoon = Ico("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z");
const IconSun = Ico("M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z");
const IconChevron = Ico("M6 9l6 6 6-6");

/* =========================================================================
   Page
   ========================================================================= */

type Mode = "single" | "dataset";

export default function Home() {
  const [dark, setDark] = useState(true);
  const [mode, setMode] = useState<Mode>("single");

  // Shared batch state (dataset upload + evaluation suite feed the same table).
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(0);
  const evalRef = useRef<HTMLDivElement>(null);

  async function runBatch(inputs: InputRow[]) {
    if (!inputs.length || processing) return;
    setProcessing(true);
    setHasRun(true);
    setDone(0);
    setRows(inputs.map((r) => ({ ...r, result: null, failed: false })));
    await mapPool(inputs, 5, async (row, i) => {
      const result = await triage(row.message);
      setRows((prev) => {
        const next = [...prev];
        next[i] = { ...inputs[i], result, failed: result === null };
        return next;
      });
      setDone((d) => d + 1);
    });
    setProcessing(false);
  }

  function runEvaluationSuite() {
    setMode("dataset");
    runBatch(EVAL_CASES.map((c) => ({ id: c.id, message: c.input })));
    evalRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Nav dark={dark} onToggleTheme={() => setDark((d) => !d)} />
        <Hero onRunSuite={runEvaluationSuite} />

        {/* Light content band that overlaps the hero */}
        <div className="relative z-10 -mt-10 rounded-t-3xl bg-slate-50 pb-20 dark:bg-slate-950">
          <div className="mx-auto max-w-6xl px-4">
            <Features />

            <section id="analyze" className="mt-16">
              <h2 className="text-center text-2xl font-bold tracking-tight">Analyze Customer Messages</h2>
              <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
                Choose a mode below to get started
              </p>

              <ModeToggle mode={mode} setMode={setMode} />

              {mode === "single" ? (
                <SingleMode />
              ) : (
                <DatasetMode processing={processing} onRun={runBatch} />
              )}
            </section>

            <div ref={evalRef}>
              <EvaluationResults rows={rows} hasRun={hasRun} processing={processing} done={done} />
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

/* =========================================================================
   Nav
   ========================================================================= */

function Nav({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const links = [
    ["Home", "#top"],
    ["How It Works", "#how-it-works"],
    ["Evaluation", "#evaluation"],
    ["About", "#about"],
  ];
  return (
    <header id="top" className="bg-slate-950">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <IconChat className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-white">Frontline AI</div>
            <div className="text-xs text-slate-400">Customer Support Triage</div>
          </div>
        </div>
        <div className="hidden items-center gap-8 md:flex">
          {links.map(([label, href]) => (
            <a key={label} href={href} className="text-sm font-medium text-slate-300 transition-colors hover:text-white">
              {label}
            </a>
          ))}
        </div>
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800"
        >
          {dark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
        </button>
      </nav>
    </header>
  );
}

/* =========================================================================
   Hero
   ========================================================================= */

function Hero({ onRunSuite }: { onRunSuite: () => void }) {
  const bullets = [
    "Understands messy, real-world messages",
    "Detects intent, priority, and emotional context",
    "Escalates critical issues to humans",
    "Reliable, safe, and built for customer trust",
  ];
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 pb-24 pt-10">
      <div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            AI-Powered{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Support Triage
            </span>{" "}
            That Your Team Can Trust
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Frontline AI automatically understands, classifies, and prioritizes customer messages so your support team
            can focus on what matters most.
          </p>
          <ul className="mt-6 space-y-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-slate-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#analyze"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-transform hover:scale-[1.02]"
            >
              Try It Now <IconArrow className="h-4 w-4" />
            </a>
            <button
              onClick={onRunSuite}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/40 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              Run Evaluation Suite
            </button>
          </div>
        </div>

        <HowItWorks />
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: IconChat, label: "1. Receive Customer Message", tint: "from-indigo-500 to-indigo-700" },
    { icon: IconBrain, label: "2. AI Analyzes & Understands", tint: "from-purple-500 to-purple-700" },
    { icon: IconList, label: "3. Classify & Prioritize", tint: "from-slate-600 to-slate-800" },
    { icon: IconUser, label: "4. Route to Human (if needed)", tint: "from-sky-500 to-sky-700" },
  ];
  return (
    <div id="how-it-works" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur">
      <h3 className="text-center text-sm font-semibold text-white">How Frontline AI Works</h3>
      <div className="mt-6 flex items-start justify-between gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center text-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${s.tint} text-white`}>
                <s.icon className="h-5 w-5" />
              </div>
              <span className="mt-2 text-[11px] leading-tight text-slate-300">{s.label}</span>
            </div>
            {i < steps.length - 1 && <IconArrow className="mt-4 h-4 w-4 shrink-0 text-slate-600" />}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-center gap-3 border-t border-slate-800 pt-4">
        <span className="text-amber-400"><IconSparkle className="h-5 w-5" /></span>
        <div className="text-left">
          <div className="text-sm font-semibold text-white">Built with Google Gemini</div>
          <div className="text-xs text-slate-400">Fast · Intelligent · Reliable</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Features
   ========================================================================= */

function Features() {
  const items = [
    { icon: IconTarget, tint: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300", title: "Accurate Classification", body: "Detects intent across billing, technical, shipping, refunds, accounts and more." },
    { icon: IconBolt, tint: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", title: "Smart Prioritization", body: "Assigns priority (P0–P3) based on urgency and impact." },
    { icon: IconShield, tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", title: "Human Escalation", body: "Automatically flags messages that need human attention." },
    { icon: IconGlobe, tint: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300", title: "Multilingual Support", body: "Understands messages in multiple languages." },
  ];
  return (
    <div className="grid gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${it.tint}`}>
            <it.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-semibold">{it.title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   Mode toggle
   ========================================================================= */

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        onClick={() => setMode("single")}
        className={`rounded-xl px-4 py-3 text-left transition-colors ${
          mode === "single" ? "bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:ring-indigo-500/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          <IconChat className="h-4 w-4" /> Single Message
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Analyze one customer message</div>
      </button>
      <button
        onClick={() => setMode("dataset")}
        className={`rounded-xl px-4 py-3 text-left transition-colors ${
          mode === "dataset" ? "bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:ring-indigo-500/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconUpload className="h-4 w-4" /> Dataset Upload
          </div>
          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">Recommended</Badge>
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Upload and analyze multiple messages</div>
      </button>
    </div>
  );
}

/* =========================================================================
   Single mode
   ========================================================================= */

function SingleMode() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    const data = await triage(message);
    setLoading(false);
    if (!data) setError("Could not analyze the message. Is the server running?");
    else setResult(data);
  }

  const canSubmit = message.trim().length >= 3 && !loading;

  return (
    <div className="mx-auto mt-6 grid max-w-5xl gap-6 md:grid-cols-2">
      {/* Input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="text-sm font-semibold">Paste Customer Message</label>
        <div className="relative mt-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="e.g. I was charged twice for my subscription this month…"
            className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">
            {message.length} / 2000
          </span>
        </div>
        <button
          onClick={analyze}
          disabled={!canSubmit}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconSparkle className="h-4 w-4" /> {loading ? "Analyzing…" : "Analyze Message"}
        </button>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Our AI will classify intent, set priority, and determine if human review is needed.
        </p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Result */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-sm font-semibold">Triage Result</div>
        {!result ? (
          <div className="flex h-[85%] min-h-40 flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-400 dark:bg-indigo-500/10">
              <IconSparkle className="h-6 w-6" />
            </div>
            <div className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">No analysis yet</div>
            <div className="text-xs text-slate-400">Your result will appear here.</div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge value={result.category} />
              <PriorityBadge value={result.priority} />
              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                confidence {(result.confidence * 100).toFixed(0)}%
              </Badge>
              {result.needs_human && (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">⚠ Needs human</Badge>
              )}
            </div>
            <ResultField label="Summary">{result.summary}</ResultField>
            <ResultField label="Suggested Action">{result.suggested_action}</ResultField>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-slate-700 dark:text-slate-200">{children}</p>
    </div>
  );
}

/* =========================================================================
   Dataset mode
   ========================================================================= */

function DatasetMode({ processing, onRun }: { processing: boolean; onRun: (rows: InputRow[]) => void }) {
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChoose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseFile(file);
      if (!parsed.length) {
        setError("No messages found. Expected a 'message' field or column.");
        setInputs([]);
        setFileName(null);
        return;
      }
      setInputs(parsed);
      setFileName(file.name);
    } catch {
      setError("Could not parse the file. Use valid JSON or CSV.");
      setInputs([]);
      setFileName(null);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload <span className="font-medium text-slate-700 dark:text-slate-200">messages.json</span> or{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">messages.csv</span> (a{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">message</code> field or column).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".json,.csv"
          onChange={(e) => onChoose(e.target.files?.[0])}
          className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
        />
        {fileName && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {fileName} · {inputs.length} message{inputs.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <button
        onClick={() => onRun(inputs)}
        disabled={!inputs.length || processing}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {processing ? "Processing…" : "Process All Messages"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Tip: click <span className="font-medium">Run Evaluation Suite</span> in the header to score the built-in
        20-case dataset. Results appear below.
      </p>
    </div>
  );
}

/* =========================================================================
   Evaluation results
   ========================================================================= */

function EvaluationResults({
  rows,
  hasRun,
  processing,
  done,
}: {
  rows: ResultRow[];
  hasRun: boolean;
  processing: boolean;
  done: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const stats = useMemo(() => {
    const processed = rows.filter((r) => r.result !== null || r.failed).length;
    const failed = rows.filter((r) => r.failed).length;
    const withResult = rows.filter((r) => r.result);
    const needsHuman = withResult.filter((r) => r.result!.needs_human).length;
    const avg = withResult.length
      ? withResult.reduce((s, r) => s + r.result!.confidence, 0) / withResult.length
      : 0;
    return {
      total: rows.length,
      processed,
      failed,
      needsHuman,
      needsHumanPct: withResult.length ? Math.round((needsHuman / withResult.length) * 100) : 0,
      avg,
    };
  }, [rows]);

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <section id="evaluation" className="mt-16">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Evaluation Results{!hasRun && <span className="text-slate-400"> (Example)</span>}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {hasRun
              ? processing
                ? `Processing ${done}/${stats.total}…`
                : "Live results from the triage API."
              : "Run the evaluation suite or upload a dataset to see detailed results and metrics."}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={IconList} tint="text-indigo-500" label="Total Messages" value={stats.total || "—"} />
        <Stat icon={IconCheck} tint="text-emerald-500" label="Processed" value={hasRun ? `${stats.processed}` : "—"} />
        <Stat icon={IconShield} tint="text-red-500" label="Failed" value={hasRun ? stats.failed : "—"} />
        <Stat icon={IconUser} tint="text-amber-500" label="Needs Human Review"
          value={hasRun ? `${stats.needsHuman} (${stats.needsHumanPct}%)` : "—"} />
        <Stat icon={IconBolt} tint="text-sky-500" label="Avg. Confidence" value={hasRun ? stats.avg.toFixed(2) : "—"} />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {!hasRun ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-400 dark:bg-indigo-500/10">
              <IconList className="h-6 w-6" />
            </div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">No results yet</div>
            <div className="text-xs text-slate-400">Run the evaluation suite or upload a dataset to populate this table.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Needs Human</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, i) => {
                  const st = statusOf(row);
                  const open = expanded.has(i);
                  const pending = !row.result && !row.failed;
                  return (
                    <Fragment key={i}>
                      <tr
                        onClick={() => row.result && toggle(i)}
                        className={row.result ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {row.result && <IconChevron className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.id}</td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-700 dark:text-slate-200" title={row.message}>
                          {row.message}
                        </td>
                        {pending ? (
                          <td colSpan={5} className="px-4 py-3 text-slate-400">…</td>
                        ) : row.failed || !row.result ? (
                          <td colSpan={5} className="px-4 py-3">
                            <Badge className={st.cls}>{st.label}</Badge>
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-3"><CategoryBadge value={row.result.category} /></td>
                            <td className="px-4 py-3"><PriorityBadge value={row.result.priority} /></td>
                            <td className="px-4 py-3"><ConfidenceBar value={row.result.confidence} /></td>
                            <td className="px-4 py-3">
                              {row.result.needs_human ? (
                                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">Yes</Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">No</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3"><Badge className={st.cls}>{st.label}</Badge></td>
                          </>
                        )}
                      </tr>
                      {open && row.result && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                          <td></td>
                          <td colSpan={7} className="px-4 pb-4 pt-1">
                            <div className="flex flex-col gap-3">
                              <ResultField label="Full Message">{row.message}</ResultField>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <ResultField label="Summary">{row.result.summary}</ResultField>
                                <ResultField label="Suggested Action">{row.result.suggested_action}</ResultField>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: (p: IconProps) => React.ReactElement;
  tint: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className={tint}><Icon className="h-4 w-4" /></span>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

/* =========================================================================
   Footer
   ========================================================================= */

function Footer() {
  return (
    <footer id="about" className="border-t border-slate-800 bg-slate-950 py-10 text-center text-sm text-slate-400">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-center gap-2 text-white">
          <IconSparkle className="h-4 w-4 text-amber-400" />
          <span className="font-semibold">Frontline AI</span>
        </div>
        <p className="mt-2">Reliable customer support triage, built with Google Gemini.</p>
      </div>
    </footer>
  );
}
