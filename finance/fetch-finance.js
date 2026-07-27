import fs from 'fs';

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
};

const LOGOS = {
    reuters: 'https://www.google.com/s2/favicons?domain=reuters.com&sz=128',
    yahoo: 'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=128',
    marketwatch: 'https://www.google.com/s2/favicons?domain=marketwatch.com&sz=128',
    coindesk: 'https://www.google.com/s2/favicons?domain=coindesk.com&sz=128',
    reddit: 'https://www.google.com/s2/favicons?domain=reddit.com&sz=128',
    google: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
};

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function truncateAtWord(str, maxLen = 160) {
    if (!str || str.length <= maxLen) return str;
    const cut = str.substring(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 0 ? cut.substring(0, lastSpace) : cut;
}

function ensurePeriod(str) {
    if (!str) return str;
    const trimmed = str.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : trimmed + '...';
}

function extractImage(itemStr) {
    const patterns = [
        /<media:thumbnail[^>]+url=["']([^"']+)["']/,
        /<media:content[^>]+url=["']([^"']+)["']/,
        /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/,
    ];
    for (const p of patterns) {
        const m = itemStr.match(p);
        if (m && m[1].startsWith('http')) return m[1].trim();
    }
    return null;
}

function parseRssItems(xmlText, limit, fallbackUrl, fallbackLogo) {
    const items = xmlText.split('<item>');
    items.shift();
    return items.slice(0, limit).map(itemStr => {
        const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
        let title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
        if (title.length > 120) title = title.substring(0, 117) + "...";
        const linkMatch = itemStr.match(/<link>([^<]+)<\/link>/) || itemStr.match(/<link\s+href=["']([^"']+)["']/);
        const url = linkMatch ? linkMatch[1].trim() : fallbackUrl;
        const descMatch = itemStr.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);
        const descRaw = descMatch ? descMatch[1] : "";
        const desc = ensurePeriod(truncateAtWord(decodeEntities(descRaw)
            .replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, ' ')
            .replace(/<[^>]*$/g, '').replace(/\s+/g, ' ').trim()));
        const image = extractImage(itemStr) || fallbackLogo;
        return { title, url, desc, image };
    });
}

function parseAtomEntries(xmlText, limit, fallbackUrl, fallbackLogo) {
    const items = xmlText.split('<entry>');
    items.shift();
    return items.slice(0, limit).map(itemStr => {
        const titleMatch = itemStr.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
        let title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
        if (title.length > 120) title = title.substring(0, 117) + "...";
        const linkMatch = itemStr.match(/<link[^>]+href=["']([^"']+)["']/) || itemStr.match(/<link>([^<]+)<\/link>/);
        const url = linkMatch ? linkMatch[1].trim() : fallbackUrl;
        const descMatch = itemStr.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/s);
        const descRaw = descMatch ? descMatch[1] : "";
        const desc = ensurePeriod(truncateAtWord(decodeEntities(descRaw)
            .replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ').trim()));
        const image = extractImage(itemStr) || fallbackLogo;
        return { title, url, desc, image };
    });
}

const financeContext = (title) => {
    const t = title.toLowerCase();
    if (/earnings|revenue|profit|loss|eps|quarterly/.test(t)) return "Earnings report analysis trending in financial markets.";
    if (/fed|federal reserve|interest rate|inflation|fomc|rate hike|rate cut/.test(t)) return "Federal Reserve and interest rate discussion active in markets.";
    if (/gdp|recession|economy|macro|unemployment|jobs report/.test(t)) return "Macroeconomic discussion active in financial communities.";
    if (/options|calls|puts|volatility|iv|theta|delta/.test(t)) return "Options trading discussion active in investor communities.";
    if (/crypto|bitcoin|ethereum|btc|eth|defi|blockchain/.test(t)) return "Cryptocurrency discussion active in digital asset markets.";
    if (/ipo|merger|acquisition|buyout|takeover/.test(t)) return "Corporate action discussion active in financial communities.";
    if (/dividend|yield|bond|treasury|fixed income/.test(t)) return "Fixed income and dividend discussion active in markets.";
    if (/ai|artificial intelligence|semiconductor|chip|nvidia/.test(t)) return "Technology sector discussion active in financial communities.";
    if (/short|squeeze|hedge|bearish/.test(t)) return "Short selling and market positioning discussion active.";
    return "Market discussion active in financial communities.";
};

async function fetchFinanceMatrix() {
    console.log("Initializing Finance Data Engine...");

    let topFinance = [];
    let markets = [];
    let crypto = [];
    let personalFinance = [];
    let financeTrends = [];

    // ── TOP FINANCE NEWS ──
    const financeSources = [
        { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', logo: LOGOS.reuters },
        { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/rss/', logo: LOGOS.yahoo },
        { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', logo: LOGOS.marketwatch },
    ];

    for (const source of financeSources) {
        try {
            console.log(`Parsing Finance News from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topFinance.push({
                    site: item.title || source.name,
                    category: "Top Finance News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest finance news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── MARKETS ──
    try {
        console.log("Parsing Markets from Reddit...");
        const res = await fetch('https://www.reddit.com/r/stocks+investing/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`r/stocks+investing RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/stocks/', LOGOS.reddit);
            entries.forEach(entry => markets.push({
                site: entry.title || "Market Discussion",
                category: "Markets",
                dailyHits: `${Math.floor(Math.random() * 800 + 150)} Traders`,
                growth: `${Math.random() > 0.35 ? "+" : "-"}${Math.floor(Math.random() * 25 + 5)} coms/min`,
                trend: financeContext(entry.title || ''),
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('Markets Error:', e.message); }

    // ── CRYPTO ──
    const cryptoSources = [
        { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', logo: LOGOS.coindesk },
        { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', logo: 'https://www.google.com/s2/favicons?domain=cointelegraph.com&sz=128' },
    ];

    for (const source of cryptoSources) {
        try {
            console.log(`Parsing Crypto from ${source.name}...`);
            await new Promise(r => setTimeout(r, 2000));
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => crypto.push({
                    site: item.title || source.name,
                    category: "Crypto",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 8 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest cryptocurrency news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── PERSONAL FINANCE ──
    const personalFinanceSources = [
        { name: 'NerdWallet', url: 'https://www.nerdwallet.com/blog/feed/', logo: 'https://www.google.com/s2/favicons?domain=nerdwallet.com&sz=128' },
        { name: 'Investopedia', url: 'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_personal-finance', logo: 'https://www.google.com/s2/favicons?domain=investopedia.com&sz=128' },
        { name: 'The Balance', url: 'https://www.thebalancemoney.com/rss', logo: 'https://www.google.com/s2/favicons?domain=thebalancemoney.com&sz=128' },
        { name: 'Bankrate', url: 'https://www.bankrate.com/rss/', logo: 'https://www.google.com/s2/favicons?domain=bankrate.com&sz=128' },
    ];

    for (const source of personalFinanceSources) {
        if (personalFinance.length >= 4) break;
        try {
            console.log(`Parsing Personal Finance from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const needed = 4 - personalFinance.length;
                const items = parseRssItems(await res.text(), needed, source.url, source.logo);
                items.forEach(item => personalFinance.push({
                    site: item.title || source.name,
                    category: "Personal Finance",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest personal finance tips from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── FINANCE TRENDS ──
    try {
        console.log("Parsing Finance Trends from Google Trends...");
        const res = await fetch('https://trends.google.com/trending/rss?geo=US&cat=7', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Finance status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            const items = xmlText.split('<item>');
            items.shift();
            items.slice(0, 4).forEach(itemStr => {
                const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
                const trendName = titleMatch ? titleMatch[1].trim() : "Trending Finance Search";
                const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
                const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
                const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
                let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
                if (!storyContext) storyContext = "Trending finance search dominating US query volume.";
                const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
                let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
                const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
                const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
                financeTrends.push({
                    site: trendName,
                    category: "Trending Finance Searches",
                    dailyHits: liveTraffic,
                    growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                    trend: ensurePeriod(storyContext),
                    url: sourceUrl,
                    image
                });
            });
            console.log(`Finance Trends compiled: ${financeTrends.length} items`);
        }
    } catch (e) { console.error('Finance Trends Error:', e.message); }

    // ── FALLBACKS ──
    if (topFinance.length === 0) {
        topFinance = Array.from({ length: 6 }, (_, i) => ({
            site: `Finance Story #${i + 1}`, category: "Top Finance News",
            dailyHits: "Global", growth: "+2.0%",
            trend: "Latest finance news from global markets.",
            url: "https://finance.yahoo.com", image: LOGOS.yahoo
        }));
    }
    if (markets.length === 0) {
        markets = Array.from({ length: 4 }, (_, i) => ({
            site: `Market Discussion #${i + 1}`, category: "Markets",
            dailyHits: "500 Traders", growth: "+15 coms/min",
            trend: "Market discussion active in investor communities.",
            url: "https://www.reddit.com/r/stocks/", image: LOGOS.reddit
        }));
    }
    if (crypto.length === 0) {
        crypto = Array.from({ length: 4 }, (_, i) => ({
            site: `Crypto Discussion #${i + 1}`, category: "Crypto",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Cryptocurrency discussion active in digital asset communities.",
            url: "https://www.coindesk.com", image: LOGOS.coindesk
        }));
    }
    if (personalFinance.length === 0) {
        personalFinance = Array.from({ length: 4 }, (_, i) => ({
            site: `Personal Finance #${i + 1}`, category: "Personal Finance",
            dailyHits: "500 Coms", growth: "+10 up/min",
            trend: "Personal finance discussion active in community.",
            url: "https://www.reddit.com/r/personalfinance/", image: LOGOS.reddit
        }));
    }
    if (financeTrends.length === 0) {
        financeTrends = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Finance Search #${i + 1}`, category: "Trending Finance Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending finance search dominating US query volume.",
            url: "https://trends.google.com", image: LOGOS.google
        }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...topFinance,
        ...markets,
        ...crypto,
        ...personalFinance,
        ...financeTrends,
    ].map((item, index) => ({ rank: index + 1, ...item }));

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    // ── GROQ FINANCE EDITORIAL SUMMARY ──
    try {
        console.log("Generating finance editorial summary via Groq...");
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        if (GROQ_API_KEY) {
            const topStories = orderedGrid.slice(0, 15)
                .map(item => `- [${item.category}] ${item.site}: ${item.trend}`)
                .join('\n');

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    max_tokens: 400,
                    temperature: 0.7,
                    messages: [{
                        role: 'user',
                        content: `You are the finance editor of Daily Hit Metrics. Based on the following trending finance stories from this hour, write a concise 250-300 word financial briefing that synthesizes the key market themes, economic developments, and investment storylines. Write in a sharp, authoritative financial journalism style. Do not use bullet points — write flowing prose. Do not include any title or heading — begin directly with the editorial text.\n\nTop finance stories this hour:\n${topStories}`
                    }]
                })
            });

            if (groqRes.ok) {
                const groqData = await groqRes.json();
                const summary = groqData.choices?.[0]?.message?.content?.trim();
                if (summary) {
                    finalDatabaseState.editorialSummary = summary;
                    console.log("Groq finance summary generated successfully.");
                }
            } else {
                console.error("Groq API error:", groqRes.status);
            }
        }
    } catch (e) {
        console.error("Groq summary error:", e.message);
    }

    const jsonData = JSON.stringify(finalDatabaseState, null, 2);

    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const CF_API_TOKEN = process.env.CF_API_TOKEN;
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_FINANCE_NAMESPACE_ID;

    const kvRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/data`,
        {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: jsonData
        }
    );

    if (kvRes.ok) {
        console.log("Finance KV write complete: Finance Matrix successfully deployed.");
        const htmlContent = fs.readFileSync('finance/index.html', 'utf8');
        const htmlRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/index.html`,
            {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'text/html' },
                body: htmlContent
            }
        );
        if (htmlRes.ok) console.log("Finance HTML written to KV successfully.");
        else console.error("Finance HTML KV write failed:", await htmlRes.text());
    } else {
        console.error("Finance KV write failed:", await kvRes.text());
        fs.writeFileSync('finance-data.json', jsonData);
    }
    // ── KEYWORD EMAIL ALERTS ──
    try {
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (!SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
            console.log("Keyword alerts skipped — missing SUPABASE_SERVICE_KEY or RESEND_API_KEY.");
        } else {
            console.log("Checking keyword alerts...");
            const usersRes = await fetch(
                `https://dljqwghiyjhombvflgfg.supabase.co/rest/v1/profiles?subscription_tier=eq.pro&select=id,email,first_name,preferences`,
                {
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (usersRes.ok) {
                const users = await usersRes.json();
                const siteUsers = users.filter(u => u.preferences?.finance?.keywords?.length > 0);
                console.log(`Found ${siteUsers.length} users with Finance keyword alerts.`);

                for (const user of siteUsers) {
                    const keywords = user.preferences.finance.keywords;
                    const matches = [];
                    for (const item of orderedGrid) {
                        const text = `${item.site} ${item.trend}`.toLowerCase();
                        for (const keyword of keywords) {
                            const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
                            if (regex.test(text)) { matches.push({ item, keyword }); break; }
                        }
                    }
                    if (matches.length === 0) continue;

                    const matchList = matches.map(({ item, keyword }) =>
                        `<tr><td style="padding:10px 0; border-bottom:1px solid #e8e0d0;">
                            <div style="font-family:Georgia,serif; font-size:14px; font-weight:700;">
                                <a href="${item.url}" style="color:#3a6b4a; text-decoration:none;">${item.site}</a>
                            </div>
                            <div style="font-family:Georgia,serif; font-size:12px; color:#5a3e2b; margin-top:4px;">${item.trend}</div>
                            <div style="font-family:Georgia,serif; font-size:11px; color:#8a6a50; margin-top:4px;">
                                Matched keyword: <strong>${keyword}</strong> · ${item.category}
                            </div>
                        </td></tr>`
                    ).join('');

                    const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="background:#484848; margin:0; padding:20px;">
<div style="max-width:600px; margin:0 auto; background:#faf8f4; border-left:3px solid #3a6b4a; border-right:3px solid #3a6b4a; padding:32px 36px;">
    <div style="font-family:Georgia,serif; font-size:20px; font-weight:700; color:#2f3640; text-align:right; margin-bottom:4px;">Daily Hit Metrics</div>
    <div style="border-top:3px solid #2c1810; margin:8px 0 24px;"></div>
    <div style="font-family:Georgia,serif; font-size:13px; color:#5a3e2b; margin-bottom:20px;">
        Hi ${user.first_name || 'there'},<br><br>
        The following articles matched your keyword alerts on the <strong>Finance</strong> feed this hour:
    </div>
    <table style="width:100%; border-collapse:collapse;">${matchList}</table>
    <div style="margin-top:24px; font-family:Georgia,serif; font-size:11px; color:#8a6a50; border-top:1px solid #d4c9b0; padding-top:16px;">
        You're receiving this because you set up keyword alerts on Daily Hit Metrics.<br>
        Manage your alerts in <a href="https://news.dailyhitmetrics.com/settings.html" style="color:#3a6b4a;">Settings</a>.
        <br><br>© 2026 MpathTek · All rights reserved
    </div>
</div></body></html>`;

                    const emailRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            from: 'Daily Hit Metrics <noreply@dailyhitmetrics.com>',
                            to: user.email,
                            subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics Finance`,
                            html: emailHtml
                        })
                    });

                    if (emailRes.ok) console.log(`Keyword alert sent to ${user.email} (${matches.length} matches).`);
                    else console.error(`Failed to send alert to ${user.email}:`, await emailRes.text());
                }
            } else {
                console.error("Failed to fetch users:", await usersRes.text());
            }
        }
    } catch (e) {
        console.error("Keyword alert error:", e.message);
    }
}

fetchFinanceMatrix();
