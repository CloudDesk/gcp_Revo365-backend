export function convertDateRangeToEpoch(dateRange) {
    if (dateRange.length !== 2) {
        throw new Error('Invalid date range format.');
    }

    const [startYear, startMonth] = dateRange[0].split('-');
    const [endYear, endMonth] = dateRange[1].split('-');

    if (!startMonth || !startYear || !endMonth || !endYear) {
        throw new Error('Invalid date range format.');
    }

    const monthNames = ["january", "february", "march", "april", "may", "june", 
                        "july", "august", "september", "october", "november", "december"];
    
    const startMonthIndex = monthNames.indexOf(startMonth.toLowerCase());
    const endMonthIndex = monthNames.indexOf(endMonth.toLowerCase());

    if (startMonthIndex === -1 || endMonthIndex === -1) {
        throw new Error('Invalid month name in date range.');
    }

    const startDate = new Date(Date.UTC(startYear, startMonthIndex, 1, 0, 0, 0));
    const startEpoch = Math.floor(startDate.getTime() / 1000);

    const endDate = new Date(Date.UTC(endYear, endMonthIndex + 1, 1, 0, 0, 0));
    endDate.setSeconds(endDate.getSeconds() - 1);
    const endEpoch = Math.floor(endDate.getTime() / 1000);

    // console.log(startEpoch);
    // console.log(endEpoch);

    return { startEpoch, endEpoch };
}

