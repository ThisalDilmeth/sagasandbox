import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0f0f12] px-6 text-center">
      {/* Ambient gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#7c3aed]/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-[#4f46e5]/8 blur-[100px]" />
        <div className="absolute right-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-[#0ea5e9]/6 blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-2xl">
        {/* Badge */}
        <span className="rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-1.5 text-xs font-medium tracking-widest text-[#a78bfa] uppercase">
          AI Image Generation
        </span>

        {/* Headline */}
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
          Pin objects.{" "}
          <span className="bg-gradient-to-r from-[#7c3aed] via-[#a78bfa] to-[#38bdf8] bg-clip-text text-transparent">
            Generate scenes.
          </span>
        </h1>

        {/* Subtext */}
        <p className="max-w-lg text-lg leading-relaxed text-[#9ca3af]">
          Place pins on the canvas to mark where each object should appear, then
          hit{" "}
          <span className="font-medium text-[#e5e7eb]">Synthesize scenery</span>{" "}
          to generate a high-fidelity image with everything in exactly the right
          position.
        </p>

        {/* How it works */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[#6b7280]">
          <Step n="1" label="Click canvas to place a pin" />
          <Arrow />
          <Step n="2" label="Label each object" />
          <Arrow />
          <Step n="3" label="Generate the scene" />
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/studio"
            className="group inline-flex items-center gap-2 rounded-xl bg-[#7c3aed] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition-all hover:bg-[#6d28d9] hover:shadow-[#7c3aed]/40 hover:-translate-y-0.5"
          >
            Open Studio
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>

        {/* Fine print */}
        <p className="text-xs text-[#4b5563]">
          Runs locally · No account required · Powered by Flux &amp; fal.ai
        </p>
      </div>
    </main>
  );
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1a1a1e] border border-[#2a2a2e] text-xs font-bold text-[#7c3aed]">
        {n}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="hidden h-4 w-4 text-[#374151] sm:block"
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}
