// src/components/layout/store/StoreLayout.tsx
import StoreNavbar from './StoreNavbar';
import StoreSidebar from './StoreSidebar';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-800">
      <StoreSidebar />
      <div className="flex flex-col flex-1">
        <StoreNavbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
