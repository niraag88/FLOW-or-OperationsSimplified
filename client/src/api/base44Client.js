export const DEMO = true; // UI-only mode on Replit
export const base44 = {
  auth: { async me(){ if(DEMO) return { email:"admin@local", role:"Admin", isOwner:true }; throw new Error("Base44 SDK not configured"); } },
  entities: new Proxy({}, { get(){ if(DEMO){ return {
    async list(){ return []; }, async create(){ return { id: Math.random().toString(36).slice(2) }; },
    async update(){ return true; }, async delete(){ return true; }, async getById(){ return null; }
  }; } throw new Error("Base44 entity not available off-platform"); } })
};
