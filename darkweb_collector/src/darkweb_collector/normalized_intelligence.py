from __future__ import annotations

from darkweb_collector.search_schema import event_report_time

from collections import Counter, OrderedDict, defaultdict
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from functools import lru_cache, wraps
from html import unescape
from hashlib import sha1, sha256
import json
import logging
from pathlib import Path
import re
import sqlite3
import socket
from tempfile import TemporaryDirectory
from threading import Lock
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen
try:
    import pycountry
except Exception:  # pragma: no cover - optional until dependencies are installed
    pycountry = None
try:
    from babel import Locale
except Exception:  # pragma: no cover - optional until dependencies are installed
    Locale = None

from darkweb_collector.config import get_site_config
from darkweb_collector.detail_i18n import translate_event_title_cached
from darkweb_collector.detail_artifacts import (
    detail_artifact_paths, display_artifact_path, forum_artifact_payload, native_artifact_path,
    referenced_artifact_resources, victim_artifact_payload,
)
from darkweb_collector.db import (
    list_document_hit_snapshots,
    list_document_hits,
    get_normalized_intelligence_cache_state,
    get_normalized_intelligence_event,
    list_normalized_intelligence_events,
    replace_normalized_intelligence_events,
    upsert_normalized_intelligence_cache_state,
)
from darkweb_collector.runtime import output_root, project_root, user_data_root
from darkweb_collector.sites.breachforums import normalize_breachforums_timestamp
from darkweb_collector.sites.cracked import normalize_cracked_timestamp
from darkweb_collector.sites.darkforums import clean_extracted_attackers, normalize_darkforums_timestamp
from darkweb_collector.sites.pwnfrm import normalize_pwnfrm_timestamp
from darkweb_collector.sites.spear import normalize_spear_timestamp
from darkweb_collector.sites.leakforum import normalize_leakforum_timestamp
from darkweb_collector.sites.xforums import normalize_xforums_timestamp
from darkweb_collector.utils import safe_stem
from darkweb_collector.vulnerability_i18n import (
    build_affected_version_items,
    build_reference_link_entries,
    humanize_product_token,
    humanize_raw_source_type,
    humanize_source_type,
    is_translation_error,
    resolve_vulnerability_summary,
    translate_product_name,
    translate_vulnerability_summary,
    translate_vulnerability_title,
    translate_vulnerability_type,
)


logger = logging.getLogger(__name__)
NORMALIZED_REFRESH_ADVISORY_LOCK_ID = int.from_bytes(b"DWTINORM", "big")
_NORMALIZED_REFRESH_LOCK = Lock()
NORMALIZATION_BATCH_SIZE = 50
NORMALIZATION_BATCH_BYTES = 8 * 1024 * 1024
DOMAIN_RE = re.compile(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b", re.IGNORECASE)
WORD_RE = re.compile(r"[A-Za-z0-9]+")

SOURCE_LABELS = {
    "changan": "Changan",
    "breachforums": "BreachForums (bf.st)",
    "cracked": "Cracked",
    "darkforums": "DarkForums",
    "dragonforce": "DragonForce",
    "dragonforceblog": "DragonForce",
    "chaos": "Chaos",
    "lynx": "Lynx",
    "pwnfrm": "PwnedForums",
    "raidforums": "RaidForums",
    "spear": "Spear",
    "leakforum": "LeakForum",
    "xforums": "XForums (xforums.st)",
    "baidu_wenku": "Baidu Wenku",
    "docin": "Docin",
    "doc88": "Doc88",
    "book118": "Book118",
    "iask_share": "iAsk Shared Docs",
    "panhub": "PanHub",
    "pikasoo": "Pika Search",
    "lzpanx": "Lanpan Search",
    "esoua": "Esoua",
    "xiaobaipan": "Xiaobaipan",
    "xiaobudian": "Xiaobudian Search",
    "lingfengyun": "Lingfengyun",
    "dalipan": "Dalipan",
    "pandashi": "Pandashi",
    "panyq": "Panyouquan",
    "baidupan_share": "Baidu Netdisk",
    "aliyundrive_share": "Aliyun Drive",
    "quark_share": "Quark Netdisk",
    "tianyi_share": "Tianyi Cloud Drive",
    "pan123_share": "123 Cloud drive",
    "onedrive_share": "OneDrive",
    "xunlei_share": "Xunlei Cloud Drive",
    "uc_share": "UC Netdisk",
    "mobile_share": "China Mobile Cloud Drive",
    "pan115_share": "115 Netdisk",
    "pikpak_share": "PikPak",
    "ransomware_live": "ransomware.live",
    "cisa_kev": "CISA KEV",
    "nvd": "NVD",
    "securityweek": "SecurityWeek",
    "apache": "Apache Security",
    "vendor_oracle": "Oracle Security",
}

STATUS_LABELS = {
    "published": "Published",
    "going": "Negotiating",
    "transferring": "Transferring",
    "stopped": "Stopped",
    "unknown": "Unknown",
}

INDUSTRY_LABELS = {
    "other": "Other",
    "unknown": "Unknown",
    "government": "Government",
    "finance": "Finance",
    "healthcare": "Healthcare",
    "technology": "Technology",
    "military": "Military",
    "agriculture": "Agriculture",
    "retail": "Retail",
    "education": "Education",
    "telecommunications": "Telecommunications",
    "energy": "Energy",
    "transportation": "Transportation",
    "entertainment": "Entertainment",
}

INDUSTRY_LABELS.update(
    {
        "public sector": "Government",
        "financial services": "Finance",
        "agriculture and food production": "Agriculture",
        "consumer services": "Retail",
        "telecommunication": "Telecommunications",
        "transportation/logistics": "Transportation",
        "hospitality and tourism": "Entertainment",
        "manufacturing": "Manufacturing",
        "construction": "Manufacturing",
        "business services": "Other",
    }
)

REGION_LABELS = {
    "unknown": "Unknown",
    "north_america": "North America",
    "europe": "Europe",
    "asia": "Asia",
    "middle_east": "Middle East",
    "africa": "Africa",
    "oceania": "Oceania",
    "south_america": "South America",
}

ASSET_SENSITIVITY_POINTS = {
    "Credentials": 18,
    "Database": 16,
    "Source code": 18,
    "KYC/PII": 18,
    "Financial data": 20,
    "Exploit": 14,
    "Mixed data": 10,
    "Other": 6,
}

BEHAVIOR_MALIGNANCY_POINTS = {
    "Ransomware": 14,
    "Access sale": 12,
    "For sale": 10,
    "Spread": 8,
    "Recruitment": 6,
    "Exploit discussion": 7,
    "Disclosure": 5,
    "Other": 3,
}

OPERATION_STAGE_POINTS = {
    "Negotiation": 4,
    "For sale": 3,
    "Recruitment": 2,
    "Propagation": 2,
    "Disclosure": 1,
    "Other": 0,
}

TTP_RISK_POINTS = {
    "double_extortion": 4,
    "RaaS": 3,
    "credential_trade": 3,
    "exploit_sharing": 2,
    "initial_access_broker": 4,
    "malware_sale": 3,
}

COLLABORATION_POINTS = {
    "Independent operation": 0,
    "Recruiting partners": 2,
    "Deal brokering": 3,
}

COUNTRY_LABELS = {
    "unknown": "Unknown",
    "US": "United States",
    "GB": "United Kingdom",
    "CN": "China",
    "RU": "Russia",
    "HK": "Hong Kong",
    "TW": "Taiwan",
    "PK": "Pakistan",
    "TH": "Thailand",
    "VN": "Vietnam",
    "VE": "Venezuela",
    "AT": "Austria",
    "LI": "Liechtenstein",
    "SE": "Sweden",
    "ET": "Ethiopia",
    "NZ": "New Zealand",
    "IQ": "Iraq",
    "AU": "Australia",
    "DE": "Germany",
    "FR": "France",
    "IT": "Italy",
    "ES": "Spain",
    "MX": "Mexico",
    "ZA": "South Africa",
    "CL": "Chile",
    "CA": "Canada",
    "RO": "Romania",
    "CH": "Switzerland",
    "MY": "Malaysia",
    "EG": "Egypt",
    "MA": "Morocco",
    "AR": "Argentina",
    "BR": "Brazil",
    "IN": "India",
    "ID": "Indonesia",
    "PE": "Peru",
    "PL": "Poland",
    "JP": "Japan",
    "KR": "South Korea",
    "SG": "Singapore",
    "AE": "United Arab Emirates",
    "SA": "Saudi Arabia",
}

COUNTRY_REGION_MAP = {
    "US": "North America",
    "CA": "North America",
    "MX": "North America",
    "GB": "Europe",
    "DE": "Europe",
    "FR": "Europe",
    "IT": "Europe",
    "ES": "Europe",
    "RO": "Europe",
    "CH": "Europe",
    "PL": "Europe",
    "RU": "Europe",
    "AT": "Europe",
    "LI": "Europe",
    "SE": "Europe",
    "CN": "Asia",
    "HK": "Asia",
    "TW": "Asia",
    "IN": "Asia",
    "ID": "Asia",
    "JP": "Asia",
    "KR": "Asia",
    "SG": "Asia",
    "MY": "Asia",
    "PK": "Asia",
    "TH": "Asia",
    "VN": "Asia",
    "AE": "Middle East",
    "SA": "Middle East",
    "ZA": "Africa",
    "EG": "Africa",
    "MA": "Africa",
    "ET": "Africa",
    "IQ": "Middle East",
    "AR": "South America",
    "BR": "South America",
    "CL": "South America",
    "PE": "South America",
    "VE": "South America",
    "AU": "Oceania",
    "NZ": "Oceania",
}

COUNTRY_HINT_PATTERNS = {
    "US": [
        r"\bunited states\b",
        r"\busa\b",
        r"\bamerican\b",
        r"\bnew york\b",
        r"\bcalifornia\b",
        r"\btexas\b",
        r"\bflorida\b",
        r"\bohio\b",
        r"\bnew jersey\b",
        r"\butah\b",
        r"\bbountiful\b",
        r"\bchicago\b",
        r"\bmassachusetts\b",
    ],
    "GB": [
        r"\bunited kingdom\b",
        r"\buk\b",
        r"\bbritain\b",
        r"\bbritish\b",
        r"\bengland\b",
        r"\blondon\b",
        r"\bliverpool\b",
        r"\bmanchester\b",
    ],
    "CN": [r"\bchina\b", r"\bchinese\b", r"\bbeijing\b", r"\bshanghai\b", r"\bguangzhou\b", r"\bshenzhen\b"],
    "HK": [r"\bhong kong\b", r"\bha\.org\.hk\b"],
    "TW": [r"\btaiwan\b", r"\btaipei\b"],
    "PK": [r"\bpakistan\b", r"\bpakistani\b", r"\bislamabad\b"],
    "TH": [r"\bthailand\b", r"\bthai\b", r"\bsiam\b", r"\bbangkok\b"],
    "VN": [r"\bvietnam\b", r"\bvietnamese\b", r"\bhanoi\b", r"\bho chi minh\b"],
    "VE": [r"\bvenezuela\b", r"\bvenezuelan\b"],
    "AT": [r"\baustria\b", r"\bvienna\b"],
    "LI": [r"\bliechtenstein\b"],
    "SE": [r"\bsweden\b", r"\bswedish\b", r"\bstockholm\b"],
    "ET": [r"\bethiopia\b", r"\bethiopian\b", r"\baddis ababa\b"],
    "NZ": [r"\bnew zealand\b", r"\bnz\b", r"\bauckland\b", r"\bwellington\b"],
    "IQ": [r"\biraq\b", r"\biraqi\b", r"\bbasra\b", r"\bbaghdad\b"],
    "RU": [r"\brussia\b", r"\brussian\b", r"\bmoscow\b", r"\bst\.?\s*petersburg\b"],
    "AU": [r"\baustralia\b", r"\baustralian\b", r"\bsydney\b", r"\bmelbourne\b", r"\bqueensland\b"],
    "DE": [r"\bgermany\b", r"\bgerman\b", r"\bberlin\b", r"\bmunich\b", r"\bhamburg\b", r"\bbruchsal\b"],
    "FR": [r"\bfrance\b", r"\bfrench\b", r"\bparis\b"],
    "IT": [r"\bitaly\b", r"\bitalian\b", r"\bmilan\b", r"\bmeda\b", r"\brome\b"],
    "ES": [r"\bspain\b", r"\bspanish\b", r"\bmadrid\b", r"\bbarcelona\b"],
    "MX": [r"\bmexico\b", r"\bmexican\b", r"\bchiapas\b", r"\bmexico city\b"],
    "ZA": [r"\bsouth africa\b", r"\bsandton\b", r"\bjohannesburg\b", r"\bcape town\b"],
    "CL": [r"\bchile\b", r"\bchilean\b", r"\bsantiago\b"],
    "CA": [r"\bcanada\b", r"\bcanadian\b", r"\btoronto\b", r"\bmontreal\b", r"\bwinnipeg\b"],
    "RO": [r"\bromania\b", r"\bromanian\b", r"\bbucharest\b"],
    "CH": [r"\bswitzerland\b", r"\bswiss\b", r"\bzurich\b", r"\bgeneva\b"],
    "MY": [r"\bmalaysia\b", r"\bmalaysian\b", r"\bkuala lumpur\b"],
    "EG": [r"\begypt\b", r"\begyptian\b", r"\bcairo\b"],
    "AR": [r"\bargentina\b", r"\bargentine\b", r"\bbuenos aires\b"],
    "BR": [r"\bbrazil\b", r"\bbrazilian\b", r"\bsao paulo\b"],
    "IN": [r"\bindia\b", r"\bindian\b", r"\bnew delhi\b", r"\bmumbai\b"],
    "ID": [r"\bindonesia\b", r"\bindonesian\b", r"\bjakarta\b"],
    "PL": [r"\bpoland\b", r"\bpolish\b", r"\bwarsaw\b"],
    "JP": [r"\bjapan\b", r"\bjapanese\b", r"\btokyo\b"],
    "KR": [r"\bkorea\b", r"\bsouth korea\b", r"\bseoul\b"],
    "SG": [r"\bsingapore\b"],
    "AE": [r"\buae\b", r"\bunited arab emirates\b", r"\bdubai\b", r"\babu dhabi\b"],
    "SA": [r"\bsaudi arabia\b", r"\briyadh\b"],
}

COUNTRY_DOMAIN_SUFFIX_HINTS = {
    "co.za": "ZA",
    "com.au": "AU",
    "com.mx": "MX",
    "co.uk": "GB",
    "org.hk": "HK",
    "co.in": "IN",
    "uk": "GB",
    "hk": "HK",
    "tw": "TW",
    "pk": "PK",
    "th": "TH",
    "vn": "VN",
    "ve": "VE",
    "at": "AT",
    "li": "LI",
    "se": "SE",
    "et": "ET",
    "ca": "CA",
    "co.nz": "NZ",
    "nz": "NZ",
    "ru": "RU",
    "cn": "CN",
    "jp": "JP",
    "kr": "KR",
    "sg": "SG",
    "my": "MY",
    "de": "DE",
    "fr": "FR",
    "it": "IT",
    "es": "ES",
    "ch": "CH",
    "pl": "PL",
    "cl": "CL",
    "br": "BR",
    "ar": "AR",
    "mx": "MX",
    "au": "AU",
    "za": "ZA",
    "eg": "EG",
}

NOISY_VICTIM_DOMAINS = {
    "zoominfo.com",
    "dropmefiles.com",
    "mediafire.com",
    "pastebin.com",
    "mega.nz",
}

SOURCE_HOSTNAME_KEYWORDS = {
    "breachforums",
    "cracked",
    "darkforums",
    "dragonforce",
    "chaos",
    "lynx",
    "pwnfrm",
    "raidforums",
    "spear.cx",
    "leakforum.io",
    "leakforum.st",
    "xforums",
    "blogspot",
    "wordpress",
    "onion",
}


_FORUM_TIMESTAMP_NORMALIZERS = {
    "breachforums": normalize_breachforums_timestamp,
    "cracked": normalize_cracked_timestamp,
    "darkforums": normalize_darkforums_timestamp,
    "pwnfrm": normalize_pwnfrm_timestamp,
    "raidforums": normalize_pwnfrm_timestamp,
    "spear": normalize_spear_timestamp,
    "leakforum": normalize_leakforum_timestamp,
    "xforums": normalize_xforums_timestamp,
}


def _normalize_forum_timestamp(
    site_name: str | None,
    value: str | None,
    *,
    collected_at_utc: str | None,
) -> str:
    normalizer = _FORUM_TIMESTAMP_NORMALIZERS.get(
        str(site_name or "").lower(),
        normalize_darkforums_timestamp,
    )
    try:
        return normalizer(value, collected_at_utc=collected_at_utc) or ""
    except Exception as exc:
        logger.warning("timestamp normalization failed for site=%r: %s", site_name, exc)
        return ""

INDUSTRY_PRIORITY = [
    "Military",
    "Finance",
    "Manufacturing",
    "Agriculture",
    "Healthcare",
    "Technology",
    "Transportation",
    "Telecommunications",
    "Energy",
    "Government",
    "Education",
    "Entertainment",
    "Retail",
]

GENERIC_ENTITY_TERMS = {
    "data",
    "dataset",
    "database",
    "databases",
    "records",
    "record",
    "details",
    "detail",
    "dump",
    "leak",
    "leaked",
    "selling",
    "sale",
    "sample",
    "samples",
    "fullz",
    "credential",
    "credentials",
    "account",
    "accounts",
    "information",
    "documents",
    "document",
    "personal",
    "partial",
    "complete",
    "rows",
    "victim",
    "victims",
    "files",
    "archive",
    "package",
    "combo",
    "combolist",
    "list",
    "unknown",
}

INDUSTRY_KEYWORDS = {
    "Military": ["military", "defense", "defence", "navy", "air force", "missile", "weapon", "munitions", "warfare", "national security", "armed forces"],
    "Finance": ["bank", "banking", "finance", "financial", "fintech", "insurance", "payment", "investment", "capital management", "wealth management", "advisory", "retirement", "forex", "broker", "trading", "crypto", "cryptocurrency", "wallet", "exchange", "coinbase"],
    "Healthcare": ["health", "healthcare", "medical", "hospital", "clinic", "pharma", "medical devices", "pain management", "rehabilitation", "ministry of health", "social works"],
    "Technology": ["software", "saas", "cloud", "hosting", "tech", "technology", "digital", "electronics", "microelectronics", "photo frame", "logic", "semiconductor", "semi", "chip", "integrated circuit"],
    "Manufacturing": ["manufacturing", "industrial", "factory", "equipment", "construction", "engineering", "manufacturer", "packaging", "hydraulic", "chemical", "materials", "furniture", "components", "architectural", "interior", "craftsmanship", "architect", "architects", "architecture", "design-build"],
    "Agriculture": ["farm", "farming", "nursery", "grower", "growers", "christmas trees", "tree farm", "shrubs", "perennials", "fruits", "wholesale plant"],
    "Retail": ["retail", "shop", "shopping", "ecommerce", "e-commerce", "store"],
    "Education": ["school", "college", "university", "universidad", "education", "academy", "student", "faculty"],
    "Government": ["government", "gov", "ministry", "municipal", "police", "public sector", "driver's license", "driver license", "identity card", "id card", "id cards", "passport", "citizenship", "national registry", "reniec"],
    "Transportation": ["transport", "logistics", "shipping", "airline", "airport", "rail", "freight", "trucking"],
    "Energy": ["energy", "oil", "gas", "power", "electric", "utility"],
    "Telecommunications": ["telecom", "telecommunications", "mobile", "carrier", "broadband", "communications"],
    "Entertainment": ["media", "entertainment", "marketing", "destination marketing", "philharmonic", "orchestra", "concert", "advertising", "agency", "casino", "betting", "gaming", "sportsbook", "fitness", "publishing", "publisher", "onlyfans", "adult content", "creator content", "streaming"],
}

INDUSTRY_PHRASE_BOOSTS = {
    "Manufacturing": [
        r"\bmanufacturer of\b",
        r"\bfull[- ]service manufacturer\b",
        r"\bmetalized packaging\b",
        r"\banodized aluminum\b",
        r"\bpackaging\b",
        r"\bindustrial installations\b",
    ],
    "Agriculture": [
        r"\bchristmas trees?\b",
        r"\bwholesale plant nursery\b",
        r"\bnursery plants?\b",
        r"\bplant nursery\b",
        r"\btrees?, fruits?, topiaries?, roses?, perennials?, shrubs?\b",
        r"\bgrow(?:er|ing)\b",
    ],
    "Transportation": [
        r"\btransport services\b",
        r"\bdistribution systems\b",
    ],
}

REGION_KEYWORDS = {
    "North America": [" usa ", " us ", " united states", " north america", "canada", "mexico"],
    "Europe": ["europe", "european", "germany", "france", "italy", "spain", "uk", "england", "poland", "netherlands"],
    "Asia": ["asia", "asian", "china", "india", "japan", "korea", "singapore", "vietnam", "thailand", "indonesia"],
    "Middle East": ["middle east", "uae", "saudi", "qatar", "oman", "kuwait", "israel"],
    "South America": ["south america", "brazil", "argentina", "chile", "colombia", "peru"],
    "Africa": ["africa", "nigeria", "kenya", "south africa", "ghana", "morocco"],
    "Oceania": ["australia", "new zealand", "oceania"],
}

RECENT_EVENT_HOURS = 72
SPIKE_WINDOW_DAYS = 7
NORMALIZATION_VERSION = "2026-10-15-vulnerability-summary-v8"
NORMALIZATION_SCHEMA_VERSION = NORMALIZATION_VERSION
DOMAIN_ENRICHMENT_BUDGET = 20
DOMAIN_ENRICHMENT_TIMEOUT = 2
SEVERITY_ORDER = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}

REGION_DOMAIN_SUFFIX_HINTS = {
    "fr": "Europe",
    "de": "Europe",
    "es": "Europe",
    "it": "Europe",
    "uk": "Europe",
    "nl": "Europe",
    "pl": "Europe",
    "tr": "Europe",
    "us": "North America",
    "ca": "North America",
    "mx": "North America",
    "cn": "Asia",
    "jp": "Asia",
    "kr": "Asia",
    "sg": "Asia",
    "vn": "Asia",
    "th": "Asia",
    "id": "Asia",
    "bd": "Asia",
    "pk": "Asia",
    "ae": "Middle East",
    "sa": "Middle East",
    "qa": "Middle East",
    "om": "Middle East",
    "kw": "Middle East",
    "iq": "Middle East",
    "ir": "Middle East",
    "il": "Middle East",
    "ma": "Africa",
    "dz": "Africa",
    "eg": "Africa",
    "ng": "Africa",
    "ke": "Africa",
    "za": "Africa",
    "br": "South America",
    "ar": "South America",
    "cl": "South America",
    "co": "South America",
    "pe": "South America",
    "au": "Oceania",
    "nz": "Oceania",
}

REGION_CODE_HINTS = {
    "FR": "Europe",
    "DE": "Europe",
    "ES": "Europe",
    "IT": "Europe",
    "UK": "Europe",
    "PL": "Europe",
    "TR": "Europe",
    "US": "North America",
    "USA": "North America",
    "CA": "North America",
    "MX": "North America",
    "CN": "Asia",
    "JP": "Asia",
    "KR": "Asia",
    "SG": "Asia",
    "VN": "Asia",
    "TH": "Asia",
    "ID": "Asia",
    "IQ": "Middle East",
    "IR": "Middle East",
    "AE": "Middle East",
    "SA": "Middle East",
    "QA": "Middle East",
    "OM": "Middle East",
    "KW": "Middle East",
    "MA": "Africa",
    "DZ": "Africa",
    "EG": "Africa",
    "NG": "Africa",
    "KE": "Africa",
    "BR": "South America",
    "AR": "South America",
    "CL": "South America",
    "CO": "South America",
    "PE": "South America",
    "AU": "Oceania",
    "NZ": "Oceania",
}

REGION_CITY_HINTS = {
    "paris": "Europe",
    "london": "Europe",
    "madrid": "Europe",
    "rome": "Europe",
    "istanbul": "Europe",
    "casablanca": "Africa",
    "rabat": "Africa",
    "algiers": "Africa",
    "cairo": "Africa",
    "baghdad": "Middle East",
    "dubai": "Middle East",
    "doha": "Middle East",
    "riyadh": "Middle East",
    "amman": "Middle East",
    "tokyo": "Asia",
    "beijing": "Asia",
    "shanghai": "Asia",
    "seoul": "Asia",
    "bangkok": "Asia",
    "jakarta": "Asia",
    "new york": "North America",
    "los angeles": "North America",
    "toronto": "North America",
    "montreal": "North America",
    "sao paulo": "South America",
    "buenos aires": "South America",
    "santiago": "South America",
    "melbourne": "Oceania",
    "sydney": "Oceania",
    "auckland": "Oceania",
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _coerce_string_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [_normalize_label(item) for item in value if _normalize_label(item)]
    if isinstance(value, str):
        parsed = _parse_json(value)
        if isinstance(parsed, list):
            return [_normalize_label(item) for item in parsed if _normalize_label(item)]
        return [_normalize_label(part) for part in value.split("||") if _normalize_label(part)]
    return []


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    lowered = str(value or "").strip().lower()
    return lowered in {"1", "true", "yes", "y", "on"}


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for candidate in (raw, raw.replace(" UTC", "+00:00"), raw.replace("Z", "+00:00")):
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    for fmt in ("%d/%m/%Y", "%d %B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _format_dt(value: str | None) -> str:
    dt = _parse_dt(value)
    if dt is None:
        return value or ""
    return dt.astimezone().strftime("%Y-%m-%d %H:%M")


def _format_date(value: str | None) -> str:
    dt = _parse_dt(value)
    if dt is None:
        return (value or "").split(" ", 1)[0]
    return dt.strftime("%Y-%m-%d")


def _event_updated_time(event: dict[str, Any]) -> str:
    return event_report_time(event)


def _event_hash(*parts: str) -> str:
    payload = "|".join((part or "").strip() for part in parts)
    return sha1(payload.encode("utf-8")).hexdigest()[:16]


def _normalize_whitespace(value: str | None) -> str:
    return " ".join(str(value or "").replace("\u00a0", " ").split())


def _normalize_label(value: str | None) -> str:
    return _normalize_whitespace(value).strip(" ,;:()[]{}")


def _looks_like_domain(value: str | None) -> bool:
    return bool(value and DOMAIN_RE.fullmatch(value.strip().lower()))


def _normalize_domain(value: str | None) -> str:
    return _normalize_label(value).lower().removeprefix("www.")


def _canonical_key(value: str | None) -> str:
    cleaned = _normalize_label(value).lower()
    return re.sub(r"[\W_]+", "-", cleaned, flags=re.UNICODE).strip("-")


def _label_industry(value: str | None) -> str:
    raw = _normalize_label(value)
    lowered = raw.lower()
    if any(token in raw for token in ("鍒堕",)) or "manufact" in lowered or "construction" in lowered:
        return "Manufacturing"
    if any(token in raw for token in ("鍏朵",)) or "business services" in lowered:
        return "Business services"
    if any(token in raw for token in ("闆跺",)) or "consumer services" in lowered or "retail" in lowered:
        return "Retail"
    if any(token in raw for token in ("浜ら",)) or "transport" in lowered or "logistics" in lowered:
        return "Transportation"
    if any(token in raw for token in ("鏂囧",)) or "hospitality" in lowered or "tourism" in lowered or "entertainment" in lowered:
        return "Entertainment"
    if any(token in raw for token in ("鏀垮",)) or "public sector" in lowered or "government" in lowered:
        return "Government"
    if any(token in raw for token in ("閲戣",)) or "financial services" in lowered or "finance" in lowered:
        return "Finance"
    if any(token in raw for token in ("鍖荤",)) or "healthcare" in lowered:
        return "Healthcare"
    if any(token in raw for token in ("绉戞",)) or "technology" in lowered:
        return "Technology"
    if any(token in raw for token in ("鍐滀",)) or "agriculture" in lowered:
        return "Agriculture"
    if any(token in raw for token in ("閫氫",)) or "telecommunication" in lowered:
        return "Telecommunications"
    if any(token in raw for token in ("鑳芥",)) or "energy" in lowered:
        return "Energy"
    if any(token in raw for token in ("鏁欒",)) or "education" in lowered:
        return "Education"
    return INDUSTRY_LABELS.get(lowered, raw or "Unknown")


def _label_region(value: str | None) -> str:
    raw = _normalize_label(value)
    lowered = raw.lower()
    return REGION_LABELS.get(lowered, raw or "Unknown")


def _label_source(value: str | None) -> str:
    raw = _normalize_label(value).lower()
    return SOURCE_LABELS.get(raw, _normalize_label(value) or "Unknown")


def _label_country(code: str | None) -> str:
    raw = _normalize_label(code).upper()
    if raw in COUNTRY_LABELS:
        return COUNTRY_LABELS[raw]
    if Locale is not None and raw:
        try:
            locale = Locale.parse("en")
            translated = locale.territories.get(raw)
        except Exception:
            translated = None
        if translated:
            return str(translated)
    if pycountry is not None and raw:
        try:
            country = pycountry.countries.get(alpha_2=raw)
        except Exception:
            country = None
        if country is not None:
            return str(getattr(country, "name", "") or raw)
    return "Unknown"


def _region_from_country_code(code: str | None) -> str:
    raw = _normalize_label(code).upper()
    return COUNTRY_REGION_MAP.get(raw, "Unknown")


def _display_region(country: str | None, macro_region: str | None) -> str:
    country_label = _normalize_label(country)
    region_label = _normalize_label(macro_region)
    if country_label and country_label != "Unknown":
        return country_label
    if region_label and region_label != "Unknown":
        return region_label
    return "Unknown"


_GENERIC_COUNTRY_PATTERNS: list[tuple[str, re.Pattern[str], str]] | None = None


def _generic_country_patterns() -> list[tuple[str, re.Pattern[str], str]]:
    global _GENERIC_COUNTRY_PATTERNS
    if _GENERIC_COUNTRY_PATTERNS is not None:
        return _GENERIC_COUNTRY_PATTERNS

    patterns: list[tuple[str, re.Pattern[str], str]] = []
    if pycountry is None:
        _GENERIC_COUNTRY_PATTERNS = patterns
        return patterns

    seen: set[tuple[str, str]] = set()
    skipped_alpha2 = {"US", "GB", "AE", "SA", "GE", "LA"}
    for country in pycountry.countries:
        code = str(getattr(country, "alpha_2", "") or "").upper()
        if not code or code in skipped_alpha2:
            continue
        aliases = {
            str(getattr(country, "name", "") or "").strip(),
            str(getattr(country, "official_name", "") or "").strip(),
            str(getattr(country, "common_name", "") or "").strip(),
        }
        for alias in aliases:
            normalized_alias = alias.lower()
            if not normalized_alias or len(normalized_alias) < 4:
                continue
            key = (code, normalized_alias)
            if key in seen:
                continue
            seen.add(key)
            patterns.append(
                (
                    code,
                    re.compile(rf"(?<![a-z0-9]){re.escape(normalized_alias)}(?![a-z0-9])", re.IGNORECASE),
                    alias,
                )
            )

    _GENERIC_COUNTRY_PATTERNS = patterns
    return patterns


def _clean_display_subject(value: str | None) -> str:
    subject = _normalize_whitespace(value)
    if not subject:
        return ""
    subject = re.sub(r"^[^\w\u4e00-\u9fff]+", "", subject)
    subject = re.sub(r"\s*\(.*$", "", subject)
    subject = re.sub(r"\s*\([^)]*\)$", "", subject)
    subject = subject.strip(" -_:,.;")
    return subject[:80]


def _pick_display_subject(event: dict[str, Any]) -> str:
    victim = _clean_display_subject(event.get("victim"))
    raw_title = _clean_display_subject(event.get("title"))
    if victim and victim not in {"Unknown entity", "Unknown"}:
        if _looks_like_domain(victim) and raw_title and not _looks_like_domain(raw_title) and len(raw_title) >= len(victim):
            return raw_title
        if _looks_like_domain(victim) and raw_title and len(raw_title.split()) >= 2:
            return raw_title
        return victim
    return raw_title or "this target"


def build_display_title(event: dict[str, Any]) -> str:
    raw_title = _normalize_label(event.get("title"))
    event_type = str(event.get("event_type") or "")
    subject = _pick_display_subject(event)

    if event_type == "ransomware":
        return raw_title or subject or "Untitled ransomware event"

    if event_type == "data_leak":
        leak_type = _normalize_label(event.get("leak_type") or event.get("category"))
        leak_title_map = {
            "Database leak": "Suspected database leak",
            "Credential leak": "Suspected credential data leak",
            "Source code leak": "Suspected source code leak",
            "Identity documents": "Suspected identity document leak",
            "Trading and sales": "Data suspected to be for sale",
            "Data leak": "Suspected data leak",
        }
        suffix = leak_title_map.get(leak_type, "Suspected data leak")
        translated_title = translate_event_title_cached(raw_title, fallback=subject)
        lowered_title = translated_title.lower()
        if any(token in lowered_title for token in ("leak", "for sale", "database", "credential", "identity document", "document", "source code")):
            return translated_title
        return f"{translated_title}: {suffix}"

    if event_type == "vulnerability":
        return raw_title or "Public-source vulnerability alert"

    return raw_title or subject or "Untitled event"


def _is_noisy_domain(domain: str | None) -> bool:
    normalized = _normalize_domain(domain)
    return not normalized or normalized.endswith(".onion") or normalized in NOISY_VICTIM_DOMAINS


def _domain_country_code(domain: str | None) -> str:
    normalized = _normalize_domain(domain)
    if not normalized:
        return ""
    for suffix, code in sorted(COUNTRY_DOMAIN_SUFFIX_HINTS.items(), key=lambda item: len(item[0]), reverse=True):
        if normalized.endswith(f".{suffix}") or normalized == suffix:
            return code
    return ""


def _domain_enrichment_cache_path() -> Path:
    return project_root() / "data" / "domain_enrichment_cache.json"


def _load_domain_enrichment_cache() -> dict[str, Any]:
    path = _domain_enrichment_cache_path()
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        return {
            key: value
            for key, value in payload.items()
            if not str(key).startswith("__") and _looks_like_domain(str(key))
        }
    except Exception:
        return {}


def _save_domain_enrichment_cache(cache: dict[str, Any]) -> None:
    path = _domain_enrichment_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    serializable = {
        key: value
        for key, value in cache.items()
        if not str(key).startswith("__") and _looks_like_domain(str(key))
    }
    path.write_text(json.dumps(serializable, ensure_ascii=False, indent=2), encoding="utf-8")


def _http_fetch(url: str, timeout: int = DOMAIN_ENRICHMENT_TIMEOUT) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 Codex Governance Enricher"})
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="ignore")


def _strip_html(html_text: str) -> str:
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", html_text)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return _normalize_whitespace(unescape(text))


def _extract_html_title(html_text: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html_text)
    return _normalize_whitespace(unescape(match.group(1))) if match else ""


def _extract_meta_description(html_text: str) -> str:
    match = re.search(r'(?is)<meta[^>]+name=["\\\']description["\\\'][^>]+content=["\\\'](.*?)["\\\']', html_text)
    if match:
        return _normalize_whitespace(unescape(match.group(1)))
    match = re.search(r'(?is)<meta[^>]+property=["\\\']og:description["\\\'][^>]+content=["\\\'](.*?)["\\\']', html_text)
    return _normalize_whitespace(unescape(match.group(1))) if match else ""


def _extract_domain_from_url(value: str | None) -> str:
    raw = _normalize_label(value)
    if not raw:
        return ""
    if _looks_like_domain(raw):
        return _normalize_domain(raw)
    try:
        parsed = urlparse(raw)
    except Exception:
        return ""
    host = parsed.netloc or parsed.path.split("/", 1)[0]
    normalized = _normalize_domain(host)
    return normalized if _looks_like_domain(normalized) else ""


def _to_base_domain(domain: str | None) -> str:
    normalized = _normalize_domain(domain)
    if not _looks_like_domain(normalized):
        return ""
    parts = normalized.split(".")
    if len(parts) <= 2:
        return normalized
    multi_suffixes = {"co.uk", "com.au", "co.nz", "com.mx", "co.in", "org.hk"}
    tail = ".".join(parts[-2:])
    if tail in {"uk", "au", "nz", "mx", "in", "hk"} and ".".join(parts[-3:]) in multi_suffixes:
        return ".".join(parts[-3:])
    if ".".join(parts[-2:]) in multi_suffixes:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _extract_followup_links(html_text: str, base_domain: str) -> list[str]:
    links: list[str] = []
    for match in re.findall(r'(?is)href=["\\\'](.*?)["\\\']', html_text or ""):
        candidate = _normalize_whitespace(unescape(match))
        if not candidate or candidate.startswith("#") or candidate.startswith("mailto:") or candidate.startswith("javascript:"):
            continue
        lowered = candidate.lower()
        if not any(token in lowered for token in ("about", "contact", "location", "office", "company", "who-we-are", "our-story")):
            continue
        if candidate.startswith("/"):
            candidate = f"https://{base_domain}{candidate}"
        domain = _extract_domain_from_url(candidate)
        if domain and _to_base_domain(domain) == _to_base_domain(base_domain):
            links.append(candidate)
    deduped = []
    seen: set[str] = set()
    for item in links:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped[:3]


def _resolve_ip_country(domain: str) -> tuple[str, str]:
    try:
        ip = socket.gethostbyname(domain)
    except Exception:
        return "", ""
    try:
        payload = json.loads(_http_fetch(f"https://ipwho.is/{ip}", timeout=DOMAIN_ENRICHMENT_TIMEOUT))
    except Exception:
        return "", ""
    if not isinstance(payload, dict) or payload.get("success") is False:
        return "", ""
    country_code = _normalize_label(str(payload.get("country_code") or "")).upper()
    return country_code, ip


def _enrich_domain(domain: str, cache: dict[str, Any], *, allow_ip_geo: bool = True) -> dict[str, Any]:
    normalized = _normalize_domain(domain)
    if not normalized or _is_noisy_domain(normalized):
        return {}
    cached = cache.get(normalized)
    if isinstance(cached, dict):
        if str(cached.get("country_source") or "") == "ip_geo":
            cached = {
                **cached,
                "country": "Unknown",
                "country_code": "",
                "macro_region": "Unknown",
                "country_source": "unknown",
                "country_score": 0,
                "country_evidence": [],
            }
            cache[normalized] = cached
        return cached
    if int(cache.get("__remaining__", DOMAIN_ENRICHMENT_BUDGET)) <= 0:
        return {}
    cache["__remaining__"] = int(cache.get("__remaining__", DOMAIN_ENRICHMENT_BUDGET)) - 1

    fetch_domain = normalized
    html_text = ""
    fetched_url = ""
    for scheme in ("https://", "http://"):
        candidate = f"{scheme}{fetch_domain}"
        try:
            html_text = _http_fetch(candidate, timeout=DOMAIN_ENRICHMENT_TIMEOUT)
            fetched_url = candidate
            break
        except Exception:
            continue

    if not html_text:
        base_domain = _to_base_domain(normalized)
        if base_domain and base_domain != normalized:
            for scheme in ("https://", "http://"):
                candidate = f"{scheme}{base_domain}"
                try:
                    html_text = _http_fetch(candidate, timeout=DOMAIN_ENRICHMENT_TIMEOUT)
                    fetched_url = candidate
                    fetch_domain = base_domain
                    break
                except Exception:
                    continue

    title = _extract_html_title(html_text)
    description = _extract_meta_description(html_text)
    body = _strip_html(html_text)[:4000] if html_text else ""
    followup_text = ""
    for link in _extract_followup_links(html_text, fetch_domain):
        try:
            followup_html = _http_fetch(link, timeout=DOMAIN_ENRICHMENT_TIMEOUT)
        except Exception:
            continue
        followup_text += " " + _extract_html_title(followup_html)
        followup_text += " " + _extract_meta_description(followup_html)
        followup_text += " " + _strip_html(followup_html)[:2500]

    geo_bundle = _infer_country_bundle(
        ("domain", 6, normalized),
        ("homepage_title", 6, title),
        ("homepage_meta", 6, description),
        ("homepage_body", 4, body),
        ("followup_pages", 6, followup_text),
    )
    industry_bundle = _infer_industry_bundle(
        ("domain", 4, normalized),
        ("homepage_title", 6, title),
        ("homepage_meta", 6, description),
        ("homepage_body", 4, body),
        ("followup_pages", 5, followup_text),
    )

    enriched = {
        "domain": normalized,
        "fetched_url": fetched_url,
        "country": geo_bundle.get("country") or "Unknown",
        "country_code": geo_bundle.get("country_code") or "",
        "macro_region": geo_bundle.get("macro_region") or "Unknown",
        "country_source": geo_bundle.get("source") or "unknown",
        "country_score": int(geo_bundle.get("score") or 0),
        "country_evidence": geo_bundle.get("evidence") or [],
        "industry": industry_bundle.get("industry") or "Unknown",
        "industry_source": industry_bundle.get("source") or "unknown",
        "industry_score": int(industry_bundle.get("score") or 0),
    }
    cache[normalized] = enriched
    return enriched


def _pick_primary_domain(*values: str) -> str:
    for value in values:
        extracted = _extract_domain_from_url(value)
        if extracted and not _is_noisy_domain(extracted):
            return extracted
        for domain in _extract_domains(value):
            if not _is_noisy_domain(domain):
                return domain
    return ""


def _source_base_domains(*urls: str) -> set[str]:
    domains: set[str] = set()
    for url in urls:
        domain = _normalize_domain(_extract_domain_from_url(url))
        if not domain:
            continue
        domains.add(domain)
        base_domain = _to_base_domain(domain)
        if base_domain:
            domains.add(base_domain)
    return domains


def _filter_country_candidate_domains(domains: list[str], *source_urls: str) -> list[str]:
    excluded = _source_base_domains(*source_urls)
    filtered: list[str] = []
    for domain in domains:
        normalized = _normalize_domain(domain)
        if not normalized:
            continue
        base_domain = _to_base_domain(normalized)
        if normalized in excluded or (base_domain and base_domain in excluded):
            continue
        if any(keyword in normalized for keyword in SOURCE_HOSTNAME_KEYWORDS):
            continue
        filtered.append(normalized)
    return list(dict.fromkeys(filtered))


@lru_cache(maxsize=None)
def _keyword_match_pattern(keyword: str) -> re.Pattern[str]:
    escaped = re.escape(keyword.lower())
    return re.compile(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])")


def _count_keyword_matches(text: str, keyword: str) -> int:
    if keyword.lower() not in text:
        return 0
    return len(_keyword_match_pattern(keyword).findall(text))


@lru_cache(maxsize=256)
def _country_hint_literal(pattern: str) -> str:
    match = re.fullmatch(r"\\b([a-z0-9 ]+)\\b", pattern)
    return match.group(1) if match else ""


def _cache_text_inference(function):
    cache = OrderedDict()
    lock = Lock()

    @wraps(function)
    def cached(*texts):
        key = tuple(
            (source, weight, sha256(str(text or "").encode("utf-8", "surrogatepass")).digest())
            for source, weight, text in texts
        )
        with lock:
            if key in cache:
                cache.move_to_end(key)
                return cache[key]
        result = function(*texts)
        with lock:
            cache[key] = result
            cache.move_to_end(key)
            if len(cache) > 8192:
                cache.popitem(last=False)
        return result

    return cached


@_cache_text_inference
def _infer_industry_bundle(*texts: tuple[str, int]) -> dict[str, Any]:
    scores: dict[str, int] = defaultdict(int)
    sources: dict[str, list[str]] = defaultdict(list)
    for source_name, weight, text in texts:
        normalized = _normalize_whitespace(text).lower()
        if not normalized:
            continue
        for industry in INDUSTRY_PRIORITY:
            matches = 0
            for keyword in INDUSTRY_KEYWORDS.get(industry, []):
                matches += _count_keyword_matches(normalized, keyword)
            if matches:
                scores[industry] += matches * weight
                sources[industry].append(source_name)
        for industry, patterns in INDUSTRY_PHRASE_BOOSTS.items():
            phrase_hits = sum(1 for pattern in patterns if re.search(pattern, normalized))
            if phrase_hits:
                scores[industry] += phrase_hits * (weight + 3)
                sources[industry].append(f"{source_name}:phrase")

        # When the text clearly says the company is a manufacturer or grower,
        # downstream customer industries should not override the core business.
        if any(token in normalized for token in ("manufacturer", "manufacturing", "grower", "nursery", "farm")):
            if scores.get("Manufacturing"):
                scores["Healthcare"] = max(0, scores.get("Healthcare", 0) - weight * 2)
                scores["Retail"] = max(0, scores.get("Retail", 0) - weight)
            if scores.get("Agriculture"):
                scores["Retail"] = max(0, scores.get("Retail", 0) - weight * 2)
                scores["Healthcare"] = max(0, scores.get("Healthcare", 0) - weight)
    if not scores:
        return {"industry": "Unknown", "source": "unknown", "score": 0}
    industry = max(scores.items(), key=lambda item: (item[1], -INDUSTRY_PRIORITY.index(item[0])))[0]
    source = "+".join(dict.fromkeys(sources[industry])) or "text"
    return {"industry": industry, "source": source, "score": scores[industry]}


@_cache_text_inference
def _infer_country_bundle(*texts: tuple[str, int]) -> dict[str, Any]:
    scores: dict[str, int] = defaultdict(int)
    sources: dict[str, list[str]] = defaultdict(list)
    evidence: dict[str, list[str]] = defaultdict(list)

    for source_name, weight, text in texts:
        normalized = _normalize_whitespace(text)
        lowered = normalized.lower()
        if not lowered:
            continue

        for code, patterns in COUNTRY_HINT_PATTERNS.items():
            for pattern in patterns:
                literal = _country_hint_literal(pattern)
                if literal and literal not in lowered:
                    continue
                match = re.search(pattern, lowered)
                if not match:
                    continue
                scores[code] += weight
                sources[code].append(source_name)
                evidence[code].append(match.group(0))
                break

        for domain in _extract_domains(normalized):
            if _is_noisy_domain(domain):
                continue
            code = _domain_country_code(domain)
            if code:
                scores[code] += max(1, weight - 3)
                sources[code].append(f"{source_name}:domain")
                evidence[code].append(domain)

        # These Unicode letters also match ASCII literals under re.IGNORECASE.
        generic_text = lowered.replace("ı", "i").replace("ſ", "s")
        for code, pattern, alias in _generic_country_patterns():
            if alias.isascii() and alias.lower() not in generic_text:
                continue
            match = pattern.search(lowered)
            if not match:
                continue
            scores[code] += max(1, weight - 1)
            sources[code].append(f"{source_name}:generic_country")
            evidence[code].append(match.group(0) or alias)
            break

    if not scores:
        return {
            "country": "Unknown",
            "country_code": "",
            "macro_region": "Unknown",
            "source": "unknown",
            "score": 0,
            "evidence": [],
        }

    country_code = max(scores.items(), key=lambda item: (item[1], item[0]))[0]
    return {
        "country": _label_country(country_code),
        "country_code": country_code,
        "macro_region": _region_from_country_code(country_code),
        "source": "+".join(dict.fromkeys(sources[country_code])) or "text",
        "score": scores[country_code],
        "evidence": list(dict.fromkeys(evidence[country_code]))[:6],
    }


def _build_quality_scores(event: dict[str, Any], geo_bundle: dict[str, Any], industry_bundle: dict[str, Any]) -> tuple[int, int]:
    confidence = 25
    completeness = 30

    if event.get("victim") and event.get("victim") != "Unknown entity":
        confidence += 15
        completeness += 10
    if geo_bundle.get("country") and geo_bundle["country"] != "Unknown":
        confidence += min(25, int(geo_bundle.get("score") or 0))
        completeness += 20
    if industry_bundle.get("industry") and industry_bundle["industry"] != "Unknown":
        confidence += min(20, int(industry_bundle.get("score") or 0))
        completeness += 15
    if event.get("detail_text"):
        completeness += 10
    if event.get("disclosure_time"):
        completeness += 10
    if event.get("source_url"):
        completeness += 5

    return min(confidence, 100), min(completeness, 100)


def _propagate_entity_context(events: list[dict[str, Any]]) -> None:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        victim_key = event.get("victim_key") or "unknown"
        if victim_key == "unknown":
            continue
        grouped[victim_key].append(event)

    for victim_events in grouped.values():
        best_country_event = max(
            victim_events,
            key=lambda item: (
                str(item.get("country") or "").strip() not in {"", "Unknown"},
                int(item.get("metadata", {}).get("country_score") or 0),
                int(item.get("confidence_score") or 0),
            ),
        )
        best_industry_event = max(
            victim_events,
            key=lambda item: (
                str(item.get("industry") or "").strip() not in {"", "Unknown"},
                int(item.get("metadata", {}).get("industry_score") or 0),
                int(item.get("confidence_score") or 0),
            ),
        )
        best_country = str(best_country_event.get("country") or "").strip()
        best_industry = str(best_industry_event.get("industry") or "").strip()
        for event in victim_events:
            metadata = event.setdefault("metadata", {})
            best_country_meta = best_country_event.get("metadata", {}) or {}
            best_country_source = str(best_country_meta.get("country_source") or "")
            best_country_score = int(best_country_meta.get("country_score") or 0)
            can_propagate_country = (
                best_country not in {"", "Unknown"}
                and (best_country_source != "ip_geo" or best_country_score >= 6)
            )
            if str(event.get("country") or "").strip() in {"", "Unknown"} and can_propagate_country:
                event["country"] = best_country
                event["country_code"] = best_country_event.get("country_code") or ""
                event["region"] = best_country_event.get("region") or event.get("region") or "Unknown"
                metadata["country_source"] = f"{metadata.get('country_source', 'unknown')}+victim_group"
                metadata.setdefault("tag_sources", []).append("victim_group:country")
                event["confidence_score"] = min(int(event.get("confidence_score") or 0) + 8, 100)
                event["completeness_score"] = min(int(event.get("completeness_score") or 0) + 10, 100)
            if str(event.get("industry") or "").strip() in {"", "Unknown"} and best_industry not in {"", "Unknown"}:
                event["industry"] = best_industry
                metadata["industry_source"] = f"{metadata.get('industry_source', 'unknown')}+victim_group"
                metadata.setdefault("tag_sources", []).append("victim_group:industry")
                event["confidence_score"] = min(int(event.get("confidence_score") or 0) + 6, 100)
                event["completeness_score"] = min(int(event.get("completeness_score") or 0) + 8, 100)


def _apply_domain_enrichment(events: list[dict[str, Any]], domain_cache: dict[str, Any]) -> None:
    candidates = []
    for event in events:
        metadata = event.get("metadata") or {}
        evidence = metadata.get("entity_link_evidence") or {}
        domain = _normalize_domain(evidence.get("primary_domain") or "")
        if not domain or _is_noisy_domain(domain):
            continue
        if event.get("country") != "Unknown" and event.get("industry") != "Unknown":
            continue
        candidates.append(event)

    candidates.sort(
        key=lambda item: (
            _parse_dt(item.get("disclosure_time")) or datetime.min.replace(tzinfo=timezone.utc),
            int(item.get("risk_score") or 0),
        ),
        reverse=True,
    )

    for event in candidates:
        metadata = event.get("metadata") or {}
        evidence = metadata.get("entity_link_evidence") or {}
        domain = _normalize_domain(evidence.get("primary_domain") or "")
        enrichment = _enrich_domain(domain, domain_cache)
        if not enrichment:
            continue
        if event.get("country") == "Unknown" and enrichment.get("country") not in {"", "Unknown"}:
            event["country"] = enrichment["country"]
            event["country_code"] = enrichment.get("country_code") or ""
            event["region"] = enrichment.get("macro_region") or event.get("region") or "Unknown"
            metadata["country_source"] = enrichment.get("country_source") or "domain_cache"
            metadata["country_score"] = int(enrichment.get("country_score") or 0)
            metadata["country_evidence"] = enrichment.get("country_evidence") or [domain]
            metadata.setdefault("tag_sources", []).append(metadata["country_source"])
            event["confidence_score"] = min(int(event.get("confidence_score") or 0) + 8, 100)
            event["completeness_score"] = min(int(event.get("completeness_score") or 0) + 10, 100)
        if event.get("industry") == "Unknown" and enrichment.get("industry") not in {"", "Unknown"}:
            event["industry"] = enrichment["industry"]
            metadata["industry_source"] = enrichment.get("industry_source") or "domain_cache"
            metadata["industry_score"] = int(enrichment.get("industry_score") or 0)
            metadata.setdefault("tag_sources", []).append(metadata["industry_source"])
            event["confidence_score"] = min(int(event.get("confidence_score") or 0) + 6, 100)
            event["completeness_score"] = min(int(event.get("completeness_score") or 0) + 8, 100)
def _coerce_resource_list(value: Any) -> list[dict[str, str]]:
    if not value:
        return []
    if isinstance(value, list):
        resources: list[dict[str, str]] = []
        for item in value:
            if isinstance(item, dict):
                url = _normalize_label(item.get("url"))
                if url:
                    resources.append({"label": _normalize_label(item.get("label") or item.get("name") or url), "url": url})
            elif isinstance(item, str):
                url = _normalize_label(item)
                if url:
                    resources.append({"label": url, "url": url})
        return resources
    if isinstance(value, str):
        items = [_normalize_label(item) for item in value.split(",")]
        return [{"label": item, "url": item} for item in items if item]
    return []


@lru_cache(maxsize=None)
def _site_output_dir(site_name: str) -> Path | None:
    try:
        return get_site_config(site_name).output_dir
    except Exception:
        legacy_name = safe_stem(site_name, fallback="")
        return (output_root() / legacy_name).resolve() if legacy_name else None


def _public_output_url(path: Path) -> str:
    path = display_artifact_path(path.resolve())
    root = display_artifact_path(output_root().resolve())
    try:
        relative_path = path.relative_to(root)
    except ValueError:
        return path.as_uri()
    return f"/collector-output/{relative_path.as_posix()}"


def _resource_entry(path: Path, label: str) -> dict[str, str]:
    return {"label": label, "url": _public_output_url(path)}


def _artifact_candidate_stems(*values: str) -> list[str]:
    seen: set[str] = set()
    stems: list[str] = []
    for value in values:
        normalized = safe_stem(str(value or "").strip())
        if normalized and normalized not in seen:
            seen.add(normalized)
            stems.append(normalized)
    return stems


def _resolve_artifact_resources(
    details_dir: Path,
    stems: list[str],
    fallback_tokens: list[str],
    *,
    allow_fuzzy: bool = True,
    raw_payload=None,
    output_dir: Path | None = None,
    site_name: str = "",
    target_url: str = "",
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    def verified(stem):
        paths = detail_artifact_paths(output_dir or details_dir, details_dir, stem, raw_payload,
                                      site_name=site_name, target_url=target_url, forum=False)
        resources = [_resource_entry(paths[key], label) for key, label in
                     (("html", "Local HTML mirror"), ("json", "Local JSON mirror")) if key in paths]
        screenshots = [_resource_entry(paths["png"], "Detail screenshot")] if "png" in paths else []
        return resources, screenshots

    for stem in stems:
        resources, screenshots = verified(stem)
        if resources or screenshots:
            return resources, screenshots

    if allow_fuzzy:
        inspected: set[Path] = set()
        for token in fallback_tokens:
            safe_token = safe_stem(token)
            if not safe_token:
                continue
            for path in details_dir.glob(f"*{safe_token}*.json"):
                if path in inspected:
                    continue
                if len(inspected) >= 100:
                    return [], []
                inspected.add(path)
                resources, screenshots = verified(path.stem)
                if resources or screenshots:
                    return resources, screenshots
    return [], []


def _forum_output_resources(row_dict: dict[str, Any]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    output_dir = _site_output_dir(str(row_dict.get("site_name") or ""))
    topic_url = _normalize_label(row_dict.get("topic_url"))
    if output_dir is None or not topic_url:
        return [], []
    section = _normalize_label(row_dict.get("section")) or "section"
    detail_dir = native_artifact_path(output_dir / section / "details")
    artifact_stem = _event_hash(topic_url)[:10]
    return referenced_artifact_resources(output_dir, detail_dir, artifact_stem, forum_artifact_payload(row_dict),
        site_name=str(row_dict.get("site_name") or ""), target_url=topic_url, forum=True,
        resource_entry=_resource_entry, include_legacy=True)


def _victim_output_resources(
    row_dict: dict[str, Any],
    raw_json: dict[str, Any],
    detail_raw_json: dict[str, Any] | None = None,
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    site_name = str(row_dict.get("site_name") or "")
    output_dir = _site_output_dir(site_name)
    if output_dir is None:
        return [], []
    detail_raw_json = victim_artifact_payload(row_dict, detail_raw_json or {})
    content_hash = str(raw_json.get("content_hash") or row_dict.get("content_hash") or "")
    detail_content_hash = str(detail_raw_json.get("content_hash") or "")
    domain = str(raw_json.get("domain") or row_dict.get("domain") or "")
    detail_domain = str(detail_raw_json.get("website") or "")
    name = str(raw_json.get("name") or row_dict.get("name") or "")
    detail_name = str(detail_raw_json.get("company_name") or detail_raw_json.get("page_title") or "")
    detail_url = str(raw_json.get("detail_url") or row_dict.get("detail_url") or "")
    detail_slug = detail_url.rstrip("/").rsplit("/", 1)[-1] if detail_url else ""
    artifact_stem = str(detail_raw_json.get("artifact_stem") or raw_json.get("artifact_stem") or "").strip()
    detail_dir = native_artifact_path(output_dir / "details")
    referenced = referenced_artifact_resources(output_dir, detail_dir, artifact_stem, detail_raw_json,
        site_name=site_name, target_url=detail_url, forum=False, resource_entry=_resource_entry)
    if referenced is not None:
        return referenced
    stems = _artifact_candidate_stems(
        artifact_stem,
        safe_stem(f"{content_hash[:10]}_{name[:30]}"),
        safe_stem(f"{content_hash[:10]}_{domain or name}"),
        safe_stem(f"{content_hash[:10]}_{detail_slug}"),
        safe_stem(f"{detail_content_hash[:10]}_{detail_name[:30]}"),
        safe_stem(f"{detail_content_hash[:10]}_{detail_domain or detail_name or name}"),
        safe_stem(f"{detail_content_hash[:10]}_{detail_slug}"),
        _event_hash(detail_url)[:10] if detail_url else "",
        safe_stem(detail_url),
    )
    fallback_tokens = [
        name[:30],
        detail_name[:30],
        domain,
        detail_domain,
        _extract_domain_from_url(detail_url),
        _clean_display_subject(name),
        _clean_display_subject(detail_name),
    ]
    best_resources: list[dict[str, str]] = []
    best_screenshots: list[dict[str, str]] = []
    for stem in stems:
        resources, screenshots = _resolve_artifact_resources(
            detail_dir,
            [stem],
            [],
            allow_fuzzy=False,
            raw_payload=detail_raw_json, output_dir=output_dir, site_name=site_name, target_url=detail_url,
        )
        if resources and screenshots:
            return resources, screenshots
        if (resources or screenshots) and not (best_resources or best_screenshots):
            best_resources = resources
            best_screenshots = screenshots
    if best_resources or best_screenshots:
        return best_resources, best_screenshots
    return _resolve_artifact_resources(
        detail_dir,
        stems,
        [item for item in fallback_tokens if item],
        raw_payload=detail_raw_json, output_dir=output_dir, site_name=site_name, target_url=detail_url,
        allow_fuzzy=False,
    )


def _extract_domains(*texts: str) -> list[str]:
    seen: set[str] = set()
    results: list[str] = []
    for text in texts:
        for match in DOMAIN_RE.findall(text or ""):
            domain = _normalize_domain(match)
            if domain and domain not in seen:
                seen.add(domain)
                results.append(domain)
    return results


def _clean_entity_candidates(candidates: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        label = _normalize_label(candidate)
        lowered = label.lower()
        if not label or lowered in seen:
            continue
        words = {word.lower() for word in WORD_RE.findall(label)}
        if words and words.issubset(GENERIC_ENTITY_TERMS):
            continue
        if not _looks_like_domain(label) and any(term in lowered for term in ("sell ", "selling", "sample", "data", "records")) and len(words) <= 5:
            continue
        seen.add(lowered)
        cleaned.append(label)
    return cleaned


def _pick_primary_victim(candidates: list[str], title: str, content: str, fallback_domains: list[str]) -> tuple[str, str]:
    scored: list[tuple[int, str]] = []
    title_lower = title.lower()
    content_lower = content.lower()
    for candidate in _clean_entity_candidates(candidates):
        lowered = candidate.lower()
        score = 0
        if _looks_like_domain(candidate):
            score += 8
        if lowered and lowered in title_lower:
            score += 5
        if lowered and lowered in content_lower:
            score += 2
        if len(candidate.split()) <= 5:
            score += 1
        scored.append((score, candidate))
    if scored:
        scored.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
        victim = scored[0][1]
        victim_key = _normalize_domain(victim) if _looks_like_domain(victim) else _canonical_key(victim)
        return victim, victim_key
    for domain in fallback_domains:
        if _is_noisy_domain(domain):
            continue
        return domain, domain
    return "Unknown entity", "unknown"


def _infer_industry(*texts: str) -> str:
    bundle = _infer_industry_bundle(*[(f"text_{index}", 4 if index == 0 else 3, text) for index, text in enumerate(texts)])
    return bundle["industry"]


def _infer_region(*texts: str) -> str:
    country_bundle = _infer_country_bundle(*[(f"text_{index}", 6 if index == 0 else 4, text) for index, text in enumerate(texts)])
    if country_bundle["country"] != "Unknown":
        return country_bundle["macro_region"]

    merged = f" {' '.join(texts).lower()} "
    scores: dict[str, int] = {}

    for domain in _extract_domains(*texts):
        suffix = domain.rsplit(".", 1)[-1]
        region = REGION_DOMAIN_SUFFIX_HINTS.get(suffix)
        if region:
            scores[region] = scores.get(region, 0) + 5

    for code, region in REGION_CODE_HINTS.items():
        code_lower = code.lower()
        if f"[{code_lower}]" in merged or f" {code_lower} " in merged:
            scores[region] = scores.get(region, 0) + 4

    for city, region in REGION_CITY_HINTS.items():
        if city in merged:
            scores[region] = scores.get(region, 0) + 3

    for label, keywords in REGION_KEYWORDS.items():
        if any(keyword in merged for keyword in keywords):
            scores[label] = scores.get(label, 0) + 2

    if scores:
        best_region, best_score = max(scores.items(), key=lambda item: (item[1], item[0]))
        if best_score >= 2:
            return best_region
    return "Unknown"


def _classify_forum_leak_type(section: str, title: str, content: str) -> str:
    text = f"{title} {content}".lower()
    if section == "source_codes":
        return "Source code leak"
    if section in {"stealer_logs", "cloud_logs"} or any(keyword in text for keyword in ("password", "credential", "combo", "combolist", "fullz", "account")):
        return "Credential leak"
    if any(keyword in text for keyword in ("source code", "repo", "repository", "git", "github")):
        return "Source code leak"
    if any(keyword in text for keyword in ("passport", "license", "statement", "document", "id card", "selfie")):
        return "Identity documents"
    if any(keyword in text for keyword in ("database", "dump", "records", "sql", "breach", "leak")):
        return "Database leak"
    if section == "sellers_place":
        return "Trading and sales"
    return "Data leak"


def _severity_from_forum(section: str, leak_type: str) -> str:
    if leak_type in {"Credential leak", "Source code leak"}:
        return "critical"
    if section == "databases" or leak_type in {"Database leak", "Identity documents"}:
        return "high"
    if section == "sellers_place":
        return "medium"
    return "medium"


def _severity_from_status(status: str) -> str:
    lowered = status.lower()
    if lowered == "published":
        return "critical"
    if lowered in {"going", "transferring"}:
        return "high"
    if lowered == "stopped":
        return "medium"
    return "medium"


def _severity_from_vulnerability(severity: str, cvss: Any, is_exploited: bool) -> str:
    normalized = _normalize_label(severity).lower()
    try:
        cvss_value = float(cvss) if cvss not in {None, ""} else None
    except (TypeError, ValueError):
        cvss_value = None

    if normalized == "critical" or (cvss_value is not None and cvss_value >= 9.0):
        return "critical"
    if is_exploited or normalized == "high" or (cvss_value is not None and cvss_value >= 7.0):
        return "high"
    if normalized == "medium" or (cvss_value is not None and cvss_value >= 4.0):
        return "medium"
    return "low"


def _recent_cutoff(hours: int = RECENT_EVENT_HOURS) -> datetime:
    return _now_utc() - timedelta(hours=hours)


def _normalization_rows(connection, sql, order_by, text_columns=()) -> Iterator[dict[str, Any]]:
    """Bound driver buffers with a server cursor or text-sized SQL pages."""
    if getattr(connection, 'backend_name', '') == 'postgresql':
        cursor = connection.iter_rows(f'SELECT * FROM ({sql}) AS source ORDER BY {order_by}', batch_size=1)
        try:
            for row in cursor:
                yield dict(row)
        finally:
            cursor.close()
        return
    offset = 0
    while True:
        limit = NORMALIZATION_BATCH_SIZE
        if text_columns:
            size = ' + '.join(f'COALESCE(LENGTH({column}), 0)' for column in text_columns)
            sizes = connection.execute(
                f'SELECT {size} AS characters FROM ({sql}) AS source ORDER BY {order_by} LIMIT ? OFFSET ?',
                (limit, offset),
            ).fetchall()
            if not sizes:
                return
            limit = 0
            total = 0
            for row in sizes:
                estimated_bytes = int(row['characters']) * 4
                if limit and total + estimated_bytes > NORMALIZATION_BATCH_BYTES:
                    break
                limit += 1
                total += estimated_bytes
        rows = connection.execute(
            f'SELECT * FROM ({sql}) AS source ORDER BY {order_by} LIMIT ? OFFSET ?', (limit, offset),
        ).fetchall()
        if not rows:
            return
        for row in rows:
            yield dict(row)
        offset += len(rows)


def _forum_artifact_signature(connection) -> dict[str, Any]:
    rows = _normalization_rows(connection,
        """
        SELECT id, site_name, section, topic_url
        FROM forum_details
        """, 'id')
    mirror_count = 0
    screenshot_count = 0
    for row in rows:
        try:
            mirror_resources, screenshot_resources = _forum_output_resources(dict(row))
        except Exception:
            continue
        mirror_count += len(mirror_resources)
        screenshot_count += len(screenshot_resources)
    return {
        "mirror_count": mirror_count,
        "screenshot_count": screenshot_count,
    }


def _forum_victim_signature(connection) -> dict[str, Any]:
    rows = _normalization_rows(connection,
        """
        SELECT id, forum_detail_id, victim_name, COALESCE(industry, '') AS industry, COALESCE(region, '') AS region
        FROM forum_victims
        """, 'forum_detail_id, victim_name, industry, region, id')
    digest = sha1()
    tagged_industry_count = 0
    tagged_region_count = 0
    count = 0
    for row in rows:
        payload = dict(row)
        payload.pop('id')
        count += 1
        digest.update(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        if payload["industry"] not in {"", "other", "unknown"}:
            tagged_industry_count += 1
        if payload["region"] not in {"", "unknown"}:
            tagged_region_count += 1
    return {
        "count": count,
        "content_hash": digest.hexdigest(),
        "tagged_industry_count": tagged_industry_count,
        "tagged_region_count": tagged_region_count,
    }


def _source_signature_payload(connection) -> dict[str, Any]:
    forum_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(fetched_at) AS latest_at
        FROM forum_details
        """
    ).fetchone()
    victim_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(COALESCE(published_at_utc, '')) AS latest_at
        FROM victims
        """
    ).fetchone()
    victim_detail_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(fetched_at_utc) AS latest_at
        FROM victim_details
        """
    ).fetchone()
    vulnerability_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(disclosure_time) AS latest_at, MAX(last_seen_at) AS latest_seen_at
        FROM vulnerability_records
        """
    ).fetchone()
    ransomware_live_stats = connection.execute(
        """SELECT COUNT(*) AS count, MAX(id) AS max_id,
                  MAX(last_seen_at) AS latest_at FROM ransomware_live_victims"""
    ).fetchone()
    document_hit_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(last_seen_at) AS latest_at
        FROM document_hits
        """
    ).fetchone()
    document_snapshot_stats = connection.execute(
        """
        SELECT COUNT(*) AS count, MAX(id) AS max_id, MAX(fetched_at) AS latest_at
        FROM document_hit_snapshots
        """
    ).fetchone()
    return {
        "normalization_version": NORMALIZATION_VERSION,
        "forum_details": dict(forum_stats),
        "forum_artifacts": _forum_artifact_signature(connection),
        "forum_victims": _forum_victim_signature(connection),
        "victims": dict(victim_stats),
        "victim_details": dict(victim_detail_stats),
        "vulnerability_records": dict(vulnerability_stats),
        "ransomware_live_victims": dict(ransomware_live_stats),
        "document_hits": dict(document_hit_stats),
        "document_hit_snapshots": dict(document_snapshot_stats),
    }


def _build_source_signature(connection) -> str:
    payload = {
        "version": NORMALIZATION_SCHEMA_VERSION,
        **_source_signature_payload(connection),
    }
    return sha1(_json_dumps(payload).encode("utf-8")).hexdigest()


def _normalized_event_count(connection) -> int:
    row = connection.execute("SELECT COUNT(*) AS count FROM normalized_intelligence_events").fetchone()
    return int(row["count"]) if row else 0


def should_refresh_normalized_intelligence(connection) -> bool:
    try:
        cache_state = get_normalized_intelligence_cache_state(connection)
        current_signature = _build_source_signature(connection)
        current_event_count = _normalized_event_count(connection)
    except sqlite3.DatabaseError:
        return _normalized_event_count(connection) == 0
    if cache_state is None:
        return True
    if cache_state.get("source_signature") != current_signature:
        return True
    if int(cache_state.get("event_count") or 0) != current_event_count:
        return True
    return False


def _try_acquire_normalized_refresh_lock(connection) -> tuple[bool, bool]:
    if getattr(connection, "backend_name", "") == "postgresql":
        row = connection.execute(
            "SELECT pg_try_advisory_xact_lock(?) AS acquired",
            (NORMALIZED_REFRESH_ADVISORY_LOCK_ID,),
        ).fetchone()
        return bool(row and row["acquired"]), False
    return _NORMALIZED_REFRESH_LOCK.acquire(blocking=False), True


def _load_normalized_rows_without_refresh(connection) -> list[dict[str, Any]]:
    return [_hydrate_event_row(row) for row in list_normalized_intelligence_events(connection)]


def _forum_rows(connection) -> Iterator[dict[str, Any]]:
    return _normalization_rows(connection,
        """
        SELECT d.id, d.site_name, d.section, d.topic_url, d.content_hash, d.content, d.attachments,
               d.victims, d.attackers, d.timestamps, d.fetched_at, d.raw_json,
               COALESCE(t.title, d.topic_url) AS title,
               GROUP_CONCAT(fv.victim_name, '||') AS victim_names,
               GROUP_CONCAT(COALESCE(fv.industry, ''), '||') AS industries,
               GROUP_CONCAT(COALESCE(fv.region, ''), '||') AS regions
        FROM forum_details d
        LEFT JOIN forum_topics t
          ON t.site_name = d.site_name
         AND t.section = d.section
         AND t.url = d.topic_url
        LEFT JOIN forum_victims fv
          ON fv.forum_detail_id = d.id
        GROUP BY d.id, t.title
        """, 'id DESC', ('content', 'raw_json', 'attachments', 'victims', 'attackers', 'timestamps',
                       'title', 'victim_names', 'industries', 'regions'))


def _victim_rows(connection) -> Iterator[dict[str, Any]]:
    return _normalization_rows(connection,
        """
        SELECT v.id, v.site_name, v.source_url, v.detail_url, v.name, v.display_label, v.domain,
               v.status, v.published_at_utc, v.claimed_size, v.claimed_size_gb, v.content_hash,
               v.raw_json, vd.text_excerpt, vd.page_title, vd.outbound_link_count, vd.fetched_at_utc,
               cr.collected_at_utc AS last_seen_at_utc, vd.raw_json AS detail_raw_json
        FROM victims v
        LEFT JOIN collection_runs cr ON cr.id = v.last_seen_run_id
        LEFT JOIN victim_details vd
          ON vd.id = (
              SELECT vd2.id
              FROM victim_details vd2
              WHERE vd2.victim_id = v.id
              ORDER BY datetime(vd2.fetched_at_utc) DESC, vd2.id DESC
              LIMIT 1
          )
        """, 'id DESC', ('raw_json', 'detail_raw_json', 'text_excerpt', 'page_title', 'name', 'display_label'))


def _ransomware_live_rows(connection) -> Iterator[dict[str, Any]]:
    return _normalization_rows(connection,
        """SELECT id, victim_id, group_name, victim_name, website, country_code, activity,
                  discovered_at, attacked_at, post_url, permalink, screenshot_url,
                  description, press_url, raw_json, last_seen_at
           FROM ransomware_live_victims""",
        'datetime(COALESCE(attacked_at, discovered_at)) DESC, id DESC', ('description', 'raw_json'))


def _vulnerability_rows(connection) -> Iterator[dict[str, Any]]:
    return _normalization_rows(connection,
        """
        SELECT id, source_name, source_type, cve_id, title, vendor, product, vulnerability_type,
               severity, cvss, is_exploited, has_poc, patch_available, wide_impact,
               disclosure_time, affected_versions, summary, advisory_url, reference_urls_json,
               raw_json, last_seen_at
        FROM vulnerability_records
        """, 'datetime(disclosure_time) DESC, id DESC', ('summary', 'raw_json', 'reference_urls_json', 'affected_versions'))


def _document_hit_rows(connection) -> list[dict[str, Any]]:
    return list_document_hits(connection, limit=None)


def _build_forum_base_event(row: dict[str, Any], domain_cache: dict[str, Any] | None = None) -> dict[str, Any]:
    title = _normalize_label(row.get("title")) or _normalize_label(row.get("topic_url")) or "Untitled forum post"
    content = _normalize_whitespace(row.get("content"))
    topic_url = _normalize_label(row.get("topic_url"))
    raw_json = forum_artifact_payload(row)
    disclosure_time = (
        raw_json.get("published_at_utc")
        or _normalize_forum_timestamp(
            row.get("site_name"),
            raw_json.get("timestamp") or row.get("timestamps"),
            collected_at_utc=row.get("fetched_at"),
        )
        or row.get("fetched_at")
        or ""
    )
    topic_url = _normalize_label(row.get("topic_url"))
    victim_names = [item for item in str(row.get("victim_names") or "").split("||") if _normalize_label(item)]
    victim_candidates = victim_names[:]
    victims_field = _normalize_label(row.get("victims"))
    if victims_field:
        victim_candidates.extend(part for part in victims_field.split(",") if _normalize_label(part))
    domain_candidates = _filter_country_candidate_domains(
        _extract_domains(title, content, victims_field),
        topic_url,
    )
    victim, victim_key = _pick_primary_victim(victim_candidates, title, content, domain_candidates)
    attacker_candidates = clean_extracted_attackers(
        [_normalize_label(item) for item in str(row.get("attackers") or "").split(",") if _normalize_label(item)]
    )
    attacker = attacker_candidates[0] if attacker_candidates else _label_source(row.get("site_name"))
    industry_candidates = [
        _label_industry(item)
        for item in str(row.get("industries") or "").split("||")
        if _normalize_label(item) and _label_industry(item) not in {"Unknown", "Other"}
    ]
    region_candidates = [
        _label_region(item)
        for item in str(row.get("regions") or "").split("||")
        if _normalize_label(item) and _label_region(item) != "Unknown"
    ]
    industry_bundle = _infer_industry_bundle(
        ("title", 7, title),
        ("content", 5, content),
        ("victim", 4, victim),
        ("domains", 3, " ".join(domain_candidates)),
    )
    industry = industry_candidates[0] if industry_candidates else industry_bundle["industry"]
    if industry_bundle["industry"] != "Unknown" and industry_bundle["score"] >= 8 and industry in {"Unknown", "Other", "Government"}:
        industry = industry_bundle["industry"]
    geo_bundle = _infer_country_bundle(
        ("title", 9, title),
        ("content", 6, content),
        ("victim", 5, victim),
        ("domains", 4, " ".join(domain_candidates)),
    )
    primary_domain = _pick_primary_domain(victim, " ".join(domain_candidates))
    if domain_cache is not None and primary_domain and (geo_bundle["country"] == "Unknown" or industry_bundle["industry"] == "Unknown"):
        enrichment = _enrich_domain(primary_domain, domain_cache, allow_ip_geo=False)
        if enrichment and geo_bundle["country"] == "Unknown" and enrichment.get("country") not in {"", "Unknown"}:
            geo_bundle = {
                "country": enrichment["country"],
                "country_code": enrichment.get("country_code") or "",
                "macro_region": enrichment.get("macro_region") or "Unknown",
                "source": enrichment.get("country_source") or "domain_cache",
                "score": int(enrichment.get("country_score") or 0),
                "evidence": enrichment.get("country_evidence") or [primary_domain],
            }
        if enrichment and industry_bundle["industry"] == "Unknown" and enrichment.get("industry") not in {"", "Unknown"}:
            industry_bundle = {
                "industry": enrichment["industry"],
                "source": enrichment.get("industry_source") or "domain_cache",
                "score": int(enrichment.get("industry_score") or 0),
            }
            if industry in {"Unknown", "Other", "Government"}:
                industry = enrichment["industry"]
    region = geo_bundle["macro_region"] if geo_bundle["country"] != "Unknown" else (region_candidates[0] if region_candidates else geo_bundle["macro_region"])
    leak_type = _classify_forum_leak_type(str(row.get("section") or ""), title, content)
    severity = _severity_from_forum(str(row.get("section") or ""), leak_type)
    mirror_resources = _coerce_resource_list(row.get("attachments"))
    local_resources, screenshot_resources = _forum_output_resources(row)
    mirror_resources.extend(local_resources)
    if topic_url:
        mirror_resources.append({"label": "Original disclosure link", "url": topic_url})
    event = {
        "event_id": f"forum:{row['site_name']}:{row['section']}:{_event_hash(topic_url)}",
        "_artifact_snapshot": True,
        "source_kind": "forum",
        "raw_source_type": "forum_details",
        "source_site_name": str(row.get("site_name") or ""),
        "source_record_id": int(row["id"]),
        "event_type": "data_leak",
        "category": leak_type,
        "leak_type": leak_type,
        "title": title,
        "attacker": attacker,
        "victim": victim,
        "victim_key": victim_key,
        "industry": industry,
        "country": geo_bundle["country"],
        "country_code": geo_bundle["country_code"],
        "region": region,
        "disclosure_time": disclosure_time,
        "severity": severity,
        "source_url": topic_url,
        "detail_text": content,
        "mirror_resources": mirror_resources,
        "screenshot_resources": screenshot_resources,
        "json_preview_url": next((item["url"] for item in mirror_resources if item["url"].endswith(".json")), ""),
    }
    confidence_score, completeness_score = _build_quality_scores(event, geo_bundle, industry_bundle)
    return {
        **event,
        "confidence_score": confidence_score,
        "completeness_score": completeness_score,
        "metadata": {
            "section": str(row.get("section") or ""),
            "source": str(row.get("site_name") or ""),
            "source_label": _label_source(row.get("site_name")),
            **({"content_access": raw_json["content_access"]} if raw_json.get("content_access") in ("public", "partial") else {}),
            "updated_time": row.get("fetched_at") or disclosure_time,
            "victim_candidates": _clean_entity_candidates(victim_candidates)[:8],
            "domain_candidates": domain_candidates[:8],
            "published_label": _format_date(disclosure_time),
            "resource_count": len(mirror_resources),
            "country_source": geo_bundle["source"],
            "country_score": geo_bundle["score"],
            "country_evidence": geo_bundle["evidence"],
            "industry_source": industry_bundle["source"],
            "industry_score": industry_bundle["score"],
            "tag_sources": [geo_bundle["source"], industry_bundle["source"]],
            "entity_link_evidence": {
                "match_method": "domain_or_title",
                "matched_fields": [name for name, value in {"title": title, "content": content, "victim": victim}.items() if value],
                "domain_candidates": domain_candidates[:5],
                "primary_domain": primary_domain,
            },
            "risk_reasons": [],
            "raw_json": raw_json,
        },
    }


def _pick_victim_from_row(row: dict[str, Any], raw_json: dict[str, Any]) -> tuple[str, str]:
    name = _normalize_label(row.get("name")) or _normalize_label(raw_json.get("name"))
    display_label = _normalize_label(row.get("display_label"))
    domain_candidates = _extract_domains(
        name,
        display_label,
        str(row.get("domain") or ""),
        str(raw_json.get("website_url") or ""),
        str(raw_json.get("location") or ""),
    )
    if name and name.lower() != "unknown":
        victim_key = _normalize_domain(name) if _looks_like_domain(name) else _canonical_key(name)
        return name, victim_key
    for domain in domain_candidates:
        if not _is_noisy_domain(domain):
            return domain, domain
    return "Unknown entity", "unknown"


def _build_victim_base_event(row: dict[str, Any], domain_cache: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_json = _parse_json(row.get("raw_json"))
    detail_raw_json = victim_artifact_payload(row)
    victim, victim_key = _pick_victim_from_row(row, raw_json)
    attacker = _label_source(row.get("site_name"))
    status = _normalize_label(row.get("status") or raw_json.get("status") or "unknown").lower()
    category = STATUS_LABELS.get(status, _normalize_label(row.get("status")) or "Unknown")
    detail_text = _normalize_whitespace(row.get("text_excerpt") or detail_raw_json.get("text_excerpt") or raw_json.get("description"))
    detail_url = _normalize_label(row.get("detail_url") or raw_json.get("detail_url"))
    website_url = _normalize_label(
        raw_json.get("website_url") or detail_raw_json.get("website") or raw_json.get("website")
    )
    if website_url and not re.match(r"^[a-z][a-z0-9+.-]*://", website_url, re.IGNORECASE):
        website_url = f"https://{website_url.lstrip('/')}"
    location = _normalize_label(raw_json.get("location"))
    source_url = _normalize_label(row.get("source_url") or raw_json.get("source_url"))
    disclosure_url = detail_url or source_url
    domain = _normalize_label(row.get("domain"))
    title = _normalize_label(row.get("display_label")) or victim
    industry_bundle = _infer_industry_bundle(
        ("title", 7, title),
        ("description", 6, _normalize_label(raw_json.get("description"))),
        ("website", 4, website_url),
        ("detail", 5, detail_text),
        ("victim", 4, victim),
    )
    industry = industry_bundle["industry"]
    geo_bundle = _infer_country_bundle(
        ("title", 8, title),
        ("description", 6, _normalize_label(raw_json.get("description"))),
        ("location", 7, location),
        ("website", 5, website_url),
        ("domain", 5, domain),
        ("detail", 5, detail_text),
        ("victim", 4, victim),
    )
    primary_domain = _pick_primary_domain(domain, website_url, victim)
    if domain_cache is not None and primary_domain and (geo_bundle["country"] == "Unknown" or industry_bundle["industry"] == "Unknown"):
        enrichment = _enrich_domain(primary_domain, domain_cache)
        if enrichment and geo_bundle["country"] == "Unknown" and enrichment.get("country") not in {"", "Unknown"}:
            geo_bundle = {
                "country": enrichment["country"],
                "country_code": enrichment.get("country_code") or "",
                "macro_region": enrichment.get("macro_region") or "Unknown",
                "source": enrichment.get("country_source") or "domain_cache",
                "score": int(enrichment.get("country_score") or 0),
                "evidence": enrichment.get("country_evidence") or [primary_domain],
            }
        if enrichment and industry_bundle["industry"] == "Unknown" and enrichment.get("industry") not in {"", "Unknown"}:
            industry_bundle = {
                "industry": enrichment["industry"],
                "source": enrichment.get("industry_source") or "domain_cache",
                "score": int(enrichment.get("industry_score") or 0),
            }
            if industry == "Unknown":
                industry = enrichment["industry"]
    region = geo_bundle["macro_region"]
    severity = _severity_from_status(status)
    local_resources, local_screenshots = _victim_output_resources(row, raw_json, detail_raw_json)
    mirror_resources = _coerce_resource_list(detail_url)
    mirror_resources.extend(local_resources)
    screenshot_resources = _coerce_resource_list(raw_json.get("thumbnails"))
    screenshot_resources.extend(local_screenshots)
    last_seen_at = row.get("last_seen_at_utc") or row.get("fetched_at_utc") or ""
    disclosure_time = row.get("published_at_utc") or row.get("fetched_at_utc") or last_seen_at
    if isinstance(disclosure_time, str) and disclosure_time.strip().upper() in {"PUBLISHED", "GOING", "TRANSFERING", "TRANSFERRING", "STOPPED"}:
        disclosure_time = row.get("fetched_at_utc") or last_seen_at
    event = {
        "event_id": f"victim:{row['site_name']}:{_event_hash(str(detail_url or victim))}",
        "_artifact_snapshot": True,
        "source_kind": "victim",
        "raw_source_type": "victims",
        "source_site_name": str(row.get("site_name") or ""),
        "source_record_id": int(row["id"]),
        "event_type": "ransomware",
        "category": category,
        "leak_type": "Ransomware disclosure",
        "title": title,
        "attacker": attacker,
        "victim": victim,
        "victim_key": victim_key,
        "industry": industry,
        "country": geo_bundle["country"],
        "country_code": geo_bundle["country_code"],
        "region": region,
        "disclosure_time": disclosure_time,
        "severity": severity,
        "source_url": disclosure_url,
        "detail_text": detail_text,
        "mirror_resources": mirror_resources,
        "screenshot_resources": screenshot_resources,
        "json_preview_url": next((item["url"] for item in mirror_resources if item["url"].endswith(".json")), ""),
    }
    confidence_score, completeness_score = _build_quality_scores(event, geo_bundle, industry_bundle)
    return {
        **event,
        "confidence_score": confidence_score,
        "completeness_score": completeness_score,
        "metadata": {
            "status": status,
            "claimed_size": _normalize_label(row.get("claimed_size")),
            "claimed_size_gb": row.get("claimed_size_gb"),
            "source": str(row.get("site_name") or ""),
            "source_label": _label_source(row.get("site_name")),
            "updated_time": last_seen_at or detail_raw_json.get("fetched_at_utc") or disclosure_time,
            "published_label": _format_date(disclosure_time),
            "website_url": website_url,
            "resource_count": len(mirror_resources),
            "country_source": geo_bundle["source"],
            "country_score": geo_bundle["score"],
            "country_evidence": geo_bundle["evidence"],
            "industry_source": industry_bundle["source"],
            "industry_score": industry_bundle["score"],
            "tag_sources": [geo_bundle["source"], industry_bundle["source"]],
            "entity_link_evidence": {
                "match_method": "display_label_or_domain",
                "matched_fields": [name for name, value in {"display_label": row.get("display_label"), "domain": domain, "detail": detail_text}.items() if value],
                "domain_candidates": [item for item in [domain, _normalize_domain(victim)] if item],
                "primary_domain": primary_domain,
            },
            "risk_reasons": [],
            "raw_json": raw_json,
        },
    }


def _build_ransomware_live_base_event(row: dict[str, Any], domain_cache: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_json = _parse_json(row.get("raw_json"))
    attacker = _normalize_label(row.get("group_name")) or "ransomware.live"
    victim_name = _normalize_label(row.get("victim_name"))
    website = _normalize_label(row.get("website"))
    victim = victim_name or website or "Unknown entity"
    victim_key = _normalize_domain(website or victim) if _looks_like_domain(website or victim) else _canonical_key(victim)
    title = victim
    detail_text = _normalize_whitespace(row.get("description"))
    country_code = _normalize_label(row.get("country_code")).upper()
    country = _label_country(country_code) if country_code else "Unknown"
    region = _region_from_country_code(country_code) if country_code else "Unknown"
    industry_label = _label_industry(row.get("activity"))
    industry_bundle = _infer_industry_bundle(
        ("attacker", 5, attacker),
        ("victim", 5, victim),
        ("website", 5, website),
        ("detail", 6, detail_text),
        ("activity", 7, industry_label),
    )
    industry = industry_label if industry_label not in {"Unknown", "Other", "Not Found"} else industry_bundle["industry"]

    primary_domain = _pick_primary_domain(website, victim)
    geo_bundle = {
        "country": country,
        "country_code": country_code,
        "macro_region": region,
        "source": "country_code" if country_code else "unknown",
        "score": 18 if country_code else 0,
        "evidence": [country_code] if country_code else [],
    }
    if domain_cache is not None and primary_domain and geo_bundle["country"] == "Unknown":
        enrichment = _enrich_domain(primary_domain, domain_cache)
        if enrichment and enrichment.get("country") not in {"", "Unknown"}:
            geo_bundle = {
                "country": enrichment["country"],
                "country_code": enrichment.get("country_code") or "",
                "macro_region": enrichment.get("macro_region") or "Unknown",
                "source": enrichment.get("country_source") or "domain_cache",
                "score": int(enrichment.get("country_score") or 0),
                "evidence": enrichment.get("country_evidence") or [primary_domain],
            }
        if enrichment and industry in {"Unknown", "Other"} and enrichment.get("industry") not in {"", "Unknown"}:
            industry = enrichment["industry"]
            industry_bundle = {
                "industry": enrichment["industry"],
                "source": enrichment.get("industry_source") or "domain_cache",
                "score": int(enrichment.get("industry_score") or 0),
            }

    disclosure_time = row.get("attacked_at") or row.get("discovered_at") or row.get("last_seen_at") or ""
    mirror_resources = _coerce_resource_list(
        [
            {"label": "Original disclosure page", "url": _normalize_label(row.get("post_url"))},
            {"label": "Detail link", "url": _normalize_label(row.get("permalink"))},
            {"label": "News link", "url": _normalize_label(row.get("press_url"))},
        ]
    )
    screenshot_resources = _coerce_resource_list(
        [{"label": "Screenshot", "url": _normalize_label(row.get("screenshot_url"))}]
    )

    event = {
        "event_id": f"ransomware-live:{_normalize_label(row.get('victim_id')) or row.get('id')}",
        "source_kind": "victim",
        "raw_source_type": "ransomware_live_victims",
        "source_site_name": "ransomware_live",
        "source_record_id": int(row["id"]),
        "event_type": "ransomware",
        "category": "Published",
        "leak_type": "Ransomware disclosure",
        "title": title,
        "attacker": attacker,
        "victim": victim,
        "victim_key": victim_key,
        "industry": industry,
        "country": geo_bundle["country"],
        "country_code": geo_bundle["country_code"],
        "region": geo_bundle["macro_region"],
        "disclosure_time": disclosure_time,
        "severity": "critical",
        "source_url": _normalize_label(row.get("permalink")) or _normalize_label(row.get("post_url")),
        "detail_text": detail_text,
        "mirror_resources": mirror_resources,
        "screenshot_resources": screenshot_resources,
        "json_preview_url": "",
    }
    confidence_score, completeness_score = _build_quality_scores(event, geo_bundle, industry_bundle)
    return {
        **event,
        "confidence_score": confidence_score,
        "completeness_score": completeness_score,
        "metadata": {
            "source": "ransomware.live",
            "source_label": "ransomware.live",
            "raw_source_type_label": "ransomware.live Victim records",
            "updated_time": row.get("last_seen_at") or disclosure_time,
            "published_label": _format_date(disclosure_time),
            "resource_count": len(mirror_resources),
            "country_source": geo_bundle["source"],
            "country_score": geo_bundle["score"],
            "country_evidence": geo_bundle["evidence"],
            "industry_source": industry_bundle["source"],
            "industry_score": industry_bundle["score"],
            "tag_sources": [geo_bundle["source"], industry_bundle["source"]],
            "entity_link_evidence": {
                "match_method": "victim_name_or_website",
                "matched_fields": [name for name, value in {"victim_name": victim_name, "website": website, "description": detail_text}.items() if value],
                "domain_candidates": [item for item in [primary_domain, _normalize_domain(victim)] if item],
                "primary_domain": primary_domain,
            },
            "victim_id": _normalize_label(row.get("victim_id")),
            "website": website,
            "activity": _normalize_label(row.get("activity")),
            "risk_reasons": [],
            "raw_json": raw_json,
        },
    }


VENDOR_HOST_HINTS = {
    "helpx.adobe.com": "Adobe",
    "sec.cloudapps.cisco.com": "Cisco",
    "access.redhat.com": "Red Hat",
    "msrc.microsoft.com": "Microsoft",
    "me.sap.com": "SAP",
    "plugins.trac.wordpress.org": "WordPress plugin",
    "wordpress.org": "WordPress plugin",
}


def _humanize_vendor_name(value: str | None) -> str:
    raw = _normalize_label(value)
    if not raw:
        return ""
    return " ".join(part.capitalize() if part.islower() else part for part in raw.replace("_", " ").replace("-", " ").split())


def _infer_vendor_product_from_advisory_url(url: str | None) -> tuple[str, str]:
    parsed = urlparse(str(url or "").strip())
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.strip("/")
    if not host:
        return "", ""

    vendor = VENDOR_HOST_HINTS.get(host, "")
    product = ""

    if host == "plugins.trac.wordpress.org":
        match = re.search(r"/browser/([^/]+)/", f"/{path}/", re.IGNORECASE)
        if match:
            product = humanize_product_token(match.group(1))
    elif host == "github.com":
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 2:
            vendor = _humanize_vendor_name(parts[0]) or vendor
            product = humanize_product_token(parts[1])
    elif host == "helpx.adobe.com":
        match = re.search(r"/products/([^/]+)/", f"/{path}/", re.IGNORECASE)
        if match:
            product = humanize_product_token(match.group(1))
    elif host == "sec.cloudapps.cisco.com":
        slug = path.lower()
        if "-ise-" in slug or "ise-" in slug:
            product = "Cisco ISE"
        elif "webex" in slug:
            product = "Cisco Webex"

    return vendor, product


def _infer_vendor_product_from_text(title: str, summary: str) -> tuple[str, str]:
    text = " ".join(part for part in [title, summary] if part).strip()
    if not text:
        return "", ""

    patterns = [
        (r"WordPress 的 ([^，。]+?) 插件", "WordPress 插件", None),
        (r"Openfind开发的([A-Za-z0-9/_ .-]+)", "Openfind", None),
        (r"(?:思科|Cisco)\s*身份服务引擎\s*\(ISE\)", "Cisco", "Cisco ISE"),
        (r"(?:思科|Cisco)\s*ISE(?:-PIC)?", "Cisco", "Cisco ISE"),
        (r"(?:思科|Cisco)\s*Webex", "Cisco", "Cisco Webex"),
        (r"Adobe\s+Connect", "Adobe", "Adobe Connect"),
        (r"ColdFusion", "Adobe", "ColdFusion"),
        (r"ArgoCD 图像更新程序", "ArgoCD", "ArgoCD Image Updater"),
        (r"Gravity\s+[0-9]", "", "Gravity"),
        (r"MailGates/MailAudit", "Openfind", "MailGates/MailAudit"),
    ]

    for pattern, vendor, product in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        if product is None and match.groups():
            product = humanize_product_token(match.group(1))
        return vendor, product or ""

    return "", ""


def _resolve_vulnerability_vendor_product(row: dict[str, Any], raw_json: dict[str, Any]) -> tuple[str, str]:
    vendor = _normalize_label(row.get("vendor") or raw_json.get("vendor"))
    product = _normalize_label(row.get("product") or raw_json.get("product"))
    advisory_url = _normalize_label(row.get("advisory_url") or raw_json.get("advisory_url"))
    title = _normalize_label(row.get("title") or raw_json.get("title"))
    summary = _normalize_whitespace(row.get("summary") or raw_json.get("summary"))

    inferred_vendor_url, inferred_product_url = _infer_vendor_product_from_advisory_url(advisory_url)
    inferred_vendor_text, inferred_product_text = _infer_vendor_product_from_text(title, summary)

    resolved_vendor = vendor or inferred_vendor_text or inferred_vendor_url or "Unknown vendor"
    resolved_product = product or inferred_product_text or inferred_product_url or "Unknown product"
    return resolved_vendor, translate_product_name(resolved_product)


def _build_vulnerability_base_event(row: dict[str, Any]) -> dict[str, Any]:
    raw_json = _parse_json(row.get("raw_json"))
    display_summary, original_summary = resolve_vulnerability_summary(row, raw_json)
    source_name = _normalize_label(row.get("source_name")).lower()
    source_label = _label_source(source_name)
    vendor, product = _resolve_vulnerability_vendor_product({**row, "summary": display_summary}, raw_json)
    cve_id = _normalize_label(row.get("cve_id")).upper()
    vulnerability_type = translate_vulnerability_type(_normalize_label(row.get("vulnerability_type")) or "Public-source vulnerability")
    original_title = _normalize_label(row.get("title")) or f"{cve_id} {vendor} {product}"
    title = translate_vulnerability_title(original_title, vendor=vendor, product=product)
    summary = translate_vulnerability_summary(display_summary)
    summary_unavailable = not summary and any(
        is_translation_error(value)
        for value in (row.get("summary"), raw_json.get("summary"), raw_json.get("original_summary"))
    )
    affected_versions = _coerce_string_list(row.get("affected_versions"))
    affected_version_items = build_affected_version_items(affected_versions)
    raw_reference_urls = [item.get("url") for item in _coerce_resource_list(_parse_json(row.get("reference_urls_json"))) if item.get("url")]
    advisory_url = _normalize_label(row.get("advisory_url"))
    if advisory_url:
        raw_reference_urls.insert(0, advisory_url)
    reference_urls = build_reference_link_entries(raw_reference_urls, vendor=vendor)
    severity = _severity_from_vulnerability(
        str(row.get("severity") or ""),
        row.get("cvss"),
        _coerce_bool(row.get("is_exploited")),
    )
    return {
        "event_id": f"vuln:{cve_id.lower()}",
        "source_kind": "vulnerability",
        "raw_source_type": "vulnerability_records",
        "source_site_name": source_name,
        "source_record_id": int(row["id"]),
        "event_type": "vulnerability",
        "category": vulnerability_type,
        "leak_type": "Vulnerability alerts",
        "title": title,
        "attacker": vendor,
        "victim": product,
        "victim_key": _canonical_key(product),
        "industry": "Infrastructure software",
        "region": "Global",
        "disclosure_time": row.get("disclosure_time") or "",
        "severity": severity,
        "source_url": advisory_url or next((item["url"] for item in reference_urls if item.get("url")), ""),
        "detail_text": summary,
        "mirror_resources": reference_urls,
        "screenshot_resources": [],
        "json_preview_url": "",
        "metadata": {
            "source": "Multi-source aggregation" if len(reference_urls) > 1 else source_label,
            "source_name": source_name,
            "source_label": source_label,
            "source_labels": [source_label],
            "source_names": [source_name] if source_name else [],
            "updated_time": row.get("last_seen_at") or row.get("disclosure_time") or "",
            "source_type": _normalize_label(row.get("source_type")) or "public",
            "source_type_label": humanize_source_type(row.get("source_type")),
            "raw_source_type_label": humanize_raw_source_type("vulnerability_records"),
            "cve_id": cve_id,
            "vendor": vendor,
            "product": product,
            "original_title": original_title,
            "original_summary": original_summary,
            "summary": summary,
            "summary_unavailable": summary_unavailable,
            "cvss": row.get("cvss"),
            "is_exploited": _coerce_bool(row.get("is_exploited")),
            "has_poc": _coerce_bool(row.get("has_poc")),
            "patch_available": _coerce_bool(row.get("patch_available")),
            "wide_impact": _coerce_bool(row.get("wide_impact")),
            "affected_versions": affected_versions,
            "affected_version_items": affected_version_items,
            "reference_urls": reference_urls,
            "published_label": _format_dt(row.get("disclosure_time")),
            "resource_count": len(reference_urls),
            "risk_reasons": [],
            "raw_json": raw_json,
        },
    }


def _compute_spike_counters(events: list[dict[str, Any]], field: str) -> tuple[Counter[str], Counter[str]]:
    recent_cutoff = _now_utc() - timedelta(days=SPIKE_WINDOW_DAYS)
    previous_cutoff = _now_utc() - timedelta(days=SPIKE_WINDOW_DAYS * 2)
    recent_counter: Counter[str] = Counter()
    previous_counter: Counter[str] = Counter()
    for event in events:
        label = _normalize_label(event.get(field))
        if not label or label == "Unknown":
            continue
        event_dt = _parse_dt(str(event.get("disclosure_time") or ""))
        if event_dt is None:
            continue
        if event_dt >= recent_cutoff:
            recent_counter[label] += 1
        elif event_dt >= previous_cutoff:
            previous_counter[label] += 1
    return recent_counter, previous_counter


def _score_events(events: list[dict[str, Any]], *, statistics=None, recent_cutoff=None) -> None:
    if statistics is None:
        actor_counter = Counter(event["attacker"] for event in events if event["attacker"] and event["attacker"] != "Unknown")
        victim_counter = Counter(event["victim_key"] for event in events if event["victim_key"] and event["victim_key"] != "unknown")
        actor_sites: defaultdict[str, set[str]] = defaultdict(set)
        for event in events:
            actor_sites[event["attacker"]].add(event["source_site_name"])
        actor_site_counts = {actor: len(sites) for actor, sites in actor_sites.items()}
        industry_recent, industry_previous = _compute_spike_counters(events, "industry")
        region_recent, region_previous = _compute_spike_counters(events, "region")
    else:
        (actor_counter, victim_counter, actor_site_counts, industry_recent, industry_previous,
         region_recent, region_previous) = statistics
    recent_cutoff = recent_cutoff or _recent_cutoff()
    severity_points = {"critical": 30, "high": 20, "medium": 12, "low": 6}

    for event in events:
        score = severity_points.get(event["severity"], 8)
        reasons: list[str] = []
        if event["severity"] == "critical":
            reasons.append("High-risk disclosure event present")
        elif event["severity"] == "high":
            reasons.append("Belongs to a high-risk event type")

        if event["event_type"] == "vulnerability":
            metadata = event["metadata"]
            cvss = metadata.get("cvss")
            try:
                cvss_value = float(cvss) if cvss not in {None, ""} else None
            except (TypeError, ValueError):
                cvss_value = None
            if metadata.get("is_exploited"):
                score += 22
                reasons.append("Vulnerability has public exploitation activity")
            if metadata.get("has_poc"):
                score += 10
                reasons.append("A public PoC or exploit sample exists")
            if metadata.get("wide_impact"):
                score += 8
                reasons.append("Wide range of affected versions")
            if not metadata.get("patch_available"):
                score += 8
                reasons.append("Patch not yet available or only mitigations exist")
            if cvss_value is not None and cvss_value >= 9.5:
                score += 6
                reasons.append("CVSS Metrics near maximum score")
        elif event["leak_type"] in {"Credential leak", "Source code leak", "Database leak", "Ransomware disclosure"}:
            score += 10
            reasons.append(f"Matched key intelligence type:{event['leak_type']}")

        actor = event["attacker"]
        actor_count = actor_counter.get(actor, 0)
        if event["event_type"] != "vulnerability" and actor_count >= 2:
            score += min(18, actor_count * 4)
            reasons.append("The same entity appeared repeatedly recently")

        if event["event_type"] != "vulnerability" and actor_site_counts.get(actor, 0) >= 2:
            score += 12
            reasons.append("The same entity appeared across sites")

        victim_count = victim_counter.get(event["victim_key"], 0)
        if event["event_type"] != "vulnerability" and victim_count >= 2:
            score += min(15, victim_count * 4)
            reasons.append("The same victim entity was exposed repeatedly")

        industry = event["industry"]
        if event["event_type"] != "vulnerability" and industry != "Unknown" and industry_recent.get(industry, 0) >= max(2, industry_previous.get(industry, 0) + 1):
            score += 8
            reasons.append("Activity in the affected industry has risen recently")

        region = event["region"]
        if event["event_type"] != "vulnerability" and region != "Unknown" and region_recent.get(region, 0) >= max(2, region_previous.get(region, 0) + 1):
            score += 6
            reasons.append("Activity in the affected region has risen recently")

        event_dt = _parse_dt(str(event.get("disclosure_time") or ""))
        if event_dt is not None and event_dt >= recent_cutoff:
            score += 6
            reasons.append("Event occurred within the last 72 hours")

        event["risk_score"] = min(score, 100)
        event["metadata"]["risk_reasons"] = reasons[:4]


def _severity_segment_score(event: dict[str, Any]) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 0
    severity = str(event.get("severity") or "medium").lower()
    if severity == "critical":
        score += 14
        reasons.append("rule:Base severity level is critical")
    elif severity == "high":
        score += 10
        reasons.append("rule:Base severity level is high")
    elif severity == "medium":
        score += 6
    else:
        score += 3

    metadata = event.get("metadata") or {}
    if event.get("event_type") == "vulnerability":
        if metadata.get("is_exploited"):
            score += 8
            reasons.append("rule:Vulnerability has public exploitation activity")
        if metadata.get("has_poc"):
            score += 4
            reasons.append("rule:A public PoC or exploit sample exists")
        if metadata.get("wide_impact"):
            score += 2
            reasons.append("rule:Wide range of affected versions")
        if not metadata.get("patch_available"):
            score += 4
            reasons.append("rule:Patch not yet available or only mitigations exist")
        try:
            cvss_value = float(metadata.get("cvss")) if metadata.get("cvss") not in {None, ""} else None
        except (TypeError, ValueError):
            cvss_value = None
        if cvss_value is not None and cvss_value >= 9.5:
            score += 2
            reasons.append("rule:CVSS Metrics near maximum score")
    elif event.get("leak_type") in {"Credential leak", "Source code leak", "Database leak", "Ransomware disclosure"}:
        score += 6
        reasons.append(f"rule:Matched key intelligence type {event.get('leak_type')}")

    return min(score, 30), reasons[:3]


def _asset_segment_score(event: dict[str, Any], profile: dict[str, Any] | None) -> tuple[int, list[str]]:
    if not profile:
        return 0, []
    asset_type = str(profile.get("asset_type") or "Other")
    score = ASSET_SENSITIVITY_POINTS.get(asset_type, 6)
    source_prefix = "llm" if str(profile.get("provider_mode") or "") == "llm" else "rule"
    reasons = [f"{source_prefix}:Identified asset type is {asset_type}"]
    industry = str((profile.get("victim_targeting") or {}).get("industry") or event.get("industry") or "")
    if industry in {"Finance", "Government", "Healthcare"}:
        score = min(20, score + 2)
        reasons.append(f"rule:Victim belongs to a highly sensitive industry {industry}")
    return min(score, 20), reasons[:3]


def _behavior_segment_score(profile: dict[str, Any] | None) -> tuple[int, list[str]]:
    if not profile:
        return 0, []
    intent_type = str(profile.get("intent_type") or "Other")
    operation_stage = str(profile.get("operation_stage") or "Other")
    collaboration_mode = str(profile.get("collaboration_mode") or "Independent operation")
    score = BEHAVIOR_MALIGNANCY_POINTS.get(intent_type, 3)
    score += OPERATION_STAGE_POINTS.get(operation_stage, 0)
    score += COLLABORATION_POINTS.get(collaboration_mode, 0)
    source_prefix = "llm" if str(profile.get("provider_mode") or "") == "llm" else "rule"
    reasons = [f"{source_prefix}:Identified attack intent is {intent_type}"]
    if operation_stage != "Other":
        reasons.append(f"{source_prefix}:Behavior stage is {operation_stage}")
    for tag in profile.get("ttp_tags") or []:
        score += TTP_RISK_POINTS.get(str(tag), 0)
    if profile.get("ttp_tags"):
        reasons.append(f"{source_prefix}:Matched TTP tag {', '.join(profile.get('ttp_tags')[:2])}")
    return min(score, 20), reasons[:4]


def _activity_segment_score(
    event: dict[str, Any],
    actor_counter: Counter[str],
    actor_sites: defaultdict[str, set[str]],
    victim_counter: Counter[str],
    actor_active_days: defaultdict[str, set[str]],
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    actor = str(event.get("attacker") or "")
    if actor and actor != "Unknown":
        actor_count = actor_counter.get(actor, 0)
        if actor_count >= 2:
            score += min(8, actor_count * 2)
            reasons.append("rule:The same entity appeared repeatedly recently")
        if len(actor_sites.get(actor, set())) >= 2:
            score += 6
            reasons.append("rule:The same entity appeared across sites")
        if len(actor_active_days.get(actor, set())) >= 3:
            score += 4
            reasons.append("rule:The same entity has been continuously active across multiple time windows")
    victim_key = str(event.get("victim_key") or "")
    if victim_key and victim_key != "unknown" and victim_counter.get(victim_key, 0) >= 2:
        score += min(6, victim_counter.get(victim_key, 0) * 2)
        reasons.append("rule:The same victim entity was exposed repeatedly")
    return min(score, 20), reasons[:4]


def _urgency_segment_score(
    event: dict[str, Any],
    profile: dict[str, Any] | None,
    industry_recent: Counter[str],
    industry_previous: Counter[str],
    region_recent: Counter[str],
    region_previous: Counter[str],
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    recent_cutoff = _recent_cutoff()
    event_dt = _parse_dt(str(event.get("disclosure_time") or ""))
    if event_dt is not None and event_dt >= recent_cutoff:
        score += 4
        reasons.append("rule:Event occurred within the last 72 hours")
    industry = str(event.get("industry") or "")
    if industry and industry != "Unknown" and industry_recent.get(industry, 0) >= max(2, industry_previous.get(industry, 0) + 1):
        score += 3
        reasons.append(f"rule:Activity in industry {industry} is rising")
    region = str(event.get("region") or "")
    if region and region != "Unknown" and region_recent.get(region, 0) >= max(2, region_previous.get(region, 0) + 1):
        score += 2
        reasons.append(f"rule:Activity in region {region} is rising")
    if profile and str(profile.get("intent_type") or "") == "Spread":
        source_prefix = "llm" if str(profile.get("provider_mode") or "") == "llm" else "rule"
        score += 1
        reasons.append(f"{source_prefix}:Spread/propagation intent identified")
    return min(score, 10), reasons[:4]


def _flatten_risk_reasons(segments: list[dict[str, Any]]) -> list[str]:
    reasons: list[str] = []
    seen: set[str] = set()
    for segment in segments:
        for reason in segment.get("reasons") or []:
            if reason in seen:
                continue
            seen.add(reason)
            reasons.append(str(reason))
    return reasons[:8]


def apply_behavior_risk_overlays(events: list[dict[str, Any]], behavior_profiles: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cloned_events: list[dict[str, Any]] = []
    actor_counter = Counter()
    victim_counter = Counter()
    actor_sites: defaultdict[str, set[str]] = defaultdict(set)
    actor_active_days: defaultdict[str, set[str]] = defaultdict(set)

    for event in events:
        item = {**event, "metadata": dict(event.get("metadata") or {})}
        cloned_events.append(item)
        actor = str(item.get("attacker") or "")
        if actor and actor != "Unknown":
            actor_counter[actor] += 1
            actor_sites[actor].add(str(item.get("source_site_name") or ""))
            event_dt = _parse_dt(str(item.get("disclosure_time") or ""))
            if event_dt is not None:
                actor_active_days[actor].add(event_dt.date().isoformat())
        victim_key = str(item.get("victim_key") or "")
        if victim_key and victim_key != "unknown":
            victim_counter[victim_key] += 1

    industry_recent, industry_previous = _compute_spike_counters(cloned_events, "industry")
    region_recent, region_previous = _compute_spike_counters(cloned_events, "region")

    for event in cloned_events:
        profile = behavior_profiles.get(str(event.get("event_id") or ""))
        event["behavior_profile"] = profile or {}
        event["provider_mode"] = str((profile or {}).get("provider_mode") or "none")

        severity_score, severity_reasons = _severity_segment_score(event)
        asset_score, asset_reasons = _asset_segment_score(event, profile)
        behavior_score, behavior_reasons = _behavior_segment_score(profile)
        activity_score, activity_reasons = _activity_segment_score(
            event,
            actor_counter=actor_counter,
            actor_sites=actor_sites,
            victim_counter=victim_counter,
            actor_active_days=actor_active_days,
        )
        urgency_score, urgency_reasons = _urgency_segment_score(
            event,
            profile,
            industry_recent=industry_recent,
            industry_previous=industry_previous,
            region_recent=region_recent,
            region_previous=region_previous,
        )

        segments = [
            {"key": "base_harm", "label": "Base severity", "score": severity_score, "max_score": 30, "reasons": severity_reasons},
            {"key": "asset_sensitivity", "label": "Asset sensitivity", "score": asset_score, "max_score": 20, "reasons": asset_reasons},
            {"key": "behavior_malignancy", "label": "Behavior severity", "score": behavior_score, "max_score": 20, "reasons": behavior_reasons},
            {"key": "organization_activity", "label": "Group activity", "score": activity_score, "max_score": 20, "reasons": activity_reasons},
            {"key": "urgency_spread", "label": "Urgency and spread", "score": urgency_score, "max_score": 10, "reasons": urgency_reasons},
        ]
        total_score = min(sum(int(segment["score"]) for segment in segments), 100)
        event["risk_score"] = total_score
        event["risk_breakdown"] = {
            "total": total_score,
            "segments": segments,
        }
        event["risk_evidence"] = list((profile or {}).get("evidence_spans") or [])
        event["risk_reasons"] = _flatten_risk_reasons(segments)
        event["metadata"]["risk_reasons"] = event["risk_reasons"]
        event["metadata"]["risk_breakdown"] = event["risk_breakdown"]
        event["metadata"]["provider_mode"] = event["provider_mode"]
    return cloned_events


def _hydrate_event_row(row: dict[str, Any]) -> dict[str, Any]:
    metadata = _parse_json(row.get("event_metadata_json"))
    return {
        **row,
        "mirror_resources": _coerce_resource_list(_parse_json(row.get("mirror_resources_json"))),
        "screenshot_resources": _coerce_resource_list(_parse_json(row.get("screenshot_resources_json"))),
        "risk_reasons": [item for item in _parse_json(row.get("risk_reasons_json")) if isinstance(item, str)],
        "metadata": metadata,
        "source": metadata.get("source") or _label_source(row.get("source_site_name")),
        "country": metadata.get("country") or "Unknown",
        "country_code": metadata.get("country_code") or "",
        "region": metadata.get("macro_region") or row.get("region") or "Unknown",
        "industry": _label_industry(metadata.get("industry") or row.get("industry")),
        "confidence_score": int(metadata.get("confidence_score") or 0),
        "completeness_score": int(metadata.get("completeness_score") or 0),
        "country_source": metadata.get("country_source") or "unknown",
        "industry_source": metadata.get("industry_source") or "unknown",
        "tag_sources": [item for item in metadata.get("tag_sources", []) if isinstance(item, str)],
        "entity_link_evidence": metadata.get("entity_link_evidence") or {},
    }


def _merge_unique_resources(left: list[dict[str, str]], right: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in left + right:
        label = _normalize_label(item.get("label"))
        url = _normalize_label(item.get("url"))
        if not url:
            continue
        signature = (label, url)
        if signature in seen:
            continue
        seen.add(signature)
        merged.append({"label": label or url, "url": url})
    return merged


def _merge_unique_strings(left: list[Any], right: list[Any]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for value in list(left) + list(right):
        normalized = _normalize_label(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)
    return merged


def _merge_event_metadata(existing: dict[str, Any], current: dict[str, Any], *, mirror_resources: list[dict[str, str]]) -> dict[str, Any]:
    existing_meta = existing.get("metadata") or {}
    current_meta = current.get("metadata") or {}
    merged = {
        **existing_meta,
        **current_meta,
    }
    merged["risk_reasons"] = _merge_unique_strings(existing_meta.get("risk_reasons") or [], current_meta.get("risk_reasons") or [])[:4]
    merged["reference_urls"] = _merge_unique_resources(
        existing_meta.get("reference_urls") or [],
        current_meta.get("reference_urls") or [],
    )
    merged["source_labels"] = _merge_unique_strings(existing_meta.get("source_labels") or [], current_meta.get("source_labels") or [])
    merged["source_names"] = _merge_unique_strings(existing_meta.get("source_names") or [], current_meta.get("source_names") or [])
    merged["affected_versions"] = _merge_unique_strings(
        existing_meta.get("affected_versions") or [],
        current_meta.get("affected_versions") or [],
    )
    merged["affected_version_items"] = build_affected_version_items(merged.get("affected_versions") or [])
    if merged.get("source_labels"):
        merged["source"] = "Multi-source aggregation" if len(merged["source_labels"]) > 1 else merged["source_labels"][0]
    merged["is_exploited"] = bool(existing_meta.get("is_exploited") or current_meta.get("is_exploited"))
    merged["has_poc"] = bool(existing_meta.get("has_poc") or current_meta.get("has_poc"))
    merged["patch_available"] = bool(existing_meta.get("patch_available") or current_meta.get("patch_available"))
    merged["wide_impact"] = bool(existing_meta.get("wide_impact") or current_meta.get("wide_impact"))
    existing_cvss = existing_meta.get("cvss")
    current_cvss = current_meta.get("cvss")
    try:
        merged["cvss"] = max(float(existing_cvss or 0), float(current_cvss or 0))
    except (TypeError, ValueError):
        merged["cvss"] = current_cvss or existing_cvss
    merged["resource_count"] = len(mirror_resources)
    return merged


def _merge_duplicate_events(existing: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    def event_priority(event: dict[str, Any]) -> tuple[datetime, int, int, int, int]:
        updated_dt = _parse_dt(_event_updated_time(event))
        disclosure_dt = _parse_dt(str(event.get("disclosure_time") or ""))
        return (
            updated_dt or disclosure_dt or datetime.min.replace(tzinfo=timezone.utc),
            int(event.get("source_record_id") or 0),
            1 if event.get("screenshot_resources") else 0,
            1 if event.get("mirror_resources") else 0,
            len(event.get("detail_text") or ""),
        )

    prefer_current = event_priority(current) >= event_priority(existing)

    primary = current if prefer_current else existing
    secondary = existing if prefer_current else current
    snapshot = bool(primary.get("_artifact_snapshot")) and primary.get("event_type") != "vulnerability"

    if primary.get("event_type") == "vulnerability":
        merged_mirror_resources = _merge_unique_resources(existing.get("mirror_resources") or [], current.get("mirror_resources") or [])
        merged_screenshot_resources = _merge_unique_resources(
            existing.get("screenshot_resources") or [],
            current.get("screenshot_resources") or [],
        )
    elif snapshot:
        merged_mirror_resources = primary.get("mirror_resources") or []
        merged_screenshot_resources = primary.get("screenshot_resources") or []
    else:
        merged_mirror_resources = primary.get("mirror_resources") or secondary.get("mirror_resources") or []
        merged_screenshot_resources = primary.get("screenshot_resources") or secondary.get("screenshot_resources") or []

    merged = {
        **secondary,
        **primary,
    }
    merged["mirror_resources"] = merged_mirror_resources
    merged["screenshot_resources"] = merged_screenshot_resources
    merged["detail_text"] = primary.get("detail_text") or ("" if snapshot else secondary.get("detail_text")) or ""
    merged["json_preview_url"] = primary.get("json_preview_url") or ("" if snapshot else secondary.get("json_preview_url")) or ""
    if not snapshot:
        merged.pop("_artifact_snapshot", None)
    merged["metadata"] = _merge_event_metadata(existing, current, mirror_resources=merged_mirror_resources)
    if snapshot:
        for key in ("section", "raw_json", "updated_time", "content_access"):
            if key in (primary.get("metadata") or {}):
                merged["metadata"][key] = primary["metadata"][key]
            else:
                merged["metadata"].pop(key, None)
    merged["severity"] = max(
        (existing.get("severity"), current.get("severity")),
        key=lambda value: SEVERITY_ORDER.get(str(value or "").lower(), 0),
    )
    merged["risk_score"] = max(int(existing.get("risk_score") or 0), int(current.get("risk_score") or 0))
    return merged


def _stage_normalized_events(connection, spool, domain_cache, enrichment_budget):
    spool.executescript("""
        CREATE TABLE previous_resources(event_id TEXT PRIMARY KEY, mirrors TEXT, screenshots TEXT, preview TEXT);
        CREATE TABLE base_events(
            seq INTEGER PRIMARY KEY, payload TEXT NOT NULL, summary TEXT NOT NULL,
            victim_key TEXT, country_known INTEGER, country_score INTEGER, industry_known INTEGER,
            industry_score INTEGER, confidence INTEGER, disclosure_at TEXT, enrichment_risk INTEGER, candidate INTEGER,
            actor TEXT, site TEXT, industry TEXT, region TEXT, window INTEGER);
        CREATE INDEX country_context_order ON base_events(victim_key, country_known DESC, country_score DESC, confidence DESC, seq);
        CREATE INDEX industry_context_order ON base_events(victim_key, industry_known DESC, industry_score DESC, confidence DESC, seq);
        CREATE TABLE id_events(seq INTEGER PRIMARY KEY, event_id TEXT UNIQUE, payload TEXT NOT NULL);
        CREATE TABLE final_events(seq INTEGER PRIMARY KEY, site TEXT, kind TEXT, title_key TEXT,
            event_id TEXT, report_time TEXT, payload TEXT NOT NULL, UNIQUE(site, kind, title_key));
        CREATE INDEX final_event_order ON final_events(report_time DESC, event_id DESC);
    """)
    logger.info("normalized intelligence refresh phase=previous_resources")
    for row in _normalization_rows(connection,
            'SELECT event_id, mirror_resources_json, screenshot_resources_json, json_preview_url FROM normalized_intelligence_events',
            'event_id', ('mirror_resources_json', 'screenshot_resources_json', 'json_preview_url')):
        spool.execute('INSERT INTO previous_resources VALUES (?, ?, ?, ?)',
                      (row['event_id'], row['mirror_resources_json'], row['screenshot_resources_json'], row['json_preview_url']))
    for rows, build in ((_forum_rows, _build_forum_base_event), (_victim_rows, _build_victim_base_event),
                        (_ransomware_live_rows, _build_ransomware_live_base_event), (_vulnerability_rows, _build_vulnerability_base_event)):
        logger.info("normalized intelligence refresh phase=source source=%s", getattr(rows, '__name__', 'source'))
        for row in rows(connection):
            event = build(row) if build is _build_vulnerability_base_event else build(row, domain_cache=domain_cache)
            metadata = event['metadata']
            summary = {key: event.get(key) for key in ('victim_key', 'country', 'country_code', 'region', 'industry',
                                                      'confidence_score', 'completeness_score')}
            summary['metadata'] = {key: metadata.get(key) for key in ('country_score', 'country_source', 'industry_score', 'industry_source')}
            disclosure = _parse_dt(str(event.get('disclosure_time') or ''))
            spool.execute('INSERT INTO base_events VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0)',
                (_json_dumps(event), _json_dumps(summary), event.get('victim_key') or 'unknown',
                 int(str(event.get('country') or '').strip() not in {'', 'Unknown'}), int(metadata.get('country_score') or 0),
                 int(str(event.get('industry') or '').strip() not in {'', 'Unknown'}), int(metadata.get('industry_score') or 0),
                 int(event.get('confidence_score') or 0),
                 disclosure.astimezone(timezone.utc).isoformat(timespec='microseconds') if disclosure else '',
                 int(event.get('risk_score') or 0),
                 event['attacker'], event['source_site_name'], _normalize_label(event['industry']), _normalize_label(event['region'])))
    logger.info("normalized intelligence refresh phase=entity_context")
    # Keep the first source row on a tie, as max() does on the original ordered list.
    for name, known, score in (('country', 'country_known', 'country_score'), ('industry', 'industry_known', 'industry_score')):
        spool.execute(f"""CREATE TABLE {name}_context AS SELECT victim_key, seq, summary FROM (
            SELECT victim_key, seq, summary, ROW_NUMBER() OVER (
                PARTITION BY victim_key ORDER BY {known} DESC, {score} DESC, confidence DESC, seq) AS rank
            FROM base_events WHERE victim_key <> 'unknown') WHERE rank = 1""")
        spool.execute(f'CREATE UNIQUE INDEX {name}_context_key ON {name}_context(victim_key)')
    for row in spool.execute('''SELECT e.seq, e.payload, c.seq AS country_seq, c.summary AS country_summary,
        i.seq AS industry_seq, i.summary AS industry_summary FROM base_events e
        LEFT JOIN country_context c ON c.victim_key = e.victim_key
        LEFT JOIN industry_context i ON i.victim_key = e.victim_key ORDER BY e.seq'''):
        event = json.loads(row['payload'])
        if row['country_summary'] is not None:
            context = [(row['country_seq'], json.loads(row['country_summary'])),
                       (row['industry_seq'], json.loads(row['industry_summary'])), (row['seq'], event)]
            _propagate_entity_context([item for _, item in sorted(context, key=lambda item: item[0])])
        domain = _normalize_domain((event['metadata'].get('entity_link_evidence') or {}).get('primary_domain') or '')
        candidate = bool(domain and not _is_noisy_domain(domain) and (event.get('country') == 'Unknown' or event.get('industry') == 'Unknown'))
        spool.execute('UPDATE base_events SET payload = ?, candidate = ? WHERE seq = ?', (_json_dumps(event), int(candidate), row['seq']))
    domain_cache['__remaining__'] = enrichment_budget
    spool.execute('CREATE INDEX enrichment_order ON base_events(candidate, disclosure_at DESC, enrichment_risk DESC, seq)')
    for row in spool.execute('SELECT seq, payload FROM base_events WHERE candidate = 1 ORDER BY disclosure_at DESC, enrichment_risk DESC, seq'):
        event = json.loads(row['payload'])
        _apply_domain_enrichment([event], domain_cache)
        spool.execute('UPDATE base_events SET payload = ? WHERE seq = ?', (_json_dumps(event), row['seq']))
    now = _now_utc()
    logger.info("normalized intelligence refresh phase=scoring_and_deduplication")
    recent_cutoff, previous_cutoff = now - timedelta(days=SPIKE_WINDOW_DAYS), now - timedelta(days=SPIKE_WINDOW_DAYS * 2)
    for row in spool.execute('SELECT seq, payload FROM base_events ORDER BY seq'):
        event = json.loads(row['payload'])
        disclosure = _parse_dt(str(event.get('disclosure_time') or ''))
        window = 1 if disclosure and disclosure >= recent_cutoff else 2 if disclosure and disclosure >= previous_cutoff else 0
        spool.execute('UPDATE base_events SET industry = ?, region = ?, window = ? WHERE seq = ?',
                      (_normalize_label(event['industry']), _normalize_label(event['region']), window, row['seq']))
    spool.executescript('''CREATE TABLE statistics(kind TEXT, label TEXT, total INTEGER, sites INTEGER,
        recent INTEGER, previous INTEGER, PRIMARY KEY(kind, label));
        INSERT INTO statistics SELECT 'actor', actor, CASE WHEN actor IN ('', 'Unknown') THEN 0 ELSE COUNT(*) END,
            COUNT(DISTINCT site), 0, 0 FROM base_events GROUP BY actor;
        INSERT INTO statistics SELECT 'victim', victim_key, CASE WHEN victim_key IN ('', 'unknown') THEN 0 ELSE COUNT(*) END,
            0, 0, 0 FROM base_events GROUP BY victim_key;
        INSERT INTO statistics SELECT 'industry', industry, 0, 0, SUM(window = 1), SUM(window = 2)
            FROM base_events WHERE industry NOT IN ('', 'Unknown') GROUP BY industry;
        INSERT INTO statistics SELECT 'region', region, 0, 0, SUM(window = 1), SUM(window = 2)
            FROM base_events WHERE region NOT IN ('', 'Unknown') GROUP BY region;''')
    scoring_cutoff = _recent_cutoff()
    for row in spool.execute('''SELECT e.*, COALESCE(a.total, 0) AS actor_count, COALESCE(a.sites, 0) AS actor_sites,
        COALESCE(v.total, 0) AS victim_count, COALESCE(i.recent, 0) AS industry_recent, COALESCE(i.previous, 0) AS industry_previous,
        COALESCE(r.recent, 0) AS region_recent, COALESCE(r.previous, 0) AS region_previous FROM base_events e
        LEFT JOIN statistics a ON a.kind = 'actor' AND a.label = e.actor
        LEFT JOIN statistics v ON v.kind = 'victim' AND v.label = e.victim_key
        LEFT JOIN statistics i ON i.kind = 'industry' AND i.label = e.industry
        LEFT JOIN statistics r ON r.kind = 'region' AND r.label = e.region ORDER BY e.seq'''):
        event = json.loads(row['payload'])
        _score_events([event], statistics=({row['actor']: row['actor_count']}, {row['victim_key']: row['victim_count']},
            {row['actor']: row['actor_sites']}, {row['industry']: row['industry_recent']}, {row['industry']: row['industry_previous']},
            {row['region']: row['region_recent']}, {row['region']: row['region_previous']}), recent_cutoff=scoring_cutoff)
        existing = spool.execute('SELECT payload FROM id_events WHERE event_id = ?', (event['event_id'],)).fetchone()
        if existing is None:
            spool.execute('INSERT INTO id_events VALUES (?, ?, ?)', (row['seq'], event['event_id'], _json_dumps(event)))
        else:
            event = _merge_duplicate_events(json.loads(existing['payload']), event)
            spool.execute('UPDATE id_events SET payload = ? WHERE event_id = ?', (_json_dumps(event), event['event_id']))
    spool.execute('DROP TABLE base_events')
    for row in spool.execute('SELECT seq, payload FROM id_events ORDER BY seq'):
        event = json.loads(row['payload'])
        key = (str(event.get('source_site_name') or ''), str(event.get('event_type') or ''), _canonical_key(event.get('title') or ''))
        existing = spool.execute('SELECT payload FROM final_events WHERE site = ? AND kind = ? AND title_key = ?', key).fetchone()
        if existing is None:
            spool.execute('INSERT INTO final_events VALUES (?, ?, ?, ?, ?, ?, ?)',
                          (row['seq'], *key, event['event_id'], event_report_time(event), _json_dumps(event)))
        else:
            event = _merge_duplicate_events(json.loads(existing['payload']), event)
            spool.execute('UPDATE final_events SET event_id = ?, report_time = ?, payload = ? WHERE site = ? AND kind = ? AND title_key = ?',
                          (event['event_id'], event_report_time(event), _json_dumps(event), *key))


def _normalized_spool_rows(spool, updated_at, *, new_only=False):
    where = 'WHERE p.event_id IS NULL' if new_only else ''
    for row in spool.execute(f'''SELECT f.payload, p.mirrors, p.screenshots, p.preview FROM final_events f
            LEFT JOIN previous_resources p ON p.event_id = f.event_id {where}
            ORDER BY f.report_time DESC, f.event_id DESC'''):
        event = json.loads(row['payload'])
        snapshot = bool(event.get('_artifact_snapshot')) and event.get('event_type') != 'vulnerability'
        if snapshot:
            mirror_resources = event.get('mirror_resources') or []
            screenshot_resources = event.get('screenshot_resources') or []
        else:
            mirror_resources = _merge_unique_resources(_coerce_resource_list(_parse_json(row['mirrors'])), event.get('mirror_resources') or [])
            screenshot_resources = _merge_unique_resources(_coerce_resource_list(_parse_json(row['screenshots'])), event.get('screenshot_resources') or [])
        metadata_payload = {
            **event['metadata'], 'country': event.get('country') or 'Unknown', 'country_code': event.get('country_code') or '',
            'macro_region': event.get('region') or 'Unknown', 'confidence_score': int(event.get('confidence_score') or 0),
            'completeness_score': int(event.get('completeness_score') or 0), 'resource_count': len(mirror_resources),
        }
        yield {**{key: event[key] for key in ('event_id', 'source_kind', 'raw_source_type', 'source_site_name', 'source_record_id',
                    'event_type', 'category', 'leak_type', 'title', 'attacker', 'victim', 'victim_key', 'industry', 'region', 'severity')},
            'risk_score': int(event['risk_score']), 'disclosure_time': event.get('disclosure_time') or '',
            'source_url': event.get('source_url') or '', 'detail_text': event.get('detail_text') or '',
            'mirror_resources_json': _json_dumps(mirror_resources), 'screenshot_resources_json': _json_dumps(screenshot_resources),
            'json_preview_url': str(event.get('json_preview_url') or ('' if snapshot else row['preview']) or ''),
            'risk_reasons_json': _json_dumps(event['metadata'].get('risk_reasons') or []),
            'event_metadata_json': _json_dumps(metadata_payload), 'updated_at': updated_at}


def refresh_normalized_intelligence(connection, *, enrichment_budget: int | None = None,
                                   load_events: bool = True) -> list[dict[str, Any]]:
    source_signature = _build_source_signature(connection)
    domain_cache = _load_domain_enrichment_cache()
    budget = DOMAIN_ENRICHMENT_BUDGET if enrichment_budget is None else max(0, int(enrichment_budget))
    domain_cache["__remaining__"] = budget
    temporary_root = user_data_root() / "tmp"
    temporary_root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="normalization-", dir=temporary_root) as directory:
        spool = sqlite3.connect(Path(directory) / "events.sqlite")
        spool.row_factory = sqlite3.Row
        try:
            spool.execute("PRAGMA cache_size=-4096")
            spool.execute("PRAGMA temp_store=FILE")
            spool.execute("PRAGMA mmap_size=0")
            spool.execute("PRAGMA journal_mode=OFF")
            spool.execute("PRAGMA synchronous=OFF")
            _stage_normalized_events(connection, spool, domain_cache, budget)
            updated_at = _now_utc().isoformat()
            logger.info("normalized intelligence refresh phase=publish")
            event_count = replace_normalized_intelligence_events(connection, _normalized_spool_rows(spool, updated_at))
            upsert_normalized_intelligence_cache_state(
                connection, source_signature=source_signature, event_count=event_count, refreshed_at=updated_at,
            )
            _save_domain_enrichment_cache(domain_cache)
            from darkweb_collector.incremental_intelligence import reset_incremental_projection

            reset_incremental_projection(connection)
            for row in _normalized_spool_rows(spool, updated_at, new_only=True):
                connection.execute("""INSERT INTO normalized_notification_outbox
                    (event_id, payload, revision, enqueued_at) VALUES (?, ?, 1, ?)
                    ON CONFLICT(event_id) DO UPDATE SET payload = excluded.payload,
                    revision = normalized_notification_outbox.revision + 1,
                    enqueued_at = excluded.enqueued_at, attempts = 0, next_retry = 0, lease_until = 0""",
                    (row["event_id"], _json_dumps(row), _now_utc().timestamp()))
            connection.commit()
            return load_normalized_events(connection, refresh=False) if load_events else []
        finally:
            spool.close()


def ensure_normalized_intelligence(
    connection,
    force: bool = False,
    *,
    enrichment_budget: int | None = None,
    load_events: bool = True,
) -> list[dict[str, Any]]:
    if not force and not should_refresh_normalized_intelligence(connection):
        return load_normalized_events(connection, refresh=False) if load_events else []
    acquired, release_local = _try_acquire_normalized_refresh_lock(connection)
    if not acquired:
        return _load_normalized_rows_without_refresh(connection) if load_events else []
    try:
        if not force and not should_refresh_normalized_intelligence(connection):
            return _load_normalized_rows_without_refresh(connection) if load_events else []
        return refresh_normalized_intelligence(connection, enrichment_budget=enrichment_budget, load_events=load_events)
    finally:
        if release_local:
            _NORMALIZED_REFRESH_LOCK.release()


def load_normalized_events(connection, refresh: bool = False) -> list[dict[str, Any]]:
    if refresh:
        return ensure_normalized_intelligence(connection, force=True)
    rows = list_normalized_intelligence_events(connection)
    if rows:
        return [_hydrate_event_row(row) for row in rows]
    return []


def load_normalized_event_page(
    connection,
    *,
    event_type: str = "",
    limit: int = 500,
    offset: int = 0,
    query: str = "",
    sort: str = "latest",
) -> list[dict[str, Any]]:
    rows = list_normalized_intelligence_events(
        connection,
        event_type=event_type,
        limit=limit,
        offset=offset,
        query=query,
        sort=sort,
    )
    if rows:
        return [_hydrate_event_row(row) for row in rows]
    return []


def load_normalized_event_detail(connection, event_id: str, refresh: bool = False) -> dict[str, Any] | None:
    if refresh:
        ensure_normalized_intelligence(connection, force=True, load_events=False)
    row = get_normalized_intelligence_event(connection, event_id)
    if row is None:
        return None
    return _hydrate_event_row(row)


def normalized_event_to_list_item(event: dict[str, Any]) -> dict[str, Any]:
    metadata = event.get("metadata") or {}
    display_title = build_display_title(event)
    updated_time_raw = _event_updated_time(event)
    summary = str(metadata.get("summary") or event.get("detail_text") or "")
    return {
        "id": event["event_id"],
        "event_type": event["source_kind"],
        "normalized_event_type": event["event_type"],
        "raw_source_type": event["raw_source_type"],
        "disclosureTime": _format_date(event.get("disclosure_time")),
        "disclosureTimeRaw": event.get("disclosure_time") or "",
        "disclosureDate": _format_date(event.get("disclosure_time")),
        "updatedTime": _format_dt(updated_time_raw),
        "updatedTimeRaw": updated_time_raw,
        "rawSourceTypeLabel": metadata.get("raw_source_type_label") or humanize_raw_source_type(event["raw_source_type"]),
        "title": display_title,
        "originalTitle": event["title"],
        "category": event["category"],
        "attacker": event["attacker"],
        "sourceSite": metadata.get("source_label") or _label_source(event.get("source_site_name")),
        "industry": _label_industry(event["industry"]),
        "country": event.get("country") or "Unknown",
        "countryCode": event.get("country_code") or "",
        "macroRegion": event.get("region") or "Unknown",
        "region": _display_region(event.get("country"), event.get("region")),
        "severity": event["severity"],
        "victim": event["victim"],
        "riskScore": event["risk_score"],
        "riskReasons": event["risk_reasons"],
        "monitoringMatches": event.get("monitoring_matches") or [],
        "monitoringWeight": int(event.get("monitoring_weight") or 0),
        "monitoringPriority": event.get("monitoring_priority") or "low",
        "sampleLinks": event.get("sample_links") or [],
        "sampleLinkCount": int(event.get("sample_link_count") or 0),
        "hasSampleEvidence": bool(event.get("has_sample_evidence")),
        "priorityScore": int(event.get("priority_score") or 0),
        "confidenceScore": int(event.get("confidence_score") or 0),
        "completenessScore": int(event.get("completeness_score") or 0),
        "cveId": metadata.get("cve_id") or "",
        "vendor": metadata.get("vendor") or "",
        "product": metadata.get("product") or "",
        "cvss": metadata.get("cvss"),
        "isExploited": bool(metadata.get("is_exploited")),
        "patchAvailable": bool(metadata.get("patch_available")),
        "summary": summary[:500],
    }


def normalized_event_to_detail(event: dict[str, Any]) -> dict[str, Any]:
    metadata = event.get("metadata") or {}
    display_title = build_display_title(event)
    updated_time_raw = _event_updated_time(event)
    mirror_resources = event["mirror_resources"]
    screenshot_resources = event["screenshot_resources"]
    json_preview_url = event.get("json_preview_url") or ""
    if event.get("raw_source_type") == "forum_details":
        local_mirror_resources, local_screenshot_resources = _forum_output_resources(
            {
                "site_name": event.get("source_site_name"),
                "section": metadata.get("section"),
                "topic_url": event.get("source_url"),
                "title": event.get("title"),
                "raw_json": metadata.get("raw_json"),
            }
        )
        mirror_resources = _merge_unique_resources(mirror_resources, local_mirror_resources)
        screenshot_resources = _merge_unique_resources(screenshot_resources, local_screenshot_resources)
        json_preview_url = json_preview_url or next((item["url"] for item in mirror_resources if item["url"].endswith(".json")), "")
    return {
        "id": event["event_id"],
        "identifier": event["event_id"],
        "event_type": event["source_kind"],
        "normalized_event_type": event["event_type"],
        "raw_source_type": event["raw_source_type"],
        "raw_source_type_label": metadata.get("raw_source_type_label") or humanize_raw_source_type(event["raw_source_type"]),
        "title": display_title,
        "original_title": event["title"],
        "disclosure_time": _format_date(event.get("disclosure_time")),
        "disclosure_time_raw": event.get("disclosure_time") or "",
        "updated_time": _format_dt(updated_time_raw),
        "updated_time_raw": updated_time_raw,
        "attacker": event["attacker"],
        "disclosure_url": event.get("source_url") or "",
        "detail_text": event.get("detail_text") or "",
        **({"content_access": metadata["content_access"]} if metadata.get("content_access") in ("public", "partial") else {}),
        "category": event["category"],
        "source": _label_source(event["source"]),
        "industry": _label_industry(event["industry"]),
        "country": event.get("country") or "Unknown",
        "country_code": event.get("country_code") or "",
        "macro_region": event.get("region") or "Unknown",
        "region": _display_region(event.get("country"), event.get("region")),
        "mirror_resources": mirror_resources,
        "screenshot_resources": screenshot_resources,
        "json_preview_url": json_preview_url,
        "victim": event["victim"],
        "risk_score": event["risk_score"],
        "risk_reasons": event["risk_reasons"],
        "risk_breakdown": event.get("risk_breakdown") or metadata.get("risk_breakdown") or {},
        "rule_risk_breakdown": event.get("rule_risk_breakdown") or {},
        "monitoring_matches": event.get("monitoring_matches") or [],
        "monitoring_weight": int(event.get("monitoring_weight") or 0),
        "monitoring_priority": event.get("monitoring_priority") or "low",
        "sample_links": event.get("sample_links") or [],
        "has_sample_evidence": bool(event.get("has_sample_evidence")),
        "sample_link_count": int(event.get("sample_link_count") or 0),
        "leak_type": event["leak_type"],
        "severity": event["severity"],
        "confidence_score": int(event.get("confidence_score") or 0),
        "completeness_score": int(event.get("completeness_score") or 0),
        "country_source": event.get("country_source") or "unknown",
        "industry_source": event.get("industry_source") or "unknown",
        "tag_sources": event.get("tag_sources") or [],
        "entity_link_evidence": event.get("entity_link_evidence") or {},
        "cve_id": metadata.get("cve_id") or "",
        "vendor": metadata.get("vendor") or "",
        "product": metadata.get("product") or "",
        "cvss": metadata.get("cvss"),
        "is_exploited": bool(metadata.get("is_exploited")),
        "patch_available": bool(metadata.get("patch_available")),
        "has_poc": bool(metadata.get("has_poc")),
        "affected_versions": metadata.get("affected_versions") or [],
        "affected_version_items": metadata.get("affected_version_items") or [],
        "summary": metadata.get("summary") or event.get("detail_text") or "",
        "reference_urls": metadata.get("reference_urls") or event.get("mirror_resources") or [],
        "source_labels": metadata.get("source_labels") or [],
        "source_type_label": metadata.get("source_type_label") or humanize_source_type(metadata.get("source_type")),
        "original_title": metadata.get("original_title") or event["title"],
        "original_summary": metadata.get("original_summary") or "",
        "summary_unavailable": bool(metadata.get("summary_unavailable")),
    }


def _build_actor_ranking(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        actor = event["attacker"] or "Unknown"
        grouped[actor].append(event)

    ranking: list[dict[str, Any]] = []
    for actor, actor_events in grouped.items():
        actor_events.sort(
            key=lambda item: (_parse_dt(item.get("disclosure_time")) or datetime.min.replace(tzinfo=timezone.utc)),
            reverse=True,
        )
        sites = {item["source_site_name"] for item in actor_events if item["source_site_name"]}
        leak_type_counts = Counter(item["leak_type"] for item in actor_events if item["leak_type"])
        reasons: list[str] = []
        if len(actor_events) >= 3:
            reasons.append("Appeared several times recently")
        if len(sites) >= 2:
            reasons.append("Appeared across sites")
        if any(item["severity"] == "critical" for item in actor_events):
            reasons.append("High-risk events present")
        ranking.append(
            {
                "actor": actor,
                "eventCount": len(actor_events),
                "crossSiteCount": len(sites),
                "averageRiskScore": round(sum(item["risk_score"] for item in actor_events) / len(actor_events)),
                "topLeakType": leak_type_counts.most_common(1)[0][0] if leak_type_counts else "Unknown",
                "lastSeenAt": _format_dt(actor_events[0].get("disclosure_time")),
                "reasons": reasons or ["Continuously active"],
            }
        )
    ranking.sort(key=lambda item: (item["averageRiskScore"], item["eventCount"], item["crossSiteCount"]), reverse=True)
    return ranking[:10]


def _build_victim_ranking(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        victim_key = event["victim_key"]
        if not victim_key or victim_key == "unknown":
            continue
        grouped[victim_key].append(event)

    ranking: list[dict[str, Any]] = []
    for _, victim_events in grouped.items():
        victim_events.sort(
            key=lambda item: (_parse_dt(item.get("disclosure_time")) or datetime.min.replace(tzinfo=timezone.utc)),
            reverse=True,
        )
        ranking.append(
            {
                "victim": victim_events[0]["victim"],
                "eventCount": len(victim_events),
                "averageRiskScore": round(sum(item["risk_score"] for item in victim_events) / len(victim_events)),
                "lastSeenAt": _format_dt(victim_events[0].get("disclosure_time")),
                "industries": sorted({item["industry"] for item in victim_events if item["industry"] and item["industry"] != "Unknown"})[:3],
            }
        )
    ranking.sort(key=lambda item: (item["averageRiskScore"], item["eventCount"]), reverse=True)
    return ranking[:10]


def _aggregate_dimension(events: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        key = _normalize_label(event.get(field))
        if not key or key == "Unknown":
            continue
        grouped[key].append(event)
    rows: list[dict[str, Any]] = []
    for key, grouped_events in grouped.items():
        rows.append(
            {
                "name": key,
                "value": len(grouped_events),
                "averageRiskScore": round(sum(item["risk_score"] for item in grouped_events) / len(grouped_events)),
            }
        )
    rows.sort(key=lambda item: (item["averageRiskScore"], item["value"]), reverse=True)
    return rows[:8]


def _build_behavior_signals(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actor_ranking = _build_actor_ranking(events)
    repeated_victims = [item for item in _build_victim_ranking(events) if item["eventCount"] >= 2]
    industry_focus = _aggregate_dimension(events, "industry")
    region_focus = _aggregate_dimension(events, "region")
    signals: list[dict[str, Any]] = []
    if actor_ranking:
        top_actor = actor_ranking[0]
        signals.append(
            {
                "title": f"{top_actor['actor']} Most active",
                "description": f"appeared {top_actor['eventCount']} times in total, average risk score {top_actor['averageRiskScore']}.",
                "tone": "danger" if top_actor["averageRiskScore"] >= 60 else "warning",
            }
        )
    if repeated_victims:
        top_victim = repeated_victims[0]
        signals.append(
            {
                "title": f"{top_victim['victim']} Repeated exposure",
                "description": f"The same victim entity appeared {top_victim['eventCount']} times; prioritize manual review.",
                "tone": "warning",
            }
        )
    if industry_focus:
        signals.append(
            {
                "title": f"{industry_focus[0]['name']} is a frequently affected industry",
                "description": f"Current records {industry_focus[0]['value']} records, average risk score {industry_focus[0]['averageRiskScore']}.",
                "tone": "primary",
            }
        )
    if region_focus:
        signals.append(
            {
                "title": f"{region_focus[0]['name']} Region continuously active",
                "description": f"Current records {region_focus[0]['value']} records, suitable as a key regional example for presentations.",
                "tone": "success",
            }
        )
    return signals[:4]


def build_behavior_payload(connection, events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    normalized_events = events if events is not None else load_normalized_events(connection)
    behavior_events = [item for item in normalized_events if item["event_type"] != "vulnerability"]
    data_leak_events = [item for item in normalized_events if item["event_type"] == "data_leak"]
    ransomware_events = [item for item in normalized_events if item["event_type"] == "ransomware"]
    vulnerability_events = [item for item in normalized_events if item["event_type"] == "vulnerability"]
    actor_ranking = _build_actor_ranking(behavior_events)
    victim_ranking = _build_victim_ranking(behavior_events)
    industry_focus = _aggregate_dimension(behavior_events, "industry")
    region_focus = _aggregate_dimension(behavior_events, "region")
    anomaly_events = sorted(
        behavior_events,
        key=lambda item: (item["risk_score"], _parse_dt(item.get("disclosure_time")) or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )[:12]

    return {
        "summaryCards": [
            {"label": "Normalized events", "value": str(len(normalized_events)), "description": "Number of intelligence events that have been cleaned and structurally extracted.", "tone": "primary"},
            {"label": "High-risk events", "value": str(sum(1 for item in normalized_events if item["risk_score"] >= 60)), "description": "Number of events with a rule score of 60 or above.", "tone": "danger"},
            {"label": "Active entities", "value": str(len(actor_ranking)), "description": "Number of entities available for behavior analysis ranking.", "tone": "warning"},
            {"label": "Repeated victim entities", "value": str(sum(1 for item in victim_ranking if item["eventCount"] >= 2)), "description": "Number of victim entities that appeared multiple times.", "tone": "success"},
        ],
        "actorRiskRanking": actor_ranking,
        "victimRiskRanking": victim_ranking,
        "industryRiskDistribution": industry_focus,
        "regionRiskDistribution": region_focus,
        "anomalyEvents": [
            {
                "id": item["event_id"],
                "title": build_display_title(item),
                "originalTitle": item["title"],
                "attacker": item["attacker"],
                "victim": item["victim"],
                "category": item["category"],
                "sourceSite": _label_source(item["source_site_name"]),
                "disclosureTime": _format_dt(item.get("disclosure_time")),
                "riskScore": item["risk_score"],
                "reasons": item["risk_reasons"],
            }
            for item in anomaly_events
        ],
        "behaviorSignals": _build_behavior_signals(behavior_events),
        "extractionStats": {
            "dataLeakCount": len(data_leak_events),
            "ransomwareCount": len(ransomware_events),
            "vulnerabilityCount": len(vulnerability_events),
            "updatedAt": _format_dt(_now_utc().isoformat()),
        },
    }
