import fs from 'fs';

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
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topPolitics.push({
                    site: item.title || source.name,
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
        const res = await fetch('https://www.reddit.com/r/politics/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`r/politics RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/politics/', LOGOS.reddit);
            entries.forEach(entry => usPolitics.push({
                site: entry.title || "US Politics Discussion",
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
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const needed = 4 - intlPolitics.length;
                const items = parseRssItems(await res.text(), needed, source.url, source.logo);
                items.forEach(item => intlPolitics.push({
                    site: item.title || source.name,
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

    // ── POLITICS TRENDS ──
    try {
        console.log("Parsing Politics Trends from Google Trends...");
        const res = await fetch('https://trends.google.com/trending/rss?geo=US&cat=396', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Politics status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            const items = xmlText.split('<item>');
            items.shift();
            items.slice(0, 4).forEach(itemStr => {
                const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
                const trendName = titleMatch ? titleMatch[1].trim() : "Trending Political Search";
                const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
                const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
                const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
                let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
                if (!storyContext) storyContext = "Trending political search dominating US query volume.";
                const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
                let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
                const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
                const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
                politicsTrends.push({
                    site: trendName,
                    category: "Trending Political Searches",
                    dailyHits: liveTraffic,
                    growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                    trend: ensurePeriod(storyContext),
                    url: sourceUrl,
                    image
                });
            });
            console.log(`Politics Trends compiled: ${politicsTrends.length} items`);
        }
    } catch (e) { console.error('Politics Trends Error:', e.message); }

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
        politicsTrends = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Political Search #${i + 1}`, category: "Trending Political Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending political search dominating US query volume.",
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
}

fetchPoliticsMatrix();
