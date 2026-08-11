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
    // Handle both <item> (RSS 2.0) and <item rdf:about="..."> (RDF/RSS 1.0)
    const items = xmlText.split(/<item(?:\s[^>]*)?>/).slice(1);
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
            const res = await fetchRSS(source.url);
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const items = parseRssItems(await res.text(), 2, source.url, source.logo);
                items.forEach(item => topSports.push({
                    site: item.title || source.name,
                    sourceName: source.name,
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
        const cbsNflRes = await fetchRSS('https://www.cbssports.com/rss/headlines/nfl/');
        console.log(`CBS Sports NFL RSS status: ${cbsNflRes.status}`);
        if (cbsNflRes.ok) {
            const items = parseRssItems(await cbsNflRes.text(), 2, 'https://www.cbssports.com/nfl/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => americanFootball.push({
                site: item.title || "CBS Sports NFL",
                sourceName: "CBS Sports NFL",
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
        const res = await fetchRSS('https://www.reddit.com/r/nfl/.rss?limit=10');
        console.log(`r/nfl RSS status: ${res.status}`);
        if (res.ok) {
            const entries = parseAtomEntries(await res.text(), 2, 'https://www.reddit.com/r/nfl/', LOGOS.reddit);
            entries.forEach(entry => americanFootball.push({
                site: entry.title || "NFL Discussion",
                sourceName: "r/nfl",
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
        const cbsNbaRes = await fetchRSS('https://www.cbssports.com/rss/headlines/nba/');
        console.log(`CBS Sports NBA RSS status: ${cbsNbaRes.status}`);
        if (cbsNbaRes.ok) {
            const items = parseRssItems(await cbsNbaRes.text(), 4, 'https://www.cbssports.com/nba/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => basketball.push({
                site: item.title || "CBS Sports NBA",
                sourceName: "CBS Sports NBA",
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
    try {
        console.log("Parsing Basketball from r/nba...");
        const rnbaRes = await fetchRSS('https://www.reddit.com/r/nba/.rss?limit=10');
        console.log(`r/nba RSS status: ${rnbaRes.status}`);
        if (rnbaRes.ok) {
            const entries = parseAtomEntries(await rnbaRes.text(), 10, 'https://www.reddit.com/r/nba/', LOGOS.reddit);
            entries.forEach(entry => basketball.push({
                site: entry.title || "r/nba Discussion",
                sourceName: "r/nba",
                category: "Basketball",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: "Trending in r/nba — top discussion in the basketball community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/nba Error:', e.message); }

    // ── SOCCER ──
    try {
        console.log("Parsing Soccer from BBC Sport Football...");
        const bbcSoccerRes = await fetchRSS('https://feeds.bbci.co.uk/sport/football/rss.xml');
        console.log(`BBC Sport Football RSS status: ${bbcSoccerRes.status}`);
        if (bbcSoccerRes.ok) {
            const items = parseRssItems(await bbcSoccerRes.text(), 2, 'https://www.bbc.co.uk/sport/football', LOGOS.bbc);
            items.forEach(item => soccer.push({
                site: item.title || "BBC Sport Football",
                sourceName: "BBC Sport Football",
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
        const skyFootballRes = await fetchRSS('https://www.skysports.com/rss/12040');
        console.log(`Sky Sports Football RSS status: ${skyFootballRes.status}`);
        if (skyFootballRes.ok) {
            const items = parseRssItems(await skyFootballRes.text(), 2, 'https://www.skysports.com/football', LOGOS.skysports);
            items.forEach(item => soccer.push({
                site: item.title || "Sky Sports Football",
                sourceName: "Sky Sports Football",
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
    try {
        console.log("Parsing Soccer from r/soccer...");
        const rsoccerRes = await fetchRSS('https://www.reddit.com/r/soccer/.rss?limit=10');
        console.log(`r/soccer RSS status: ${rsoccerRes.status}`);
        if (rsoccerRes.ok) {
            const entries = parseAtomEntries(await rsoccerRes.text(), 10, 'https://www.reddit.com/r/soccer/', LOGOS.reddit);
            entries.forEach(entry => soccer.push({
                site: entry.title || "r/soccer Discussion",
                sourceName: "r/soccer",
                category: "Soccer",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: "Trending in r/soccer — top discussion in the global football community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/soccer Error:', e.message); }

    // ── BASEBALL ──
    try {
        console.log("Parsing Baseball from CBS Sports MLB...");
        const cbsMlbRes = await fetchRSS('https://www.cbssports.com/rss/headlines/mlb/');
        console.log(`CBS Sports MLB RSS status: ${cbsMlbRes.status}`);
        if (cbsMlbRes.ok) {
            const items = parseRssItems(await cbsMlbRes.text(), 4, 'https://www.cbssports.com/mlb/', 'https://www.google.com/s2/favicons?domain=cbssports.com&sz=128');
            items.forEach(item => baseball.push({
                site: item.title || "CBS Sports MLB",
                sourceName: "CBS Sports MLB",
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
    try {
        console.log("Parsing Baseball from r/baseball...");
        const rbaseballRes = await fetchRSS('https://www.reddit.com/r/baseball/.rss?limit=10');
        console.log(`r/baseball RSS status: ${rbaseballRes.status}`);
        if (rbaseballRes.ok) {
            const entries = parseAtomEntries(await rbaseballRes.text(), 10, 'https://www.reddit.com/r/baseball/', LOGOS.reddit);
            entries.forEach(entry => baseball.push({
                site: entry.title || "r/baseball Discussion",
                sourceName: "r/baseball",
                category: "Baseball",
                dailyHits: `${Math.floor(Math.random() * 8000 + 500)} Coms`,
                growth: `+${Math.floor(Math.random() * 60 + 10)} up/min`,
                trend: "Trending in r/baseball — top discussion in the baseball community.",
                url: entry.url,
                image: entry.image
            }));
        }
    } catch (e) { console.error('r/baseball Error:', e.message); }

    // ── SPORTS TRENDS (7 regions, cat=20 = Sports) ──
    const SPORTS_REGION_LABELS = {
        'us':            'Google Trends Sports US',
        'north-america': 'Google Trends Sports North America',
        'south-america': 'Google Trends Sports South America',
        'europe':        'Google Trends Sports Europe',
        'africa':        'Google Trends Sports Africa',
        'asia':          'Google Trends Sports Asia',
        'oceania':       'Google Trends Sports Oceania'
    };

    const parseSportsTrends = (xmlText, label) => {
        const items = xmlText.split('<item>');
        items.shift();
        const results = [];
        items.slice(0, 4).forEach(itemStr => {
            const titleMatch = itemStr.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
            const trendName = titleMatch ? titleMatch[1].trim() : "Trending Sports Search";
            const trafficMatch = itemStr.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
            const liveTraffic = trafficMatch ? trafficMatch[1].trim() : "1K+";
            const newsTitleMatch = itemStr.match(/<ht:news_item_title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_title>/);
            let storyContext = newsTitleMatch ? decodeEntities(newsTitleMatch[1].replace(/<[^>]*>/g, '').trim()) : "";
            if (!storyContext) storyContext = `Trending sports search in ${SPORTS_REGION_LABELS[label]?.replace('Google Trends Sports ', '') || 'this region'}.`;
            const urlMatch = itemStr.match(/<ht:news_item_url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/ht:news_item_url>/);
            let sourceUrl = urlMatch ? urlMatch[1].trim() : `https://news.google.com/search?q=${encodeURIComponent(trendName)}`;
            const imgMatch = itemStr.match(/<ht:picture>(.*?)<\/ht:picture>/);
            const image = (imgMatch && imgMatch[1].startsWith('http')) ? imgMatch[1].trim() : LOGOS.google;
            results.push({
                site: trendName,
                sourceName: SPORTS_REGION_LABELS[label] || 'Google Trends Sports',
                category: "Trending Sports Searches",
                dailyHits: liveTraffic,
                growth: "+" + (Math.random() * 10 + 5).toFixed(1) + "%",
                trend: ensurePeriod(storyContext),
                url: sourceUrl,
                image
            });
        });
        return results;
    };

    const fetchSportsContinentTrends = async (geos, label) => {
        const allItems = [];
        for (const geo of geos) {
            try {
                const res = await fetch(`https://trends.google.com/trending/rss?geo=${geo}&cat=20`, { headers: BROWSER_HEADERS });
                if (res.ok) allItems.push(...parseSportsTrends(await res.text(), label));
            } catch(e) {}
        }
        // Deduplicate by title, take top 4
        const seen = new Set();
        const unique = allItems.filter(i => { if (seen.has(i.site)) return false; seen.add(i.site); return true; });
        sportsTrends.push(...unique.slice(0, 4));
    };

    try {
        console.log("Parsing US Sports Trends...");
        const usRes = await fetch('https://trends.google.com/trending/rss?geo=US&cat=20', { headers: BROWSER_HEADERS });
        console.log(`Google Trends Sports US status: ${usRes.status}`);
        if (usRes.ok) sportsTrends.push(...parseSportsTrends(await usRes.text(), 'us'));
        console.log(`US sports trends compiled: ${sportsTrends.length} items`);
    } catch(e) { console.error('Sports Trends US Error:', e.message); }

    await fetchSportsContinentTrends(['CA', 'MX'], 'north-america');
    console.log(`North America sports trends compiled`);
    await fetchSportsContinentTrends(['BR', 'AR', 'CO', 'CL', 'PE'], 'south-america');
    console.log(`South America sports trends compiled`);
    await fetchSportsContinentTrends(['GB', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL'], 'europe');
    console.log(`Europe sports trends compiled`);
    await fetchSportsContinentTrends(['NG', 'ZA', 'KE', 'EG', 'GH', 'ET'], 'africa');
    console.log(`Africa sports trends compiled`);
    await fetchSportsContinentTrends(['IN', 'JP', 'KR', 'ID', 'PH', 'PK', 'VN', 'TH'], 'asia');
    console.log(`Asia sports trends compiled`);
    await fetchSportsContinentTrends(['AU', 'NZ'], 'oceania');
    console.log(`Oceania sports trends compiled - total: ${sportsTrends.length} items`);

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
        const labels = ['us', 'north-america', 'south-america', 'europe', 'africa', 'asia', 'oceania'];
        sportsTrends = Array.from({ length: 28 }, (_, i) => ({
            site: `Trending Sports Search #${i + 1}`,
            sourceName: SPORTS_REGION_LABELS[labels[Math.floor(i / 4)]] || 'Google Trends Sports',
            category: "Trending Sports Searches",
            dailyHits: "10K+", growth: "+8.0%",
            trend: "Trending sports search dominating regional query volume.",
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

    // ── GROQ SPORTS EDITORIAL SUMMARY ──
    try {
        console.log("Generating sports editorial summary via Groq...");
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
                        content: `You are the sports editor of Daily Hit Metrics. Based on the following trending sports stories from this hour, write a concise 250-300 word sports briefing that synthesizes the key storylines across all sports. Write in a sharp, authoritative sports journalism style. Do not use bullet points — write flowing prose. Do not include any title or heading — begin directly with the editorial text.\n\nTop sports stories this hour:\n${topStories}`
                    }]
                })
            });

            if (groqRes.ok) {
                const groqData = await groqRes.json();
                const summary = groqData.choices?.[0]?.message?.content?.trim();
                if (summary) {
                    finalDatabaseState.editorialSummary = summary;
                    console.log("Groq sports summary generated successfully.");
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
                const siteUsers = users.filter(u => u.preferences?.sports?.keywords?.length > 0);
                console.log(`Found ${siteUsers.length} users with Sports keyword alerts.`);

                for (const user of siteUsers) {
                    const keywords = user.preferences.sports.keywords;
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
        The following articles matched your keyword alerts on the <strong>Sports</strong> feed this hour:
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
                            subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics Sports`,
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

fetchSportsMatrix();
