import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookPlus, Download, Eye, FileText, Loader2, UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGULATIONS } from "@/lib/regulations";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/teacher")({
  head: () => ({
    meta: [
      { title: "Faculty dashboard — ScholarShare" },
      {
        name: "description",
        content:
          "Add subjects per regulation, upload PDFs, and track how many students viewed and downloaded them.",
      },
      { property: "og:title", content: "Faculty dashboard — ScholarShare" },
      { property: "og:description", content: "Upload PDFs and track student reach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherPage,
});

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  regulation: string;
}

function TeacherPage() {
  const { user, profile, loading } = useAuth();
  const queryClient = useQueryClient();

  const subjects = useQuery({
    queryKey: ["subjects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, code, regulation")
        .eq("teacher_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const materials = useQuery({
    queryKey: ["teacher-materials", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, regulation, created_at, subject_id, subjects(name, code)")
        .eq("teacher_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["teacher-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_events")
        .select("material_id, event_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const rows = materials.data ?? [];
    return rows.map((m) => {
      const mine = (events.data ?? []).filter((e) => e.material_id === m.id);
      const subject = m.subjects as { name: string; code: string } | null;
      return {
        id: m.id,
        title: m.title,
        subject: subject?.name ?? "",
        regulation: m.regulation,
        label: `${subject?.name ?? "Subject"} · ${m.regulation}`,
        views: mine.filter((e) => e.event_type === "view").length,
        downloads: mine.filter((e) => e.event_type === "download").length,
      };
    });
  }, [materials.data, events.data]);

  const totals = stats.reduce(
    (acc, s) => ({ views: acc.views + s.views, downloads: acc.downloads + s.downloads }),
    { views: 0, downloads: 0 },
  );

  if (loading) return <CenteredSpinner />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={profile?.full_name ? `Prof. ${profile.full_name}` : "Faculty"}
        subtitle="Manage your subjects, share PDFs per regulation and track reach."
        badge="Faculty"
      />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <SubjectForm
            userId={user?.id}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["subjects", user?.id] })}
            subjects={subjects.data ?? []}
          />
          <UploadForm
            userId={user?.id}
            subjects={subjects.data ?? []}
            onDone={() =>
              queryClient.invalidateQueries({ queryKey: ["teacher-materials", user?.id] })
            }
          />
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Reach of your materials
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Unique students who opened or downloaded each PDF.
              </p>
            </div>
            <div className="flex gap-3">
              <Metric icon={<Eye className="h-4 w-4" />} label="Total views" value={totals.views} />
              <Metric
                icon={<Download className="h-4 w-4" />}
                label="Total downloads"
                value={totals.downloads}
              />
            </div>
          </div>

          {stats.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border bg-secondary/30 p-10 text-center text-sm text-muted-foreground">
              Upload a PDF to start collecting view and download analytics.
            </p>
          ) : (
            <>
              <div className="mt-6 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
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
                    <Bar
                      dataKey="downloads"
                      name="Downloads"
                      fill="var(--chart-2)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 grid gap-3">
                {stats.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.subject} · {s.regulation}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-5 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-4 w-4" /> {s.views} viewed
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Download className="h-4 w-4" /> {s.downloads} downloaded
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </p>
      <p className="font-display text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SubjectForm({
  userId,
  subjects,
  onDone,
}: {
  userId?: string;
  subjects: SubjectRow[];
  onDone: () => void;
}) {
  const [regulation, setRegulation] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const code = String(data.get("code") ?? "").trim();
    if (!name) return toast.error("Enter the subject name");
    if (!code) return toast.error("Subject code is required");
    if (!regulation) return toast.error("Select a regulation");

    setBusy(true);
    const { error } = await supabase
      .from("subjects")
      .insert({ teacher_id: userId, name, code, regulation });
    setBusy(false);
    if (error) return toast.error(error.message);
    form.reset();
    setRegulation("");
    toast.success("Subject added");
    onDone();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
        <BookPlus className="h-5 w-5 text-primary" /> Your subjects
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add the same subject once per regulation you teach it for.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="subject-name">Subject name</Label>
            <Input id="subject-name" name="name" maxLength={120} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject-code">Subject code (required)</Label>
            <Input
              id="subject-code"
              name="code"
              maxLength={30}
              required
              placeholder="e.g. CS301"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Regulation</Label>
          <Select value={regulation} onValueChange={setRegulation}>
            <SelectTrigger>
              <SelectValue placeholder="Select regulation" />
            </SelectTrigger>
            <SelectContent>
              {REGULATIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Adding…" : "Add subject"}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap gap-2">
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects added yet.</p>
        ) : (
          subjects.map((s) => (
            <span
              key={s.id}
              className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground"
            >
              {s.code} · {s.name} · {s.regulation}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function UploadForm({
  userId,
  subjects,
  onDone,
}: {
  userId?: string;
  subjects: SubjectRow[];
  onDone: () => void;
}) {
  const [subjectId, setSubjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const file = data.get("file") as File | null;
    const subject = subjects.find((s) => s.id === subjectId);

    if (!subject) return toast.error("Select a subject and regulation");
    if (!title) return toast.error("Enter a title for the PDF");
    if (!file || file.size === 0) return toast.error("Choose a PDF file");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are allowed");
    if (file.size > 20 * 1024 * 1024) return toast.error("PDF must be under 20MB");

    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("materials")
      .upload(path, file, { contentType: "application/pdf" });

    if (uploadError) {
      setBusy(false);
      return toast.error(uploadError.message);
    }

    const { error } = await supabase.from("materials").insert({
      teacher_id: userId,
      subject_id: subject.id,
      regulation: subject.regulation,
      title,
      file_path: path,
    });
    setBusy(false);
    if (error) return toast.error(error.message);

    form.reset();
    setSubjectId("");
    toast.success("PDF shared with students");
    onDone();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
        <UploadCloud className="h-5 w-5 text-primary" /> Share a PDF
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each subject entry already carries its regulation, so students see the right file.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label>Subject &amp; regulation</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder={subjects.length ? "Select subject" : "Add a subject first"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {s.regulation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="material-title">Title</Label>
          <Input id="material-title" name="title" maxLength={140} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="material-file">PDF file</Label>
          <Input id="material-file" name="file" type="file" accept="application/pdf" required />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Uploading…" : "Upload & share"}
        </Button>
      </form>
    </section>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
