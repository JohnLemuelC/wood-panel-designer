import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Wood Panel Wall Designer</h1>
          <p className="text-stone-600 mt-2">
            Upload your photos, arrange them on your wall, and print a 1:1 template to hang them perfectly.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/signup"
            className="flex-1 bg-stone-900 text-white text-center py-3 rounded-lg font-medium hover:bg-stone-800"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="flex-1 border border-stone-300 text-stone-900 text-center py-3 rounded-lg font-medium hover:bg-stone-100"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
