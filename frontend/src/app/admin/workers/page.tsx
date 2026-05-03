import { PageFrame } from "../../../components/page-frame";
import { Panel } from "../../../components/panel";
import { SubstituteDirectory } from "../../../components/substitute-directory";
import { getWorkers } from "../../../lib/api";

export default async function WorkersPage() {
  const workers = await getWorkers();

  return (
    <PageFrame
      eyebrow="Substitute Roster"
      title="Substitutes"
      description="Browse the substitute pool. Filter by availability, city, language, or qualification."
    >
      <Panel title="Substitute directory">
        <SubstituteDirectory workers={workers} />
      </Panel>
    </PageFrame>
  );
}
