import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Presentation, FileText, BarChart3, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScholarShare — Course PDF Portal for Students & Faculty" },
      {
        name: "description",
        content:
          "Faculty share subject PDFs by regulation; students read and download them. Track views and downloads with live analytics.",
      },
      { property: "og:title", content: "ScholarShare — Course PDF Portal" },
      {
        property: "og:description",
        content: "Share subject PDFs by regulation and track student views and downloads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[image:var(--gradient-hero)] opacity-90 blur-3xl" />

      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Academic resource portal
          </span>
          <h1 className="mt-6 font-display text-5xl leading-tight font-bold text-foreground sm:text-6xl">
            ScholarShare
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Faculty publish subject PDFs per regulation. Students open and download what applies to
            them. Everything is tracked, so teachers know exactly what reached the class.
          </p>
        </header>

        <section className="mt-12 grid gap-6 sm:grid-cols-2">
          <RoleCard
            to="student"
            icon={<GraduationCap className="h-7 w-7" />}
            title="I'm a Student"
            body="Pick your regulation — R25, R24 and more — and get every PDF your faculty shared for it."
          />
          <RoleCard
            to="teacher"
            icon={<Presentation className="h-7 w-7" />}
            title="I'm a Faculty"
            body="Add the subjects you teach per regulation, upload PDFs, and watch views and downloads live."
          />
          <RoleCard
            to="admin"
            icon={<ShieldCheck className="h-7 w-7" />}
            title="I'm the Admin"
            body="Review registered students and faculty, uploaded PDFs, and engagement per subject code."
          />
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2">
          <Feature
            icon={<FileText className="h-5 w-5" />}
            title="Regulation-aware uploads"
            body="The same subject can carry different material for R24 and R25 without mixing them up."
          />
          <Feature
            icon={<BarChart3 className="h-5 w-5" />}
            title="Reach analytics"
            body="Every PDF reports unique student views and downloads on an interactive chart."
          />
        </section>
      </main>
    </div>
  );
}

function RoleCard({
  to,
  icon,
  title,
  body,
}: {
  to: "student" | "teacher" | "admin";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      to="/auth"
      search={{ role: to }}
      className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </span>
      <h2 className="font-display text-2xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <span className="mt-auto pt-2 text-sm font-semibold text-primary">Continue →</span>
    </Link>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/70 bg-secondary/40 p-5">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
