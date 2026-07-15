const fs = require('fs');

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractImage(itemStr) {
    const patterns = [
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
        /<media:content[^>]+url=["']([^"']+)["'][^>]+medium=["']image["']/i,
        /<media:content[^>]+medium=["']image["'][^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image[^"']*["']/i,
        /<image>.*?<url>([^<]+)<\/url>/is,
        /og:image[^>]+content=["']([^"']+)["']/i,
    ];
    for (const pattern of patterns) {
        const match = itemStr.match(pattern);
        if (match && match[1] && match[1].startsWith('http')) return match[1].trim();
    }
    return null;
}


function parseAtomEntries(xmlText, limit, fallbackUrl, fallbackLogo) {
    const items = xmlText.split('<entry>');
    items.shift();
    return items.slice(0, limit).map(itemStr => {
        const titleMatch = itemStr.match(/<title[^>]*>(.*?)<\/title>/s);
        let title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
        if (title.length > 120) title = title.substring(0, 117) + "...";
        const linkMatch = itemStr.match(/<link\s+href=["']([^"']+)["']/);
        const url = linkMatch ? linkMatch[1].trim() : fallbackUrl;
        const image = extractImage(itemStr) || fallbackLogo;
        return { title, url, image };
    });
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
        const desc = descMatch ? decodeEntities(descMatch[1].replace(/<[^>]*>/g, '').trim()).substring(0, 160) : "";
        const image = extractImage(itemStr) || fallbackLogo;
        return { title, url, desc, image };
    });
}

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

const LOGOS = {
    reuters:   'https://www.google.com/s2/favicons?domain=reuters.com&sz=128',
    bbc:       'https://www.google.com/s2/favicons?domain=bbc.com&sz=128',
    npr:       'https://www.google.com/s2/favicons?domain=npr.org&sz=128',
    aljazeera: 'https://www.google.com/s2/favicons?domain=aljazeera.com&sz=128',
    reddit:    'https://www.google.com/s2/favicons?domain=reddit.com&sz=128',
    hn:        'https://www.google.com/s2/favicons?domain=ycombinator.com&sz=128',
    ign:       'https://www.google.com/s2/favicons?domain=ign.com&sz=128',
    google:    'https://www.google.com/s2/favicons?domain=google.com&sz=128',
};

async function fetchHighUtilityMatrix() {
    let worldNews       = [];
    let socialPulse     = [];
    let techNews        = [];
    let videoGames      = [];
    let financeTrends   = [];
    let popularSearches = [];

    console.log("Initializing 24-Slot Data Engine (6x4 Layout)...");

    // ==========================================
    // TIER 1: WORLD NEWS — Reuters, BBC, NPR, Al Jazeera (1 each)
    // ==========================================
    const worldSources = [
        { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian', logo: 'https://www.google.com/s2/favicons?domain=theguardian.com&sz=128' },
        { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC News', logo: LOGOS.bbc },
        { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR News', logo: LOGOS.npr },
        { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera', logo: LOGOS.aljazeera },
    ];

    for (const source of worldSources) {
        try {
            console.log(`Parsing World News from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 1, source.url, source.logo);
                if (items.length > 0) {
                    worldNews.push({
                        site: items[0].title || `${source.name} News`,
                        category: "World News",
                        dailyHits: "Global",
                        growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                        trend: items[0].desc || `Breaking news from ${source.name}.`,
                        url: items[0].url,
                        image: items[0].image
                    });
                }
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

    if (worldNews.length === 0) {
        worldNews = Array.from({ length: 4 }, (_, i) => ({
            site: `World News Dispatch #${i + 1}`,
            category: "World News",
            dailyHits: "Global",
            growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
            trend: "Breaking developments from international news services.",
            url: "https://reuters.com/",
            image: LOGOS.reuters
        }));
    }

    // ==========================================
    // TIER 2: SOCIAL PULSE — 4 Reddit r/popular
    // ==========================================
    try {
        console.log("Parsing Social Pulse from r/popular...");
        const res = await fetch('https://www.reddit.com/r/popular/.rss?limit=15', { headers: BROWSER_HEADERS });
        console.log(`Social Pulse RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/popular/', LOGOS.reddit);
            const subredditMatch = (url) => { const m = url.match(/\/r\/([^/]+)\//); return m ? `r/${m[1]}` : 'r/popular'; };
            entries.forEach(entry => socialPulse.push({
                site: entry.title || "Trending Discussion",
                category: "Social Pulse",
                dailyHits: `${Math.floor(Math.random() * 4000 + 1200).toLocaleString()} Coms`,
                growth: "+" + Math.floor(Math.random() * 40 + 20) + " up/min",
                trend: `Trending in ${subredditMatch(entry.url)} — viral engagement climbing across the network.`,
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('Social Pulse Error:', e.message); }

    if (socialPulse.length === 0) {
        socialPulse = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Thread #${i + 1}`,
            category: "Social Pulse",
            dailyHits: `${Math.floor(Math.random() * 3000 + 1000)} Coms`,
            growth: `+${Math.floor(Math.random() * 30 + 15)} up/min`,
            trend: "Viral discussion running hot across aggregated open networks.",
            url: "https://www.reddit.com/r/popular/",
            image: LOGOS.reddit
        }));
    }

    // ==========================================
    // TIER 3: TECH — 4 Hacker News
    // ==========================================
    try {
        console.log("Parsing Tech from Hacker News...");
        const res = await fetch('https://news.ycombinator.com/rss', { headers: BROWSER_HEADERS });
        console.log(`Hacker News RSS status: ${res.status}`);
        if (res.ok) {
            const items = parseRssItems(await res.text(), 4, 'https://news.ycombinator.com/', LOGOS.hn);
            items.forEach(item => techNews.push({
                site: item.title || "Hacker News",
                category: "Tech",
                dailyHits: Math.floor(Math.random() * 800 + 200) + " pts",
                growth: "+" + Math.floor(Math.random() * 30 + 5) + " pts/hr",
                trend: item.desc || "Top story on Hacker News.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('Hacker News Error:', e.message); }

    if (techNews.length === 0) {
        techNews = Array.from({ length: 4 }, (_, i) => ({
            site: `Tech Story #${i + 1}`,
            category: "Tech",
            dailyHits: Math.floor(Math.random() * 800 + 200) + " pts",
            growth: "+" + Math.floor(Math.random() * 30 + 5) + " pts/hr",
            trend: "Top discussion from the tech and startup community.",
            url: "https://news.ycombinator.com/",
            image: LOGOS.hn
        }));
    }

    // ==========================================
    // TIER 4: VIDEO GAMES — 3 IGN + 1 r/gaming
    // ==========================================
    try {
        console.log("Parsing Video Games from IGN...");
        const res = await fetch('https://feeds.feedburner.com/ign/news', { headers: BROWSER_HEADERS });
        console.log(`IGN RSS status: ${res.status}`);
        if (res.ok) {
            const items = parseRssItems(await res.text(), 3, 'https://ign.com/', LOGOS.ign);
            items.forEach(item => videoGames.push({
                site: item.title || "IGN News",
                category: "Video Games",
                dailyHits: Math.floor(Math.random() * 5000 + 500).toLocaleString() + " views",
                growth: "+" + (Math.random() * 8 + 1).toFixed(1) + "%",
                trend: item.desc || "Latest gaming news from IGN.",
                url: item.url,
                image: item.image
            }));
        }
    } catch (e) { console.error('IGN Error:', e.message); }

    try {
        console.log("Parsing Video Games from r/gaming...");
        const res = await fetch('https://www.reddit.com/r/gaming/.rss?limit=10', { headers: BROWSER_HEADERS });
        console.log(`r/gaming RSS status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            console.log(`r/gaming XML length: ${xmlText.length}`);
            const entries = parseAtomEntries(xmlText, 1, 'https://www.reddit.com/r/gaming/', LOGOS.reddit);
            console.log(`r/gaming entries parsed: ${entries.length}`);
            entries.forEach(entry => videoGames.push({
                site: entry.title || "r/gaming",
                category: "Video Games",
                dailyHits: `${Math.floor(Math.random() * 3000 + 500).toLocaleString()} Coms`,
                growth: "+" + Math.floor(Math.random() * 30 + 5) + " up/min",
                trend: "Top post trending in r/gaming.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/gaming Error:', e.message); }

    // If r/gaming slot is missing, add a fallback entry
    if (videoGames.length < 4) {
        videoGames.push({
            site: "Hot discussion in r/gaming",
            category: "Video Games",
            dailyHits: `${Math.floor(Math.random() * 3000 + 500).toLocaleString()} Coms`,
            growth: "+" + Math.floor(Math.random() * 30 + 5) + " up/min",
            trend: "Top trending post from the r/gaming community.",
            url: "https://www.reddit.com/r/gaming/",
            image: LOGOS.reddit
        });
    }

    if (videoGames.length === 0) {
        videoGames = Array.from({ length: 4 }, (_, i) => ({
            site: `Gaming Story #${i + 1}`,
            category: "Video Games",
            dailyHits: Math.floor(Math.random() * 5000 + 500).toLocaleString() + " views",
            growth: "+" + (Math.random() * 8 + 1).toFixed(1) + "%",
            trend: "Top story from the gaming world.",
            url: "https://ign.com/",
            image: LOGOS.ign
        }));
    }

    // ==========================================
    // TIER 5: FINANCE TRENDS — 4 Reddit
    // ==========================================
    try {
        console.log("Parsing Finance Trends from Reddit...");
        const res = await fetch('https://www.reddit.com/r/stocks+investing+options/.rss?limit=15', { headers: BROWSER_HEADERS });
        console.log(`Finance Trends RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 4, 'https://www.reddit.com/r/stocks/', LOGOS.reddit);
            entries.forEach(entry => financeTrends.push({
                site: entry.title || "Market Discussion",
                category: "Finance Trends",
                dailyHits: `${Math.floor(Math.random() * 800 + 150)} Traders`,
                growth: `${Math.random() > 0.35 ? "+" : "-"}${Math.floor(Math.random() * 25 + 5)} coms/min`,
                trend: "Active market discussion — retail traders parsing live developments.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('Finance Error:', e.message); }

    if (financeTrends.length === 0) {
        const mocks = ["Macro Index Data Release Analysis", "Options Chain Volatility Shift", "Tech Sector Earnings Breakdown", "Treasury Yield Curve Movement"];
        financeTrends = mocks.map(topic => ({
            site: topic,
            category: "Finance Trends",
            dailyHits: `${Math.floor(Math.random() * 400 + 100)} Traders`,
            growth: `${Math.random() > 0.5 ? "+" : "-"}${Math.floor(Math.random() * 20 + 5)} coms/min`,
            trend: "Market-moving community analysis parsing live execution metrics.",
            url: "https://www.reddit.com/r/stocks/",
            image: LOGOS.reddit
        }));
    }

    // ==========================================
    // TIER 6: POPULAR SEARCHES — 4 Google Trends
    // ==========================================
    try {
        console.log("Parsing Popular Searches from Google Trends...");
        const res = await fetch('https://trends.google.com/trending/rss?geo=US', { headers: BROWSER_HEADERS });
        console.log(`Google Trends RSS status: ${res.status}`);
        if (res.ok) {
            const xmlText = await res.text();
            const items = xmlText.split('<item>');
            items.shift();
            popularSearches = items.slice(0, 4).map(itemStr => {
                const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
                const trendName = titleMatch ? titleMatch[1].trim() : "Trending Search";
                const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
                const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "100K+";
                const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
                let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
                if (!storyContext) storyContext = "Trending search dominating US query volume.";
                const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
                let sourceUrl = urlMatch ? urlMatch[1].trim() : "";
                if (!sourceUrl || sourceUrl.includes('trends.google.com')) {
                    sourceUrl = `https://news.google.com/search?q=${encodeURIComponent(trendName)}&hl=en-US&gl=US&ceid=US:en`;
                }
                const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
                const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
                return {
                    site: trendName,
                    category: "Popular Searches",
                    dailyHits: liveTraffic,
                    growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                    trend: storyContext,
                    url: sourceUrl,
                    image
                };
            });
            console.log(`Successfully compiled ${popularSearches.length} Popular Searches.`);
        }
    } catch (e) { console.error('Google Trends Error:', e.message); }

    if (popularSearches.length === 0) {
        popularSearches = Array.from({ length: 4 }, (_, i) => ({
            site: `Trending Search #${i + 1}`,
            category: "Popular Searches",
            dailyHits: `${150 - (i * 25)}K+`,
            growth: "+" + (Math.random() * 8 + 4).toFixed(1) + "%",
            trend: "Breakout search volume dominating US query trends.",
            url: "https://news.google.com/",
            image: LOGOS.google
        }));
    }

    // ==========================================
    // ASSEMBLE FINAL 24-SLOT GRID
    // ==========================================
    const orderedGrid = [
        ...worldNews,
        ...socialPulse,
        ...techNews,
        ...videoGames,
        ...financeTrends,
        ...popularSearches
    ].map((item, index) => ({ rank: index + 1, ...item }));

    const finalDatabaseState = {
        lastUpdated: new Date().toISOString(),
        trafficLeaderboard: orderedGrid
    };

    fs.writeFileSync('data.json', JSON.stringify(finalDatabaseState, null, 2));
    console.log("Database write complete: 6x4 24-Slot Matrix successfully deployed.");
}

fetchHighUtilityMatrix();
