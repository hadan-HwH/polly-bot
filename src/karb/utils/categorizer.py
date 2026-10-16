"""Keyword-based market categorization.

Derives a category from a market's question/slug text when the Gamma API
does not provide tags or category metadata.  Used by both the scanner
pipeline (to filter out unwanted categories) and the market-sync worker
(to populate the ``markets_cache.category`` column).
"""

from __future__ import annotations

CATEGORY_RULES: list[tuple[str, list[str]]] = [
    (
        "Crypto",
        [
            "bitcoin", "btc ", "btc?", "ethereum", "eth ", "eth?",
            "solana", "sol ", "sol?", "crypto", "token price",
            "up or down", "doge", "xrp", "bnb", "cardano", "ada ",
            "polkadot", "polygon", "matic", "litecoin", "avalanche",
            "chainlink", "uniswap", "aave", "fdv ", "token ",
            "protocol", "public sale", "edgex",
            "stablecoin", "polymarket", "mindshare",
        ],
    ),
    (
        "Esports",
        [
            "counter-strike", "dota 2", "valorant", "lol:",
            "esports", "map handicap", "bo3", "bo5",
            "game winner", "games total", "league of legends",
            "esl ", "blast ", "esl challenge",
        ],
    ),
    (
        "Sports",
        [
            "vs.", "vs ", "nba", "nfl", "mlb", "nhl", "mls",
            "premier league", "atp", "wta", "miami open",
            "champions league", "la liga", "bundesliga",
            "serie a", "ligue 1", "fifa", "world cup",
            "masters tournament", "ncaa", "f1 ", "formula 1",
            "grand prix", "nascar", "pga", "lpga",
            "wimbledon", "us open", "french open", "australian open",
            "super bowl", "playoffs", "stanley cup",
            "europa league", "copa america", "euro 2026",
            "ufc ", "boxing", "wrestling",
            "drivers' champion", "win the 202",
            "spread:", "handicap", "grand slam",
            "win on 202",
            "epl ", "top 4", "standings",
            "western conference", "eastern conference",
            "mammoth", "rugby", "fc ", " fc",
        ],
    ),
    (
        "Weather",
        [
            "weather", "temperature", "precipitation",
            "rainfall", "snowfall",
            "tornado", "tornadoes", "flood",
            "heat wave", "cold wave",
            "sunny", "cloudy",
            "rain in ", "rain?", "snow in ", "snow?",
            "hurricane ", "storm ",
        ],
    ),
    (
        "Geopolitics",
        [
            "invade", "invasion", "ceasefire", "military",
            "regime fall", "regime change", "forces enter",
            "declare war", "strike iran", "strike israel",
            "sanctions", "troops", "nuclear",
            "nato", "annex", "occupy", "blockade",
            "acquire greenland", "us acquire",
            "uranium", "enrichment", "hormuz",
            "iranian control", "leadership change",
            "leader of venezuela", "enter venezuela",
            "enter iran", "visit china", "visit russia",
            "us strike", "ground operation",
            "strike cyprus", "strike 4 countries",
            "supreme leader", "maduro", "anti-cartel",
            "greenland deal",
            "russia capture", "hezbollah", "houthi",
            "khamenei", "khomeini", "pahlavi",
            "head of state", "oil terminal",
            "us x iran", "strike on israel",
            "israel strike", "will israel",
            "normalize relations", "iran strike",
            "iran nuke", "board of peace",
        ],
    ),
    (
        "Politics",
        [
            "president", "election", "congress", "senate",
            "governor", "democrat", "republican", "nomination",
            "white house", "executive order", "impeach",
            "prime minister", "parliament", "vote",
            "out by ", "out before", "resign", "cabinet",
            "xi jinping", "putin", "zelenskyy",
            "nobel", "banned in",
            "dhs ", "fact check",
            "scotus", "balance of power",
            "border patrol", "shooter charged",
            "ice shooter",
            "mayor of", "pardon", "shutdown",
            "cut off trade", "embassy",
            "leader of cuba", "díaz-canel",
            "signed into law", "charged by",
        ],
    ),
    (
        "Business",
        [
            "market cap", "ipo", "acquire", "acquisition",
            "stock", "revenue", "company", "shares",
            "valuation", "bankruptcy", "merger", "ceo",
            "largest company", "quarterly",
            "delisted", "msci", "microstrategy",
        ],
    ),
    (
        "Economics",
        [
            "crude oil", "s&p", "nasdaq", "fed ", "gdp",
            "inflation", "interest rate", "treasury",
            "unemployment", "tariff", "trade deficit",
            "dow jones", "oil price", "gold price",
            "recession", "debt ceiling",
            "federal funds rate", "funds rate",
            "silver (si)", "gold (gc)", "gold price",
            "copper", "natural gas",
        ],
    ),
    (
        "Pop Culture",
        [
            "oscar", "grammy", "emmy", "tweet", "tweets",
            "celebrity", "movie", "album", "box office",
            "elon musk", "post ", "posts ",
            "gta", "game release", "released before",
            "youtube", "tiktok", "instagram",
            "jesus christ", "viral", "eurovision",
            "epstein", "kardashian", "netflix",
            "opening weekend", "best domestic",
        ],
    ),
    (
        "Science",
        [
            "spacex", "nasa", "climate", "ai ",
            "artificial intelligence", "vaccine",
            "measles", "pandemic", "virus", "disease",
            "alien", "ufo", "moon", "mars",
            "claude ", "gpt-", "openai", "chatgpt",
            "released by", "hottest year", "warmest",
            "fda ", "earthquake", "magnitude",
            "volcanic",
        ],
    ),
]

ALL_CATEGORIES: list[str] = [cat for cat, _ in CATEGORY_RULES] + ["Other"]


def categorize_market(question: str, slug: str = "") -> str:
    """Return a category string derived from keyword matching.

    Falls back to ``"Other"`` when no rule matches.
    """
    text = f"{question} {slug}".lower()
    for category, keywords in CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return category
    return "Other"
