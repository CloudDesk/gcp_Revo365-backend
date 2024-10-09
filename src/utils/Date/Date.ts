export module DateCustomize {

    export const ConvertDDMMYYYtoutc = async (receiveddate) => {
        const [day, month, year] = receiveddate.split('-').map(Number);

        // Create a date object using the provided values directly
        console.log(month, 'MONTH IS');
        const dateset = new Date(Date.UTC(year, month - 1, day));
        console.log(dateset);
        // Adjust for IST (UTC +5:30)
        const offset = 5.5 * 60 * 60 * 1000;
        const istTime = dateset.getTime() + offset;

        // Convert to Unix timestamp in seconds
        const timedatset = Math.floor(istTime / 1000);

        console.log(timedatset, 'TIme Data set is ');
        return timedatset;
    }

}