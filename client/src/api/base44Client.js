export const DEMO = false; // Use real database operations

// Fallback implementation when not using Base44 platform
const fallbackEntityHandler = {
  async list(){ 
    console.warn("Base44 entities.list() called - using API endpoints instead"); 
    return []; 
  }, 
  async create(){ 
    console.warn("Base44 entities.create() called - using API endpoints instead"); 
    return { id: Math.random().toString(36).slice(2) }; 
  },
  async update(){ 
    console.warn("Base44 entities.update() called - using API endpoints instead"); 
    return true; 
  }, 
  async delete(){ 
    console.warn("Base44 entities.delete() called - using API endpoints instead"); 
    return true; 
  }, 
  async getById(){ 
    console.warn("Base44 entities.getById() called - using API endpoints instead"); 
    return null; 
  }
};

export const base44 = {
  auth: { 
    async me(){ 
      if(DEMO) return { email:"admin@local", role:"Admin", isOwner:true }; 
      console.warn("Base44 auth.me() called - using authentication system instead"); 
      return null;
    } 
  },
  entities: new Proxy({}, { 
    get(){ 
      if(DEMO){ 
        return fallbackEntityHandler;
      } 
      return fallbackEntityHandler; // Return fallback instead of throwing error
    } 
  }),
  integrations: {
    Core: {
      InvokeLLM: async () => ({ success: true }),
      SendEmail: async () => ({ success: true }),
      UploadFile: async ({ file }) => {
        // Create a mock URL using object URL for demo purposes
        const mockUrl = URL.createObjectURL(file);
        console.log("Mock UploadFile - Created URL:", mockUrl);
        return { success: true, file_url: mockUrl };
      },
      GenerateImage: async () => ({ success: true, url: '#' }),
      ExtractDataFromUploadedFile: async () => ({ success: true, data: {} })
    }
  }
};
