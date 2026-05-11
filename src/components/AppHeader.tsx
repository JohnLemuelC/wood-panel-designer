import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role = "customer";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role) role = profile.role;
  }

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href={role === "operator" ? "/operator" : "/customer"} className="font-bold text-stone-900">
          Wood Panel Designer
        </Link>
        <div className="flex items-center gap-4">
          {role === "operator" && (
            <>
              <Link href="/operator" className="text-sm text-stone-700 hover:text-stone-900">
                Pipeline
              </Link>
              <Link href="/operator/catalog" className="text-sm text-stone-700 hover:text-stone-900">
                Catalog
              </Link>
            </>
          )}
          {role === "customer" && (
            <Link href="/customer" className="text-sm text-stone-700 hover:text-stone-900">
              My jobs
            </Link>
          )}
          <span className="text-sm text-stone-500 hidden sm:inline">{user?.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-stone-700 hover:text-stone-900 border border-stone-300 rounded px-3 py-1"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
