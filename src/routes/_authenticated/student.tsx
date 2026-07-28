import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
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

  async function openMaterial(id: string, path: string, download: boolean) {
    const { data, error } = await supabase.storage
      .from("materials")
      .createSignedUrl(path, 300, download ? { download: true } : undefined);
    if (error || !data) return toast.error(error?.message ?? "Could not open the file");
    await track(id, download ? "download" : "view");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
          <h2 className="font-display text-lg font-semibold text-foreground">
            Shared materials {regulation ? `for ${regulation}` : ""}
          </h2>

          {!regulation ? (
            <EmptyState text="Select your regulation above to see the PDFs shared with your batch." />
          ) : materials.isLoading ? (
            <CenteredSpinner />
          ) : (materials.data?.length ?? 0) === 0 ? (
            <EmptyState text="No PDFs have been shared for this regulation yet." />
          ) : (
            <div className="mt-4 grid gap-4">
              {materials.data!.map((m) => {
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
                          {teacher?.full_name || "Faculty"}
                        </p>
                        {seen ? (
                          <span className="mt-1 inline-block text-xs font-medium text-accent">
                            Already opened
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openMaterial(m.id, m.file_path, false)}>
                        <Eye className="mr-2 h-4 w-4" /> View
                      </Button>
                      <Button onClick={() => openMaterial(m.id, m.file_path, true)}>
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
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
