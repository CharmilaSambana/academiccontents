import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/material-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const source = requestUrl.searchParams.get("url");
        const mode = requestUrl.searchParams.get("mode") === "download" ? "download" : "inline";
        const fileName = sanitizeFileName(requestUrl.searchParams.get("name") ?? "material.pdf");

        if (!source) {
          return new Response("Missing file URL", { status: 400 });
        }

        const sourceUrl = parseAllowedStorageUrl(source);
        if (!sourceUrl) {
          return new Response("Invalid file URL", { status: 400 });
        }

        const upstream = await fetch(sourceUrl);
        if (!upstream.ok || !upstream.body) {
          return new Response("Could not load PDF", { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "application/pdf",
            "content-disposition": `${mode === "download" ? "attachment" : "inline"}; filename="${fileName}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});

function parseAllowedStorageUrl(value: string) {
  try {
    const sourceUrl = new URL(value);

    // Host allow-list: the configured Supabase project when available,
    // otherwise any Supabase storage host (env vars may be unset on
    // third-party hosting such as Vercel).
    const configuredUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      import.meta.env?.VITE_SUPABASE_URL;

    const isAllowedHost = configuredUrl
      ? sourceUrl.host === new URL(configuredUrl).host
      : sourceUrl.protocol === "https:" && sourceUrl.host.endsWith(".supabase.co");

    const isSignedMaterialUrl = sourceUrl.pathname.startsWith(
      "/storage/v1/object/sign/materials/",
    );
    const hasToken = sourceUrl.searchParams.has("token");

    return isAllowedHost && isSignedMaterialUrl && hasToken ? sourceUrl : null;
  } catch {
    return null;
  }
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[\\/\r\n"]/g, "_").trim();
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned || "material"}.pdf`;
}