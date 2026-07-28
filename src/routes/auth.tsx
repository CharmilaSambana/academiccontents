import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, GraduationCap, Presentation } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  role: z.enum(["student", "teacher"]).catch("student"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in or register — ScholarShare" },
      {
        name: "description",
        content: "Create your student or faculty account, or sign in to access shared course PDFs.",
      },
      { property: "og:title", content: "Sign in or register — ScholarShare" },
      {
        property: "og:description",
        content: "Student and faculty accounts for the ScholarShare course PDF portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const { role } = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeByRole(navigate);
    });
  }, [navigate]);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const parsed = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!fullName) return toast.error("Please enter your full name");
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role },
      },
    });
    setLoading(false);

    if (error) return toast.error(error.message);
    toast.success("Account created. Signing you in…");
    await routeByRole(navigate);
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = credentials.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    await routeByRole(navigate);
  }

  const isTeacher = role === "teacher";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Change role
        </Link>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {isTeacher ? (
                <Presentation className="h-5 w-5" />
              ) : (
                <GraduationCap className="h-5 w-5" />
              )}
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold text-foreground">
                {isTeacher ? "Faculty access" : "Student access"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Register if you're new, otherwise sign in.
              </p>
            </div>
          </div>

          <Tabs defaultValue="login" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <Field id="login-email" name="email" label="Email" type="email" />
                <Field id="login-password" name="password" label="Password" type="password" />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 pt-4">
                <Field id="reg-name" name="fullName" label="Full name" type="text" />
                <Field id="reg-email" name="email" label="Email" type="email" />
                <Field id="reg-password" name="password" label="Password" type="password" />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : `Create ${isTeacher ? "faculty" : "student"} account`}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type,
}: {
  id: string;
  name: string;
  label: string;
  type: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} required maxLength={255} autoComplete="on" />
    </div>
  );
}

async function routeByRole(navigate: ReturnType<typeof useNavigate>) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  navigate({ to: data?.role === "teacher" ? "/teacher" : "/student", replace: true });
}
