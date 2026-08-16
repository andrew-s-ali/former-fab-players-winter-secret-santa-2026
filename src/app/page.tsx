import { eventTitle } from "@/lib/event";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {eventTitle()}
        </h1>
        <p className="mt-4 text-base opacity-70">
          Sign-ups open soon. Check back for details.
        </p>
      </div>
    </main>
  );
}
