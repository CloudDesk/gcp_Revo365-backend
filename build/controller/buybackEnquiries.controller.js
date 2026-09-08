import { buybackEnquiriesService } from "../services/buybackEnquiries.service.js";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizePayload = (payload) => ({
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").replace(/\D/g, ""),
    email: String(payload.email || "").trim(),
    device_type: String(payload.device_type || payload.deviceType || "").trim(),
    device_model: String(payload.device_model || payload.deviceModel || "").trim(),
    status: String(payload.status || "Open").trim(),
    followup_notes: payload.followup_notes ?? payload.followupNotes ?? null,
});
const validatePayload = (payload) => {
    if (!payload.name)
        return "Name is required";
    if (!payload.phone || payload.phone.length !== 10)
        return "Phone number must be exactly 10 digits";
    if (!payload.email || !emailRegex.test(payload.email))
        return "Valid email is required";
    if (!payload.device_type)
        return "Device type is required";
    if (!payload.device_model)
        return "Device model is required";
    return null;
};
export var buybackEnquiriesController;
(function (buybackEnquiriesController) {
    buybackEnquiriesController.createEnquiry = async (request, reply) => {
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
        }
        catch (error) {
            console.error("Error in buybackEnquiriesController.createEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    buybackEnquiriesController.getAllEnquiries = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params;
            const { search, searchTerm } = request.query;
            const finalSearch = search || searchTerm || "";
            const enquiries = await buybackEnquiriesService.getAllEnquiries(Number(pageNumber), Number(recordCount), finalSearch);
            reply.status(200).send(enquiries);
        }
        catch (error) {
            console.error("Error in buybackEnquiriesController.getAllEnquiries:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    buybackEnquiriesController.getSingleEnquiry = async (request, reply) => {
        try {
            const { id } = request.params;
            const enquiry = await buybackEnquiriesService.getEnquiryById(Number(id));
            if (!enquiry) {
                return reply.status(404).send({ error: "Buyback enquiry not found" });
            }
            reply.status(200).send({ success: true, data: enquiry });
        }
        catch (error) {
            console.error("Error in buybackEnquiriesController.getSingleEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    buybackEnquiriesController.updateEnquiry = async (request, reply) => {
        try {
            const { id } = request.params;
            const payload = normalizePayload(request.body || {});
            const validationError = validatePayload(payload);
            if (validationError) {
                return reply.status(400).send({ error: validationError });
            }
            const updated = await buybackEnquiriesService.updateEnquiry(Number(id), payload);
            reply.status(200).send({ success: true, data: updated });
        }
        catch (error) {
            console.error("Error in buybackEnquiriesController.updateEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
})(buybackEnquiriesController || (buybackEnquiriesController = {}));
//# sourceMappingURL=buybackEnquiries.controller.js.map