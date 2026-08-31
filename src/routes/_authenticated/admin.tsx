import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Eye, FileText, GraduationCap, Loader2, Presentation, Search, ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — ScholarShare" },
      {
        name: "description",
        content:
          "Administrator overview of registered students and faculty, uploaded PDFs, and view/download activity per subject code.",
      },
      { property: "og:title", content: "Admin dashboard — ScholarShare" },
      { property: "og:description", content: "Site-wide members, PDFs and reach analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { role, profile, loading } = useAuth();
  const [q, setQ] = useState("");

  const isAdmin = role === "admin";

  const roles = useQuery({
    queryKey: ["admin-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profiles = useQuery({
    queryKey: ["admin-profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, regulation, created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useQuery({
    queryKey: ["admin-subjects"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, code, regulation, teacher_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const materials = useQuery({
    queryKey: ["admin-materials"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, regulation, teacher_id, subject_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["admin-events"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_events")
        .select("material_id, student_id, event_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]));
    const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
    return (materials.data ?? []).map((m) => {
      const subject = subjectById.get(m.subject_id);
      const mine = (events.data ?? []).filter((e) => e.material_id === m.id);
      return {
        id: m.id,
        title: m.title,
        code: subject?.code ?? "—",
        subject: subject?.name ?? "—",
        regulation: m.regulation,
        teacher: nameById.get(m.teacher_id) ?? "Faculty",
        views: mine.filter((e) => e.event_type === "view").length,
        downloads: mine.filter((e) => e.event_type === "download").length,
      };
    });
  }, [materials.data, subjects.data, events.data, profiles.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(term) ||
        r.subject.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term) ||
        r.regulation.toLowerCase().includes(term),
    );
  }, [rows, q]);

  const byCode = useMemo(() => {
    const map = new Map<string, { code: string; views: number; downloads: number; pdfs: number }>();
    for (const r of filtered) {
      const entry = map.get(r.code) ?? { code: r.code, views: 0, downloads: 0, pdfs: 0 };
      entry.views += r.views;
      entry.downloads += r.downloads;
      entry.pdfs += 1;
      map.set(r.code, entry);
    }
    return [...map.values()];
  }, [filtered]);

  const counts = useMemo(() => {
    const list = roles.data ?? [];
    return {
      students: list.filter((r) => r.role === "student").length,
      teachers: list.filter((r) => r.role === "teacher").length,
      pdfs: (materials.data ?? []).length,
      active: new Set((events.data ?? []).map((e) => e.student_id)).size,
    };
  }, [roles.data, materials.data, events.data]);

  const uploadsByTeacher = useMemo(() => {
    const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
    const map = new Map<string, number>();
    for (const m of materials.data ?? []) {
      map.set(m.teacher_id, (map.get(m.teacher_id) ?? 0) + 1);
    }
    return [...map.entries()].map(([id, count]) => ({
      name: nameById.get(id) ?? "Faculty",
      count,
    }));
  }, [materials.data, profiles.data]);

  if (loading) return <CenteredSpinner />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Restricted" subtitle="Administrator access only." />
        <main className="mx-auto max-w-xl px-6 py-20 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            This dashboard is available only to administrator accounts.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={profile?.full_name ? `Admin · ${profile.full_name}` : "Administrator"}
        subtitle="Site-wide members, uploads and engagement."
        badge="Admin"
      />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<GraduationCap className="h-4 w-4" />} label="Students registered" value={counts.students} />
          <Stat icon={<Presentation className="h-4 w-4" />} label="Faculty registered" value={counts.teachers} />
          <Stat icon={<FileText className="h-4 w-4" />} label="PDFs uploaded" value={counts.pdfs} />
          <Stat icon={<Eye className="h-4 w-4" />} label="Students who engaged" value={counts.active} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Activity by subject code
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search a subject code to narrow every table and chart below.
              </p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search subject code"
                className="pl-9"
              />
            </div>
          </div>

          {byCode.length === 0 ? (
            <EmptyState text="No PDFs match this search yet." />
          ) : (
            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCode} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="code"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="views" name="Views" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="downloads" name="Downloads" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-6 grid gap-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.code} · {r.subject} · {r.regulation} · {r.teacher}
                    </p>
                  </div>
                </div>
                <div className="flex gap-5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="h-4 w-4" /> {r.views}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Download className="h-4 w-4" /> {r.downloads}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold text-foreground">PDFs per faculty</h2>
          {uploadsByTeacher.length === 0 ? (
            <EmptyState text="No faculty uploads yet." />
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {uploadsByTeacher.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-foreground">{t.name}</span>
                  <span className="text-muted-foreground">{t.count} PDFs</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)]">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </p>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="mt-6 rounded-xl border border-dashed border-border bg-secondary/30 p-10 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
