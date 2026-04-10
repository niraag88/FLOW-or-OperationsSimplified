
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/hooks/useAuth";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Truck, 
  FileText, 
  BarChart3, 
  Settings,
  User,
  Menu,
  X,
  ClipboardList,
  LogOut,
  ChevronDown,
  Building2,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const navigationItems: any[] = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    type: "single"
  },
  {
    title: "Internal",
    icon: Building2,
    type: "dropdown",
    items: [
      {
        title: "Inventory",
        url: createPageUrl("Inventory"),
        icon: Package,
      },
      {
        title: "Purchase Orders",
        url: createPageUrl("Purchase Orders"),
        icon: ShoppingCart,
      },
      {
        title: "Reports",
        url: createPageUrl("Reports"),
        icon: BarChart3,
      }
    ]
  },
  {
    title: "External",
    icon: Users2,
    type: "dropdown",
    items: [
      {
        title: "Quotations",
        url: createPageUrl("Quotations"),
        icon: ClipboardList,
      },
      {
        title: "Invoices",
        url: createPageUrl("Invoices"),
        icon: FileText,
      },
      {
        title: "Delivery Orders",
        url: createPageUrl("Delivery Orders"),
        icon: Truck,
      }
    ]
  },
  {
    title: "Settings",
    icon: Settings,
    type: "dropdown",
    items: [
      {
        title: "General Settings",
        url: createPageUrl("Settings"),
        icon: Settings,
      },
      {
        title: "User Management",
        url: createPageUrl("UserManagement"),
        icon: Users2,
        adminOnly: true
      }
    ]
  },
];


interface LayoutProps {
  children: React.ReactNode;
  currentPageName?: string;
}

export default function Layout({ children, currentPageName = "" }: LayoutProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Get current user from auth context
  const currentUser = user ? {
    full_name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
    email: user.email || '',
    role: user.role,
  } : null;

  // Don't wrap Print page
  if (currentPageName === "Print") {
    return <>{children}</>;
  }

  const isActiveItem = (item: any) => {
    if (item.type === "single") {
      return location.pathname.startsWith(item.url);
    } else if (item.type === "dropdown") {
      return item.items.some((subItem: any) => location.pathname.startsWith(subItem.url));
    }
    return false;
  };

  const getCurrentPageTitle = () => {
    for (const item of navigationItems) {
      if (item.type === "single" && location.pathname.startsWith(item.url)) {
        return item.title;
      } else if (item.type === "dropdown") {
        const subItem = item.items.find((sub: any) => location.pathname.startsWith(sub.url));
        if (subItem) {
          return subItem.title;
        }
      }
    }
    return currentPageName || "FLOW";
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error: any) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 shadow-xl border-b border-slate-800">
        <div className="px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden text-gray-300 hover:text-white hover:bg-slate-800 p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
              
              <Link to="/" className="outline-none focus:outline-none">
                <img 
                  src="/flow-logo-new.png" 
                  alt="FLOW Logo" 
                  className="h-8 sm:h-10 w-auto object-contain"
                />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-1">
              {navigationItems.map((item, index) => {
                const isActive = isActiveItem(item);
                
                if (item.type === "single") {
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-emerald-500 text-white shadow-lg'
                          : 'text-gray-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.title}
                    </Link>
                  );
                } else if (item.type === "dropdown") {
                  return (
                    <DropdownMenu key={item.title}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? 'bg-emerald-500 text-white shadow-lg'
                              : 'text-gray-300 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.title}
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        {item.items
                          .filter((subItem: any) => !subItem.adminOnly || currentUser?.role === 'Admin')
                          .map((subItem: any) => (
                          <DropdownMenuItem key={subItem.title} asChild>
                            <Link
                              to={subItem.url}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <subItem.icon className="w-4 h-4" />
                              {subItem.title}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }
                return null;
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-slate-800 flex items-center gap-1 sm:gap-2 p-2">
                    <User className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline text-sm truncate max-w-[100px]">
                      {currentUser?.full_name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium truncate">{currentUser?.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
                    <p className="text-xs text-gray-500 capitalize">Role: {currentUser?.role}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.href = createPageUrl('Settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-900">
            <div className="px-3 sm:px-4 py-4 space-y-2 max-h-[70vh] overflow-y-auto">
              {navigationItems.map((item) => {
                if (item.type === "single") {
                  const isActive = location.pathname.startsWith(item.url);
                  return (
                    <Link
                      key={item.title}
                      to={item.url}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-emerald-500 text-white'
                          : 'text-gray-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  );
                } else if (item.type === "dropdown") {
                  return (
                    <div key={item.title} className="space-y-1">
                      <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400">
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      {item.items
                        .filter((subItem: any) => !subItem.adminOnly || currentUser?.role === 'Admin')
                        .map((subItem: any) => {
                        const isActive = location.pathname.startsWith(subItem.url);
                        return (
                          <Link
                            key={subItem.title}
                            to={subItem.url}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-6 py-2 rounded-lg text-sm transition-all duration-200 ${
                              isActive
                                ? 'bg-emerald-500 text-white'
                                : 'text-gray-300 hover:text-white hover:bg-slate-800'
                            }`}
                          >
                            <subItem.icon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{subItem.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-3 sm:px-4 lg:px-8 py-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
              {getCurrentPageTitle()}
            </h2>
          </div>
        </div>
        <div className="p-3 sm:p-4 lg:p-8 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
