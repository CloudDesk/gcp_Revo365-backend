import { dashboardservice } from "../services/dashboard.service.js";
export const dashboardController = {
    getPerMonthSalesData: async (request, reply) => {
        try {
            const data = await dashboardservice.getSalesPerMonthData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getDashboardData:", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getSalesMonthlyData: async (request, reply) => {
        try {
            const data = await dashboardservice.getSalesMonthlyData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getSalesMonthlyData:", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getSalesMonthlyLocationData: async (request, reply) => {
        try {
            const data = await dashboardservice.getSalesMonthlyLocationData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getSalesMonthlyLocationData:", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getGroupedData: async (request, reply) => {
        try {
            const data = await dashboardservice.getGroupedData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getGroupedData:", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getCountData: async (request, reply) => {
        try {
            // const data = await dashboardservice.getCountData(request.query, request.params);
            const data = await dashboardservice.getCountData2(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTicketsCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getSalesGroupbyValuesData: async (request, reply) => {
        try {
            const data = await dashboardservice.getGroupbyValueData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTicketsCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getDynamicSalesGroupbyValuesData: async (request, reply) => {
        try {
            const data = await dashboardservice.getDynamicGroupbyValueData2(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTicketsCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getOrderStatusAmountQuantityData: async (request, reply) => {
        try {
            const data = await dashboardservice.getOrderStstusDashboardAmountQuantityData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusAmountQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getOrderStatusQuantityData: async (request, reply) => {
        try {
            const data = await dashboardservice.getOrderStstusDashboardQuantityData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getCountDashboardData: async (request, reply) => {
        try {
            const data = await dashboardservice.getCountDashboardData(request.query, request.params);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getCountDashboardData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getTicketCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getTicketCountDashboardData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getEpochTicketCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getEpochTicketCountDashboardData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getEpochTicketCountLocationBasedData: async (request, reply) => {
        try {
            const data = await dashboardservice.getEpochTicketCountLocationBasedData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getProductCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getProductStatusCountDashboardData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getOrderStatusQuantityData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getTodayTicketPriorityCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getTodayTicketPriorityCountData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTodayTicketPriorityCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getTodayTicketTypeCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getTodayTicketTypeCountData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTodayTicketTypeCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getAvailableTotalAmountCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getAvailableCountTotalData();
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTodayTicketTypeCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getAvailableTotalAmountCountLocationBasedData: async (request, reply) => {
        try {
            const data = await dashboardservice.getAvailableCountTotalLocationBasedData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getAvalibleCountTotalLocationBasedData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getAvailableCountData: async (request, reply) => {
        try {
            const data = await dashboardservice.getAvailableCountData();
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getAvalibleCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getAvailableCountDataLocation: async (request, reply) => {
        try {
            const data = await dashboardservice.getAvailableCountDatalocation(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getAvailableCountDataLocation", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getRevenueQuarterData: async (request, reply) => {
        try {
            const data = await dashboardservice.getRevenueQuarterData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getRevenueQuarterData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getRevenueQuarterDataLocation: async (request, reply) => {
        try {
            const data = await dashboardservice.getRevenueQuarterDataLocation(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getRevenueQuarterDataLocation", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getInvoiceData: async (request, reply) => {
        try {
            const data = await dashboardservice.getInvoiceData();
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getInvoiceData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getInvoiceDateBasedData: async (request, reply) => {
        try {
            const data = await dashboardservice.getInvoiceDataDateBased(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getInvoiceDateBasedData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
    getSoldDetailsData: async (request, reply) => {
        try {
            const data = await dashboardservice.getSoldDetailsData(request.query);
            reply.send(data);
        }
        catch (error) {
            console.error("Error in getTodayTicketTypeCountData", error);
            reply.status(500).send({ error: 'Internal Server Error' });
        }
    },
};
//# sourceMappingURL=dashboard.controller.js.map