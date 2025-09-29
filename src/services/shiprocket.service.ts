// // src/services/shiprocket.service.ts 
// import axios from "axios";
// import loginShiprocket from "../shiprocket/shiprocketAuth.js";

// interface ShippingCalculationParams {
//   pickup_postcode: number;
//   delivery_postcode: number;
//   weight: number; // in kg
//   cod?: boolean;
// }

// interface ShippingRate {
//   courier_company_id: number;
//   courier_name: string;
//   freight_charge: number;
//   cod_charges: number;
//   other_charges: number;
//   total_charge: number;
//   etd: string;
// }

// interface ShippingResponse {
//   status: number;
//   data?: {
//     available_courier_companies: ShippingRate[];
//   };
//   message?: string;
// }

// class ShiprocketShippingService {
//   private token: string | null = null;
//   private tokenExpiry: number = 0;
//   private readonly SELLER_PINCODE = "600096";

//   async getAuthToken(): Promise<string | null> {
//     // Check if token exists and is not expired
//     const now = Date.now();
//     if (this.token && this.tokenExpiry > now) {
//       return this.token;
//     }
    
//     // Get fresh token
//     this.token = await loginShiprocket();
//     // Set expiry to 9 days (tokens usually valid for 10 days)
//     this.tokenExpiry = now + (9 * 24 * 60 * 60 * 1000);
    
//     return this.token;
//   }

//   async calculateShipping(params: ShippingCalculationParams): Promise<ShippingRate[]> {
//     try {
//       console.log('data from frontend', params);
//       const token = await this.getAuthToken();
//       console.log('Token==', token);
      
//       if (!token) {
//         throw new Error("Failed to authenticate with Shiprocket");
//       }

//       // Add required parameters for Shiprocket API
//       const requestParams = {
//         pickup_postcode: params.pickup_postcode,
//         delivery_postcode: params.delivery_postcode,
//         weight: params.weight,
//         cod: params.cod ? 1 : 0, // Convert boolean to 1/0
//         declared_value: 1000, // Add declared value (required)
//         length: 10, // Add dimensions (sometimes required)
//         breadth: 10,
//         height: 10,
//       };

//       console.log('Request params:', requestParams);

//       // Try the pickup serviceability endpoint instead
//       const response = await axios.get<ShippingResponse>(
//         `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability/pickup`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//           params: requestParams,
//         }
//       );

//       console.log('Shiprocket response:', response.data);

//       if (response.data.status === 200 && response.data.data) {
//         return response.data.data.available_courier_companies || [];
//       } else {
//         throw new Error(response.data.message || "Failed to calculate shipping");
//       }
//     } catch (error: any) {
//       console.error("Error calculating shipping:", error.response?.data || error.message);
      
//       // If 403 error, clear token and retry once
//       if (error.response?.status === 403 && this.token) {
//         console.log('Token invalid, getting fresh token...');
//         this.token = null;
//         this.tokenExpiry = 0;
        
//         // Retry with fresh token
//         const freshToken = await this.getAuthToken();
//         if (freshToken) {
//           try {
//             const retryResponse = await axios.get<ShippingResponse>(
//               `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability`,
//               {
//                 headers: {
//                   Authorization: `Bearer ${freshToken}`,
//                   "Content-Type": "application/json",
//                 },
//                 params: {
//                   pickup_postcode: params.pickup_postcode,
//                   delivery_postcode: params.delivery_postcode,
//                   weight: params.weight,
//                   cod: params.cod ? 1 : 0,
//                   declared_value: 1000,
//                   length: 10,
//                   breadth: 10,
//                   height: 10,
//                 },
//               }
//             );
            
//             if (retryResponse.data.status === 200 && retryResponse.data.data) {
//               return retryResponse.data.data.available_courier_companies || [];
//             }
//           } catch (retryError) {
//             console.error("Retry also failed:", retryError);
//           }
//         }
//       }
      
//       throw new Error("Unable to calculate shipping cost");
//     }
//   }

//   async getLowestShippingCost(
//     deliveryPincode: string,
//     weight: number = 1,
//     cod: boolean = false
//   ): Promise<{ cost: number; courier: string; etd: string }> {
//     try {
//       const shippingRates = await this.calculateShipping({
//         pickup_postcode: Number(this.SELLER_PINCODE),
//         delivery_postcode: Number(deliveryPincode),
//         weight,
//         cod,
//       });

//       if (shippingRates.length === 0) {
//         return { cost: 0, courier: "Not available", etd: "N/A" };
//       }

//       // Find the lowest cost option
//       const lowestRate = shippingRates.reduce((prev, current) =>
//         prev.total_charge < current.total_charge ? prev : current
//       );

//       return {
//         cost: lowestRate.total_charge,
//         courier: lowestRate.courier_name,
//         etd: lowestRate.etd,
//       };
//     } catch (error) {
//       console.error("Error getting lowest shipping cost:", error);
//       // Return default shipping cost if service fails
//       return { cost: 50, courier: "Standard", etd: "5-7 days" };
//     }
//   }
// }

// export const shiprocketShippingService = new ShiprocketShippingService();

// ----------------------------------------------------------------------------------------
// src/services/shiprocket.service.ts 
// import axios from "axios";
// import loginShiprocket from "../shiprocket/shiprocketAuth.js";

// interface ShippingCalculationParams {
//   pickup_postcode: number;
//   delivery_postcode: number;
//   weight: number; // in kg
//   cod?: boolean;
// }

// interface ShippingRate {
//   courier_company_id: number;
//   courier_name: string;
//   freight_charge: number;
//   cod_charges: number;
//   other_charges: number;
//   total_charge: number;
//   etd: string;
// }

// interface ShippingResponse {
//   status: number;
//   data?: {
//     available_courier_companies: ShippingRate[];
//   };
//   message?: string;
// }

// class ShiprocketShippingService {
//   private token: string | null = null;
//   private tokenExpiry: number = 0;
//   private readonly SELLER_PINCODE = "600096";

//   async getAuthToken(): Promise<string | null> {
//     // Check if token exists and is not expired
//     const now = Date.now();
//     if (this.token && this.tokenExpiry > now) {
//       return this.token;
//     }
    
//     // Get fresh token
//     this.token = await loginShiprocket();
//     // Set expiry to 9 days (tokens usually valid for 10 days)
//     this.tokenExpiry = now + (9 * 24 * 60 * 60 * 1000);
    
//     return this.token;
//   }

//   async calculateShipping(params: ShippingCalculationParams): Promise<ShippingRate[]> {
//     try {
//       console.log('data from frontend', params);
//       const token = await this.getAuthToken();
//       console.log('Token==', token);
      
//       if (!token) {
//         throw new Error("Failed to authenticate with Shiprocket");
//       }

//       // Add required parameters for Shiprocket API
//       const requestParams = {
//         pickup_postcode: params.pickup_postcode,
//         delivery_postcode: params.delivery_postcode,
//         weight: params.weight,
//         cod: params.cod ? 1 : 0, // Convert boolean to 1/0
//         declared_value: 1000, // Add declared value (required)
//         length: 10, // Add dimensions (sometimes required)
//         breadth: 10,
//         height: 10,
//       };

//       console.log('Request params:', requestParams);

//       const response = await axios.get<ShippingResponse>(
//         `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//           params: requestParams,
//         }
//       );

//       console.log('Shiprocket response:', response.data);

//       if (response.data.status === 200 && response.data.data) {
//         return response.data.data.available_courier_companies || [];
//       } else {
//         throw new Error(response.data.message || "Failed to calculate shipping");
//       }
//     } catch (error: any) {
//       console.error("Error calculating shipping:", error.response?.data || error.message);
      
//       // If 403 error, clear token and retry once
//       if (error.response?.status === 403 && this.token) {
//         console.log('Token invalid, getting fresh token...');
//         this.token = null;
//         this.tokenExpiry = 0;
        
//         // Retry with fresh token
//         const freshToken = await this.getAuthToken();
//         if (freshToken) {
//           try {
//             const retryResponse = await axios.get<ShippingResponse>(
//               `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability`,
//               {
//                 headers: {
//                   Authorization: `Bearer ${freshToken}`,
//                   "Content-Type": "application/json",
//                 },
//                 params: {
//                   pickup_postcode: params.pickup_postcode,
//                   delivery_postcode: params.delivery_postcode,
//                   weight: params.weight,
//                   cod: params.cod ? 1 : 0,
//                   declared_value: 1000,
//                   length: 10,
//                   breadth: 10,
//                   height: 10,
//                 },
//               }
//             );
            
//             if (retryResponse.data.status === 200 && retryResponse.data.data) {
//               return retryResponse.data.data.available_courier_companies || [];
//             }
//           } catch (retryError) {
//             console.error("Retry also failed:", retryError);
//           }
//         }
//       }
      
//       throw new Error("Unable to calculate shipping cost");
//     }
//   }

//   async getLowestShippingCost(
//     deliveryPincode: string,
//     weight: number = 1,
//     cod: boolean = false
//   ): Promise<{ cost: number; courier: string; etd: string }> {
//     try {
//       const shippingRates = await this.calculateShipping({
//         pickup_postcode: Number(this.SELLER_PINCODE),
//         delivery_postcode: Number(deliveryPincode),
//         weight,
//         cod,
//       });

//       if (shippingRates.length === 0) {
//         return { cost: 0, courier: "Not available", etd: "N/A" };
//       }

//       // Find the lowest cost option
//       const lowestRate = shippingRates.reduce((prev, current) =>
//         prev.total_charge < current.total_charge ? prev : current
//       );

//       return {
//         cost: lowestRate.total_charge,
//         courier: lowestRate.courier_name,
//         etd: lowestRate.etd,
//       };
//     } catch (error) {
//       console.error("Error getting lowest shipping cost:", error);
//       // Return default shipping cost if service fails
//       return { cost: 50, courier: "Standard", etd: "5-7 days" };
//     }
//   }
// }

// export const shiprocketShippingService = new ShiprocketShippingService();

// ------------------------------------

// src/services/shiprocket.service.ts 
// import ax

// =================================================================================

// src/services/shiprocket.service.ts 
// import axios from "axios";
// import loginShiprocket from "../shiprocket/shiprocketAuth.js";

// interface ShippingCalculationParams {
//   pickup_postcode: number;
//   delivery_postcode: number;
//   weight: number;
//   cod?: boolean;
// }

// interface ShippingRate {
//   courier_company_id: number;
//   courier_name: string;
//   freight_charge: number;
//   cod_charges: number;
//   other_charges: number;
//   total_charge: number;
//   etd: string;
// }

// interface ShippingResponse {
//   status: number;
//   data?: {
//     available_courier_companies: ShippingRate[];
//   };
//   message?: string;
// }

// class ShiprocketShippingService {
//   private token: string | null = null;
//   private tokenExpiry: number = 0;
//   private readonly SELLER_PINCODE = "600096";

//   async getAuthToken(): Promise<string | null> {
//     const now = Date.now();
//     if (this.token && this.tokenExpiry > now) {
//       return this.token;
//     }
    
//     this.token = await loginShiprocket();
//     this.tokenExpiry = now + (9 * 24 * 60 * 60 * 1000);
    
//     return this.token;
//   }

//   async calculateShipping(params: ShippingCalculationParams): Promise<ShippingRate[]> {
//     try {
//       console.log('Calculating shipping for:', params);
//       const token = await this.getAuthToken();
      
//       if (!token) {
//         throw new Error("Failed to authenticate with Shiprocket");
//       }

//       // CRITICAL: Note the trailing slash in the URL - it's required!
//       // This is a GET request with query parameters
//       const queryParams = {
//         pickup_postcode: params.pickup_postcode,
//         delivery_postcode: params.delivery_postcode,
//         weight: params.weight,
//         cod: params.cod ? 1 : 0, // 1 for COD, 0 for Prepaid
//       };

//       console.log('Request params:', queryParams);

//       const response = await axios.get<ShippingResponse>(
//         `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability/`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//           params: queryParams,
//         }
//       );

//       console.log('API Response:', JSON.stringify(response.data, null, 2));

//       if (response.data.status === 200 && response.data.data) {
//         const couriers = response.data.data.available_courier_companies || [];
        
//         if (couriers.length === 0) {
//           console.warn('No courier companies available for this route');
//           return this.getFallbackRates(params);
//         }
        
//         return couriers;
//       } else {
//         throw new Error(response.data.message || "Failed to calculate shipping");
//       }
//     } catch (error: any) {
//       console.error("Error calculating shipping:", error.response?.data || error.message);
      
//       // Handle specific errors
//       if (error.response?.status === 403) {
//         console.error(`
// ========================================
// ⚠️  SHIPROCKET API ACCESS DENIED (403)
// ========================================
// Your Shiprocket account doesn't have permission to access this API.

// REQUIRED ACTIONS:
// 1. Login to https://app.shiprocket.in
// 2. Go to Settings → API
// 3. Click "Create API User" if not already done
// 4. Make sure your account is verified (KYC complete)
// 5. Check if you have an active billing plan
// 6. Some API endpoints require paid plans

// For help: support@shiprocket.in or call 011-4954-2244

// Using fallback shipping rates...
// ========================================
//         `);
//         return this.getFallbackRates(params);
//       }
      
//       if (error.response?.status === 404) {
//         console.error('404 Error - Endpoint not found. Check API URL and account permissions.');
//         return this.getFallbackRates(params);
//       }
      
//       // Return fallback for any error
//       return this.getFallbackRates(params);
//     }
//   }

//   /**
//    * Fallback shipping rates when API is not accessible
//    */
//   private getFallbackRates(params: ShippingCalculationParams): ShippingRate[] {
//     const { weight, cod, pickup_postcode, delivery_postcode } = params;
    
//     // Calculate distance-based pricing
//     const pickupRegion = Math.floor(pickup_postcode / 1000);
//     const deliveryRegion = Math.floor(delivery_postcode / 1000);
//     const isLocal = pickupRegion === deliveryRegion;
//     const isRegional = Math.abs(pickupRegion - deliveryRegion) <= 10;
    
//     // Base rates for India
//     let baseRate = 40;
//     let etd = "5-7 days";
    
//     if (isLocal) {
//       baseRate = 40;
//       etd = "2-3 days";
//     } else if (isRegional) {
//       baseRate = 60;
//       etd = "4-5 days";
//     } else {
//       baseRate = 80;
//       etd = "6-8 days";
//     }
    
//     // Weight charges: Free up to 0.5kg, then ₹20 per additional kg
//     const weightCharge = Math.max(0, Math.ceil(weight - 0.5)) * 20;
    
//     // COD charges
//     const codCharge = cod ? 30 : 0;
    
//     const totalCharge = baseRate + weightCharge + codCharge;
    
//     console.log('Using fallback rates:', { baseRate, weightCharge, codCharge, totalCharge });
    
//     return [
//       {
//         courier_company_id: 1,
//         courier_name: "Standard Delivery",
//         freight_charge: baseRate + weightCharge,
//         cod_charges: codCharge,
//         other_charges: 0,
//         total_charge: totalCharge,
//         etd: etd,
//       },
//       {
//         courier_company_id: 2,
//         courier_name: "Express Delivery",
//         freight_charge: Math.round((baseRate + weightCharge) * 1.5),
//         cod_charges: codCharge,
//         other_charges: 0,
//         total_charge: Math.round((baseRate + weightCharge) * 1.5 + codCharge),
//         etd: isLocal ? "1-2 days" : "3-4 days",
//       },
//     ];
//   }

//   async getLowestShippingCost(
//     deliveryPincode: string,
//     weight: number = 1,
//     cod: boolean = false
//   ): Promise<{ cost: number; courier: string; etd: string }> {
//     try {
//       const shippingRates = await this.calculateShipping({
//         pickup_postcode: Number(this.SELLER_PINCODE),
//         delivery_postcode: Number(deliveryPincode),
//         weight,
//         cod,
//       });

//       if (shippingRates.length === 0) {
//         return { cost: 50, courier: "Standard", etd: "5-7 days" };
//       }

//       // Find the lowest cost option
//       const lowestRate = shippingRates.reduce((prev, current) =>
//         prev.total_charge < current.total_charge ? prev : current
//       );

//       return {
//         cost: lowestRate.total_charge,
//         courier: lowestRate.courier_name,
//         etd: lowestRate.etd,
//       };
//     } catch (error) {
//       console.error("Error getting lowest shipping cost:", error);
//       return { cost: 50, courier: "Standard", etd: "5-7 days" };
//     }
//   }

//   /**
//    * Get all available shipping options (not just the lowest)
//    */
//   async getAllShippingOptions(
//     deliveryPincode: string,
//     weight: number = 1,
//     cod: boolean = false
//   ): Promise<ShippingRate[]> {
//     return await this.calculateShipping({
//       pickup_postcode: Number(this.SELLER_PINCODE),
//       delivery_postcode: Number(deliveryPincode),
//       weight,
//       cod,
//     });
//   }
// }

// export const shiprocketShippingService = new ShiprocketShippingService();



// ---------------------------------
// src/services/shiprocket.service.ts 
import axios from "axios";
import loginShiprocket from "../shiprocket/shiprocketAuth.js";

interface ShippingCalculationParams {
  pickup_postcode: number;
  delivery_postcode: number;
  weight: number;
  cod?: boolean;
}

interface ShippingRate {
  courier_company_id: number;
  courier_name: string;
  freight_charge: number;
  cod_charges: number;
  other_charges: number;
  total_charge: number;
  etd: string;
}

interface ShippingResponse {
  status: number;
  data?: {
    available_courier_companies: ShippingRate[];
  };
  message?: string;
}

class ShiprocketShippingService {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private readonly SELLER_PINCODE = "600096";

  async getAuthToken(): Promise<string | null> {
    const now = Date.now();
    if (this.token && this.tokenExpiry > now) {
      return this.token;
    }
    
    this.token = await loginShiprocket();
    this.tokenExpiry = now + (9 * 24 * 60 * 60 * 1000);
    
    return this.token;
  }

  /**
   * Diagnostic function to check account permissions
   */
  async diagnoseAccount(): Promise<void> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        console.error('❌ Failed to get auth token');
        return;
      }

      console.log('\n========================================');
      console.log('🔍 SHIPROCKET ACCOUNT DIAGNOSTICS');
      console.log('========================================\n');

      // Test 1: Check if we can access profile
      try {
        const profileResponse = await axios.get(
          `${process.env.SHIPROCKET_BASE_URL}/settings/company/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        console.log('✅ Profile access: SUCCESS');
        console.log('   Account:', profileResponse.data?.data?.company_name);
      } catch (error: any) {
        console.log('❌ Profile access: FAILED', error.response?.data?.message);
      }

      // Test 2: Check courier list access
      try {
        const courierResponse = await axios.get(
          `${process.env.SHIPROCKET_BASE_URL}/courier/courierList`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        console.log('✅ Courier list access: SUCCESS');
      } catch (error: any) {
        console.log('❌ Courier list access: FAILED', error.response?.data?.message);
      }

      // Test 3: Check serviceability with minimal params
      try {
        const serviceResponse = await axios.get(
          `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability/`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              pickup_postcode: 600096,
              delivery_postcode: 600100,
              weight: 1,
              cod: 0,
            },
          }
        );
        console.log('✅ Serviceability access: SUCCESS');
        console.log('   Available couriers:', serviceResponse.data?.data?.available_courier_companies?.length || 0);
      } catch (error: any) {
        console.log('❌ Serviceability access: FAILED');
        console.log('   Error:', error.response?.data?.message);
        console.log('   Status:', error.response?.status);
        
        if (error.response?.status === 403) {
          console.log('\n⚠️  403 ERROR ANALYSIS:');
          console.log('   This means your account is authenticated but lacks permissions.');
          console.log('   Common causes:');
          console.log('   1. Account not on a paid plan');
          console.log('   2. KYC/Verification incomplete');
          console.log('   3. API access not enabled for your plan');
          console.log('   4. IP whitelist mismatch (check your server IP)');
        }
      }

      console.log('\n========================================\n');
    } catch (error) {
      console.error('Diagnostic failed:', error);
    }
  }

  async calculateShipping(params: ShippingCalculationParams): Promise<ShippingRate[]> {
    try {
      console.log('Calculating shipping for:', params);
      const token = await this.getAuthToken();
      
      if (!token) {
        throw new Error("Failed to authenticate with Shiprocket");
      }

      const queryParams = {
        pickup_postcode: params.pickup_postcode,
        delivery_postcode: params.delivery_postcode,
        weight: params.weight,
        cod: params.cod ? 1 : 0,
      };

      console.log('Request params:', queryParams);

      const response = await axios.get<ShippingResponse>(
        `${process.env.SHIPROCKET_BASE_URL}/courier/serviceability/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: queryParams,
        }
      );

      console.log('✅ API Response SUCCESS');

      if (response.data.status === 200 && response.data.data) {
        const couriers = response.data.data.available_courier_companies || [];
        
        if (couriers.length === 0) {
          console.warn('⚠️  No courier companies available for this route');
          return this.getFallbackRates(params);
        }
        
        console.log(`Found ${couriers.length} courier options`);
        return couriers;
      } else {
        throw new Error(response.data.message || "Failed to calculate shipping");
      }
    } catch (error: any) {
      console.error("❌ Error calculating shipping:", error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        console.error(`
========================================
⚠️  403 FORBIDDEN - ACCOUNT LIMITATION
========================================

IMMEDIATE ACTIONS:
1. Contact Shiprocket Support NOW
   📧 Email: support@shiprocket.in
   📞 Phone: 011-4954-2244
   💬 Chat: https://app.shiprocket.in

2. Ask them to enable "Courier Serviceability API" 
   for your account: ${process.env.SHIPROCKET_EMAIL}

3. Verify these are complete:
   ✓ KYC verification
   ✓ Bank account linked
   ✓ Active billing plan
   ✓ API permissions enabled

4. Check if your IP is whitelisted:
   Your requests must come from the IPs configured
   in your API User settings.

Until resolved, using fallback rates...
========================================
        `);
      }
      
      return this.getFallbackRates(params);
    }
  }

  private getFallbackRates(params: ShippingCalculationParams): ShippingRate[] {
    const { weight, cod, pickup_postcode, delivery_postcode } = params;
    
    const pickupRegion = Math.floor(pickup_postcode / 1000);
    const deliveryRegion = Math.floor(delivery_postcode / 1000);
    const isLocal = pickupRegion === deliveryRegion;
    const isRegional = Math.abs(pickupRegion - deliveryRegion) <= 10;
    
    let baseRate = 40;
    let etd = "5-7 days";
    
    if (isLocal) {
      baseRate = 40;
      etd = "2-3 days";
    } else if (isRegional) {
      baseRate = 60;
      etd = "4-5 days";
    } else {
      baseRate = 80;
      etd = "6-8 days";
    }
    
    const weightCharge = Math.max(0, Math.ceil(weight - 0.5)) * 20;
    const codCharge = cod ? 30 : 0;
    const totalCharge = baseRate + weightCharge + codCharge;
    
    console.log('📦 Using fallback rates:', { 
      isLocal, 
      baseRate, 
      weightCharge, 
      codCharge, 
      totalCharge 
    });
    
    return [
      {
        courier_company_id: 1,
        courier_name: "Standard Delivery (Estimated)",
        freight_charge: baseRate + weightCharge,
        cod_charges: codCharge,
        other_charges: 0,
        total_charge: totalCharge,
        etd: etd,
      },
      {
        courier_company_id: 2,
        courier_name: "Express Delivery (Estimated)",
        freight_charge: Math.round((baseRate + weightCharge) * 1.5),
        cod_charges: codCharge,
        other_charges: 0,
        total_charge: Math.round((baseRate + weightCharge) * 1.5 + codCharge),
        etd: isLocal ? "1-2 days" : "3-4 days",
      },
    ];
  }

  async getLowestShippingCost(
    deliveryPincode: string,
    weight: number = 1,
    cod: boolean = false
  ): Promise<{ cost: number; courier: string; etd: string }> {
    try {
      const shippingRates = await this.calculateShipping({
        pickup_postcode: Number(this.SELLER_PINCODE),
        delivery_postcode: Number(deliveryPincode),
        weight,
        cod,
      });

      if (shippingRates.length === 0) {
        return { cost: 50, courier: "Standard", etd: "5-7 days" };
      }

      const lowestRate = shippingRates.reduce((prev, current) =>
        prev.total_charge < current.total_charge ? prev : current
      );

      return {
        cost: lowestRate.total_charge,
        courier: lowestRate.courier_name,
        etd: lowestRate.etd,
      };
    } catch (error) {
      console.error("Error getting lowest shipping cost:", error);
      return { cost: 50, courier: "Standard", etd: "5-7 days" };
    }
  }

  async getAllShippingOptions(
    deliveryPincode: string,
    weight: number = 1,
    cod: boolean = false
  ): Promise<ShippingRate[]> {
    return await this.calculateShipping({
      pickup_postcode: Number(this.SELLER_PINCODE),
      delivery_postcode: Number(deliveryPincode),
      weight,
      cod,
    });
  }
}

export const shiprocketShippingService = new ShiprocketShippingService();

// Export diagnostic function for testing
export async function runShiprocketDiagnostics() {
    console.log('Inside diagnos')
  const service = new ShiprocketShippingService();
  await service.diagnoseAccount();
}

// For Fastify:
// import { runShiprocketDiagnostics } from './services/shiprocket.service';
// fastify.get('/test-shiprocket-diagnostics', async (request, reply) => {
//   await runShiprocketDiagnostics();
//   return reply.send({ message: 'Check console for diagnostics' });
// });