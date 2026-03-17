import { notFound } from "next/navigation";

// Preview via nanoid has been removed — clients now access builds via /approve/[bookingId]
export default function PreviewPage() {
  notFound();
}
