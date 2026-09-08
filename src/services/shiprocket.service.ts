// src/services/shiprocket.service.ts
import axios from "axios";
import loginShiprocket from "../shiprocket/shiprocketAuth.js";
import { query } from "../database/postgres.js";
import { resolveFulfillmentLocation } from "../config/fulfillment.config.js";

type ShiprocketSettingsRow = {
  pickup_location?: string | null;
  default_weight?: number | string | null;
  default_length?: number | string | null;
  default_breadth?: number | string | null;
  default_height?: number | string | null;
  auto_create_enabled?: boolean | null;
  auto_cancel_enabled?: boolean | null;
};

export type ShiprocketSettings = {
  pickupLocation: string;
  defaultWeight: number;
  defaultLength: number;
  defaultBreadth: number;
  defaultHeight: number;
  autoCreateEnabled: boolean;
  autoCancelEnabled: boolean;
};

const normalizeOptionalText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const toSafeNumber = (value: any, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_SHIPROCKET_SETTINGS: ShiprocketSettings = {
  pickupLocation: resolveFulfillmentLocation(),
  defaultWeight: 0.5,
  defaultLength: 10,
  defaultBreadth: 10,
  defaultHeight: 10,
  autoCreateEnabled: true,
  autoCancelEnabled: true,
};

const mapShiprocketSettingsRow = (
  row?: ShiprocketSettingsRow | null
): ShiprocketSettings => ({
  pickupLocation:
    normalizeOptionalText(row?.pickup_location) ||
    DEFAULT_SHIPROCKET_SETTINGS.pickupLocation,
  defaultWeight: toSafeNumber(
    row?.default_weight,
    DEFAULT_SHIPROCKET_SETTINGS.defaultWeight
  ),
  defaultLength: toSafeNumber(
    row?.default_length,
    DEFAULT_SHIPROCKET_SETTINGS.defaultLength
  ),
  defaultBreadth: toSafeNumber(
    row?.default_breadth,
    DEFAULT_SHIPROCKET_SETTINGS.defaultBreadth
  ),
  defaultHeight: toSafeNumber(
    row?.default_height,
    DEFAULT_SHIPROCKET_SETTINGS.defaultHeight
  ),
  autoCreateEnabled: row?.auto_create_enabled !== false,
  autoCancelEnabled: row?.auto_cancel_enabled !== false,
});

export const getShiprocketSettings = async (): Promise<ShiprocketSettings> => {
  try {
    const result = await query(
      `SELECT pickup_location, default_weight, default_length, default_breadth, default_height,
              auto_create_enabled, auto_cancel_enabled
       FROM shiprocket_settings
       WHERE id = 1`,
      []
    );
    return mapShiprocketSettingsRow(result.rows[0] || null);
  } catch (error) {
    return { ...DEFAULT_SHIPROCKET_SETTINGS };
  }
};

export const upsertShiprocketSettings = async (settings: any) => {
  const current = await getShiprocketSettings();
  const next: ShiprocketSettings = {
    pickupLocation:
      normalizeOptionalText(settings?.pickupLocation) ||
      normalizeOptionalText(settings?.pickup_location) ||
      current.pickupLocation,
    defaultWeight: toSafeNumber(
      settings?.defaultWeight ?? settings?.default_weight,
      current.defaultWeight
    ),
    defaultLength: toSafeNumber(
      settings?.defaultLength ?? settings?.default_length,
      current.defaultLength
    ),
    defaultBreadth: toSafeNumber(
      settings?.defaultBreadth ?? settings?.default_breadth,
      current.defaultBreadth
    ),
    defaultHeight: toSafeNumber(
      settings?.defaultHeight ?? settings?.default_height,
      current.defaultHeight
    ),
    autoCreateEnabled:
      settings?.autoCreateEnabled ??
      settings?.auto_create_enabled ??
      current.autoCreateEnabled,
    autoCancelEnabled:
      settings?.autoCancelEnabled ??
      settings?.auto_cancel_enabled ??
      current.autoCancelEnabled,
  };

  const result = await query(
    `INSERT INTO shiprocket_settings (
        id, pickup_location, default_weight, default_length, default_breadth, default_height,
        auto_create_enabled, auto_cancel_enabled, updated_at
     )
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
        pickup_location = EXCLUDED.pickup_location,
        default_weight = EXCLUDED.default_weight,
        default_length = EXCLUDED.default_length,
        default_breadth = EXCLUDED.default_breadth,
        default_height = EXCLUDED.default_height,
        auto_create_enabled = EXCLUDED.auto_create_enabled,
        auto_cancel_enabled = EXCLUDED.auto_cancel_enabled,
        updated_at = NOW()
     RETURNING pickup_location, default_weight, default_length, default_breadth, default_height,
               auto_create_enabled, auto_cancel_enabled`,
    [
      next.pickupLocation,
      next.defaultWeight,
      next.defaultLength,
      next.defaultBreadth,
      next.defaultHeight,
      next.autoCreateEnabled,
      next.autoCancelEnabled,
    ]
  );

  return mapShiprocketSettingsRow(result.rows[0] || null);
};

export const listShiprocketPickupLocations = async () => {
  const token = await loginShiprocket();
  if (!token) {
    return {
      ok: false,
      message: "Unable to authenticate with Shiprocket",
      data: [],
    };
  }

  const response = await axios.get(
    `${process.env.SHIPROCKET_BASE_URL}/settings/company/pickup`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const locations = response?.data?.data?.shipping_address || [];
  return {
    ok: true,
    message: "Pickup locations fetched successfully",
    data: locations,
  };
};

const updateShiprocketStatusForMerchant = async (
  merchantTransactionId: string,
  status: string | null,
  statusCode?: number | null
) => {
  await query(
    `UPDATE orders
     SET shiprocket_status = COALESCE($1, shiprocket_status),
         shiprocket_status_code = COALESCE($2, shiprocket_status_code)
     WHERE merchanttransactionid = $3`,
    [status, statusCode ?? null, merchantTransactionId]
  );
  await query(
    `UPDATE thirdpartyorders
     SET shiprocket_status = COALESCE($1, shiprocket_status),
         shiprocket_status_code = COALESCE($2, shiprocket_status_code)
     WHERE merchanttransactionid = $3`,
    [status, statusCode ?? null, merchantTransactionId]
  );
};

export const cancelShiprocketOrderForMerchant = async (
  merchantTransactionId: string
) => {
  if (!merchantTransactionId) {
    return { ok: false, reason: "missing_merchant_transaction_id" };
  }

  const settings = await getShiprocketSettings();
  if (!settings.autoCancelEnabled) {
    return { ok: true, reason: "auto_cancel_disabled" };
  }

  const orderLookup = await query(
    `SELECT merchanttransactionid, shiprocket_order_id, shiprocket_shipment_id, shiprocket_status
     FROM orders
     WHERE merchanttransactionid = $1
     UNION ALL
     SELECT merchanttransactionid, shiprocket_order_id, shiprocket_shipment_id, shiprocket_status
     FROM thirdpartyorders
     WHERE merchanttransactionid = $1
     LIMIT 1`,
    [merchantTransactionId]
  );

  const row = orderLookup.rows[0];
  if (!row) {
    return { ok: false, reason: "merchant_not_found" };
  }

  const shiprocketOrderId = row?.shiprocket_order_id;
  const shiprocketStatus = normalizeOptionalText(row?.shiprocket_status)?.toLowerCase();
  if (!shiprocketOrderId) {
    return { ok: true, reason: "no_shiprocket_order" };
  }

  if (
    shiprocketStatus &&
    ["cancelled", "canceled", "delivered", "shipped", "rto delivered"].includes(
      shiprocketStatus
    )
  ) {
    return { ok: true, reason: "already_terminal", currentStatus: row?.shiprocket_status };
  }

  const token = await loginShiprocket();
  if (!token || !process.env.SHIPROCKET_BASE_URL) {
    return { ok: false, reason: "shiprocket_configuration_incomplete" };
  }

  try {
    const response = await axios.post(
      `${process.env.SHIPROCKET_BASE_URL}/orders/cancel`,
      {
        ids: [Number(shiprocketOrderId)],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const message =
      normalizeOptionalText(response?.data?.message) || "cancel_requested";
    await updateShiprocketStatusForMerchant(merchantTransactionId, message, response?.status || null);

    return {
      ok: true,
      reason: "cancel_requested",
      response: response?.data || null,
      statusCode: response?.status || null,
    };
  } catch (error: any) {
    const errorMessage =
      normalizeOptionalText(error?.response?.data?.message) ||
      normalizeOptionalText(error?.message) ||
      "shiprocket_cancel_failed";
    await updateShiprocketStatusForMerchant(
      merchantTransactionId,
      errorMessage,
      error?.response?.status || null
    );
    return {
      ok: false,
      reason: "shiprocket_cancel_failed",
      error: error?.response?.data || error?.message || error,
      statusCode: error?.response?.status || null,
    };
  }
};

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
  rate?: number;
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
