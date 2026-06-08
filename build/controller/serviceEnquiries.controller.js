import { SERVICE_ENQUIRY_STATUSES, serviceEnquiriesService, } from "../services/serviceEnquiries.service.js";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeStatus = (status) => {
    const normalized = String(status || "Open").trim().toLowerCase();
    return (SERVICE_ENQUIRY_STATUSES.find((allowedStatus) => allowedStatus.toLowerCase() === normalized) || "Open");
};
const normalizePayload = (payload) => ({
    customer_name: String(payload.customer_name || payload.customerName || "").trim(),
    phone: String(payload.phone || "").replace(/\D/g, ""),
    email: String(payload.email || "").trim(),
    device_type: String(payload.device_type || payload.deviceType || "").trim(),
    device_model: String(payload.device_model || payload.deviceModel || "").trim(),
    status: normalizeStatus(payload.status),
    issue_description: String(payload.issue_description || payload.issueDescription || "").trim(),
    notes: payload.notes ?? null,
});
const validatePayload = (payload) => {
    if (!payload.customer_name)
        return "Customer name is required";
    if (!payload.phone || payload.phone.length !== 10) {
        return "Phone number must be exactly 10 digits";
    }
    if (!payload.email || !emailRegex.test(payload.email))
        return "Valid email is required";
    if (!payload.device_type)
        return "Device type is required";
    //if (!payload.device_model) return "Device model is required";
    return null;
};
export var serviceEnquiriesController;
(function (serviceEnquiriesController) {
    serviceEnquiriesController.createEnquiry = async (request, reply) => {
        try {
            const payload = normalizePayload(request.body || {});
            const validationError = validatePayload(payload);
            if (validationError) {
                return reply.status(400).send({ error: validationError });
            }
            const enquiry = await serviceEnquiriesService.createEnquiry(payload);
            reply.status(201).send({
                success: true,
                message: "Service enquiry created successfully",
                data: enquiry,
            });
        }
        catch (error) {
            console.error("Error in serviceEnquiriesController.createEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    serviceEnquiriesController.getAllEnquiries = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params;
            const { search, searchTerm, status } = request.query;
            const finalSearch = String(search || searchTerm || "").trim();
            const finalStatus = status ? normalizeStatus(status) : "";
            const enquiries = await serviceEnquiriesService.getAllEnquiries(Number(pageNumber), Number(recordCount), finalSearch, finalStatus);
            reply.status(200).send(enquiries);
        }
        catch (error) {
            console.error("Error in serviceEnquiriesController.getAllEnquiries:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    serviceEnquiriesController.getSingleEnquiry = async (request, reply) => {
        try {
            const { id } = request.params;
            const enquiry = await serviceEnquiriesService.getEnquiryById(Number(id));
            if (!enquiry) {
                return reply.status(404).send({ error: "Service enquiry not found" });
            }
            reply.status(200).send({ success: true, data: enquiry });
        }
        catch (error) {
            console.error("Error in serviceEnquiriesController.getSingleEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
    serviceEnquiriesController.updateEnquiry = async (request, reply) => {
        try {
            const { id } = request.params;
            const payload = normalizePayload(request.body || {});
            const validationError = validatePayload(payload);
            if (validationError) {
                return reply.status(400).send({ error: validationError });
            }
            const updated = await serviceEnquiriesService.updateEnquiry(Number(id), payload);
            if (!updated) {
                return reply.status(404).send({ error: "Service enquiry not found" });
            }
            reply.status(200).send({ success: true, data: updated });
        }
        catch (error) {
            console.error("Error in serviceEnquiriesController.updateEnquiry:", error);
            reply.status(500).send({ error: error.message });
        }
    };
})(serviceEnquiriesController || (serviceEnquiriesController = {}));
//# sourceMappingURL=serviceEnquiries.controller.js.map