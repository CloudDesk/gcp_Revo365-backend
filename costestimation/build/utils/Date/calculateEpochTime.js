import { ErrorHandler } from "../../errorHandler/errorHandler.js";
export const calculateEpochTime = async (Year, Month) => {
    try {
        let monthdata = ['January', 'Febraury', 'March', 'April', 'May',
            'June', 'July', 'August', 'September', 'October', 'November', 'December'
        ];
        let monthnumber = monthdata.indexOf(Month);
        const date = new Date(Year, monthnumber + 1, 1);
        let epochTIme = date.getTime();
        return epochTIme;
    }
    catch (error) {
        let ErrorData = await ErrorHandler.handleQueryError(error);
        console.log(ErrorData);
    }
};
//# sourceMappingURL=calculateEpochTime.js.map