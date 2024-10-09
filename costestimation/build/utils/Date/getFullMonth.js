export const getFullMonth = async (monthData) => {
    let Month = [{
            "Jan": "January",
            "Feb": "February",
            "Mar": "March",
            "Apr": "April",
            "May": "May",
            "Jun": "June",
            "Jul": "July",
            "Aug": "August",
            "Sep": "September",
            "Oct": "October",
            "Nov": "November",
            "Dec": "December"
        }];
    return Month[0][monthData];
};
//# sourceMappingURL=getFullMonth.js.map