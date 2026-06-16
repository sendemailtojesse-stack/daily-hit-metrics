const fs = require('fs');

async function fetchTrends() {
    try {
        // Fetch live global search trends
        const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://trends.google.com/trending/rss?geo=US');
        const data = await response.json();
        
        const trafficLeaderboard = data.items.slice(0, 5).map((item, index) => {
            // Calculate a simulated traffic velocity baseline based on Google's search volume ranking
            const approximateHits = (150 - (index * 22)) + "K"; 
            const growthRate = "+" + (Math.random() * 12 + 4).toFixed(1) + "%";
            
            // Clean up the search title (removing extra characters if any exist)
            const cleanTrendName = item.title.trim();

            return {
                rank: index + 1,
                site: cleanTrendName,          // Move the actual live trend name to the primary "Site/Entity" column
                category: "Search Spike",      
                dailyHits: approximateHits,
                growth: growthRate,
                trend: "Real-time High Velocity Volume" // Contextual description
            };
        });

        const updatedData = {
            lastUpdated: new Date().toISOString(),
            trafficLeaderboard: trafficLeaderboard
        };

        fs.writeFileSync('data.json', JSON.stringify(updatedData, null, 2));
        console.log('Successfully updated data.json with clean live trends!');
        
    } catch (error) {
        console.error('Error fetching real-time data:', error);
        process.exit(1);
    }
}

fetchTrends();
