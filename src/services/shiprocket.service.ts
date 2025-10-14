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
  private readonly SELLER_PINCODE = "600002";

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
        console.error("❌ Failed to get auth token");
        return;
      }

      // Test 1: Check if we can access profile
      try {
        const profileResponse = await axios.get(
          `${process.env.SHIPROCKET_BASE_URL}/settings/company/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        console.log("✅ Profile access: SUCCESS");
        console.log("   Account:", profileResponse.data?.data?.company_name);
      } catch (error: any) {
        console.log("❌ Profile access: FAILED", error.response?.data?.message);
      }

      // Test 2: Check courier list access
      try {
        const courierResponse = await axios.get(
          `${process.env.SHIPROCKET_BASE_URL}/courier/courierList`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        console.log("✅ Courier list access: SUCCESS");
      } catch (error: any) {
        console.log("❌ Courier list access: FAILED", error.response?.data?.message);
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
        console.log("✅ Serviceability access: SUCCESS");
        console.log(
          "   Available couriers:",
          serviceResponse.data?.data?.available_courier_companies?.length || 0
        );
      } catch (error: any) {
        console.log("❌ Serviceability access: FAILED");
        console.log("   Error:", error.response?.data?.message);
        console.log("   Status:", error.response?.status);

        if (error.response?.status === 403) {
          console.log("\n⚠️  403 ERROR ANALYSIS:");
          console.log("   This means your account is authenticated but lacks permissions.");
        }
      }

    } catch (error) {
      console.error("Diagnostic failed:", error);
    }
  }

  
  private selectBestCourier(couriers: ShippingRate[]): ShippingRate {
    if (!couriers || couriers.length === 0) {
      return {
        courier_company_id: 0,
        courier_name: "Standard Delivery (Estimated)",
        freight_charge: 50,
        cod_charges: 0,
        other_charges: 0,
        total_charge: 50,
        etd: "5-7 days",
      };
    }

    couriers.sort((a, b) => a.total_charge - b.total_charge);
    const bestCourier = couriers[0];

    const totalCharge =
  bestCourier.total_charge ??
  bestCourier.rate ??
  (bestCourier.freight_charge ?? 0) + (bestCourier.other_charges ?? 0);

    console.log(`🚀 Best Courier Selected Automatically:${bestCourier.courier_name}`);
    console.log(`   Courier: ${bestCourier.courier_name}`);
    console.log(`   Total Charge: ₹${totalCharge}`);
    console.log(`   ETA: ${bestCourier.etd}`);
    console.log(   'ETA2:',bestCourier);

    return {
    ...bestCourier,
    total_charge: Math.round(totalCharge),
  };

  }

  async calculateShipping(
    params: ShippingCalculationParams
  ): Promise<{ bestCourier: ShippingRate; allCouriers: ShippingRate[] }> {
    try {
      console.log("Calculating shipping for:", params);
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

      console.log("Request params:", queryParams);

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

      console.log("✅ API Response SUCCESS");

      if (response.data.status === 200 && response.data.data) {
        const couriers = response.data.data.available_courier_companies || [];

        if (couriers.length === 0) {
          console.warn("⚠️  No courier companies available for this route");
          const fallbackRates = this.getFallbackRates(params);
          return { bestCourier: fallbackRates[0], allCouriers: fallbackRates };
        }

        console.log(`Found ${couriers.length} courier options`);

        const bestCourier = this.selectBestCourier(couriers);
        return { bestCourier, allCouriers: couriers };
      } else {
        throw new Error(response.data.message || "Failed to calculate shipping");
      }
    } catch (error: any) {
      console.error("❌ Error calculating shipping:", error.response?.data || error.message);

      if (error.response?.status === 403) {
        console.error(`⚠️  403 FORBIDDEN - ACCOUNT LIMITATION`);
      }

      const fallbackRates = this.getFallbackRates(params);
      return { bestCourier: fallbackRates[0], allCouriers: fallbackRates };
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

    console.log("📦 Using fallback rates:", {
      isLocal,
      baseRate,
      weightCharge,
      codCharge,
      totalCharge,
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
      const { bestCourier } = await this.calculateShipping({
        pickup_postcode: Number(this.SELLER_PINCODE),
        delivery_postcode: Number(deliveryPincode),
        weight,
        cod,
      });

      return {
        cost: bestCourier.total_charge,
        courier: bestCourier.courier_name,
        etd: bestCourier.etd,
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
    const { allCouriers } = await this.calculateShipping({
      pickup_postcode: Number(this.SELLER_PINCODE),
      delivery_postcode: Number(deliveryPincode),
      weight,
      cod,
    });
    return allCouriers;
  }
}

export const shiprocketShippingService = new ShiprocketShippingService();

// Export diagnostic function for testing
export async function runShiprocketDiagnostics() {
  console.log("Inside diagnos");
  const service = new ShiprocketShippingService();
  await service.diagnoseAccount();
}
