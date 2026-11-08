"""Controllo automatico: gli ingredienti della fonte sono tutti nella ricetta estratta?

Senza AI: confronta i frammenti di ingredienti trovati nella fonte con le voci estratte (soprattutto con il campo
"origine", la frase della fonte che il modello copia per ogni ingrediente).
- Siti con dati strutturati: ogni riga dell'elenco ingredienti del sito.
- Didascalie e testo: le espressioni con una quantità ("1 cucchiaino di fecola", "500 g di patate", "2 uova").
- Il parlato non si controlla: la trascrizione automatica è troppo imprecisa.
"""

from __future__ import annotations

import re
import unicodedata

from fonti import Materiale

PAROLE_VUOTE = {"di", "d", "del", "della", "dello", "dei", "degli", "delle", "e", "ed", "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "per", "q", "b", "qb", "of", "the", "a", "and"}

_NUM = r"(?:\d+(?:[.,/]\d+)?|½|¼|¾)"
_UNITA = (
    r"(?:g|gr|grammi|kg|ml|l|cl|dl|litr[io]|cucchia(?:i|io|ini|ino)|bicchier[ei]|tazz[ae]|spicch[io]|fett[ea]|"
    r"pizzico|bustin[ae]|confezion[ei]|vasett[io]|cups?|tbsp|tsp|tablespoons?|teaspoons?|oz)"
)
_NOME = r"([a-zà-ÿ’']+(?:\s+[a-zà-ÿ’']+)?)"
# "500 g di patate", "1 cucchiaino di fecola", "100g Butter"
_CON_UNITA = re.compile(rf"(?<![\w.,]){_NUM}\s*{_UNITA}\.?\s+(?:di\s+|d['’]\s*|of\s+)?{_NOME}", re.I)
# "2 uova", "1 porro" (solo cifre, per non prendere "una volta")
_SENZA_UNITA = re.compile(rf"(?<![\w.,])\d+(?:[.,]\d+)?\s+{_NOME}", re.I)
_NON_INGREDIENTI = {
    "minuti", "minuto", "min", "ore", "ora", "secondi", "gradi", "°", "persone", "porzioni", "porzione", "volte", "giorni",
    "pezzi", "cm", "mm", "anni", "settimane", "minutes", "hours", "mins", "degrees", "people", "servings", "kcal", "cal",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9½¼¾]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _parole(s: str) -> set[str]:
    return {p for p in norm(s).split() if p not in PAROLE_VUOTE}


def _e_acqua(s: str) -> bool:
    n = norm(s)
    return bool(re.search(r"\b(acqua|water|ghiaccio|ice)\b", n)) and not re.search(r"frizzante|bottiglia|sparkling|tonica", n)


def frammenti(m: Materiale) -> list[str]:
    """Pezzi della fonte che dovrebbero corrispondere a un ingrediente."""
    if m.ingredienti_fonte:
        return [r for r in m.ingredienti_fonte if r.strip() and not _e_acqua(r)]
    testo = re.sub(r"PARLATO DEL VIDEO.*?(?=\n\nTESTO CONDIVISO|\Z)", "", m.testo, flags=re.S)
    trovati: list[str] = []
    for regex in (_CON_UNITA, _SENZA_UNITA):
        for x in regex.finditer(testo):
            parole = norm(x.group(1)).split()
            if not parole or parole[0] in _NON_INGREDIENTI or norm(x.group(0)) in (norm(t) for t in trovati):
                continue
            # "500 g di patate" trovato con l'unità non va ripreso come "500 g"
            if any(x.start() >= t_inizio and x.end() <= t_fine for t_inizio, t_fine in _intervalli(testo, trovati)):
                continue
            trovati.append(x.group(0).strip())
    return [t for t in trovati if not _e_acqua(t)]


def _intervalli(testo: str, frammenti: list[str]):
    for f in frammenti:
        i = testo.find(f)
        if i >= 0:
            yield i, i + len(f)


def _numero(q: float) -> set[str]:
    """Modi in cui una quantità può comparire nel testo: 0.5 → {"0 5", "½", "mezzo"…}"""
    forme = {norm(f"{q:g}"), norm(f"{q:g}".replace(".", ","))}
    if q == 0.5:
        forme |= {"½", "mezzo", "mezza"}
    return forme


def coperto(frammento: str, ingredienti) -> bool:
    f = norm(frammento)
    pf = _parole(frammento)
    for i in ingredienti:
        o = norm(i.origine or "")
        if o and (f in o or o in f):
            return True
        if o and pf and len(pf & _parole(o)) / len(pf) >= 0.75:
            return True
        # Senza frase d'origine: stesso nome (le prime 5 lettere, per singolari e plurali) e stessa quantità
        nome = {p[:5] for p in _parole(i.nome) if len(p) >= 4}
        if nome & {p[:5] for p in pf if len(p) >= 4}:
            # le quantità a parole ("un", "due", "mezzo") non si confrontano: basta il nome
            if i.quantita is None or not re.search(r"\d", f) or any(n in f.split() for n in _numero(i.quantita)):
                return True
    return False


def mancanti(m: Materiale, ingredienti) -> list[str]:
    return [f for f in frammenti(m) if not coperto(f, ingredienti)]
