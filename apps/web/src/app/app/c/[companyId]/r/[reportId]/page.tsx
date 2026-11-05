import { notFound } from "next/navigation";
import { CaseProvider } from "@/components/case/CaseProvider";
import { ReportEditor } from "@/components/case/ReportEditor";
import { loadCase, session } from "@/server/data";

export default async function ReportPage({ params }: { params: Promise<{ companyId: string; reportId: string }> }) {
  const { companyId, reportId } = await params;
  const { supabase } = await session();
  const loaded = await loadCase(supabase, companyId, { logOpen: true });
  if (!loaded) notFound();
  return (
    <CaseProvider companyId={companyId} project={loaded.project} revision={loaded.revision}>
      <ReportEditor reportId={reportId} companyName={loaded.company.name} submissions={loaded.submissions} />
    </CaseProvider>
  );
}
