"""Raccolta del materiale da cui estrarre una ricetta: pagine web, TikTok, Instagram, testo, screenshot.

Ogni funzione restituisce un Materiale: testo da dare all'AI, link canonico (per riconoscere i doppioni),
autore e immagine quando ci sono. Nessuna chiamata all'AI qui.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
MAX_TESTO_PAGINA = 15000


class ErroreImport(Exception):
    """Errore da mostrare così com'è nell'app (in italiano, con cosa fare)."""


@dataclass
class Materiale:
    tipo: str  # tiktok | instagram | sito | testo | screenshot
    testo: str = ""
    url_canonico: str = ""
    autore: str = ""
    immagine_url: str = ""
    dati_strutturati: bool = False  # True se il testo viene da schema.org Recipe
    immagini: list[tuple[str, bytes]] = field(default_factory=list)  # (media type, contenuto)


def scarica(url: str, timeout: int = 30) -> tuple[str, str]:
    """Restituisce (url finale dopo i redirect, html)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.6"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.geturl(), r.read().decode("utf-8", "replace")
    except Exception as e:  # rete, 403, 404…
        raise ErroreImport(f"Non riesco ad aprire il link ({e}). Incolla il testo della ricetta o manda uno screenshot.") from e


def tipo_da_url(url: str) -> str:
    host = urllib.parse.urlsplit(url).hostname or ""
    host = host.removeprefix("www.")
    if host.endswith("tiktok.com"):
        return "tiktok"
    if host.endswith("instagram.com"):
        return "instagram"
    return "sito"


_PARAMETRI_TRACCIAMENTO = re.compile(r"^(utm_|igsh|igshid|si$|_r$|_t$|is_from_webapp|sender_device|fbclid|gclid|share|exln|obrf)", re.I)


def url_confrontabile(url: str) -> str:
    """Stessa logica dell'app (src/lib/ricette.ts): per riconoscere lo stesso link scritto in modi diversi."""
    try:
        p = urllib.parse.urlsplit(url.strip())
    except ValueError:
        return url.strip().lower()
    if not p.hostname:
        return url.strip().lower()
    host = re.sub(r"^(www|m)\.", "", p.hostname)
    query = urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not _PARAMETRI_TRACCIAMENTO.match(k)])
    return f"{host}{p.path.rstrip('/')}{'?' + query if query else ''}".lower()


# --- TikTok -------------------------------------------------------------------------------------------


def _cerca_item(o):
    if isinstance(o, dict):
        if isinstance(o.get("itemStruct"), dict):
            return o["itemStruct"]
        for v in o.values():
            r = _cerca_item(v)
            if r:
                return r
    elif isinstance(o, list):
        for v in o:
            r = _cerca_item(v)
            if r:
                return r
    return None


def testo_da_vtt(vtt: str) -> str:
    """Sottotitoli WebVTT → testo semplice, senza tempi e senza righe ripetute."""
    righe: list[str] = []
    for riga in vtt.splitlines():
        riga = riga.strip()
        if not riga or riga == "WEBVTT" or "-->" in riga or riga.isdigit() or riga.startswith(("NOTE", "Kind:", "Language:")):
            continue
        riga = re.sub(r"<[^>]+>", "", riga)
        if not righe or righe[-1] != riga:
            righe.append(riga)
    return " ".join(righe)


def da_tiktok(url: str) -> Materiale:
    finale, _ = scarica(url)  # i link brevi vm.tiktok.com portano alla pagina del video
    canonico = finale.split("?")[0]
    _, pagina = scarica(canonico)  # senza parametri la pagina contiene i dati del video
    m = re.search(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', pagina, re.S)
    item = _cerca_item(json.loads(m.group(1))) if m else None
    if not item:
        raise ErroreImport("TikTok non ha mostrato la descrizione del video. Incolla la didascalia o manda uno screenshot.")
    descrizione = (item.get("desc") or "").strip()
    autore = (item.get("author") or {}).get("uniqueId") or ""
    parlato = ""
    sottotitoli = (item.get("video") or {}).get("subtitleInfos") or []
    ordinati = sorted(sottotitoli, key=lambda s: (0 if str(s.get("LanguageCodeName", "")).startswith("ita") else 1 if str(s.get("LanguageCodeName", "")).startswith("eng") else 2))
    for s in ordinati[:1]:
        try:
            parlato = testo_da_vtt(scarica(s["Url"])[1])
        except ErroreImport:
            pass
    if not descrizione and not parlato:
        raise ErroreImport("Il video TikTok non ha né didascalia né parlato leggibile. Incolla il testo o manda uno screenshot.")
    if item.get("id") and autore:
        canonico = f"https://www.tiktok.com/@{autore}/video/{item['id']}"
    testo = f"DIDASCALIA DEL VIDEO:\n{descrizione or '(vuota)'}"
    if parlato:
        testo += f"\n\nPARLATO DEL VIDEO (trascrizione automatica, può contenere errori):\n{parlato}"
    return Materiale(tipo="tiktok", testo=testo, url_canonico=canonico, autore=autore)


# --- Instagram ----------------------------------------------------------------------------------------


def da_instagram(url: str) -> Materiale:
    p = urllib.parse.urlsplit(url)
    canonico = urllib.parse.urlunsplit(("https", "www.instagram.com", p.path.rstrip("/") + "/", "", ""))
    descrizione, autore = "", ""
    try:
        import yt_dlp

        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(canonico, download=False) or {}
        descrizione = (info.get("description") or "").strip()
        autore = info.get("uploader_id") or info.get("channel") or info.get("uploader") or ""
    except Exception:
        pass
    if not descrizione:
        # Ripiego: la descrizione per le anteprime dei link, a volte contiene la didascalia
        try:
            _, pagina = scarica(canonico)
            m = re.search(r'<meta[^>]+property="og:description"[^>]+content="([^"]*)"', pagina)
            descrizione = html_lib.unescape(m.group(1)).strip() if m else ""
        except ErroreImport:
            pass
    if len(descrizione) < 40:
        raise ErroreImport("Instagram non ha mostrato la didascalia (succede quando chiede il login). Incolla la didascalia o manda uno screenshot.")
    return Materiale(tipo="instagram", testo=f"DIDASCALIA DEL POST:\n{descrizione}", url_canonico=canonico, autore=autore)


# --- Siti di ricette ----------------------------------------------------------------------------------


def _ricette_jsonld(o):
    if isinstance(o, list):
        for x in o:
            yield from _ricette_jsonld(x)
    elif isinstance(o, dict):
        t = o.get("@type")
        if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
            yield o
        for k in ("@graph", "mainEntity", "itemListElement"):
            if k in o:
                yield from _ricette_jsonld(o[k])


def _istruzioni(x) -> list[str]:
    if isinstance(x, str):
        return [html_lib.unescape(re.sub(r"<[^>]+>", " ", x)).strip()]
    if isinstance(x, list):
        return [p for v in x for p in _istruzioni(v)]
    if isinstance(x, dict):
        if "itemListElement" in x:
            return _istruzioni(x["itemListElement"])
        return _istruzioni(x.get("text") or x.get("name") or "")
    return []


def _immagine(x, base: str) -> str:
    if isinstance(x, list) and x:
        return _immagine(x[0], base)
    if isinstance(x, dict):
        return _immagine(x.get("url") or x.get("contentUrl") or "", base)
    return urllib.parse.urljoin(base, x) if isinstance(x, str) and x else ""


def ricetta_da_html(pagina: str, base: str) -> dict | None:
    """schema.org Recipe dal JSON-LD della pagina, ridotto ai campi utili."""
    for blocco in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', pagina, re.S | re.I):
        try:
            dati = json.loads(blocco.strip(), strict=False)  # strict=False: alcuni siti hanno a capo non validi
        except json.JSONDecodeError:
            continue
        for r in _ricette_jsonld(dati):
            ingredienti = [html_lib.unescape(str(i)).strip() for i in r.get("recipeIngredient") or r.get("ingredients") or []]
            if not ingredienti:
                continue
            return {
                "nome": html_lib.unescape(str(r.get("name") or "")).strip(),
                "porzioni": r.get("recipeYield"),
                "tempo_totale": r.get("totalTime") or r.get("cookTime"),
                "ingredienti": ingredienti,
                "procedimento": [p for p in _istruzioni(r.get("recipeInstructions")) if p],
                "immagine": _immagine(r.get("image"), base),
            }
    return None


def testo_visibile(pagina: str) -> str:
    pagina = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>", " ", pagina)
    pagina = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>", "\n", pagina)
    testo = html_lib.unescape(re.sub(r"<[^>]+>", " ", pagina))
    testo = re.sub(r"[ \t]+", " ", testo)
    testo = re.sub(r"\n\s*\n+", "\n", testo)
    return testo.strip()[:MAX_TESTO_PAGINA]


def da_sito(url: str) -> Materiale:
    finale, pagina = scarica(url)
    p = urllib.parse.urlsplit(finale)
    canonico = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, p.query, ""))
    og = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', pagina)
    immagine = urllib.parse.urljoin(finale, html_lib.unescape(og.group(1))) if og else ""
    r = ricetta_da_html(pagina, finale)
    if r:
        return Materiale(
            tipo="sito",
            testo="RICETTA DALLA PAGINA (dati strutturati del sito):\n" + json.dumps({k: v for k, v in r.items() if k != "immagine"}, ensure_ascii=False, indent=1),
            url_canonico=canonico,
            immagine_url=r["immagine"] or immagine,
            dati_strutturati=True,
        )
    testo = testo_visibile(pagina)
    if len(testo) < 200:
        raise ErroreImport("La pagina non contiene testo leggibile. Incolla il testo della ricetta o manda uno screenshot.")
    return Materiale(tipo="sito", testo=f"TESTO DELLA PAGINA:\n{testo}", url_canonico=canonico, immagine_url=immagine)


def da_url(url: str) -> Materiale:
    tipo = tipo_da_url(url)
    if tipo == "tiktok":
        return da_tiktok(url)
    if tipo == "instagram":
        return da_instagram(url)
    return da_sito(url)
