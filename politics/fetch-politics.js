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
    guardian: 'https://www.google.com/s2/favicons?domain=theguardian.com&sz=128',
    npr: 'https://www.google.com/s2/favicons?domain=npr.org&sz=128',
    reuters: 'https://www.google.com/s2/favicons?domain=reuters.com&sz=128',
    bbc: 'https://www.google.com/s2/favicons?domain=bbc.co.uk&sz=128',
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

async function fetchPoliticsMatrix() {
    console.log("Initializing Politics Data Engine...");

    let topPolitics = [];
    let usPolitics = [];
    let intlPolitics = [];
    let politicsTrends = [];

    // ── TOP POLITICAL NEWS ──
    const politicsSources = [
        { name: 'The Guardian Politics', url: 'https://www.theguardian.com/politics/rss', logo: LOGOS.guardian },
        { name: 'NPR Politics', url: 'https://feeds.npr.org/1014/rss.xml', logo: LOGOS.npr },
        { name: 'BBC News Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', logo: LOGOS.bbc },
    ];

    for (const source of politicsSources) {
        try {
            console.log(`Parsing Politics from ${source.name}...`);
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topPolitics.push({
                    site: item.title || source.name,
                    sourceName: source.name,
                    category: "Top Political News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest political news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── US POLITICS ──
    try {
        console.log("Parsing US Politics from r/politics...");
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetchRSS('https://www.reddit.com/r/politics/.rss?limit=10');
        console.log(`r/politics RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/politics/', LOGOS.reddit);
            entries.forEach(entry => usPolitics.push({
                site: entry.title || "US Politics Discussion",
                sourceName: "r/politics",
                category: "US Politics",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: "Trending in r/politics — top discussion in the US political community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/politics Error:', e.message); }

    // ── INTERNATIONAL POLITICS ──
    const intlSources = [
        { name: 'BBC News World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', logo: LOGOS.bbc },
        { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', logo: 'https://www.google.com/s2/favicons?domain=aljazeera.com&sz=128' },
        { name: 'Reuters World', url: 'https://feeds.reuters.com/reuters/worldnews', logo: LOGOS.reuters },
        { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', logo: LOGOS.guardian },
    ];

    for (const source of intlSources) {
        if (intlPolitics.length >= 4) break;
        try {
            console.log(`Parsing International Politics from ${source.name}...`);
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const needed = 4 - intlPolitics.length;
                const items = parseRssItems(await res.text(), needed, source.url, source.logo);
                items.forEach(item => intlPolitics.push({
                    site: item.title || source.name,
                    sourceName: source.name,
                    category: "International Politics",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest international news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── POLITICS TRENDS (7 regions, cat=396 = Politics) ──
    const POLITICS_REGION_LABELS = {
        'us':            'Google Trends Politics US',
        'north-america': 'Google Trends Politics North America',
        'south-america': 'Google Trends Politics South America',
        'europe':        'Google Trends Politics Europe',
        'africa':        'Google Trends Politics Africa',
        'asia':          'Google Trends Politics Asia',
        'oceania':       'Google Trends Politics Oceania'
    };

    const parsePoliticsTrends = (xmlText, label) => {
        const items = xmlText.split('<item>');
        items.shift();
        const results = [];
        items.slice(0, 4).forEach(itemStr => {
            const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
            const trendName = titleMatch ? titleMatch[1].trim() : "Trending Political Search";
            const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
            const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
            const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
            let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
            if (!storyContext) storyContext = `Trending political search in ${POLITICS_REGION_LABELS[label]?.replace('Google Trends Politics ', '') || 'this region'}.`;
            const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
            let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
            const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
            const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
            results.push({
                site: trendName,
                sourceName: POLITICS_REGION_LABELS[label] || 'Google Trends Politics',
                category: "Trending Political Searches",
                dailyHits: liveTraffic,
                growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                trend: ensurePeriod(storyContext),
                url: sourceUrl,
                image
            });
        });
        return results;
    };

    const fetchPoliticsContinentTrends = async (geos, label) => {
        const allItems = [];
        for (const geo of geos) {
            try {
                const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}&cat=396`, { headers: BROWSER_HEADERS });
                if (res.ok) allItems.push(...parsePoliticsTrends(await res.text(), label));
            } catch(e) {}
        }
        const seen = new Set();
        const unique = allItems.filter(i => { if (seen.has(i.site)) return false; seen.add(i.site); return true; });
        politicsTrends.push(...unique.slice(0, 4));
    };

    try {
        console.log("Parsing US Politics Trends...");
        const usRes = await fetch('https://trends.google.com/trending/rss?geo=US&cat=396', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Politics US status: ${usRes.status}`);
        if (usRes.ok) politicsTrends.push(...parsePoliticsTrends(await usRes.text(), 'us'));
        console.log(`US politics trends compiled: ${politicsTrends.length} items`);
    } catch(e) { console.error('Politics Trends US Error:', e.message); }

    await fetchPoliticsContinentTrends(['CA', 'MX'], 'north-america');
    await fetchPoliticsContinentTrends(['BR', 'AR', 'CO', 'CL', 'PE'], 'south-america');
    await fetchPoliticsContinentTrends(['GB', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'], 'europe');
    await fetchPoliticsContinentTrends(['NG', 'ZA', 'KE', 'EG', 'GH', 'ET'], 'africa');
    await fetchPoliticsContinentTrends(['IN', 'JP', 'KR', 'ID', 'PH', 'PK', 'VN', 'TH'], 'asia');
    await fetchPoliticsContinentTrends(['AU', 'NZ'], 'oceania');
    console.log(`Politics trends total: ${politicsTrends.length} items`);

    // ── FALLBACKS ──
    if (topPolitics.length === 0) {
        topPolitics = Array.from({ length: 6 }, (_, i) => ({
            site: `Political News #${i + 1}`, category: "Top Political News",
            dailyHits: "Global", growth: "+2.0%",
            trend: "Latest political news from global sources.",
            url: "https://www.theguardian.com/politics", image: LOGOS.guardian
        }));
    }
    if (usPolitics.length === 0) {
        usPolitics = Array.from({ length: 4 }, (_, i) => ({
            site: `US Politics Discussion #${i + 1}`, category: "US Politics",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top US political discussion trending on Reddit.",
            url: "https://www.reddit.com/r/politics/", image: LOGOS.reddit
        }));
    }
    if (intlPolitics.length === 0) {
        intlPolitics = Array.from({ length: 4 }, (_, i) => ({
            site: `World News Discussion #${i + 1}`, category: "International Politics",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top international political discussion trending on Reddit.",
            url: "https://www.reddit.com/r/worldnews/", image: LOGOS.reddit
        }));
    }
    if (politicsTrends.length === 0) {
        const labels = ['us', 'north-america', 'south-america', 'europe', 'africa', 'asia', 'oceania'];
        politicsTrends = Array.from({ length: 28 }, (_, i) => ({
            site: `Trending Political Search #${i + 1}`,
            sourceName: POLITICS_REGION_LABELS[labels[Math.floor(i / 4)]] || 'Google Trends Politics',
            category: "Trending Political Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending political search dominating regional query volume.",
            url: "https://trends.google.com", image: LOGOS.google
        }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...topPolitics,
        ...usPolitics,
        ...intlPolitics,
        ...politicsTrends,
    ].map((item, index) => ({ rank: index + 1, ...item }));

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    // ── GROQ POLITICS EDITORIAL SUMMARY ──
    try {
        console.log("Generating politics editorial summary via Groq...");
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
                        content: `You are the politics editor of Daily Hit Metrics. Based on the following trending political stories from this hour, write a concise 250-300 word political briefing that synthesizes the key developments in US and international politics. Write in a sharp, balanced, nonpartisan journalistic style. Do not use bullet points — write flowing prose. Do not include any title or heading — begin directly with the editorial text.\n\nTop political stories this hour:\n${topStories}`
                    }]
                })
            });

            if (groqRes.ok) {
                const groqData = await groqRes.json();
                const summary = groqData.choices?.[0]?.message?.content?.trim();
                if (summary) {
                    finalDatabaseState.editorialSummary = summary;
                    console.log("Groq politics summary generated successfully.");
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
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_POLITICS_NAMESPACE_ID;

    const kvRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/data`,
        {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: jsonData
        }
    );

    if (kvRes.ok) {
        console.log("Politics KV write complete: Politics Matrix successfully deployed.");
        const htmlContent = fs.readFileSync('politics/index.html', 'utf8');
        const htmlRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/index.html`,
            {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'text/html' },
                body: htmlContent
            }
        );
        if (htmlRes.ok) console.log("Politics HTML written to KV successfully.");
        else console.error("Politics HTML KV write failed:", await htmlRes.text());
    } else {
        console.error("Politics KV write failed:", await kvRes.text());
        fs.writeFileSync('politics-data.json', jsonData);
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
                const siteUsers = users.filter(u => u.preferences?.politics?.keywords?.length > 0);
                console.log(`Found ${siteUsers.length} users with Politics keyword alerts.`);

                for (const user of siteUsers) {
                    const keywords = user.preferences.politics.keywords;
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
        The following articles matched your keyword alerts on the <strong>Politics</strong> feed this hour:
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
                            subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics Politics`,
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

fetchPoliticsMatrix();
