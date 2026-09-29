import { NextResponse, type NextRequest } from "next/server";

// SITE_PASSWORD tanımlıysa site sadece şifreyi bilen arkadaşlara açılır.
export const COOKIE = "famio_pass";

export async function passHash(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("famio:" + pw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await passHash(pw))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|giris|api/giris).*)"],
};
