import AppHeader from "@/components/AppHeader";
import NewJobForm from "./NewJobForm";

export default function NewJobPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader />
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">New job</h1>
        <NewJobForm />
      </main>
    </div>
  );
}
