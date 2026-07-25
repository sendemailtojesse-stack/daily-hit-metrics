import fs from 'fs';

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

async function fetchEntertainmentMatrix() {
    console.log("Initializing Entertainment Data Engine...");

    let topEntertainment = [];
    let moviesTV = [];
    let music = [];
    let entertainmentTrends = [];

    // ── TOP ENTERTAINMENT NEWS ──
    const entertainmentSources = [
        { name: 'Variety', url: 'https://variety.com/feed/', logo: LOGOS.variety },
        { name: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', logo: LOGOS.thr },
        { name: 'Deadline', url: 'https://deadline.com/feed/', logo: 'https://www.google.com/s2/favicons?domain=deadline.com&sz=128' },
    ];

    for (const source of entertainmentSources) {
        try {
            console.log(`Parsing Entertainment from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topEntertainment.push({
                    site: item.title || source.name,
                    category: "Top Entertainment News",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest entertainment news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    // ── MOVIES & TV ──
    try {
        console.log("Parsing Movies & TV from Reddit...");
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch('https://www.reddit.com/r/movies+television/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`r/movies+television RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/movies/', LOGOS.reddit);
            const subredditName = (url) => { const m = url.match(/\/r\/([^/]+)\//); return m ? `r/${m[1]}` : 'r/movies'; };
            entries.forEach(entry => moviesTV.push({
                site: entry.title || "Movies & TV Discussion",
                category: "Movies & TV",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: `Trending in ${subredditName(entry.url)} — top discussion in the film and TV community.`,
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('Movies & TV Error:', e.message); }

    // ── MUSIC ──
    try {
        console.log("Parsing Music from Reddit...");
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch('https://www.reddit.com/r/Music+hiphopheads+popheads/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`Music Reddit RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/Music/', LOGOS.reddit);
            const subredditName = (url) => { const m = url.match(/\/r\/([^/]+)\//); return m ? `r/${m[1]}` : 'r/Music'; };
            entries.forEach(entry => music.push({
                site: entry.title || "Music Discussion",
                category: "Music",
                dailyHits: `${Math.floor(Math.random() * 5000 + 200)} Coms`,
                growth: `+${Math.floor(Math.random() * 40 + 5)} up/min`,
                trend: `Trending in ${subredditName(entry.url)} — top music discussion.`,
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('Music Error:', e.message); }

    // ── ENTERTAINMENT TRENDS ──
    try {
        console.log("Parsing Entertainment Trends from Google Trends...");
        const res = await fetch('https://trends.google.com/trending/rss?geo=US&cat=3', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Entertainment status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            const items = xmlText.split('<item>');
            items.shift();
            items.slice(0, 4).forEach(itemStr => {
                const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
                const trendName = titleMatch ? titleMatch[1].trim() : "Trending Entertainment Search";
                const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
                const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
                const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
                let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
                if (!storyContext) storyContext = "Trending entertainment search dominating US query volume.";
                const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
                let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
                const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
                const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
                entertainmentTrends.push({
                    site: trendName,
                    category: "Trending Entertainment Searches",
                    dailyHits: liveTraffic,
                    growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                    trend: ensurePeriod(storyContext),
                    url: sourceUrl,
                    image
                });
            });
            console.log(`Entertainment Trends compiled: ${entertainmentTrends.length} items`);
        }
    } catch (e) { console.error('Entertainment Trends Error:', e.message); }

    // ── FALLBACKS ──
    if (topEntertainment.length === 0) {
        topEntertainment = Array.from({ length: 6 }, (_, i) => ({
            site: `Entertainment Story #${i + 1}`, category: "Top Entertainment News",
            dailyHits: "Global", growth: "+2.0%",
            trend: "Latest entertainment news from Hollywood.",
            url: "https://variety.com", image: LOGOS.variety
        }));
    }
    if (moviesTV.length === 0) {
        moviesTV = Array.from({ length: 4 }, (_, i) => ({
            site: `Movies & TV Discussion #${i + 1}`, category: "Movies & TV",
            dailyHits: "1K Coms", growth: "+20 up/min",
            trend: "Top movies and TV discussion trending on Reddit.",
            url: "https://www.reddit.com/r/movies/", image: LOGOS.reddit
        }));
    }
    if (music.length === 0) {
        music = Array.from({ length: 4 }, (_, i) => ({
            site: `Music Discussion #${i + 1}`, category: "Music",
            dailyHits: "1K Coms", growth: "+15 up/min",
            trend: "Top music discussion trending on Reddit.",
            url: "https://www.reddit.com/r/Music/", image: LOGOS.reddit
        }));
    }
    if (entertainmentTrends.length === 0) {
        entertainmentTrends = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Entertainment Search #${i + 1}`, category: "Trending Entertainment Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending entertainment search dominating US query volume.",
            url: "https://trends.google.com", image: LOGOS.google
        }));
    }

    // ── ASSEMBLE GRID ──
    const orderedGrid = [
        ...topEntertainment,
        ...moviesTV,
        ...music,
        ...entertainmentTrends,
    ].map((item, index) => ({ rank: index + 1, ...item }));

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    const jsonData = JSON.stringify(finalDatabaseState, null, 2);
    const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
    const CF_API_TOKEN = process.env.CF_API_TOKEN;
    const CF_KV_NAMESPACE_ID = process.env.CF_KV_ENTERTAINMENT_NAMESPACE_ID;

    const kvRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/data`,
        {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: jsonData
        }
    );

    if (kvRes.ok) {
        console.log("Entertainment KV write complete: Entertainment Matrix successfully deployed.");
        const htmlContent = fs.readFileSync('entertainment/index.html', 'utf8');
        const htmlRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/index.html`,
            {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'text/html' },
                body: htmlContent
            }
        );
        if (htmlRes.ok) console.log("Entertainment HTML written to KV successfully.");
        else console.error("Entertainment HTML KV write failed:", await htmlRes.text());
    } else {
        console.error("Entertainment KV write failed:", await kvRes.text());
        fs.writeFileSync('entertainment-data.json', jsonData);
    }
}

fetchEntertainmentMatrix();
