import { NextResponse } from "next/server";
import { COOKIE, passHash } from "@/proxy";

export async function POST(req: Request) {
  const form = await req.formData();
  const pw = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const expected = process.env.SITE_PASSWORD;

  if (!expected || pw === expected) {
    const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
    if (expected) {
      res.cookies.set(COOKIE, await passHash(expected), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      });
    }
    return res;
  }
  const url = new URL("/giris", req.url);
  url.searchParams.set("next", safeNext);
  url.searchParams.set("hata", "1");
  return NextResponse.redirect(url, 303);
}
