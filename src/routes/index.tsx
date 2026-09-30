import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  Gauge,
  Layers,
  LineChart,
  Search,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { Reveal } from "@/components/Reveal";

import campusImage from "@/assets/placement-cell.jpg";
import platformImage from "@/assets/talentbro-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalentBro × Thinkedufy — Placement readiness, built together" },
      {
        name: "description",
        content:
          "TalentBro by UniLink Ventures LLP and Thinkedufy by Presidency Group of Institutions: placement intelligence delivered by the people who run the campus.",
      },
      { property: "og:title", content: "TalentBro × Thinkedufy" },
      {
        property: "og:description",
        content: "One platform, one campus, one shared standard for every student.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollaborationPage,
});

type Owner = "a" | "b" | "ab";

const OWNER_LABEL: Record<Owner, string> = {
  a: "TalentBro",
  b: "Thinkedufy",
  ab: "Joint",
};

const LOGOS = {
  a: { src: "/Logo/Logo%20Circle.png", alt: "TalentBro" },
  b: { src: "/Logo/Thinkedufy.webp", alt: "Thinkedufy" },
} as const;

const PARTNERS = [
  {
    key: "a" as Owner,
    index: "01",
    role: "The engine",
    name: "TalentBro",
    logo: LOGOS.a,
    parent: "by UniLink Ventures LLP",
    lede: "The placement platform itself. Adaptive practice for every stage of selection, and a live read on the skills a campus actually holds.",
    image: platformImage,
    alt: "TalentBro placement intelligence platform in use",
    brings: [
      "AI mock interviews and roleplay",
      "Group discussion rooms",
      "Aptitude, DSA and communication training",
      "Resume building and analysis",
      "Skill mapping and readiness scoring",
      "AI talent search for recruiters",
    ],
    cta: { label: "See the platform", to: "/institution-auth" as const },
  },
  {
    key: "b" as Owner,
    index: "02",
    role: "The campus",
    name: "Thinkedufy",
    logo: LOGOS.b,
    parent: "by Presidency Group of Institutions",
    lede: "The institution. The students, the faculty, the placement office — and the lived context that turns a platform into a working practice.",
    image: campusImage,
    alt: "Placement cell team at a Presidency Group institution",
    brings: [
      "Campuses and departments to run on",
      "Student cohorts and eligibility rules",
      "Faculty and mentor network",
      "Placement drives, schedules and vendors",
      "Outcome tracking and reporting",
      "Standing trust with students and employers",
    ],
    cta: { label: "Bring your campus", to: "/institution-auth" as const },
  },
];

const MODULES: { owner: Owner; icon: typeof Layers; title: string; copy: string }[] = [
  {
    owner: "a",
    icon: Layers,
    title: "Adaptive practice engine",
    copy: "Every module is generated and graded by AI, so no two students prepare the same way — and nobody repeats yesterday's drill.",
  },
  {
    owner: "a",
    icon: Gauge,
    title: "Readiness index",
    copy: "One score per student, per skill, updated from every attempt and comparable across departments, years and campuses.",
  },
  {
    owner: "a",
    icon: Search,
    title: "Student intelligence",
    copy: "Skills, gaps and eligibility for every candidate in a single view, instead of the spreadsheet chase before every drive.",
  },
  {
    owner: "b",
    icon: Building2,
    title: "Campus rollout",
    copy: "Onboarded department by department, following the institute's own structure, academic calendar and batch rules.",
  },
  {
    owner: "b",
    icon: CalendarCheck,
    title: "Placement operations",
    copy: "Drives, schedules, shortlists and vendors, run by the placement office on live data rather than last year's sheet.",
  },
  {
    owner: "ab",
    icon: LineChart,
    title: "Outcome reporting",
    copy: "The number every review meeting asks for, already built, always current, and attributable to a department and a cohort.",
  },
];

const STEPS: { owner: Owner; label: string; title: string; copy: string }[] = [
  {
    owner: "ab",
    label: "Step 01",
    title: "One shared record",
    copy: "Thinkedufy maps the campus — departments, cohorts, eligibility. TalentBro turns that structure into a live record of every student.",
  },
  {
    owner: "a",
    label: "Step 02",
    title: "Students practise",
    copy: "Adaptive AI practice across mock interviews, group discussions, aptitude, DSA and communication, with feedback they can act on.",
  },
  {
    owner: "b",
    label: "Step 03",
    title: "Placement cells see it",
    copy: "Readiness, eligibility and shortlists in one view, on the drive days and vendor sessions the placement office already runs.",
  },
];

const ENTRIES = [
  {
    owner: "a" as Owner,
    icon: Building2,
    audience: "For placement cells",
    title: "Put the whole campus on one readiness standard.",
    copy: "Roll out across departments, wire the placement office into live data, and stop rebuilding eligibility lists for every drive.",
    cta: "Start with your institute",
    to: "/institution-auth" as const,
  },
  {
    owner: "b" as Owner,
    icon: UsersRound,
    audience: "For students",
    title: "Walk into every round already prepared.",
    copy: "Practise against real selection formats, get scored on what recruiters actually weigh, and watch your readiness move.",
    cta: "Create your student account",
    to: "/candidate-auth" as const,
  },
];

function OwnerTag({ owner }: { owner: Owner }) {
  return (
    <span className="cb-owner">
      {owner !== "b" && <i className="cb-dot-a" />}
      {owner !== "a" && <i className="cb-dot-b" />}
      {OWNER_LABEL[owner]}
    </span>
  );
}

function CollaborationPage() {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const move = (event: PointerEvent) => {
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty(
        "--hero-x",
        `${((event.clientX - bounds.left) / bounds.width - 0.5) * 2}`,
      );
      hero.style.setProperty(
        "--hero-y",
        `${((event.clientY - bounds.top) / bounds.height - 0.5) * 2}`,
      );
    };
    const reset = () => {
      hero.style.setProperty("--hero-x", "0");
      hero.style.setProperty("--hero-y", "0");
    };

    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", reset);
    return () => {
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
    };
  }, []);

  return (
    <main id="top" className="overflow-hidden bg-background text-foreground">
      <section ref={heroRef} className="cb-hero">
        <div className="cb-grid" aria-hidden="true" />
        <div className="tg-grain absolute inset-0 z-[2] opacity-[.05]" aria-hidden="true" />

        <nav className="relative z-10 mx-auto flex w-full max-w-[1500px] items-center justify-between px-5 py-5 md:px-10 lg:px-14">
          <p className="cb-mono hidden md:block">A collaboration · 2026</p>
          <Link to="/get-started" className="cb-enter group ml-auto">
            ENTER
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </nav>

        <div className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col items-center justify-center px-5 pb-24 pt-8 md:px-10 lg:px-14">
          <p className="cb-kicker">A joint placement initiative</p>

          <h1 className="cb-lockup">
            <span className="cb-lockup-side cb-lockup-side--a">
              <div className="flex items-center gap-3">
                <span className="cb-mark cb-mark--hero cb-mark--a">
                  <img src={LOGOS.a.src} alt={LOGOS.a.alt} width={2000} height={2000} />
                </span>
                <div className="cb-brand-stack">
                  <span className="cb-brand-name">TalentBro</span>
                  <span className="cb-brand-sub">by UniLink Ventures LLP</span>
                </div>
              </div>
            </span>
            <span className="cb-times" aria-hidden="true">
              &times;
            </span>
            <span className="cb-lockup-side cb-lockup-side--b">
              <div className="flex items-center gap-3">
                <div className="cb-brand-stack cb-brand-stack--b">
                  <span className="cb-brand-name">Thinkedufy</span>
                  <span className="cb-brand-sub">by Presidency Group of Institutions</span>
                </div>
                <span className="cb-mark cb-mark--hero cb-mark--b">
                  <img src={LOGOS.b.src} alt={LOGOS.b.alt} width={600} height={280} />
                </span>
              </div>
            </span>
          </h1>

          <div className="cb-bridge w-full" aria-hidden="true" />

          <p className="cb-hero-copy">
            One side builds the intelligence. The other supplies the campus it runs on. Together
            they give every student a preparation standard that is measured, comparable and visible
            to the people placing them.
          </p>
        </div>
      </section>

      <section id="partners" className="relative">
        <span className="cb-seam" aria-hidden="true">
          &times;
        </span>
        <div className="cb-split">
          {PARTNERS.map((partner) => (
            <article
              key={partner.key}
              className={`cb-panel cb-panel--${partner.key === "a" ? "dark" : "light"} cb-panel--${partner.key}`}
            >
              <span className="cb-tag">
                {partner.index} · {partner.role}
              </span>

              <h2 className="cb-panel-name">{partner.name}</h2>
              <p className="cb-panel-parent">{partner.parent}</p>

              <div className="cb-media">
                <img
                  src={partner.image}
                  loading="lazy"
                  width={1920}
                  height={1200}
                  alt={partner.alt}
                />
              </div>

              <p className="cb-panel-lede">{partner.lede}</p>

              <ul className="cb-panel-list">
                {partner.brings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <Link to={partner.cta.to} className="cb-cta group">
                {partner.cta.label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="capabilities" className="bg-background px-5 py-24 md:px-10 lg:px-14 lg:py-36">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="eyebrow">The combined platform</p>
            <h2 className="section-title max-w-4xl">
              Neither half works alone.
              <br />
              <span className="text-muted-foreground">Together they compound.</span>
            </h2>
            <p className="section-copy">
              TalentBro supplies the intelligence. Thinkedufy supplies the campus it runs on. Every
              module below names the side that owns it — and the ones neither of us would attempt
              alone.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module, index) => (
              <Reveal key={module.title} delay={index * 70} className="h-full">
                <article className={`cb-module cb-module--${module.owner}`}>
                  <div className="flex items-center justify-between">
                    <span className="cb-module-icon">
                      <module.icon className="size-4" />
                    </span>
                    <OwnerTag owner={module.owner} />
                  </div>
                  <h3 className="cb-module-title">{module.title}</h3>
                  <p className="cb-module-copy">{module.copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="bg-paper px-5 py-24 md:px-10 lg:px-14 lg:py-32">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="eyebrow">How it runs</p>
            <h2 className="section-title max-w-4xl">
              From first login
              <br />
              to signed offer.
            </h2>
          </Reveal>

          <div className="cb-flow mt-14">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 90} className="h-full">
                <div className="cb-step" data-owner={step.owner}>
                  <span className="cb-step-owner">
                    {step.label} · {OWNER_LABEL[step.owner]}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="join"
        className="cb-cta-section bg-ink px-5 py-24 text-paper md:px-10 lg:px-14 lg:py-32"
      >
        <div className="relative z-10 mx-auto max-w-[1400px]">
          <Reveal>
            <p className="cb-kicker">Join the programme</p>
            <h2 className="section-title max-w-3xl">
              Two ways in.
              <br />
              <span className="text-paper/40">One campus outcome.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-2">
            {ENTRIES.map((entry, index) => (
              <Reveal key={entry.title} delay={index * 90} className="h-full">
                <article className={`cb-entry cb-entry--${entry.owner}`}>
                  <span className="cb-entry-audience">
                    <entry.icon className="size-3.5" />
                    {entry.audience}
                  </span>
                  <h3>{entry.title}</h3>
                  <p>{entry.copy}</p>
                  <Link to={entry.to} className="cb-entry-cta group">
                    {entry.cta}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-ink px-5 pb-8 text-paper md:px-10 lg:px-14">
        <div className="mx-auto max-w-[1400px] border-t border-paper/10 pt-8">
          <div className="cb-footer-lockup sm:grid-cols-2">
            <div className="cb-footer-side">
              <div className="flex items-center gap-2.5">
                <span className="cb-mark cb-mark--a">
                  <img src={LOGOS.a.src} alt="" />
                </span>
                <div className="cb-brand-chip">
                  <strong>TalentBro</strong>
                  <span>A UniLink Ventures LLP company</span>
                </div>
              </div>
            </div>
            <div className="cb-footer-side">
              <div className="flex items-center gap-2.5">
                <span className="cb-mark cb-mark--b">
                  <img src={LOGOS.b.src} alt="" />
                </span>
                <div className="cb-brand-chip">
                  <strong>Thinkedufy</strong>
                  <span>A Presidency Group of Institutions company</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-5 sm:flex-row">
            <p className="text-paper/35">
              © 2026 TalentBro × Thinkedufy. Built for better placements.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
              <Link to="/tac" className="text-paper/45 transition-colors hover:text-paper">
                Terms &amp; Conditions
              </Link>
              <Link
                to="/privacy-policy"
                className="text-paper/45 transition-colors hover:text-paper"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
