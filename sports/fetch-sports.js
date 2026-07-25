import fs from 'fs';

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

async function fetchSportsMatrix() {
    console.log("Initializing Sports Data Engine...");

    let topSports = [];
    let americanFootball = [];
    let basketball = [];
    let soccer = [];
    let baseball = [];
    let sportsTrends = [];

    // ── TOP SPORTS NEWS ──
    const sportsSources = [
        { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', logo: LOGOS.bbc },
        { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040', logo: LOGOS.skysports },
        { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', logo: 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128' },
    ];

    for (const source of sportsSources) {
        try {
            console.log(`Parsing Top Sports from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topSports.push({
                    site: item.title || source.name,
                    category: "Top Sports News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest sports news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── AMERICAN FOOTBALL ──
    try {
        console.log("Parsing American Football from CBS Sports NFL...");
        const cbsNflRes = await fetch('https://www.cbssports.com/rss/headlines/nfl/', { headers: BROWSER_HEADERS });
        console.log(`CBS Sports NFL RSS status: ${cbsNflRes.status}`);
        if (cbsNflRes.ok) {
            const items = parseRssItems(await cbsNflRes.text(), 2, 'https://www.cbssports.com/nfl/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => americanFootball.push({
                site: item.title || "CBS Sports NFL",
                category: "American Football",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest NFL news from CBS Sports.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('CBS Sports NFL Error:', e.message); }

    try {
        console.log("Parsing American Football from r/nfl...");
        const res = await fetch('https://www.reddit.com/r/nfl/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`r/nfl RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 2, 'https://www.reddit.com/r/nfl/', LOGOS.reddit);
            entries.forEach(entry => americanFootball.push({
                site: entry.title || "NFL Discussion",
                category: "American Football",
                dailyHits: `${Math.floor(Math.random() * 5000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 50 + 10)} up/min`,
                trend: "Trending in r/nfl — top discussion in the NFL community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/nfl Error:', e.message); }

    // ── BASKETBALL ──
    try {
        console.log("Parsing Basketball from CBS Sports NBA...");
        const cbsNbaRes = await fetch('https://www.cbssports.com/rss/headlines/nba/', { headers: BROWSER_HEADERS });
        console.log(`CBS Sports NBA RSS status: ${cbsNbaRes.status}`);
        if (cbsNbaRes.ok) {
            const items = parseRssItems(await cbsNbaRes.text(), 4, 'https://www.cbssports.com/nba/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => basketball.push({
                site: item.title || "CBS Sports NBA",
                category: "Basketball",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest NBA news from CBS Sports.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('CBS Sports NBA Error:', e.message); }

    // r/nba removed due to persistent rate limiting

    // ── SOCCER ──
    try {
        console.log("Parsing Soccer from BBC Sport Football...");
        const bbcSoccerRes = await fetch('https://feeds.bbci.co.uk/sport/football/rss.xml', { headers: BROWSER_HEADERS });
        console.log(`BBC Sport Football RSS status: ${bbcSoccerRes.status}`);
        if (bbcSoccerRes.ok) {
            const items = parseRssItems(await bbcSoccerRes.text(), 2, 'https://www.bbc.co.uk/sport/football', LOGOS.bbc);
            items.forEach(item => soccer.push({
                site: item.title || "BBC Sport Football",
                category: "Soccer",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest football news from BBC Sport.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('BBC Soccer Error:', e.message); }

    try {
        console.log("Parsing Soccer from Sky Sports Football...");
        const skyFootballRes = await fetch('https://www.skysports.com/rss/12040', { headers: BROWSER_HEADERS });
        console.log(`Sky Sports Football RSS status: ${skyFootballRes.status}`);
        if (skyFootballRes.ok) {
            const items = parseRssItems(await skyFootballRes.text(), 2, 'https://www.skysports.com/football', LOGOS.skysports);
            items.forEach(item => soccer.push({
                site: item.title || "Sky Sports Football",
                category: "Soccer",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest football news from Sky Sports.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('Sky Sports Football Error:', e.message); }

    // Reddit soccer removed due to persistent rate limiting - replaced by Sky Sports Football above

    // ── BASEBALL ──
    try {
        console.log("Parsing Baseball from CBS Sports MLB...");
        const cbsMlbRes = await fetch('https://www.cbssports.com/rss/headlines/mlb/', { headers: BROWSER_HEADERS });
        console.log(`CBS Sports MLB RSS status: ${cbsMlbRes.status}`);
        if (cbsMlbRes.ok) {
            const items = parseRssItems(await cbsMlbRes.text(), 4, 'https://www.cbssports.com/mlb/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => baseball.push({
                site: item.title || "CBS Sports MLB",
                category: "Baseball",
                dailyHits: "Global",
                growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest MLB news from CBS Sports.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('CBS Sports MLB Error:', e.message); }

    // Reddit baseball removed due to persistent rate limiting - replaced by CBS Sports MLB above

    // ── SPORTS TRENDS ──
    try {
        console.log("Parsing Sports Trends from Google Trends...");
        const res = await fetch('https://trends.google.com/trending/rss?geo=US&cat=20', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Sports status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            const items = xmlText.split('<item>');
            items.shift();
            items.slice(0, 4).forEach(itemStr => {
                const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
                const trendName = titleMatch ? titleMatch[1].trim() : "Trending Sports Search";
                const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
                const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
                const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
                let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
                if (!storyContext) storyContext = "Trending sports search dominating US query volume.";
                const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
                let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
                const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
                const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
                sportsTrends.push({
                    site: trendName,
                    category: "Trending Sports Searches",
                    dailyHits: liveTraffic,
                    growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                    trend: ensurePeriod(storyContext),
                    url: sourceUrl,
                    image
                });
            });
            console.log(`Sports Trends compiled: ${sportsTrends.length} items`);
        }
    } catch (e) { console.error('Sports Trends Error:', e.message); }

    // ── FALLBACKS ──
    if (topSports.length === 0) {
        topSports = Array.from({ length: 6 }, (_, i) => ({
            site: `Top Sports Story #${i + 1}`, category: "Top Sports News",
            dailyHits: "Global", growth: "+2.0%",
            trend: "Latest sports news from around the world.",
            url: "https://www.espn.com", image: LOGOS.espn
        }));
    }
    if (americanFootball.length === 0) {
        americanFootball = Array.from({ length: 4 }, (_, i) => ({
            site: `NFL Discussion #${i + 1}`, category: "American Football",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top NFL discussion trending on Reddit.",
            url: "https://www.reddit.com/r/nfl/", image: LOGOS.reddit
        }));
    }
    if (basketball.length === 0) {
        basketball = Array.from({ length: 4 }, (_, i) => ({
            site: `NBA Discussion #${i + 1}`, category: "Basketball",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top NBA discussion trending on Reddit.",
            url: "https://www.reddit.com/r/nba/", image: LOGOS.reddit
        }));
    }
    if (soccer.length === 0) {
        soccer = Array.from({ length: 4 }, (_, i) => ({
            site: `Soccer Discussion #${i + 1}`, category: "Soccer",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top soccer discussion trending on Reddit.",
            url: "https://www.reddit.com/r/soccer/", image: LOGOS.reddit
        }));
    }
    if (baseball.length === 0) {
        baseball = Array.from({ length: 4 }, (_, i) => ({
            site: `MLB Discussion #${i + 1}`, category: "Baseball",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top baseball discussion trending on Reddit.",
            url: "https://www.reddit.com/r/baseball/", image: LOGOS.reddit
        }));
    }
    if (sportsTrends.length === 0) {
        sportsTrends = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Sports Search #${i + 1}`, category: "Trending Sports Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending sports search dominating US query volume.",
            url: "https://trends.google.com", image: LOGOS.google
        }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...topSports,
        ...americanFootball,
        ...basketball,
        ...soccer,
        ...baseball,
        ...sportsTrends,
    ].map((item, index) => ({ rank: index + 1, ...item }));

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    const jsonData = JSON.stringify(finalDatabaseState, null, 2);

    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const CF_API_TOKEN = process.env.CF_API_TOKEN;
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_SPORTS_NAMESPACE_ID;

    const kvRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/data`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: jsonData
        }
    );

    if (kvRes.ok) {
        console.log("Sports KV write complete: Sports Matrix successfully deployed.");

        // Also write the HTML to KV so the Worker can serve it
        const htmlContent = fs.readFileSync('sports/index.html', 'utf8');
        const htmlRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/index.html`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${CF_API_TOKEN}`,
                    'Content-Type': 'text/html'
                },
                body: htmlContent
            }
        );
        if (htmlRes.ok) {
            console.log("Sports HTML written to KV successfully.");
        } else {
            console.error("Sports HTML KV write failed:", await htmlRes.text());
        }
    } else {
        const err = await kvRes.text();
        console.error("Sports KV write failed:", err);
        fs.writeFileSync('sports-data.json', jsonData);
        console.log("Fallback: wrote sports-data.json locally.");
    }
}

fetchSportsMatrix();
