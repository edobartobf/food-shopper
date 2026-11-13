#!/usr/bin/env python3
"""Appoggio per la skill carrello-conad: legge la lista della Dispensa e gli abbinamenti Conad dal repo dati.

  conad.py lista            voci da comprare (non spuntate), con l'abbinamento Conad se c'è
  conad.py mostra           abbinamenti salvati
  conad.py ricorda FILE     unisce FILE (JSON) a conad/abbinamenti.json nel repo dati

FILE per "ricorda":
  {"abbinamenti": {"<nome voce>": {"prodotto": "...", "url": "/p/...", "confezione": "500 g",
                                    "peso_variabile": false, "nota": "..."}},
   "non_online": ["latte di cocco"],
   "togli": ["<nome voce>"],
   "negozio": "...", "regola": "..."}

Usa `gh api` (login GitHub già fatto su edo-dev). Le chiavi sono come chiave() in src/lib/lista.ts.
"""
import base64
import datetime as dt
import json
import subprocess
import sys
import unicodedata

REPO = "edobartobf/food-shopper-data"
FILE_ABBINAMENTI = "conad/abbinamenti.json"


def chiave(nome: str) -> str:
    s = unicodedata.normalize("NFD", nome.lower())
    s = "".join(c for c in s if not ("̀" <= c <= "ͯ"))
    return " ".join(s.split())


def gh(*args: str, input: str | None = None) -> str:
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True, input=input)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r.stdout


def leggi(percorso: str):
    """(dati, sha) oppure (None, None) se il file non c'è."""
    try:
        out = gh(f"repos/{REPO}/contents/{percorso}")
    except RuntimeError as e:
        if "Not Found" in str(e) or "404" in str(e):
            return None, None
        raise
    j = json.loads(out)
    return json.loads(base64.b64decode(j["content"]).decode()), j["sha"]


def scrivi(percorso: str, dati, sha: str | None, messaggio: str):
    corpo = {
        "message": messaggio,
        "content": base64.b64encode((json.dumps(dati, ensure_ascii=False, indent=2) + "\n").encode()).decode(),
    }
    if sha:
        corpo["sha"] = sha
    gh("-X", "PUT", f"repos/{REPO}/contents/{percorso}", "--input", "-", input=json.dumps(corpo))


def vuoto():
    return {"negozio": "", "regola": "", "abbinamenti": {}, "non_online": {}, "aggiornato_il": ""}


def numero(v: float) -> str:
    return (f"{v:.2f}".rstrip("0").rstrip(".")).replace(".", ",")


def quantita(v) -> str:
    if v.get("qb"):
        return "q.b."
    parti = [f"{numero(q['valore'])} {q['unita'] or ''}".strip() for q in v.get("quantita", [])]
    return " + ".join(parti) or "?"


def cmd_lista():
    lista, _ = leggi("spesa/attuale.json")
    ab, _ = leggi(FILE_ABBINAMENTI)
    ab = ab or vuoto()
    voci, qb = [], []
    for v in (lista or {}).get("voci", []):
        if v.get("spuntata"):
            continue
        k = chiave(v["nome"])
        riga = {
            "nome": v["nome"],
            "quantita": quantita(v),
            "reparto": v.get("reparto"),
            "nota": v.get("nota") or None,
            "stimata": bool(v.get("stimata")),
            "da_ricette": v.get("da_ricette", []),
            "abbinamento": ab["abbinamenti"].get(k),
            "non_online": k in ab["non_online"],
        }
        (qb if v.get("qb") else voci).append(riga)
    print(json.dumps({
        "negozio": ab.get("negozio"),
        "regola": ab.get("regola"),
        "da_comprare": voci,
        "qb_saltate": [x["nome"] for x in qb],
    }, ensure_ascii=False, indent=1))


def cmd_mostra():
    ab, _ = leggi(FILE_ABBINAMENTI)
    print(json.dumps(ab or vuoto(), ensure_ascii=False, indent=1))


def cmd_ricorda(file: str):
    with open(file, encoding="utf-8") as f:
        nuovo = json.load(f)
    oggi = dt.date.today().isoformat()
    for tentativo in range(3):
        ab, sha = leggi(FILE_ABBINAMENTI)
        ab = ab or vuoto()
        for nome, a in nuovo.get("abbinamenti", {}).items():
            k = chiave(nome)
            ab["abbinamenti"][k] = {"nome": nome, **a, "scelto_il": oggi}
            ab["non_online"].pop(k, None)
        for nome in nuovo.get("non_online", []):
            k = chiave(nome)
            ab["non_online"][k] = {"nome": nome, "visto_il": oggi}
            ab["abbinamenti"].pop(k, None)
        for nome in nuovo.get("togli", []):
            k = chiave(nome)
            ab["abbinamenti"].pop(k, None)
            ab["non_online"].pop(k, None)
        for campo in ("negozio", "regola"):
            if nuovo.get(campo):
                ab[campo] = nuovo[campo]
        ab["abbinamenti"] = dict(sorted(ab["abbinamenti"].items()))
        ab["non_online"] = dict(sorted(ab["non_online"].items()))
        ab["aggiornato_il"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        try:
            scrivi(FILE_ABBINAMENTI, ab, sha, "Carrello Conad: abbinamenti aggiornati")
            print(f"salvati: {len(ab['abbinamenti'])} abbinamenti, {len(ab['non_online'])} non online")
            return
        except RuntimeError as e:
            if "409" in str(e) or "422" in str(e) or "does not match" in str(e):
                continue  # qualcuno l'ha cambiato nel frattempo: rileggo e riprovo
            raise
    sys.exit("non riesco a salvare: il file cambia di continuo, riprova")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("lista", "mostra", "ricorda"):
        sys.exit(__doc__)
    if sys.argv[1] == "lista":
        cmd_lista()
    elif sys.argv[1] == "mostra":
        cmd_mostra()
    else:
        if len(sys.argv) < 3:
            sys.exit("uso: conad.py ricorda FILE.json")
        cmd_ricorda(sys.argv[2])
