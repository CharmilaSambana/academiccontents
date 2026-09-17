import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";

const PdfCanvasViewer = lazy(() => import("@/components/pdf-canvas-viewer"));

import { toast } from "sonner";
import { Download, Eye, FileText, Loader2, Search } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REGULATIONS } from "@/lib/regulations";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/student")({
  head: () => ({
    meta: [
      { title: "Student dashboard — ScholarShare" },
      {
        name: "description",
        content: "Choose your regulation and open the subject PDFs your faculty shared with you.",
      },
      { property: "og:title", content: "Student dashboard — ScholarShare" },
      { property: "og:description", content: "Course PDFs filtered to your regulation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

function StudentPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [viewer, setViewer] = useState<{ title: string; url: string } | null>(null);
  const regulation = profile?.regulation ?? null;

  const materials = useQuery({
    queryKey: ["student-materials", regulation],
    enabled: !!regulation,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, file_path, created_at, teacher_id, subjects(name, code)")
        .eq("regulation", regulation!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const teachers = useQuery({
    queryKey: ["teacher-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredMaterials = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = materials.data ?? [];
    if (!term) return rows;
    return rows.filter((m) => {
      const s = m.subjects as { name: string; code: string } | null;
      return (
        m.title.toLowerCase().includes(term) ||
        (s?.code ?? "").toLowerCase().includes(term) ||
        (s?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [materials.data, q]);

  const myEvents = useQuery({
    queryKey: ["student-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_events")
        .select("material_id, event_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function chooseRegulation(value: string) {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ regulation: value })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success(`Regulation set to ${value}`);
  }

  async function track(materialId: string, type: "view" | "download") {
    if (!user) return;
    await supabase
      .from("material_events")
      .upsert(
        { material_id: materialId, student_id: user.id, event_type: type },
        { onConflict: "material_id,student_id,event_type", ignoreDuplicates: true },
      );
    void queryClient.invalidateQueries({ queryKey: ["student-events", user.id] });
  }

  async function openMaterial(id: string, title: string, path: string, download: boolean) {
    const { data, error } = await supabase.storage
      .from("materials")
      .createSignedUrl(path, 600, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Could not open the file");

    const proxiedUrl = buildMaterialProxyUrl(data.signedUrl, title, download ? "download" : "inline");

    try {
      // Fetch the bytes ourselves so desktop browsers render a same-origin blob
      // instead of relying on plugin handling of a streamed remote URL.
      let res = await fetch(proxiedUrl);
      if (!res.ok) {
        // Fallback for hosts where the same-origin proxy route isn't available.
        res = await fetch(data.signedUrl);
      }
      if (!res.ok) throw new Error("Could not load PDF");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(
        blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }),
      );

      if (download) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${title}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        setViewer({ title, url: blobUrl });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
      return;
    }
    void track(id, download ? "download" : "view");
  }

  if (loading) return <CenteredSpinner />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}` : "Student"}
        subtitle="Materials are filtered to the regulation you select."
        badge={regulation ?? undefined}
      />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold text-foreground">Your regulation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the syllabus regulation you're studying under. You can change it any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {REGULATIONS.map((r) => (
              <button
                key={r}
                disabled={saving}
                onClick={() => chooseRegulation(r)}
                className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                  regulation === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary/50 text-foreground hover:border-primary/40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Shared materials {regulation ? `for ${regulation}` : ""}
            </h2>
            <div className="relative w-full max-w-xs">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search subject code or title"
                className="pl-9"
              />
            </div>
          </div>

          {!regulation ? (
            <EmptyState text="Select your regulation above to see the PDFs shared with your batch." />
          ) : materials.isLoading ? (
            <CenteredSpinner />
          ) : filteredMaterials.length === 0 ? (
            <EmptyState text="No PDFs match this search yet." />
          ) : (
            <div className="mt-4 grid gap-4">
              {filteredMaterials.map((m) => {
                const seen = myEvents.data?.some(
                  (e) => e.material_id === m.id && e.event_type === "view",
                );
                const subject = m.subjects as { name: string; code: string } | null;
                const teacherName =
                  teachers.data?.find((t) => t.id === m.teacher_id)?.full_name || "Faculty";
                return (
                  <article
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-foreground">{m.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {subject?.name}
                          {subject?.code ? ` (${subject.code})` : ""} ·{" "}
                          {teacherName}
                        </p>
                        {seen ? (
                          <span className="mt-1 inline-block text-xs font-medium text-accent">
                            Already opened
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openMaterial(m.id, m.title, m.file_path, false)}
                      >
                        <Eye className="mr-2 h-4 w-4" /> View
                      </Button>
                      <Button onClick={() => openMaterial(m.id, m.title, m.file_path, true)}>
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <ProfileSection />
      </main>

      <Dialog
        open={!!viewer}
        onOpenChange={(o) => {
          if (!o && viewer) {
            URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }
        }}
      >
        <DialogContent className="max-w-[min(96vw,72rem)]">
          <DialogHeader>
            <DialogTitle className="font-display">{viewer?.title}</DialogTitle>
          </DialogHeader>
          {viewer ? (
            <>
              <ClientOnly
                fallback={
                  <div className="h-[75vh] w-full rounded-lg border border-border bg-secondary/30" />
                }
              >
                <Suspense
                  fallback={
                    <div className="h-[75vh] w-full rounded-lg border border-border bg-secondary/30" />
                  }
                >
                  <PdfCanvasViewer url={viewer.url} />
                </Suspense>
              </ClientOnly>
              <a
                href={viewer.url}
                download={`${viewer.title}.pdf`}
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Download this PDF
              </a>
            </>
          ) : null}

        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileSection() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = useQuery({
    queryKey: ["my-edit-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edit_requests")
        .select("id, field, requested_value, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const current: Record<string, string | null | undefined> = {
    full_name: profile?.full_name,
    student_id: profile?.student_id,
    department: profile?.department,
    regulation: profile?.regulation,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!field) return toast.error("Choose what you want changed");
    if (!value.trim()) return toast.error("Enter the new value");
    setBusy(true);
    const { error } = await supabase.from("edit_requests").insert({
      student_id: user.id,
      field,
      current_value: current[field] ?? null,
      requested_value: value.trim(),
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setField("");
    setValue("");
    toast.success("Request sent to the administrator");
    void queryClient.invalidateQueries({ queryKey: ["my-edit-requests", user.id] });
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-lg font-semibold text-foreground">My profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your details are read-only. Ask the administrator to change anything that's wrong.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ReadOnly label="Full name" value={profile?.full_name} />
        <ReadOnly label="Email" value={profile?.email} />
        <ReadOnly label="Student ID" value={profile?.student_id} />
        <ReadOnly label="Department" value={profile?.department} />
        <ReadOnly label="Regulation" value={profile?.regulation} />
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>What should change?</Label>
          <Select value={field} onValueChange={setField}>
            <SelectTrigger>
              <SelectValue placeholder="Select a detail" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full_name">Full name</SelectItem>
              <SelectItem value="student_id">Student ID</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="regulation">Regulation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="req-value">Correct value</Label>
          <Input id="req-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Request change"}
        </Button>
      </form>

      {(requests.data?.length ?? 0) > 0 ? (
        <div className="mt-5 grid gap-2">
          {requests.data!.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-2 text-sm"
            >
              <span className="text-foreground">
                {r.field.replace("_", " ")} → {r.requested_value}
              </span>
              <span className="text-xs text-muted-foreground uppercase">{r.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function buildMaterialProxyUrl(signedUrl: string, title: string, mode: "inline" | "download") {
  const params = new URLSearchParams({
    url: signedUrl,
    name: `${title}.pdf`,
    mode,
  });
  return `/api/public/material-proxy?${params.toString()}`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-secondary/30 p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
