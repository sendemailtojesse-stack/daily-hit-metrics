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
    variety: 'https://www.google.com/s2/favicons?domain=variety.com&sz=128',
    thr: 'https://www.google.com/s2/favicons?domain=hollywoodreporter.com&sz=128',
    ew: 'https://www.google.com/s2/favicons?domain=ew.com&sz=128',
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
    // Handle both <item> (RSS 2.0) and <item rdf:about="..."> (RDF/RSS 1.0), with optional leading whitespace
    const items = xmlText.split(/<item(?:\s[^>]*)?>/).slice(1);
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

async function fetchComedyMatrix() {
    console.log("Initializing Comedy Data Engine...");

    let topEntertainment = [];
    let moviesTV = [];
    let music = [];
    let comedyTrends = [];

        // ── COMEDY NEWS ──
    const comedyNewsSources = [
        { name: 'The Onion', url: 'https://www.theonion.com/rss', logo: 'https://www.google.com/s2/favicons?domain=theonion.com&sz=128' },
        { name: 'Variety Comedy', url: 'https://variety.com/v/comedy/feed/', logo: 'https://www.google.com/s2/favicons?domain=variety.com&sz=128' },
        { name: 'Deadline Comedy', url: 'https://deadline.com/category/comedy/feed/', logo: 'https://www.google.com/s2/favicons?domain=deadline.com&sz=128' },
    ];

    for (const source of comedyNewsSources) {
        try {
            console.log(`Parsing Comedy News from ${source.name}...`);
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const xmlText = await res.text();
                if (source.name !== 'The Onion') {
                    const itemCount = xmlText.split(/<item(?:\s[^>]*)?>/).length - 1;
                    const itemIdx = xmlText.indexOf('<item');
                    console.log(`${source.name} item count: ${itemCount}, length: ${xmlText.length}, full response: ${xmlText.substring(0, 500)}`);
                }
                const items = parseRssItems(xmlText, 8, source.url, source.logo);
                items.forEach(item => topEntertainment.push({
                    site: item.title || source.name,
                    sourceName: source.name,
                    category: "Comedy News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: ensurePeriod(item.desc || `Latest comedy news from ${source.name}.`),
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── STAND-UP & LIVE ──
    try {
        console.log("Parsing Stand-Up from r/standup...");
        const standupRes = await fetchRSS('https://www.reddit.com/r/standup/.rss?limit=10');
        console.log(`r/standup RSS status: ${standupRes.status}`);
        if (standupRes.ok) {
            const entries = parseAtomEntries(await standupRes.text(), 10, 'https://www.reddit.com/r/standup/', LOGOS.reddit);
            entries.forEach(entry => moviesTV.push({
                site: entry.title || "r/standup Discussion",
                sourceName: "r/standup",
                category: "Stand-Up & Live",
                dailyHits: `${Math.floor(Math.random() * 3000 + 200)} Coms`,
                growth: `+${Math.floor(Math.random() * 40 + 5)} up/min`,
                trend: "Trending in r/standup — top discussion in the stand-up comedy community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/standup Error:', e.message); }

    try {
        console.log("Parsing Comedy from r/comedy...");
        const comedyRedditRes = await fetchRSS('https://www.reddit.com/r/comedy/.rss?limit=10');
        console.log(`r/comedy RSS status: ${comedyRedditRes.status}`);
        if (comedyRedditRes.ok) {
            const entries = parseAtomEntries(await comedyRedditRes.text(), 10, 'https://www.reddit.com/r/comedy/', LOGOS.reddit);
            entries.forEach(entry => moviesTV.push({
                site: entry.title || "r/comedy Discussion",
                sourceName: "r/comedy",
                category: "Stand-Up & Live",
                dailyHits: `${Math.floor(Math.random() * 3000 + 200)} Coms`,
                growth: `+${Math.floor(Math.random() * 40 + 5)} up/min`,
                trend: "Trending in r/comedy — top discussion in the comedy community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/comedy Error:', e.message); }

        // ── COMICS ──
    const comicsSources = [
        { name: 'XKCD', url: 'https://xkcd.com/rss.xml', logo: 'https://www.google.com/s2/favicons?domain=xkcd.com&sz=128' },
        { name: 'The Oatmeal', url: 'https://theoatmeal.com/feed/rss', logo: 'https://www.google.com/s2/favicons?domain=theoatmeal.com&sz=128' },
    ];

    for (const source of comicsSources) {
        try {
            console.log(`Parsing Comics from ${source.name}...`);
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 6, source.url, source.logo);
                items.forEach(item => music.push({
                    site: item.title || source.name,
                    sourceName: source.name,
                    category: "Comics",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: ensurePeriod(item.desc || `Latest from ${source.name}.`),
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── ENTERTAINMENT TRENDS (7 regions, cat=3 = Entertainment) ──
    const COMEDY_REGION_LABELS = {
        'us':            'Google Trends Comedy US',
        'north-america': 'Google Trends Comedy North America',
        'south-america': 'Google Trends Comedy South America',
        'europe':        'Google Trends Comedy Europe',
        'africa':        'Google Trends Comedy Africa',
        'asia':          'Google Trends Comedy Asia',
        'oceania':       'Google Trends Comedy Oceania'
    };

    const parseComedyTrends = (xmlText, label) => {
        const items = xmlText.split('<item>');
        items.shift();
        const results = [];
        items.slice(0, 4).forEach(itemStr => {
            const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
            const trendName = titleMatch ? titleMatch[1].trim() : "Trending Comedy Search";
            const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
            const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
            const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
            let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
            if (!storyContext) storyContext = `Trending entertainment search in ${COMEDY_REGION_LABELS[label]?.replace('Google Trends Comedy ', '') || 'this region'}.`;
            const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
            let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
            const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
            const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
            results.push({
                site: trendName,
                sourceName: COMEDY_REGION_LABELS[label] || 'Google Trends Comedy',
                category: "Trending Comedy Searches",
                dailyHits: liveTraffic,
                growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                trend: ensurePeriod(storyContext),
                url: sourceUrl,
                image
            });
        });
        return results;
    };

    const fetchComedyContinentTrends = async (geos, label) => {
        const allItems = [];
        for (const geo of geos) {
            try {
                const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}&cat=3`, { headers: BROWSER_HEADERS });
                if (res.ok) allItems.push(...parseComedyTrends(await res.text(), label));
            } catch(e) {}
        }
        const seen = new Set();
        const unique = allItems.filter(i => { if (seen.has(i.site)) return false; seen.add(i.site); return true; });
        comedyTrends.push(...unique.slice(0, 4));
    };

    try {
        console.log("Parsing US Comedy Trends...");
        const usRes = await fetch('https://trends.google.com/trending/rss?geo=US&cat=3', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Comedy US status: ${usRes.status}`);
        if (usRes.ok) comedyTrends.push(...parseComedyTrends(await usRes.text(), 'us'));
        console.log(`US comedy trends compiled: ${comedyTrends.length} items`);
    } catch(e) { console.error('Comedy Trends US Error:', e.message); }

    await fetchComedyContinentTrends(['CA', 'MX'], 'north-america');
    await fetchComedyContinentTrends(['BR', 'AR', 'CO', 'CL', 'PE'], 'south-america');
    await fetchComedyContinentTrends(['GB', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'], 'europe');
    await fetchComedyContinentTrends(['NG', 'ZA', 'KE', 'EG', 'GH', 'ET'], 'africa');
    await fetchComedyContinentTrends(['IN', 'JP', 'KR', 'ID', 'PH', 'PK', 'VN', 'TH'], 'asia');
    await fetchComedyContinentTrends(['AU', 'NZ'], 'oceania');
    console.log(`Entertainment trends total: ${comedyTrends.length} items`);

    // ── FALLBACKS ──
    if (topEntertainment.length === 0) {
        topEntertainment = Array.from({ length: 6 }, (_, i) => ({
            site: `Entertainment Story #${i + 1}`, category: "Comedy News",
            dailyHits: "Global", growth: "+2.0%",
            trend: "Latest entertainment news from Hollywood.",
            url: "https://variety.com", image: LOGOS.variety
        }));
    }
    if (moviesTV.length === 0) {
        moviesTV = Array.from({ length: 4 }, (_, i) => ({
            site: `Stand-Up Discussion #${i + 1}`, category: "Stand-Up & Live",
            sourceName: "r/standup", dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top stand-up comedy discussion trending on Reddit.",
            url: "https://www.reddit.com/r/standup/", image: LOGOS.reddit
        }));
    }
    if (music.length === 0) {
        music = Array.from({ length: 4 }, (_, i) => ({
            site: `Music Discussion #${i + 1}`, category: "Comics",
            dailyHits: "1K Coms", growth: "+15 up/min",
            trend: "Top music discussion trending on Reddit.",
            url: "https://www.reddit.com/r/Music/", image: LOGOS.reddit
        }));
    }
    if (comedyTrends.length === 0) {
        const labels = ['us', 'north-america', 'south-america', 'europe', 'africa', 'asia', 'oceania'];
        comedyTrends = Array.from({ length: 28 }, (_, i) => ({
            site: `Trending Comedy Search #${i + 1}`,
            sourceName: COMEDY_REGION_LABELS[labels[Math.floor(i / 4)]] || 'Google Trends Comedy',
            category: "Trending Comedy Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending entertainment search dominating regional query volume.",
            url: "https://trends.google.com", image: LOGOS.google
        }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...topEntertainment,
        ...moviesTV,
        ...music,
        ...comedyTrends
    ];

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
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_COMEDY_NAMESPACE_ID;
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
        if (kvRes.ok) console.log("Comedy KV write complete: Comedy Matrix successfully deployed.");
        else console.error("Comedy KV write failed:", await kvRes.text());
    } catch (e) { console.error("Comedy KV write error:", e.message); }

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
            const alertUsers = users.filter(u => u.preferences?.keywords?.comedy?.length > 0);
            console.log(`Found ${alertUsers.length} users with Comedy keyword alerts.`);

            for (const user of alertUsers) {
                const keywords = user.preferences.keywords.comedy;
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
        The following articles matched your keyword alerts on the <strong>Comedy</strong> feed this hour:
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
                        subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics Comedy`,
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

fetchComedyMatrix();
