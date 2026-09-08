
import axios from 'axios';
import XLSX from 'xlsx';
const SONAR_TOKEN = '325b2896daa9266b49cdf58b09f7ef1154782ee6';

const SONAR_API_URL = 'https://sonarcloud.io/api/issues/search?componentKeys=CloudDesk_gcp_Revo365-backend&resolved=false';

console.log('SONAR_TOKEN:', SONAR_TOKEN);
console.log('SONAR_API_URL:', SONAR_API_URL);


async function fetchAllIssues() {
    let allIssues = [];
    let page = 1;
    let hasMoreIssues = true;

    while (hasMoreIssues) {
        try {
            const response = await axios.get(SONAR_API_URL, {
                auth: {
                    username: SONAR_TOKEN,
                    password: '',
                },
                params: {
                    p: page,
                    ps: 500,
                },
            });

            const issues = response.data.issues;
            allIssues = allIssues.concat(issues);

            console.log(`Fetched ${issues.length} issues from page ${page}`);

            const totalIssues = response.data.total;
            console.log(`Total issues reported by API: ${totalIssues}`);

            if (allIssues.length >= totalIssues) {
                hasMoreIssues = false;
            } else {
                page++;
            }
        } catch (error) {
            console.error(`Error fetching page ${page}:`, error);
            break;
        }
    }

    console.log(`Total issues fetched: ${allIssues.length}`);
    return allIssues;
}

async function exportIssuesToExcel() {
    try {
        const issues = await fetchAllIssues();
        console.log(issues.length ,' Total issues fetched');
        const formattedData = issues.map(issue => ({
            'Issue Key': issue.key,
            'Issue Type': issue.type,
            'Severity': issue.severity,
            'Message': issue.message,
            'Status': issue.status,
            'File': issue.component,
            'Line': issue.line || 'N/A',
            'Rule': issue.rule,
            'Tags': issue.tags ? issue.tags.join(', ') : 'N/A',
            'Creation Date': issue.creationDate,
            'Update Date': issue.updateDate,
            'author': issue.author,
            'Assignee': issue.assignee || 'Unassigned',
        }));
        const highSeverityCount = formattedData.filter(issue => issue.Severity === 'CRITICAL').length;
        console.log(`High Severity Issues: ${highSeverityCount}`);
        const now = new Date();
        const formattedDate = now.toLocaleString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).replace(/[\s,]/g, '-');

        const formattedTime = now.toLocaleString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }).replace(/[\s,:]/g, '-');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Issues Report');

        XLSX.writeFile(workbook, `SonarCloud_Issues_Report_${formattedDate}_${formattedTime} .xlsx`);

        console.log(`Exported to SonarCloud_Issues_Report_${formattedDate}_${formattedTime}.xlsx successfully!`);
    } catch (error) {
        console.error('Error fetching data from SonarCloud:', error);
    }
}



exportIssuesToExcel();  