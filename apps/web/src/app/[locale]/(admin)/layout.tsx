
import Link from "next/link";

const navigation = [
  { name: "Dashboard", href: "/admin" },
  { name: "Revenue", href: "/admin/revenue" },
  { name: "Adoption", href: "/admin/adoption" },
  { name: "Owners", href: "/admin/owners" },
  { name: "Sites", href: "/admin/sites" },
  { name: "Audit", href: "/admin/audit" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="w-full border-b p-4 md:w-56 md:border-b-0 md:border-r">
        <h2 className="mb-4 text-lg font-bold">Admin Console</h2>

        <nav className="flex flex-wrap gap-3 md:flex-col">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-ink-600 hover:text-ink-950"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
