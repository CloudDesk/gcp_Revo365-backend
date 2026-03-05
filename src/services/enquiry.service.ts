export module enquiryService {
  export const enquiryCorporate = async (request: any) => {
    try {
      const payload = request.body;
      console.log("Ecom Enquiry Payload:", payload);
      return {
        status: 200,
        message: "Ecom enquiry received",
      };
    } catch (error) {
      console.error("Query Execution Error: IN enquiryCorporate", error);
      return {
        status: 500,
        message: "Failed to process ecom enquiry",
      };
    }
  };

  export const enquiryIndividual = async (request: any) => {
    try {
      const payload = request.body;
      console.log("Individual Enquiry Payload:", payload);
      return {
        status: 200,
        message: "Individual enquiry received",
      };
    } catch (error) {
      console.error("Query Execution Error: IN enquiryIndividual", error);
      return {
        status: 500,
        message: "Failed to process individual enquiry",
      };
    }
  };
}
