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
    const musicSources = [
        { name: 'Rolling Stone', url: 'https://www.rollingstone.com/music/feed/', logo: 'https://www.google.com/s2/favicons?domain=rollingstone.com&sz=128' },
        { name: 'Pitchfork', url: 'https://pitchfork.com/rss/news/feed.json', logo: 'https://www.google.com/s2/favicons?domain=pitchfork.com&sz=128' },
        { name: 'NME', url: 'https://www.nme.com/feed', logo: 'https://www.google.com/s2/favicons?domain=nme.com&sz=128' },
        { name: 'Billboard', url: 'https://www.billboard.com/feed/', logo: 'https://www.google.com/s2/favicons?domain=billboard.com&sz=128' },
    ];

    for (const source of musicSources) {
        if (music.length >= 4) break;
        try {
            console.log(`Parsing Music from ${source.name}...`);
            const res = await fetch(source.url, { headers: BROWSER_HEADERS });
            console.log(`${source.name} RSS status: ${res.status}`);
            if (res.ok) {
                const needed = 4 - music.length;
                const items = parseRssItems(await res.text(), needed, source.url, source.logo);
                items.forEach(item => music.push({
                    site: item.title || source.name,
                    category: "Music",
                    dailyHits: "Global",
                    growth: "+" + (Math.random() * 5 + 1).toFixed(1) + "%",
                    trend: item.desc || `Latest music news from ${source.name}.`,
                    url: item.url,
                    image: item.image
                }));
            }
        } catch (e) { console.error(`${source.name} Error:`, e.message); }
    }

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

    // ── GROQ ENTERTAINMENT EDITORIAL SUMMARY ──
    try {
        console.log("Generating entertainment editorial summary via Groq...");
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
                        content: `You are the entertainment editor of Daily Hit Metrics. Based on the following trending entertainment stories from this hour, write a concise 250-300 word entertainment briefing that synthesizes the key storylines across film, TV, and music. Write in a lively, engaging entertainment journalism style. Do not use bullet points — write flowing prose. Do not include any title or heading — begin directly with the editorial text.\n\nTop entertainment stories this hour:\n${topStories}`
                    }]
                })
            });

            if (groqRes.ok) {
                const groqData = await groqRes.json();
                const summary = groqData.choices?.[0]?.message?.content?.trim();
                if (summary) {
                    finalDatabaseState.editorialSummary = summary;
                    console.log("Groq entertainment summary generated successfully.");
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
                const siteUsers = users.filter(u => u.preferences?.entertainment?.keywords?.length > 0);
                console.log(`Found ${siteUsers.length} users with Entertainment keyword alerts.`);

                for (const user of siteUsers) {
                    const keywords = user.preferences.entertainment.keywords;
                    const matches = [];
                    for (const item of orderedGrid) {
                        const text = `${item.site} ${item.trend}`.toLowerCase();
                        for (const keyword of keywords) {
                            const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`);
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
        The following articles matched your keyword alerts on the <strong>Entertainment</strong> feed this hour:
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
                            subject: `Your keyword alert — ${matches.length} match${matches.length > 1 ? 'es' : ''} on Daily Hit Metrics Entertainment`,
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

fetchEntertainmentMatrix();
