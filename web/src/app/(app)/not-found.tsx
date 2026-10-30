import { EmptyState, LinkButton } from "@/components/common";

export default function NotFound() {
  return (
    <EmptyState className="m-6" title="No encontramos esta página" body="Revise la dirección o vuelva al panel." action={<LinkButton href="/dashboard" variant="outline" size="sm">Ir al panel</LinkButton>} />
  );
}
