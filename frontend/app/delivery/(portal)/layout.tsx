// app/delivery/(portal)/layout.tsx
import DeliveryShell from "@/components/delivery/delivery-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <DeliveryShell>{children}</DeliveryShell>;
}