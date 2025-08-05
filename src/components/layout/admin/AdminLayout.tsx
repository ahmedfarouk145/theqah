// src/components/layout/admin/AdminLayout.tsx
import AdminNavbar from './AdminNavbar';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-900">
      <AdminSidebar />
      <div className="flex flex-col flex-1">
        <AdminNavbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
