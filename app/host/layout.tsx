import LeaderGuard from "../../components/LeaderGuard";

export const instant = false;

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LeaderGuard>{children}</LeaderGuard>;
}