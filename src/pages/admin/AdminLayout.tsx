import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Settings, LogOut, FileText, Users, BarChart3, Wallet, MessageCircle, CreditCard, Building2, BellRing, WifiOff, Ticket, PieChart, Menu, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useState } from 'react';

export default function AdminLayout() {
  const navigate = useNavigate();
  const { storeSettings, logout } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { name: 'نظرة عامة', path: '/admin/overview', icon: LayoutDashboard },
    { name: 'التحليلات والتقارير', path: '/admin/analytics', icon: BarChart3 },
    { name: 'المخزون والمنتجات', path: '/admin/inventory', icon: Package },
    { name: 'الفواتير والمرتجعات', path: '/admin/invoices', icon: FileText },
    { name: 'قاعدة العملاء', path: '/admin/customers', icon: Users },
    { name: 'حملات واتساب', path: '/admin/whatsapp-campaigns', icon: MessageCircle },
    { name: 'الموردين والمشتريات', path: '/admin/suppliers', icon: Users },
    { name: 'حسابات الآجل', path: '/admin/deferred', icon: CreditCard },
    { name: 'إدارة المحاسبين', path: '/admin/cashiers', icon: Users },
    { name: 'الرواتب والموظفين', path: '/admin/employees', icon: Users },
    { name: 'الخزينة والمصاريف', path: '/admin/finance', icon: Wallet },
    { name: 'سلف وتمويل', path: '/admin/financing', icon: Building2 },
    { name: 'الميزانية العامة', path: '/admin/budget', icon: PieChart },
    { name: 'الفواتير الأوفلاين', path: '/admin/offline-invoices', icon: WifiOff },
    { name: 'كوبونات الخصم', path: '/admin/coupons', icon: Ticket },
    { name: 'تنبيهات النواقص', path: '/admin/stock-alerts', icon: BellRing },
    { name: 'إعدادات النظام', path: '/admin/settings', icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden" dir="rtl">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar — ثابت على الكمبيوتر، Drawer منزلق على الموبايل */}
      <div className={`fixed lg:static inset-y-0 right-0 w-72 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-40 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:w-64`}>
        <div className="p-6 pb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-2xl border border-slate-700 flex-1 min-w-0">
            <img src={storeSettings.logo} alt="Logo" className="w-10 h-10 rounded-xl bg-white object-cover" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-bold text-white text-sm truncate" title={storeSettings.name}>{storeSettings.name}</span>
              <span className="text-xs text-slate-400">لوحة الإدارة</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl shrink-0" aria-label="إغلاق القائمة">
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              style={({ isActive }) => isActive ? { background: storeSettings.themeColor } : {}}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl transition ${
                  isActive
                    ? 'text-white font-bold shadow-lg'
                    : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={20} />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-3 text-red-400 hover:bg-black/20 hover:text-red-300 rounded-xl transition"
          >
            <LogOut size={20} />
            خروج من الإدارة
          </button>
        </div>
      </div>

      {/* العمود الرئيسي */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* شريط علوي للموبايل */}
        <header className="lg:hidden flex items-center gap-3 bg-slate-900 text-white px-3 py-2.5 shadow-md z-20 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-800 rounded-xl" aria-label="فتح القائمة">
            <Menu size={24} />
          </button>
          <img src={storeSettings.logo} alt="" className="h-8 w-auto max-w-[90px] rounded-lg bg-white object-contain" />
          <span className="font-bold text-sm truncate flex-1">{storeSettings.name}</span>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50 relative">
          <div
            style={{ backgroundColor: storeSettings.themeColor + '10' }}
            className="absolute top-0 left-0 w-full h-64 -z-10"
          ></div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
