// src/components/layout/customer/CustomerLayout.tsx
import CustomerNavbar from './CustomerNavbar';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <CustomerNavbar />
      <main className="pt-16 px-4">{children}</main>
    </div>
  );
}
