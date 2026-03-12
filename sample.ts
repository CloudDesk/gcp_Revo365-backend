service 


    async generateSalaryStatement(month: number, year: number) {
    // Fetch payroll data with user details
    const payrollRecords = await Payroll.find({
        month,
        year,
        status: { $nin: [PayrollStatus.Cancelled] }
    })
        .populate('employeeId')
        .lean();

    if (!payrollRecords.length) {
        throw new Error(`No payroll records found for ${month}/${year}`);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Salary Statement');

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    // Define column structure first (without auto-generating headers yet)
    const columnDefinitions = [
        { header: 'Employee No', key: 'employeeNo', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Join Date', key: 'joinDate', width: 18 },
        { header: 'Left?', key: 'left', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'DAYS IN MONTH', key: 'daysInMonth', width: 15 },
        { header: 'EMP EFFECTIVE WORKDAYS', key: 'effectiveWorkdays', width: 25 },
        { header: 'BASIC', key: 'basic', width: 12 },
        { header: 'HRA', key: 'hra', width: 12 },
        { header: 'CONSULTANCY FEES', key: 'consultancyFees', width: 20 },
        { header: 'OTHER ALLOWANCE', key: 'otherAllowance', width: 20 },
        { header: 'GROSS', key: 'gross', width: 15 },
        { header: 'PF', key: 'pf', width: 12 },
        { header: 'INCOME TAX', key: 'incomeTax', width: 15 },
        { header: 'Professional Tax', key: 'professionalTax', width: 18 },
        { header: 'TDS Amount', key: 'tdsAmount', width: 15 },
        { header: 'TOTAL DEDUCTIONS', key: 'totalDeductions', width: 20 },
        { header: 'NET PAY', key: 'netPay', width: 15 },
    ];

    // Set column keys and widths
    worksheet.columns = columnDefinitions.map(col => ({ key: col.key, width: col.width }));

    // Remove the default headers that ExcelJS might have added at the top
    worksheet.getRow(1).values = [];

    // 1. Created On (Row 1, Top Right)
    const createdOn = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const row1 = worksheet.getRow(1);
    const createdOnCell = row1.getCell(18); // Last column (R)
    createdOnCell.value = `Created On: ${createdOn}`;
    createdOnCell.alignment = { horizontal: 'right' };
    createdOnCell.font = { size: 10, italic: true };

    // 2. Main Title (Row 2, Centered)
    worksheet.mergeCells('A2:R2');
    const titleCell = worksheet.getCell('A2');
    titleCell.value = `Salary Statement For The Month Of ${monthName} ${year}`;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.font = { bold: true, size: 16 };
    worksheet.getRow(2).height = 30;

    // 3. Table Headers (Row 3)
    const headerRow = worksheet.getRow(3);
    columnDefinitions.forEach((col, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = col.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF000000' } // Black header as per modern look or Blue as before
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
    headerRow.height = 25;

    // 4. Data Rows
    let grandTotals = {
        daysInMonth: 0,
        effectiveWorkdays: 0,
        basic: 0,
        hra: 0,
        consultancyFees: 0,
        otherAllowance: 0,
        gross: 0,
        pf: 0,
        incomeTax: 0,
        professionalTax: 0,
        tdsAmount: 0,
        totalDeductions: 0,
        netPay: 0
    };

    let positiveNetPayTotal = 0;
    let negativeNetPayTotal = 0;

    payrollRecords.forEach((record: any) => {
        const user = record.employeeId;
        if (!user) return;

        const rowData = {
            employeeNo: user.employeeCode || '',
            name: user.name || '',
            joinDate: user.joiningDate ? new Date(user.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
            left: user.active === false ? 'Yes' : 'No',
            status: user.employmentStatus || '',
            daysInMonth: record.totalDaysInMonth || 0,
            effectiveWorkdays: record.payableDays || 0,
            basic: record.basic || 0,
            hra: record.hra || 0,
            consultancyFees: record.da || 0,
            otherAllowance: record.otherAllowance || 0,
            gross: record.monthlyGross || 0,
            pf: record.epfEmployee || 0,
            incomeTax: record.incomeTax || 0,
            professionalTax: record.professionalTax || 0,
            tdsAmount: record.tdsDeduction || 0,
            totalDeductions: record.totalDeductions || 0,
            netPay: record.netSalary || 0
        };

        const row = worksheet.addRow(rowData);

        // Conditional formatting for NET PAY
        const netPayCell = row.getCell('netPay');
        if (record.netSalary < 0) {
            netPayCell.font = { color: { argb: 'FFFF0000' }, bold: true }; // Red
            negativeNetPayTotal += record.netSalary;
        } else if (record.netSalary > 0) {
            netPayCell.font = { color: { argb: 'FF00B050' }, bold: true }; // Green
            positiveNetPayTotal += record.netSalary;
        }

        // Accumulate totals
        grandTotals.daysInMonth += rowData.daysInMonth;
        grandTotals.effectiveWorkdays += rowData.effectiveWorkdays;
        grandTotals.basic += rowData.basic;
        grandTotals.hra += rowData.hra;
        grandTotals.consultancyFees += rowData.consultancyFees;
        grandTotals.otherAllowance += rowData.otherAllowance;
        grandTotals.gross += rowData.gross;
        grandTotals.pf += rowData.pf;
        grandTotals.incomeTax += rowData.incomeTax;
        grandTotals.professionalTax += rowData.professionalTax;
        grandTotals.tdsAmount += rowData.tdsAmount;
        grandTotals.totalDeductions += rowData.totalDeductions;
        grandTotals.netPay += rowData.netPay;

        // Borders for data rows
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    // 5. Grand Total Row
    const totalRow = worksheet.addRow({
        status: 'Grand Total',
        daysInMonth: grandTotals.daysInMonth,
        effectiveWorkdays: grandTotals.effectiveWorkdays,
        basic: grandTotals.basic,
        hra: grandTotals.hra,
        consultancyFees: grandTotals.consultancyFees,
        otherAllowance: grandTotals.otherAllowance,
        gross: grandTotals.gross,
        pf: grandTotals.pf,
        incomeTax: grandTotals.incomeTax,
        professionalTax: grandTotals.professionalTax,
        tdsAmount: grandTotals.tdsAmount,
        totalDeductions: grandTotals.totalDeductions,
        netPay: grandTotals.netPay
    });

    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' } // Light gray background
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // 6. Split Positive/Negative Rows (only if negative values exist)
    if (negativeNetPayTotal < 0) {
        // Positive Total Row
        const posTotalRow = worksheet.addRow({
            status: 'Total Positive Net Pay',
            netPay: positiveNetPayTotal
        });
        posTotalRow.font = { bold: true };
        posTotalRow.getCell('netPay').font = { color: { argb: 'FF00B050' }, bold: true };
        posTotalRow.eachCell((cell) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Negative Total Row
        const negTotalRow = worksheet.addRow({
            status: 'Total Negative Net Pay',
            netPay: negativeNetPayTotal
        });
        negTotalRow.font = { bold: true };
        negTotalRow.getCell('netPay').font = { color: { argb: 'FFFF0000' }, bold: true };
        negTotalRow.eachCell((cell) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    }

    return workbook;
}

route

fastify.get(
    '/salary-statement',
    {
        onRequest: [authenticate],
        schema: {
            querystring: {
                type: 'object',
                required: ['month', 'year'],
                properties: {
                    month: { type: 'number', minimum: 1, maximum: 12 },
                    year: { type: 'number', minimum: 2024, maximum: 2100 },
                },
            },
        },
    },
    async (request: FastifyRequest<{ Querystring: { month: number; year: number } }>, reply) => {
        try {
            const { month, year } = request.query;
            const workbook = await request.container!.payrollService.generateSalaryStatement(month, year);

            const buffer = await workbook.xlsx.writeBuffer();

            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const fileName = `Salary_Statement_${monthNames[month - 1]}_${year}.xlsx`;

            reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            reply.header('Content-Disposition', `attachment; filename=${fileName}`);
            return reply.send(buffer);
        } catch (error: any) {
            return reply.status(400).send({
                success: false,
                error: { message: error.message },
            });
        }
    }
);