import { buybackEnquiriesService } from "../services/buybackEnquiries.service.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizePayload = (payload: any) => ({
  name: String(payload.name || "").trim(),
  phone: String(payload.phone || "").replace(/\D/g, ""),
  email: String(payload.email || "").trim(),
  device_type: String(payload.device_type || payload.deviceType || "").trim(),
  device_model: String(payload.device_model || payload.deviceModel || "").trim(),
  status: String(payload.status || "Open").trim(),
  followup_notes: payload.followup_notes ?? payload.followupNotes ?? null,
});

const validatePayload = (payload: ReturnType<typeof normalizePayload>) => {
  if (!payload.name) return "Name is required";
  if (!payload.phone || payload.phone.length !== 10) return "Phone number must be exactly 10 digits";
  if (!payload.email || !emailRegex.test(payload.email)) return "Valid email is required";
  if (!payload.device_type) return "Device type is required";
  if (!payload.device_model) return "Device model is required";
  return null;
};

export module buybackEnquiriesController {
  export const createEnquiry = async (request: any, reply: any) => {
    try {
      const payload = normalizePayload(request.body || {});
      const validationError = validatePayload(payload);

      if (validationError) {
        return reply.status(400).send({ error: validationError });
      }

      const enquiry = await buybackEnquiriesService.createEnquiry(payload);
      reply.status(200).send({
        success: true,
        message: "Buyback enquiry received",
        data: enquiry,
      });
    } catch (error: any) {
      console.error("Error in buybackEnquiriesController.createEnquiry:", error);
      reply.status(500).send({ error: error.message });
    }
  };

  export const getAllEnquiries = async (request: any, reply: any) => {
    try {
      const { pageNumber, recordCount } = request.params;
      const { search, searchTerm } = request.query;
      const finalSearch = search || searchTerm || "";
      const enquiries = await buybackEnquiriesService.getAllEnquiries(
        Number(pageNumber),
        Number(recordCount),
        finalSearch
      );
      reply.status(200).send(enquiries);
    } catch (error: any) {
      console.error("Error in buybackEnquiriesController.getAllEnquiries:", error);
      reply.status(500).send({ error: error.message });
    }
  };

  export const getSingleEnquiry = async (request: any, reply: any) => {
    try {
      const { id } = request.params;
      const enquiry = await buybackEnquiriesService.getEnquiryById(Number(id));

      if (!enquiry) {
        return reply.status(404).send({ error: "Buyback enquiry not found" });
      }

      reply.status(200).send({ success: true, data: enquiry });
    } catch (error: any) {
      console.error("Error in buybackEnquiriesController.getSingleEnquiry:", error);
      reply.status(500).send({ error: error.message });
    }
  };

  export const updateEnquiry = async (request: any, reply: any) => {
    try {
      const { id } = request.params;
      const payload = normalizePayload(request.body || {});
      const validationError = validatePayload(payload);

      if (validationError) {
        return reply.status(400).send({ error: validationError });
      }

      const updated = await buybackEnquiriesService.updateEnquiry(Number(id), payload);
      reply.status(200).send({ success: true, data: updated });
    } catch (error: any) {
      console.error("Error in buybackEnquiriesController.updateEnquiry:", error);
      reply.status(500).send({ error: error.message });
    }
  };
}
