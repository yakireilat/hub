import Link from "next/link";
import { notFound } from "next/navigation";
import { NAV } from "@/lib/nav";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const entry = NAV.find((n) => n.slug === section && n.phase);
  if (!entry) notFound();

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">{entry.label}</h1>
      <p className="text-muted">
        This screen arrives in phase {entry.phase}. Until then, everything it will show already reaches{" "}
        <Link href="/" className="text-accent hover:text-accent-soft">
          Today
        </Link>{" "}
        and the ⌘K palette.
      </p>
    </div>
  );
}
