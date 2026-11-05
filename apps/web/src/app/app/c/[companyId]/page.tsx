import { notFound } from "next/navigation";
import { CaseProvider } from "@/components/case/CaseProvider";
import { CompanyView } from "@/components/case/CompanyView";
import { loadCase, session } from "@/server/data";

export default async function CompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { supabase } = await session();
  const loaded = await loadCase(supabase, companyId, { logOpen: true });
  if (!loaded) notFound();
  return (
    <CaseProvider companyId={companyId} project={loaded.project} revision={loaded.revision}>
      <CompanyView company={loaded.company} workspace={loaded.workspace} submissions={loaded.submissions} />
    </CaseProvider>
  );
}
