import { db } from "../db";
import { eq } from "drizzle-orm";
import { companySettings, type CompanySettings } from "@shared/schema";

export async function getCompanySettings() {
  const [settings] = await db.select().from(companySettings).limit(1);
  return settings;
}

export async function updateCompanySettings(data: Partial<CompanySettings>) {
  const existing = await getCompanySettings();
  if (existing) {
    const [settings] = await db.update(companySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companySettings.id, existing.id))
      .returning();
    return settings;
  } else {
    // For new company settings, we need the required fields
    const defaultSettings = {
      companyName: data.companyName || '',
      ...data,
      updatedAt: new Date()
    };
    const [settings] = await db.insert(companySettings).values(defaultSettings).returning();
    return settings;
  }
}
