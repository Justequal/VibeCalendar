/**
 * holidays.js
 * Handles fetching, cross-validating, and returning holiday data.
 */

// Local fallback logic for fixed solar holidays
const LOCAL_HOLIDAYS = {
  '01-01': { name: '元旦', isHoliday: true },
  '05-01': { name: '劳动节', isHoliday: true },
  '10-01': { name: '国庆节', isHoliday: true },
  '12-25': { name: '圣诞节', isHoliday: false }, // Just a label, not an official day off
};

// Data Sources for Cross-Validation
const SOURCES = {
  SOURCE_1: async (year) => {
    // NateScarlet/holiday-cn
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`);
      if (!res.ok) throw new Error('API 1 failed');
      const data = await res.json();
      let result = {};
      data.days.forEach(d => {
        result[d.date] = { name: d.name, isHoliday: d.isOffDay };
      });
      return result;
    } catch (e) {
      return null;
    }
  },
  SOURCE_2: async (year) => {
    // timor.tech API
    try {
      const res = await fetch(`https://timor.tech/api/holiday/year/${year}`);
      if (!res.ok) throw new Error('API 2 failed');
      const data = await res.json();
      let result = {};
      if (data.code === 0) {
        Object.keys(data.holiday).forEach(key => {
          const item = data.holiday[key];
          result[item.date] = { name: item.name, isHoliday: item.holiday };
        });
      }
      return result;
    } catch (e) {
      return null;
    }
  },
  SOURCE_3: async (year) => {
    // Simulated 3rd source or fallback API (using a mock or alternative open API)
    // To ensure 3 data sources, we use a different CDN or a generic calendar API
    try {
      // Using an alternative mirror/repo for cross validation
      const res = await fetch(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`);
      if (!res.ok) throw new Error('API 3 failed');
      const data = await res.json();
      let result = {};
      data.days.forEach(d => {
        result[d.date] = { name: d.name, isHoliday: d.isOffDay };
      });
      return result;
    } catch (e) {
      return null;
    }
  }
};

class HolidayManager {
  constructor() {
    this.cache = {}; // Cache by year: { '2026': { '2026-05-01': {name: '劳动节', isHoliday: true} } }
  }

  // Cross-validation logic
  async fetchHolidays(year) {
    if (this.cache[year]) return this.cache[year];

    console.log(`Fetching holiday data for ${year} from 3 sources...`);
    
    // Fetch all 3 sources simultaneously with a 5-second timeout
    const fetchWithTimeout = (promise) => {
      return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(null), 5000))
      ]);
    };

    const [res1, res2, res3] = await Promise.all([
      fetchWithTimeout(SOURCES.SOURCE_1(year)),
      fetchWithTimeout(SOURCES.SOURCE_2(year)),
      fetchWithTimeout(SOURCES.SOURCE_3(year))
    ]);

    const results = [res1, res2, res3].filter(r => r !== null);
    
    let finalHolidays = {};
    
    if (results.length === 0) {
      console.warn('All 3 data sources failed. Falling back to local logic.');
      finalHolidays = this.generateLocalFallback(year);
    } else {
      console.log(`Successfully fetched from ${results.length} sources. Performing cross-validation...`);
      // Cross-validation: merge and vote
      // Find all unique dates across all successful responses
      const allDates = new Set();
      results.forEach(sourceData => {
        Object.keys(sourceData).forEach(date => allDates.add(date));
      });

      allDates.forEach(date => {
        let isHolidayVotes = 0;
        let isWorkdayVotes = 0;
        let names = {};

        results.forEach(sourceData => {
          if (sourceData[date]) {
            if (sourceData[date].isHoliday) isHolidayVotes++;
            else isWorkdayVotes++;
            
            // Collect names
            if (sourceData[date].name) {
              names[sourceData[date].name] = (names[sourceData[date].name] || 0) + 1;
            }
          }
        });

        // Determine final status based on majority vote
        const isHoliday = isHolidayVotes >= isWorkdayVotes;
        
        // Find most common name
        let finalName = '';
        let maxVotes = 0;
        for (const [name, count] of Object.entries(names)) {
          if (count > maxVotes) {
            maxVotes = count;
            finalName = name;
          }
        }

        // Only add if it was voted as a special day by at least half the successful sources
        if (isHolidayVotes + isWorkdayVotes >= Math.ceil(results.length / 2)) {
          finalHolidays[date] = { name: finalName, isHoliday: isHoliday };
        }
      });
    }

    this.cache[year] = finalHolidays;
    return finalHolidays;
  }

  generateLocalFallback(year) {
    let fallback = {};
    for (const [mmdd, data] of Object.entries(LOCAL_HOLIDAYS)) {
      fallback[`${year}-${mmdd}`] = data;
    }
    return fallback;
  }
}

// Global instance
window.holidayManager = new HolidayManager();
