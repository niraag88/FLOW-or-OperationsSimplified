import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Users, Building2, Package2, Database, HardDrive, Trash2, Package, Trash, Archive, FolderMinus } from "lucide-react";

// Import setting components
import CompanySettings from "../components/settings/CompanySettings";
// import UserManagement from "../components/settings/UserManagement"; // Removed
import BrandManagement from "../components/settings/BrandManagement";
import CustomerManagement from "../components/settings/CustomerManagement";
import BookClosingManager from "../components/settings/BookClosingManager";
import StorageUsage from "../components/settings/StorageUsage";
import SettingsStorage from "./SettingsStorage";
import RetentionSettings from "../components/settings/RetentionSettings";
import RecycleBin from "../components/settings/RecycleBin";
import InventorySettings from "../components/settings/InventorySettings";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("company");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          Settings
        </h1>
        <p className="text-gray-600 text-sm sm:text-base">Manage your application settings and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile: Scrollable horizontal tabs */}
        <div className="w-full overflow-x-auto">
          <TabsList className="grid grid-cols-7 min-w-[600px] sm:min-w-0 sm:w-full">
            <TabsTrigger value="company" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Company</span>
              <span className="sm:hidden">Co.</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Customers</span>
              <span className="sm:hidden">Cust.</span>
            </TabsTrigger>
            <TabsTrigger value="brands" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Package2 className="w-4 h-4" />
              <span className="hidden sm:inline">Brands</span>
              <span className="sm:hidden">Br.</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
              <span className="sm:hidden">Inv.</span>
            </TabsTrigger>
            <TabsTrigger value="books" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Books</span>
              <span className="sm:hidden">Bk.</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">Storage</span>
              <span className="sm:hidden">St.</span>
            </TabsTrigger>
            <TabsTrigger value="recycle" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <FolderMinus className="w-4 h-4" />
              <span className="hidden sm:inline">Recycle Bin</span>
              <span className="sm:hidden">Rec.</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="company" className="mt-4 sm:mt-6">
          <CompanySettings />
        </TabsContent>

        <TabsContent value="customers" className="mt-4 sm:mt-6">
          <CustomerManagement />
        </TabsContent>

        <TabsContent value="brands" className="mt-4 sm:mt-6">
          <BrandManagement />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 sm:mt-6">
          <InventorySettings />
        </TabsContent>

        <TabsContent value="books" className="mt-4 sm:mt-6">
          <BookClosingManager />
        </TabsContent>

        <TabsContent value="storage" className="mt-4 sm:mt-6">
          <div className="space-y-6">
            <SettingsStorage />
            <RetentionSettings />
          </div>
        </TabsContent>

        <TabsContent value="recycle" className="mt-4 sm:mt-6">
          <RecycleBin />
        </TabsContent>
      </Tabs>
    </div>
  );
}