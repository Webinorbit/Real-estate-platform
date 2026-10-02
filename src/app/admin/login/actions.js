"use server";

import { redirect } from "next/navigation";
import { apiRaw } from "@/lib/api";
import { adoptSessionCookie, clearSessionCookie } from "@/lib/auth";

export async function loginAction(_prev, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  if (!email || !password) return { error: "Enter your email and password." };

  const res = await apiRaw("/api/auth/login", { method: "POST", body: { email, password } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { error: body?.error || "Could not sign you in. Please try again." };
  }
  await adoptSessionCookie(res);
  redirect(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/admin/login");
}
