import { test } from '@playwright/test';

test('debug widget on perfumedeer', async ({ page }) => {
    console.log('Starting debug session...');

    const consoleLogs: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleLogs.push(`[CONSOLE ERROR] ${msg.text()}`);
        }
    });

    page.on('requestfailed', request => {
        failedRequests.push(`[NETWORK FAIL] ${request.url()} - ${request.failure()?.errorText}`);
    });

    page.on('response', response => {
        if (response.status() >= 400) {
            failedRequests.push(`[HTTP ERROR] ${response.url()} - ${response.status()}`);
        }
    });

    console.log('Navigating to https://perfumedeer.com...');
    try {
        await page.goto('https://perfumedeer.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation error:', e);
    }

    // Try to find a product link. 
    // Salla/Zid usually have links like /p/123 or similar, or we can look for "products"
    const productUrl = await page.evaluate(() => {
        // Try to find a typical product card link
        const links = Array.from(document.querySelectorAll('a'));
        const productLink = links.find(a =>
            a.href.includes('/p/') ||
            a.href.includes('/products/') ||
            (a.href.match(/-c\d+/) && !a.href.includes('category')) // Zid/Salla sometimes use this
        );
        return productLink ? productLink.href : null;
    });

    if (productUrl) {
        console.log(`Found product URL: ${productUrl}. Navigating...`);
        await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Wait a bit for widgets to load
        await page.waitForTimeout(5000);

        // Check for Theqah widget elements
        const widgetInfo = await page.evaluate(() => {
            const scripts = Array.from(document.scripts).map(s => s.src).filter(s => s.includes('theqah'));
            const widgetEl = document.querySelector('.theqah-reviews, [data-theqah-widget], .theqah-stars-widget');
            return {
                scripts,
                hasWidgetElement: !!widgetEl,
                widgetHtml: widgetEl ? widgetEl.outerHTML.substring(0, 200) : 'N/A'
            };
        });

        console.log('--- Widget Info ---');
        console.log(JSON.stringify(widgetInfo, null, 2));

    } else {
        console.log('Could not find a product link on home page.');
    }

    console.log('\n--- Captured Console Errors ---');
    consoleLogs.forEach(l => console.log(l));

    console.log('\n--- Captured Network Errors ---');
    failedRequests.forEach(l => console.log(l));

    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
});
