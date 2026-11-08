"""Elabora le richieste in importazioni/*.json del repo dati e scrive le ricette in ricette/.

Uso (dentro la Action del repo dati):  python importa.py <cartella del repo dati>
Per ogni richiesta: raccoglie il materiale (fonti.py), estrae la ricetta con l'AI (estrazione.py) e:
- se va bene scrive ricette/<id>.json e cancella la richiesta e i suoi screenshot;
- se no segna la richiesta come "errore" con un messaggio per l'app.
Scrive in risultato.txt un riepilogo per il messaggio di commit.
"""

from __future__ import annotations

import json
import os
import random
import re
import string
import sys
import traceback
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from fonti import ErroreImport, Materiale, da_url, url_confrontabile
from verifica import mancanti as ingredienti_mancanti

ESTENSIONI = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}


def adesso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def id_da_titolo(titolo: str) -> str:
    base = unicodedata.normalize("NFD", titolo.lower())
    base = "".join(c for c in base if not unicodedata.combining(c))
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:40].strip("-") or "ricetta"
    return f"{base}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}"


def leggi_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def scrivi_json(p: Path, dati) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def raccogli(imp: dict, repo: Path) -> Materiale:
    url = (imp.get("url") or "").strip()
    testo = (imp.get("testo") or "").strip()
    allegati = [repo / a for a in imp.get("allegati") or [] if (repo / a).exists()]
    if url:
        try:
            m = da_url(url)
        except ErroreImport:
            # il link non si legge, ma se l'utente ha dato anche testo o screenshot si va avanti con quelli
            if not testo and not allegati:
                raise
            m = Materiale(tipo="testo", url_canonico=url)
    else:
        m = Materiale(tipo="screenshot" if allegati else "testo")
    if testo:
        m.testo = f"{m.testo}\n\nTESTO CONDIVISO DALL'UTENTE:\n{testo}".strip()
    for a in allegati:
        m.immagini.append((ESTENSIONI.get(a.suffix.lower(), "image/jpeg"), a.read_bytes()))
    if not m.testo and not m.immagini:
        raise ErroreImport("La richiesta è vuota: condividi un link, un testo o uno screenshot.")
    return m


def completa(estratta, m: Materiale, reparti, tag_esistenti, estrai):
    """Se mancano ingredienti della fonte, riprova una volta indicando quali; tiene il risultato più completo."""
    mancano = ingredienti_mancanti(m, estratta.ingredienti)
    if not mancano:
        return estratta, []
    print(f"  ! mancano {mancano}: secondo tentativo")
    seconda = estrai(m, reparti, tag_esistenti, mancanti=mancano)
    if not seconda.e_una_ricetta:
        return estratta, mancano
    mancano2 = ingredienti_mancanti(m, seconda.ingredienti)
    if len(mancano2) <= len(mancano):
        return seconda, mancano2
    return estratta, mancano


def nota_con_mancanti(nota: str | None, mancano: list[str]) -> str:
    nota = (nota or "").strip()
    if mancano:
        avviso = "Da controllare: nella fonte ci sono anche " + "; ".join(f"«{x}»" for x in mancano) + "."
        nota = f"{avviso}\n{nota}".strip()
    return nota


def main(repo: Path) -> int:
    from estrazione import estrai  # importato qui: i test di fonti/importa non richiedono anthropic

    config = leggi_json(repo / "config.json") if (repo / "config.json").exists() else {}
    reparti = config.get("reparti") or ["altro"]
    ricette = [leggi_json(p) for p in sorted((repo / "ricette").glob("*.json"))]
    tag_esistenti = sorted({t for r in ricette for t in r.get("tag", [])})
    per_url = {}
    for r in ricette:
        for u in (r.get("fonte", {}).get("url"), r.get("fonte", {}).get("url_condiviso")):
            if u:
                per_url[url_confrontabile(u)] = r

    riepilogo: list[str] = []
    for file in sorted((repo / "importazioni").glob("*.json")):
        imp = leggi_json(file)
        if imp.get("stato") not in ("in_attesa", "in_corso"):
            continue
        print(f"→ {file.name}: {imp.get('url') or imp.get('fonte')}")
        try:
            gia = per_url.get(url_confrontabile(imp["url"])) if imp.get("url") else None
            m = raccogli(imp, repo)
            gia = gia or (per_url.get(url_confrontabile(m.url_canonico)) if m.url_canonico else None)
            if gia:
                raise ErroreImport(f"Già nel ricettario: {gia['titolo']}", gia["id"])
            estratta = estrai(m, reparti, tag_esistenti)
            if not estratta.e_una_ricetta:
                raise ErroreImport(estratta.motivo or "Non ho trovato una ricetta in questo contenuto.")
            estratta, mancano = completa(estratta, m, reparti, tag_esistenti, estrai)

            ricetta = {
                "id": id_da_titolo(estratta.titolo),
                "titolo": estratta.titolo,
                "porzioni": max(1, estratta.porzioni),
                "tempo_minuti": estratta.tempo_minuti,
                "tag": [t.strip().lower() for t in estratta.tag if t.strip()][:4],
                "ingredienti": [i.model_dump(exclude_none=True) | {"quantita": i.quantita, "unita": i.unita} for i in estratta.ingredienti],
                "passaggi": estratta.passaggi,
                "fonte": {
                    "tipo": m.tipo,
                    **({"url": m.url_canonico} if m.url_canonico else {}),
                    **({"url_condiviso": imp["url"]} if imp.get("url") and imp["url"] != m.url_canonico else {}),
                    **({"autore": m.autore} if m.autore else {}),
                },
                "immagine_url": m.immagine_url or None,
                "note": nota_con_mancanti(estratta.note, mancano),
                "da_ricontrollare": True,
                "creata_da": imp.get("creata_da", ""),
                "creata_il": adesso(),
                "modificata_il": adesso(),
            }
            scrivi_json(repo / "ricette" / f"{ricetta['id']}.json", ricetta)
            file.unlink()
            for a in imp.get("allegati") or []:
                (repo / a).unlink(missing_ok=True)
            per_url.update({url_confrontabile(u): ricetta for u in (m.url_canonico, imp.get("url")) if u})
            tag_esistenti = sorted(set(tag_esistenti) | set(ricetta["tag"]))
            riepilogo.append(f"Importata: {ricetta['titolo']} [{ricetta['creata_da']}]")
            print(f"  ✓ {ricetta['titolo']} ({len(ricetta['ingredienti'])} ingredienti)")
        except Exception as e:
            if isinstance(e, ErroreImport):
                messaggio = str(e.args[0])
                imp["ricetta_id"] = e.args[1] if len(e.args) > 1 else None
            else:
                traceback.print_exc()
                messaggio = f"Errore imprevisto durante l'import ({type(e).__name__}). Riprova o incolla il testo."
            imp["stato"] = "errore"
            imp["errore"] = messaggio
            imp["elaborata_il"] = adesso()
            scrivi_json(file, imp)
            riepilogo.append(f"Import non riuscito: {imp.get('url') or file.stem} ({messaggio[:80]})")
            print(f"  ✗ {messaggio}")

    riuscite = sum(r.startswith("Importata") for r in riepilogo)
    if len(riepilogo) > 1:
        titolo = f"Import: {riuscite} {'ricetta importata' if riuscite == 1 else 'ricette importate'}"
        if len(riepilogo) - riuscite:
            titolo += f", {len(riepilogo) - riuscite} non riuscit{'o' if len(riepilogo) - riuscite == 1 else 'i'}"
        riepilogo.insert(0, titolo)
    Path(os.environ.get("RISULTATO", repo / "risultato.txt")).write_text("\n".join(riepilogo) or "Nessuna importazione in attesa", encoding="utf-8")
    return 0


def prova(repo: Path, url: str, volte: int) -> int:
    """Estrae la stessa ricetta più volte e stampa il risultato, senza scrivere niente nel repo."""
    from estrazione import estrai

    config = leggi_json(repo / "config.json") if (repo / "config.json").exists() else {}
    reparti = config.get("reparti") or ["altro"]
    m = da_url(url)
    print(f"Fonte: {m.tipo} {m.url_canonico}\nFrammenti da controllare: {ingredienti_mancanti(m, [])}\n")
    for n in range(1, volte + 1):
        estratta, mancano = completa(estrai(m, reparti, []), m, reparti, [], estrai)
        print(f"=== Prova {n}: {estratta.titolo} ({len(estratta.ingredienti)} ingredienti), mancanti: {mancano or 'nessuno'}")
        for i in estratta.ingredienti:
            q = "q.b." if i.qb else f"{i.quantita:g} {i.unita or ''}".strip()
            print(f"   [{i.gruppo or '-'}] {i.nome}: {q}   «{i.origine or ''}»")
    return 0


if __name__ == "__main__":
    argomenti = sys.argv[1:]
    if argomenti and argomenti[0] == "--prova":
        sys.exit(prova(Path("."), argomenti[1], int(argomenti[2]) if len(argomenti) > 2 else 1))
    sys.exit(main(Path(argomenti[0] if argomenti else ".")))
