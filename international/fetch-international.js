import fs from 'fs';


const WORKER_RSS_PROXY = 'https://daily-hit-metrics-worker.sendemailtojesse.workers.dev/api/rss-proxy';
const fetchRSS = async (url, retries = 2) => {
    const proxyUrl = `${WORKER_RSS_PROXY}?url=${encodeURIComponent(url)}`;
    let lastRes = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(proxyUrl);
            lastRes = res;
            if (res.ok || res.status === 404) return res;
            if (i < retries) await new Promise(r => setTimeout(r, 3000));
        } catch(e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    return lastRes || { ok: false, status: 0 };
};

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
};

const LOGOS = {
    espn: 'https://www.google.com/s2/favicons?domain=espn.com&sz=128',
    bbc: 'https://www.google.com/s2/favicons?domain=bbc.co.uk&sz=128',
    skysports: 'https://www.google.com/s2/favicons?domain=skysports.com&sz=128',
    reddit: 'https://www.google.com/s2/favicons?domain=reddit.com&sz=128',
    google: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
};

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x2F;/g, '/')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
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
        /<image>.*?<url>([^<]+)<\/url>/s,
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
        let desc = "";
        const descMatch = itemStr.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s);
        const descRaw = descMatch ? descMatch[1] : "";
        desc = ensurePeriod(truncateAtWord(decodeEntities(descRaw)
            .replace(/<\/p>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/<[^>]*$/g, '')
            .replace(/\s+/g, ' ')
            .trim()));
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
        const contentMatch = itemStr.match(/<content[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content>/s);
        const descMatch = itemStr.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/s);
        const rawDesc = (descMatch || contentMatch) ? (descMatch || contentMatch)[1] : "";
        const desc = ensurePeriod(truncateAtWord(decodeEntities(rawDesc)
            .replace(/<\/p>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()));
        const image = extractImage(itemStr) || fallbackLogo;
        return { title, url, desc, image };
    });
}

async function fetchInternationalMatrix() {
    console.log("Initializing International News Data Engine...");

    let intlNews = [];
    let europe = [];
    let asia = [];
    let worldCommunity = [];
    let intlTrends = [];

    // ── INTERNATIONAL NEWS ──
    const intlSources = [
        { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', logo: 'https://www.google.com/s2/favicons?domain=aljazeera.com&sz=128' },
        { name: 'France 24', url: 'https://www.france24.com/en/rss', logo: 'https://www.google.com/s2/favicons?domain=france24.com&sz=128' },
        { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-top', logo: 'https://www.google.com/s2/favicons?domain=dw.com&sz=128' },
        { name: 'Euronews', url: 'https://www.euronews.com/rss', logo: 'https://www.google.com/s2/favicons?domain=euronews.com&sz=128' },
    ];

    for (const source of intlSources) {
        try {
            console.log(`Parsing International News from ${source.name}...`);
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 8, source.url, source.logo);
                items.forEach(item => intlNews.push({
                    site: item.title || source.name,
                    sourceName: source.name,
                    category: "International News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: ensurePeriod(item.desc || `Latest international news from ${source.name}.`),
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

        // ── EUROPE ──
    try {
        console.log("Parsing Europe from r/europe...");
        const europeRes = await fetchRSS('https://www.reddit.com/r/europe/.rss?limit=10');
        console.log(`r/europe RSS status: ${europeRes.status}`);
        if (europeRes.ok) {
            const entries = parseAtomEntries(await europeRes.text(), 10, 'https://www.reddit.com/r/europe/', LOGOS.reddit);
            entries.forEach(entry => europe.push({
                site: entry.title || "r/europe Discussion",
                sourceName: "r/europe",
                category: "Europe",
                dailyHits: `${Math.floor(Math.random() * 5000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 50 + 10)} up/min`,
                trend: "Trending in r/europe — top discussion in the European community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/europe Error:', e.message); }

    // ── ASIA ──
    try {
        console.log("Parsing Asia from Japan Times...");
        const japanRes = await fetchRSS('https://www.japantimes.co.jp/feed/');
        console.log(`Japan Times RSS status: ${japanRes.status}`);
        if (japanRes.ok) {
            const items = parseRssItems(await japanRes.text(), 8, 'https://www.japantimes.co.jp', 'https://www.google.com/s2/favicons?domain=japantimes.co.jp&sz=128');
            items.forEach(item => asia.push({
                site: item.title || "Japan Times",
                sourceName: "Japan Times",
                category: "Asia",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: ensurePeriod(item.desc || "Latest news from Japan Times."),
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('Japan Times Error:', e.message); }

    try {
        console.log("Parsing Asia from r/asia...");
        const asiaRes = await fetchRSS('https://www.reddit.com/r/asia/.rss?limit=10');
        console.log(`r/asia RSS status: ${asiaRes.status}`);
        if (asiaRes.ok) {
            const entries = parseAtomEntries(await asiaRes.text(), 10, 'https://www.reddit.com/r/asia/', LOGOS.reddit);
            entries.forEach(entry => asia.push({
                site: entry.title || "r/asia Discussion",
                sourceName: "r/asia",
                category: "Asia",
                dailyHits: `${Math.floor(Math.random() * 5000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 50 + 10)} up/min`,
                trend: "Trending in r/asia — top discussion in the Asian community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/asia Error:', e.message); }

    // ── WORLD COMMUNITY ──
    try {
        console.log("Parsing World Community from r/worldnews...");
        const worldnewsRes = await fetchRSS('https://www.reddit.com/r/worldnews/.rss?limit=10');
        console.log(`r/worldnews RSS status: ${worldnewsRes.status}`);
        if (worldnewsRes.ok) {
            const entries = parseAtomEntries(await worldnewsRes.text(), 10, 'https://www.reddit.com/r/worldnews/', LOGOS.reddit);
            entries.forEach(entry => worldCommunity.push({
                site: entry.title || "r/worldnews Discussion",
                sourceName: "r/worldnews",
                category: "World Community",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: "Trending in r/worldnews — top discussion in the global news community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/worldnews Error:', e.message); }

    try {
        console.log("Parsing World Community from Global Voices...");
        const gvRes = await fetchRSS('https://globalvoices.org/feed/');
        console.log(`Global Voices RSS status: ${gvRes.status}`);
        if (gvRes.ok) {
            const items = parseRssItems(await gvRes.text(), 8, 'https://globalvoices.org', 'https://www.google.com/s2/favicons?domain=globalvoices.org&sz=128');
            items.forEach(item => worldCommunity.push({
                site: item.title || "Global Voices",
                sourceName: "Global Voices",
                category: "World Community",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: ensurePeriod(item.desc || "Citizen journalism from Global Voices."),
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('Global Voices Error:', e.message); }

        // ── INTERNATIONAL TRENDS (7 regions, general news cat=0) ──
    const INTL_REGION_LABELS = {
        'us':            'Google Trends International US',
        'north-america': 'Google Trends International North America',
        'south-america': 'Google Trends International South America',
        'europe':        'Google Trends International Europe',
        'africa':        'Google Trends International Africa',
        'asia':          'Google Trends International Asia',
        'oceania':       'Google Trends International Oceania'
    };

    const parseIntlTrends = (xmlText, label) => {
        const items = xmlText.split('<item>');
        items.shift();
        const results = [];
        items.slice(0, 4).forEach(itemStr => {
            const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
            const trendName = titleMatch ? titleMatch[1].trim() : "Trending International Search";
            const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
            const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
            const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
            let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
            if (!storyContext) storyContext = `Trending international search in ${INTL_REGION_LABELS[label]?.replace('Google Trends International ', '') || 'this region'}.`;
            const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
            let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
            const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
            const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
            results.push({
                site: trendName,
                sourceName: INTL_REGION_LABELS[label] || 'Google Trends International',
                category: "Trending International Searches",
                dailyHits: liveTraffic,
                growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                trend: ensurePeriod(storyContext),
                url: sourceUrl,
                image
            });
        });
        return results;
    };

    const fetchIntlContinentTrends = async (geos, label) => {
        const allItems = [];
        for (const geo of geos) {
            try {
                const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: BROWSER_HEADERS });
                if (res.ok) allItems.push(...parseIntlTrends(await res.text(), label));
            } catch(e) {}
        }
        const seen = new Set();
        const unique = allItems.filter(i => { if (seen.has(i.site)) return false; seen.add(i.site); return true; });
        intlTrends.push(...unique.slice(0, 4));
    };

    try {
        console.log("Parsing US International Trends...");
        const usRes = await fetch('https://trends.google.com/trending/rss?geo=US', { headers: BROWSER_HEADERS });
        console.log(`Google Trends International US status: ${usRes.status}`);
        if (usRes.ok) intlTrends.push(...parseIntlTrends(await usRes.text(), 'us'));
    } catch(e) { console.error('International Trends US Error:', e.message); }

    await fetchIntlContinentTrends(['CA', 'MX'], 'north-america');
    await fetchIntlContinentTrends(['BR', 'AR', 'CO', 'CL', 'PE'], 'south-america');
    await fetchIntlContinentTrends(['GB', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'], 'europe');
    await fetchIntlContinentTrends(['NG', 'ZA', 'KE', 'EG', 'GH', 'ET'], 'africa');
    await fetchIntlContinentTrends(['IN', 'JP', 'KR', 'ID', 'PH', 'PK', 'VN', 'TH'], 'asia');
    await fetchIntlContinentTrends(['AU', 'NZ'], 'oceania');
    console.log(`International trends total: ${intlTrends.length} items`);

    // ── FALLBACKS ──
    if (intlNews.length === 0) {
        intlNews = Array.from({ length: 8 }, (_, i) => ({
        site: `International News #${i + 1}`, category: "International News",
        sourceName: "Al Jazeera", dailyHits: "Global", growth: "+2.0%",
        trend: "Latest international news.", url: "https://aljazeera.com", image: LOGOS.google
    }));
    }
    if (intlTrends.length === 0) {
        const labels = ['us', 'north-america', 'south-america', 'europe', 'africa', 'asia', 'oceania'];
        intlTrends = Array.from({ length: 28 }, (_, i) => ({
        site: `Trending International Search #${i + 1}`,
        sourceName: INTL_REGION_LABELS[['us','north-america','south-america','europe','africa','asia','oceania'][Math.floor(i/4)]] || 'Google Trends International',
        category: "Trending International Searches",
        dailyHits: "10K+", growth: "+8.0%",
        trend: "Trending international search.", url: "https://trends.google.com", image: LOGOS.google
    }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...intlNews,
        ...europe,
        ...asia,
        ...worldCommunity,
        ...intlTrends
    ];

    // Assign per-section rank
    const sectionCounters = {};
    orderedGrid.forEach(item => {
        const key = item.category;
        if (!sectionCounters[key]) sectionCounters[key] = 0;
        sectionCounters[key]++;
        item.rank = sectionCounters[key];
    });

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    // ── WRITE TO KV ──
    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_INTERNATIONAL_NAMESPACE_ID;
    const CF_API_TOKEN = process.env.CF_API_TOKEN;

    try {
        const kvRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/data`,
            {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(finalDatabaseState)
            }
        );
        if (kvRes.ok) console.log("International KV write complete: International Matrix successfully deployed.");
        else console.error("International KV write failed:", await kvRes.text());
    } catch (e) { console.error("International KV write error:", e.message); }

    // ── KEYWORD ALERTS ──
    try {
        const SUPABASE_URL = 'https://dljqwghiyjhombvflgfg.supabase.co';
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
        const RESEND_API_KEY = process.env.RESEND_API_KEY;

        const usersRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id,email,first_name,preferences&subscription_tier=in.(pro,pro_plus,admin)`,
            { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );

        if (usersRes.ok) {
            const users = await usersRes.json();
            console.log(`Found ${users.filter(u => u.preferences?.keywords?.international?.length > 0).length} users with International keyword alerts.`);

            for (const user of users) {
                const keywords = user.preferences?.keywords?.international || [];
                if (keywords.length === 0) continue;

                const matches = [];
                for (const item of orderedGrid) {
                    const text = `${item.site} ${item.trend}`.toLowerCase();
                    for (const keyword of keywords) {
                        const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
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
        The following articles matched your keyword alerts on the <strong>International</strong> feed this hour:
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
                        subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics International`,
                        html: emailHtml
                    })
                });

                if (emailRes.ok) console.log(`Keyword alert sent to ${user.email} (${matches.length} matches).`);
                else console.error(`Failed to send alert to ${user.email}:`, await emailRes.text());
            }
        } else {
            console.error("Failed to fetch users:", await usersRes.text());
        }
    } catch (e) {
        console.error("Keyword alert error:", e.message);
    }
}

fetchInternationalMatrix();
