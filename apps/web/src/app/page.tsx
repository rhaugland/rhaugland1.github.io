import Link from "next/link";
import { BookingForm } from "./booking-form";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* nav — sticky glass blur */}
      <nav className="sticky top-0 z-50 border-b border-white/10" style={{ background: "rgba(15,15,15,0.85)", backdropFilter: "blur(8px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            slushie
          </span>
          <div className="flex items-center gap-4">
            <a
              href="#contact"
              className="rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105"
            >
              book a blend
            </a>
            <Link
              href="/api/auth/signin"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              team
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section
        className="relative overflow-hidden px-6 py-28 md:py-40"
        style={{ background: "linear-gradient(135deg, #DC2626 0%, #3B5BDB 100%)" }}
      >
        <div className="mx-auto max-w-3xl text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
            workflow automation for small business
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-6xl">
            one meeting. one workflow. done.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/80">
            you hop on a call, tell us what's broken, sip your coffee, and we
            build it right there. by tomorrow, it's plugged into your tools and
            running.
          </p>
          <a
            href="#contact"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3.5 text-sm font-bold text-primary shadow-lg transition-transform hover:scale-105"
          >
            book your blend →
          </a>
          <p className="mt-4 text-sm text-white/60">
            60 minutes. that's it. we handle the rest.
          </p>
        </div>
      </section>

      {/* how it works */}
      <section className="bg-background px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-extrabold text-foreground">
            sit back. sip. we've got this.
          </h2>

          <div className="relative mt-16">
            {/* vertical gradient line */}
            <div
              className="absolute left-5 top-0 h-full w-0.5 rounded-full"
              style={{ background: "linear-gradient(to bottom, #DC2626, #3B5BDB)" }}
            />

            {/* step 1 */}
            <div className="relative flex gap-6 pb-12">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                1
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">you talk, we listen</h3>
                <p className="mt-1 text-sm text-muted">
                  hop on a 60-minute call. walk us through the messy spreadsheet,
                  the copy-paste nightmare, the thing that eats your afternoon. we
                  get it.
                </p>
              </div>
            </div>

            {/* step 2 */}
            <div className="relative flex gap-6 pb-12">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                2
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">we build it live</h3>
                <p className="mt-1 text-sm text-muted">
                  while you're still on the call, we start building. you watch
                  your workflow take shape in real time. it's like magic, but it's
                  actually just us moving fast.
                </p>
              </div>
            </div>

            {/* step 3 */}
            <div className="relative flex gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-white">
                3
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  wake up to it working
                </h3>
                <p className="mt-1 text-sm text-muted">
                  we plug it into your tools overnight — google sheets, quickbooks,
                  whatever you use. by morning, your workflow is running on
                  autopilot.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="bg-white px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-extrabold text-foreground">
            pick your flavor.
          </h2>
          <p className="mt-3 text-sm text-muted">
            no subscriptions. no retainers. just pay for what you need.
          </p>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {/* single scoop */}
            <div className="rounded-2xl border-2 border-gray-200 p-8 text-left">
              <p className="text-sm font-semibold text-muted">single scoop</p>
              <p className="mt-2 text-4xl font-extrabold text-foreground">$3,500</p>
              <p className="mt-4 text-sm text-muted">
                one meeting, one workflow, one backend plug-in
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg border-2 border-primary py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                get started
              </a>
            </div>

            {/* double blend — featured */}
            <div
              className="relative rounded-2xl p-8 text-left text-white shadow-xl md:scale-105"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #3B5BDB 100%)" }}
            >
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1 text-xs font-bold text-primary shadow">
                most popular
              </span>
              <p className="text-sm font-semibold text-white/70">double blend</p>
              <p className="mt-2 text-4xl font-extrabold">$6,000</p>
              <p className="mt-4 text-sm text-white/80">
                two meetings, two workflows, two backend plug-ins
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg bg-white py-2.5 text-center text-sm font-bold text-primary transition-transform hover:scale-105"
              >
                pour this one →
              </a>
            </div>

            {/* triple freeze */}
            <div className="rounded-2xl border-2 border-secondary/30 p-8 text-left">
              <p className="text-sm font-semibold text-muted">triple freeze</p>
              <p className="mt-2 text-4xl font-extrabold text-foreground">$8,500</p>
              <p className="mt-4 text-sm text-muted">
                three meetings, three workflows, three backend plug-ins
              </p>
              <a
                href="#contact"
                className="mt-6 block rounded-lg border-2 border-secondary py-2.5 text-center text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white"
              >
                get started
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* contact / booking form */}
      <section id="contact" className="bg-background px-6 py-24">
        <div className="mx-auto max-w-lg">
          <h2 className="text-center text-3xl font-extrabold text-foreground">
            ready? this part takes 2 minutes.
          </h2>
          <div className="mt-10">
            <BookingForm />
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-[#0f0f0f] px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            slushie
          </span>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} slushie
          </p>
        </div>
      </footer>
    </div>
  );
}
