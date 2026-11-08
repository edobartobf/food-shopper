"""Test senza rete e senza AI: python -m pytest importatore"""

import json
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import fonti  # noqa: E402
import importa  # noqa: E402
from fonti import Materiale  # noqa: E402


def test_url_confrontabile_come_app():
    assert fonti.url_confrontabile("https://www.instagram.com/reel/ABC/?igsh=xyz") == "instagram.com/reel/abc"
    assert fonti.url_confrontabile("https://www.instagram.com/reel/DeZAbXTuRl_/?exln=aTA3") == "instagram.com/reel/dezabxturl_"
    assert fonti.url_confrontabile("https://m.example.it/a/?p=1&utm_source=x") == "example.it/a?p=1"


def test_tipo_da_url():
    assert fonti.tipo_da_url("https://vm.tiktok.com/ZN8/") == "tiktok"
    assert fonti.tipo_da_url("https://www.instagram.com/reel/x") == "instagram"
    assert fonti.tipo_da_url("https://www.cucchiaio.it/ricetta/x") == "sito"


def test_vtt():
    vtt = "WEBVTT\n\n\n00:00:00.000 --> 00:00:01.540\nPrendete le mele\n\n00:00:01.541 --> 00:00:02\nPrendete le mele\n\n2\n00:00:03 --> 00:00:04\n<c>e il burro</c>\n"
    assert fonti.testo_da_vtt(vtt) == "Prendete le mele e il burro"


def test_jsonld_con_a_capo_non_validi_e_graph():
    pagina = """<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
    {"@type":["Recipe"],"name":"Torta &amp; mele","recipeYield":"8","recipeIngredient":["3 mele","100 g di zucchero"],
    "recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Sbucciate
    le mele"}]},"<p>Infornate</p>"],"image":{"url":"/img/torta.jpg"}}]}</script></html>"""
    r = fonti.ricetta_da_html(pagina, "https://sito.it/ricetta/torta")
    assert r["nome"] == "Torta & mele"
    assert r["ingredienti"] == ["3 mele", "100 g di zucchero"]
    assert r["procedimento"][1] == "Infornate"
    assert r["immagine"] == "https://sito.it/img/torta.jpg"


def test_testo_visibile_toglie_script():
    assert fonti.testo_visibile("<script>x()</script><p>Ingredienti</p><li>uova</li>") == "Ingredienti\n uova"


# --- importa.main con estrazione finta ---


class FintaEstratta:
    def __init__(self, titolo="Torta di mele", e_una_ricetta=True, motivo=None):
        from pydantic import BaseModel

        class I(BaseModel):
            nome: str
            quantita: float | None
            unita: str | None
            reparto: str
            qb: bool
            nota: str | None = None
            gruppo: str | None = None
            origine: str | None = None

        self.e_una_ricetta, self.motivo, self.titolo = e_una_ricetta, motivo, titolo
        self.porzioni, self.tempo_minuti, self.tag, self.note = 6, 50, ["Dolci"], None
        self.ingredienti = [I(nome="mele", quantita=3, unita="pz", reparto="frutta e verdura", qb=False), I(nome="sale", quantita=None, unita=None, reparto="dispensa", qb=True)]
        self.passaggi = ["Taglia le mele", "Inforna"]


@pytest.fixture
def repo(tmp_path, monkeypatch):
    (tmp_path / "importazioni").mkdir()
    (tmp_path / "ricette").mkdir()
    (tmp_path / "allegati").mkdir()
    (tmp_path / "config.json").write_text(json.dumps({"reparti": ["frutta e verdura", "dispensa", "altro"]}))
    risposte = []
    finto = types.ModuleType("estrazione")
    finto.estrai = lambda m, reparti, tag, mancanti=None: risposte.pop(0)
    monkeypatch.setitem(sys.modules, "estrazione", finto)
    monkeypatch.setattr(importa, "da_url", lambda url: Materiale(tipo="sito", testo="pagina", url_canonico=url.split("?")[0], immagine_url="https://sito.it/f.jpg"))
    return tmp_path, risposte


def richiesta(repo, id_, **campi):
    dati = {"id": id_, "stato": "in_attesa", "url": "", "testo": "", "allegati": [], "creata_da": "Edoardo", "creata_il": "2026-11-08T20:00:00Z", "errore": None} | campi
    (repo / "importazioni" / f"{id_}.json").write_text(json.dumps(dati))


def test_import_riuscito_e_doppione(repo):
    cartella, risposte = repo
    risposte += [FintaEstratta()]
    richiesta(cartella, "imp-1", url="https://sito.it/torta?utm_source=x")
    (cartella / "allegati" / "imp-1-1.jpg").write_bytes(b"x")
    richiesta(cartella, "imp-2", url="https://www.sito.it/torta/")  # stesso link scritto diverso
    importa.main(cartella)

    ricette = list((cartella / "ricette").glob("*.json"))
    assert len(ricette) == 1
    r = json.loads(ricette[0].read_text())
    assert r["titolo"] == "Torta di mele" and r["da_ricontrollare"] and r["creata_da"] == "Edoardo"
    assert r["tag"] == ["dolci"]
    assert r["ingredienti"][1] == {"nome": "sale", "quantita": None, "unita": None, "reparto": "dispensa", "qb": True}
    assert r["fonte"] == {"tipo": "sito", "url": "https://sito.it/torta", "url_condiviso": "https://sito.it/torta?utm_source=x"}
    assert not (cartella / "importazioni" / "imp-1.json").exists()
    doppione = json.loads((cartella / "importazioni" / "imp-2.json").read_text())
    assert doppione["stato"] == "errore" and doppione["errore"] == "Già nel ricettario: Torta di mele" and doppione["ricetta_id"] == r["id"]


def test_contenuto_senza_ricetta(repo):
    cartella, risposte = repo
    risposte += [FintaEstratta(e_una_ricetta=False, motivo="Nella didascalia non ci sono gli ingredienti")]
    richiesta(cartella, "imp-3", testo="che bello il mare")
    importa.main(cartella)
    imp = json.loads((cartella / "importazioni" / "imp-3.json").read_text())
    assert imp["stato"] == "errore" and "ingredienti" in imp["errore"]
    assert "Import non riuscito" in (cartella / "risultato.txt").read_text()


def test_salta_richieste_gia_in_errore(repo):
    cartella, _ = repo
    richiesta(cartella, "imp-4", stato="errore", errore="vecchio")
    importa.main(cartella)
    assert (cartella / "risultato.txt").read_text() == "Nessuna importazione in attesa"


def test_pulisci_acqua_pizzico_tag():
    pytest.importorskip("anthropic")
    from estrazione import Ingrediente, RicettaEstratta, pulisci

    r = RicettaEstratta(
        e_una_ricetta=True, motivo=None, titolo="x", porzioni=2, tempo_minuti=20, tag=["Primi", "primi", "veloce"], passaggi=[], note=None,
        ingredienti=[
            Ingrediente(nome="Acqua", quantita=0.5, unita="tazza", reparto="casa e igiene", qb=False, nota=None, gruppo=None, origine=None),
            Ingrediente(nome="sale", quantita=None, unita="pizzico", reparto="dispensa", qb=False, nota=None, gruppo=None, origine=None),
            Ingrediente(nome="riso", quantita=200, unita="g", reparto="inventato", qb=False, nota=None, gruppo=None, origine=None),
        ],
    )
    pulisci(r, ["dispensa", "altro"])
    assert [i.nome for i in r.ingredienti] == ["sale", "riso"]
    assert (r.ingredienti[0].qb, r.ingredienti[0].quantita, r.ingredienti[0].unita, r.ingredienti[0].nota) == (True, None, None, "un pizzico")
    assert r.ingredienti[1].reparto == "altro"
    assert r.tag == ["primi", "veloce"]


def test_veloce_solo_sotto_30_minuti():
    pytest.importorskip("anthropic")
    from estrazione import RicettaEstratta, pulisci

    r = RicettaEstratta(e_una_ricetta=True, motivo=None, titolo="x", porzioni=2, tempo_minuti=40, tag=["piatti unici", "veloce"], passaggi=[], note=None, ingredienti=[])
    pulisci(r, ["altro"])
    assert r.tag == ["piatti unici"]


# --- controllo degli ingredienti mancanti ---

import verifica  # noqa: E402

DIDASCALIA_NOODLES = (
    "DIDASCALIA DEL VIDEO:\nBentornati nella mia cucina! Ingredienti:500 g di patate, 200 g di fecola, sale. "
    "Per la salsa: 1 cucchiaino di fecola, salsa di soia, 1 cucchiaio di aceto, 1 cucchiaio di zucchero, 2 cucchiai d’acqua, "
    "peperoncino. Per condire: 5 gamberoni giganti, 1 zucchina, qualche anello di cipollotto. Cuoci per 10 minuti a 180 gradi."
    "\n\nPARLATO DEL VIDEO (trascrizione automatica, può contenere errori):\naggiungo 3 spicchi di aglio"
)


class Ing:
    def __init__(self, nome, quantita=None, unita=None, origine=None):
        self.nome, self.quantita, self.unita, self.origine = nome, quantita, unita, origine


def test_frammenti_da_didascalia():
    f = verifica.frammenti(Materiale(tipo="tiktok", testo=DIDASCALIA_NOODLES))
    assert f == [
        "500 g di patate",
        "200 g di fecola",
        "1 cucchiaino di fecola",
        "1 cucchiaio di aceto",
        "1 cucchiaio di zucchero",
        "5 gamberoni giganti",
        "1 zucchina",
    ]  # niente acqua, minuti, gradi né parlato


def test_fecola_fusa_viene_scoperta():
    m = Materiale(tipo="tiktok", testo=DIDASCALIA_NOODLES)
    fusa = [
        Ing("patate", 500, "g", "500 g di patate"),
        Ing("fecola di patate", 200, "g", "200 g di fecola"),
        Ing("aceto", 1, "cucchiaio", "1 cucchiaio di aceto"),
        Ing("zucchero", 1, "cucchiaio", "1 cucchiaio di zucchero"),
        Ing("gamberoni", 5, "pz", "5 gamberoni giganti"),
        Ing("zucchina", 1, "pz", None),  # senza origine: vale nome + quantità
    ]
    assert verifica.mancanti(m, fusa) == ["1 cucchiaino di fecola"]
    completa = fusa + [Ing("fecola di patate", 1, "cucchiaino", "1 cucchiaino di fecola")]
    assert verifica.mancanti(m, completa) == []


def test_righe_dei_siti_e_testo_inglese():
    m = Materiale(tipo="sito", ingredienti_fonte=["150 g di riso basmati", "Un petto di pollo", "Mezzo bicchiere d'acqua", "Sale e pepe q.b."])
    estratti = [Ing("riso basmati", 150, "g", "150 g di riso basmati"), Ing("sale", origine="Sale e pepe q.b."), Ing("pepe", origine="Sale e pepe q.b.")]
    assert verifica.mancanti(m, estratti) == ["Un petto di pollo"]
    inglese = Materiale(tipo="tiktok", testo="INGREDIENTS 100g Butter, softened 130g Caster Sugar 1 tsp Ground Cinnamon")
    assert verifica.mancanti(inglese, [Ing("burro", 100, "g", "100g Butter"), Ing("zucchero semolato", 130, "g", "130g Caster Sugar")]) == ["1 tsp Ground Cinnamon"]


def test_secondo_tentativo_e_nota(repo):
    cartella, risposte = repo
    prima = FintaEstratta()
    seconda = FintaEstratta()
    seconda.ingredienti[0].origine = "3 mele"
    risposte += [prima, seconda]
    import importa as imp_mod

    m = Materiale(tipo="testo", testo="TESTO: 3 mele e 100 g di burro")
    estratta, mancano = imp_mod.completa(prima, m, [], [], lambda *a, **k: risposte.pop(0))
    assert mancano == ["100 g di burro"]
    assert imp_mod.nota_con_mancanti("Buona.", mancano) == "Da controllare: nella fonte ci sono anche «100 g di burro».\nBuona."


def test_quantita_a_parole_bastano_col_nome():
    m = Materiale(tipo="sito", ingredienti_fonte=["il succo di due limoni", "la scorza di un limone", "2 uova"])
    assert verifica.mancanti(m, [Ing("limoni", 2, "pz", "il succo di due limoni"), Ing("uova", 3, "pz")]) == ["2 uova"]
