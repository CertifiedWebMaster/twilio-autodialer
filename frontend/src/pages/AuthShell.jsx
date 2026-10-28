import { PhoneOutgoing } from "lucide-react";

const IMG = "https://images.unsplash.com/photo-1766066014237-00645c74e9c6?crop=entropy&cs=srgb&fm=jpg&q=80&w=1400";

export default function AuthShell({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="auth-page">
      <aside className="hidden lg:flex relative overflow-hidden">
        <img src={IMG} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
        <div className="relative mt-auto p-14 max-w-xl animate-rise">
          <div className="flex items-center gap-2 text-emerald-400 mb-6"><PhoneOutgoing size={18} /><span className="label text-emerald-400">AutoDialer</span></div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight text-white leading-[1.05]">Dial the whole list.<br />Talk to the people who pick up.</h1>
          <p className="mt-5 text-slate-300 max-w-md">Upload a CSV, hit start, and calls ring through to your browser one after another — every outcome and note logged for your team.</p>
        </div>
      </aside>
      <main className="flex flex-col items-center justify-center p-6 gap-8">
        <div className="lg:hidden flex items-center gap-2 text-emerald-400"><PhoneOutgoing size={18} /><span className="font-display text-2xl font-bold text-white">AutoDialer</span></div>
        {children}
      </main>
    </div>
  );
}
