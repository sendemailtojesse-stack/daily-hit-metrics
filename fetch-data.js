const fs = require('fs');

async function fetchTrends() {
    try {
        // Fetch live global search trends
        const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://trends.google.com/trending/rss?geo=US');
        const data = await response.json();
        
        // Raised .slice from 5 to 10 to grab the top 10 trends
        const trafficLeaderboard = data.items.slice(0, 10).map((item, index) => {
            // Calculate a simulated traffic velocity baseline based on Google's search volume ranking
            const approximateHits = (200 - (index * 15)) + "K"; 
            const growthRate = "+" + (Math.random() * 12 + 4).toFixed(1) + "%";
            const cleanTrendName = item.title.trim();

            return {
                rank: index + 1,
                site: cleanTrendName,          
                category: "Search Spike",      
                dailyHits: approximateHits,
                growth: growthRate,
                trend: "Real-time High Velocity Volume" 
            };
        });

        const updatedData = {
            lastUpdated: new Date().toISOString(),
            trafficLeaderboard: trafficLeaderboard
        };

        fs.writeFileSync('data.json', JSON.stringify(updatedData, null, 2));
        console.log('Successfully updated data.json with 10 live trends!');
        
    } catch (error) {
        console.error('Error fetching real-time data:', error);
        process.exit(1);
    }
}

fetchTrends();
