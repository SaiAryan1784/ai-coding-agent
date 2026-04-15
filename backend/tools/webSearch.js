import axios from 'axios';

// DuckDuckGo HTML search — scrapes the actual search results page.
// The Instant Answer API returns nothing for code/technical queries.
export async function webSearch({ query }) {
  console.log(`[webSearch] Query: "${query}"`);
  try {
    // Step 1: get a vqd token (required by DDG for the results endpoint)
    const initRes = await axios.get('https://duckduckgo.com/', {
      params: { q: query },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      },
    });

    const vqdMatch = initRes.data.match(/vqd=([^&"]+)/);
    if (!vqdMatch) {
      console.warn('[webSearch] Could not extract vqd token, falling back to lite endpoint');
      return fallbackSearch(query);
    }
    const vqd = vqdMatch[1];

    // Step 2: fetch actual search results
    const searchRes = await axios.get('https://links.duckduckgo.com/d.js', {
      params: { q: query, vqd, kl: 'us-en' },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        Referer: 'https://duckduckgo.com/',
      },
    });

    // Parse the JSONP-like response
    const jsonMatch = searchRes.data.match(/DDG\.pageLayout\.load\('d',(\[.*\])\)/s);
    if (!jsonMatch) {
      console.warn('[webSearch] Could not parse results, falling back');
      return fallbackSearch(query);
    }

    const items = JSON.parse(jsonMatch[1]);
    const results = items
      .filter(item => item.u && item.t && item.a) // real results have url, title, snippet
      .slice(0, 6)
      .map(item => ({
        title: item.t,
        snippet: item.a.replace(/<[^>]+>/g, ''), // strip HTML tags from snippet
        url: item.u,
      }));

    if (results.length === 0) return fallbackSearch(query);

    console.log(`[webSearch] Returning ${results.length} result(s)`);
    return { results };
  } catch (err) {
    console.error(`[webSearch] Primary search failed: ${err.message} — trying fallback`);
    return fallbackSearch(query);
  }
}

// Fallback: DuckDuckGo lite (simpler HTML, easier to parse)
async function fallbackSearch(query) {
  try {
    const res = await axios.get('https://lite.duckduckgo.com/lite/', {
      params: { q: query },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    // Extract results from lite HTML — results are in <a class="result-link"> and nearby <td>
    const results = [];
    const linkRegex = /<a class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;

    const links = [...res.data.matchAll(linkRegex)].slice(0, 6);
    const snippets = [...res.data.matchAll(snippetRegex)].slice(0, 6);

    links.forEach((match, i) => {
      results.push({
        title: match[2].trim(),
        snippet: snippets[i]?.[1]?.replace(/<[^>]+>/g, '').trim() || '',
        url: match[1],
      });
    });

    if (results.length > 0) {
      console.log(`[webSearch] Fallback returning ${results.length} result(s)`);
      return { results };
    }

    console.warn('[webSearch] No results from fallback either');
    return { results: [{ title: 'No results', snippet: `No results found for: "${query}"`, url: '' }] };
  } catch (err) {
    console.error('[webSearch] Fallback also failed:', err.message);
    return { error: `Web search failed: ${err.message}` };
  }
}
