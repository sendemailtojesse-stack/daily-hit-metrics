const fs = require('fs');

async function fetchTrends() {
    try {
        // Fetching live global search trends from a public RSS-to-JSON converter
        const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://trends.google.com/trending/rss?geo=US');
        const data = await response.json();
        
        // Map the live trending items into our scoreboard format
        const trafficLeaderboard = data.items.slice(0, 5).map((item, index) => {
            // Generate simulated traffic velocity baselines for our dashboard UI
            const approximateHits = (150 - (index * 20)) + "M"; 
            const growthRate = "+" + (Math.random() * 8 + 1).toFixed(1) + "%";
            
            return {
                rank: index + 1,
                site: item.categories[0] || "Trending News",
                category: "Live Trend",
                dailyHits: approximateHits,
                growth: growthRate,
                trend: item.title
            };
        });

        const updatedData = {
            lastUpdated: new Date().toISOString(),
            trafficLeaderboard: trafficLeaderboard
        };

        // Overwrite the local data.json file
        fs.writeFileSync('data.json', JSON.stringify(updatedData, null, 2));
        console.log('Successfully updated data.json with live trends!');
        
    } catch (error) {
        console.error('Error fetching real-time data:', error);
        process.exit(1);
    }
}

fetchTrends();
