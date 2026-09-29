const findLocalChromePath = async () => {
  const fs = await import("fs");
  const possiblePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  return possiblePaths.find((pathValue) => fs.default.existsSync(pathValue)) ?? "";
};

export const renderHtmlToPdf = async (html: string): Promise<Buffer> => {
  let browser: any;

  try {
    const puppeteer = await import("puppeteer-core");

    try {
      const chromium = await import("@sparticuz/chromium");
      browser = await puppeteer.default.launch({
        args: chromium.default.args,
        defaultViewport: { width: 1280, height: 800 },
        executablePath: await chromium.default.executablePath(),
        headless: true,
      });
    } catch {
      const executablePath = await findLocalChromePath();
      if (!executablePath) {
        throw new Error(
          "No Chrome/Chromium executable found. Install @sparticuz/chromium or Google Chrome."
        );
      }

      browser = await puppeteer.default.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });

    await browser.close();
    return Buffer.from(pdf);
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore browser cleanup failures
      }
    }
    throw error;
  }
};
