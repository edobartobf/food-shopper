"""Estrazione della ricetta con Claude Haiku 5.5 e output strutturato (schema Pydantic)."""

from __future__ import annotations

import base64
import io
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel, Field

from fonti import ErroreImport, Materiale

MODELLO = "claude-haiku-5-5"
UNITA = ["g", "kg", "ml", "l", "pz", "cucchiaio", "cucchiaino", "tazza", "spicchio", "fetta", "mazzetto", "pizzico", "confezione"]
MAX_BYTE_IMMAGINE = 4_500_000  # sotto il limite di 5 MB per immagine dell'API


class Ingrediente(BaseModel):
    nome: str = Field(description="Nome dell'ingrediente in italiano, minuscolo, senza marca né quantità (es. 'filetto di salmone', 'pangrattato')")
    quantita: Optional[float] = Field(description="Quantità numerica per le porzioni indicate; null se non indicata o q.b.")
    unita: Optional[Literal["g", "kg", "ml", "l", "pz", "cucchiaio", "cucchiaino", "tazza", "spicchio", "fetta", "mazzetto", "pizzico", "confezione"]] = Field(
        description="Unità; null se la quantità è un semplice numero di pezzi non specificato o manca"
    )
    reparto: str = Field(description="Reparto del supermercato, scelto dalla lista data")
    qb: bool = Field(description="true se 'quanto basta' o senza quantità")
    nota: Optional[str] = Field(description="Dettaglio utile breve (es. 'grattugiato', 'per servire'); null se nessuno")


class RicettaEstratta(BaseModel):
    e_una_ricetta: bool = Field(description="false se il materiale non contiene una ricetta o mancano del tutto gli ingredienti")
    motivo: Optional[str] = Field(description="Se e_una_ricetta è false: cosa manca, in una frase per l'utente; altrimenti null")
    titolo: str
    porzioni: int
    tempo_minuti: Optional[int]
    tag: list[str]
    ingredienti: list[Ingrediente]
    passaggi: list[str]
    note: Optional[str] = Field(description="Consigli, varianti o avvertenze presenti nella fonte; null se nessuno")


ISTRUZIONI = """Estrai una ricetta dal materiale fornito (didascalie di TikTok/Instagram, trascrizioni del parlato, \
pagine web, testo scritto a mano o screenshot) e restituiscila nello schema richiesto. Serve a un'app di ricettario e \
lista della spesa di una coppia italiana.

Regole:
- Tutto in italiano, anche se la fonte è in un'altra lingua: traduci titolo, ingredienti e passaggi.
- Titolo breve e chiaro, come in un ricettario (es. "Salmone in crosta aromatica"), senza emoji né hashtag.
- Ingredienti: nome comune da supermercato italiano, minuscolo, senza marche. Un ingrediente per voce: \
"sale e pepe" diventano due voci. Se la fonte divide gli ingredienti in gruppi (impasto, salsa…), uniscili in un'unica \
lista e metti il gruppo nella nota solo se serve a capire.
- Quantità numeriche per le porzioni indicate: frazioni in decimali ("½" → 0.5), intervalli al valore medio \
("4-5 mele" → 4.5 pz). Converti le unità americane in metriche (1 cup ≈ 240 ml o il peso tipico dell'ingrediente, \
1 tbsp = cucchiaio, 1 tsp = cucchiaino, oz → g). "Un petto di pollo" → 1 pz; "una confezione" o "una bustina" → \
1 confezione; i bicchieri vanno in ml ("un bicchiere" → 200 ml, "mezzo bicchiere" → 100 ml), mai in tazze. \
Se c'è sia un numero di pezzi sia un peso, usa il peso (es. "800 g di salmone in 4 tranci" → 800 g).
- Non mettere tra gli ingredienti l'acqua del rubinetto né il ghiaccio: se serve una quantità d'acqua, scrivila nel \
passaggio. L'acqua in bottiglia o frizzante invece è un ingrediente.
- q.b., "un pizzico" o quantità non indicata: quantita null, unita null, qb true (l'eventuale "un pizzico" va nella nota).
- Reparto: scegli SOLO tra quelli della lista data.
- Porzioni: quelle indicate (per un intervallo come "6-8" usa il valore più basso); se mancano, stimale (di solito 2-4). Tempo: totale in minuti se indicato o deducibile, \
altrimenti null.
- Passaggi: brevi e in ordine, all'imperativo ("Taglia…", "Cuoci…"), uno per azione principale. Se la fonte non li ha \
ma il parlato o il contesto li rende chiari, ricostruiscili; non inventare passaggi non deducibili.
- Tag: da 1 a 4, minuscoli, presi preferibilmente da: antipasti, primi, secondi, contorni, piatti unici, dolci, \
colazione, pane e lievitati, salse, pesce, carne, vegetariano, vegano, veloce, forno, friggitrice ad aria, asiatico. \
Il primo tag è la portata. "forno" solo se si cuoce in forno, "veloce" solo se si fa in 30 minuti o meno, "dolci" \
solo per i dolci. Riusa i tag già in uso quando calzano.
- Didascalie e parlato possono contenere saluti, pubblicità e hashtag: ignorali. La trascrizione automatica del parlato \
può avere errori: correggili col buon senso (es. nomi di ingredienti storpiati).
- Se non c'è una ricetta o non c'è nessun modo di capire gli ingredienti, e_una_ricetta = false e spiega in "motivo" \
cosa manca (es. "Nella didascalia non ci sono gli ingredienti: incollali o manda uno screenshot"). Riempi comunque \
gli altri campi con valori vuoti."""


def _riduci(media_type: str, dati: bytes) -> tuple[str, bytes]:
    """Riduce le immagini troppo grandi per l'API."""
    if len(dati) <= MAX_BYTE_IMMAGINE:
        return media_type, dati
    from PIL import Image

    img = Image.open(io.BytesIO(dati))
    img = img.convert("RGB")
    img.thumbnail((2000, 2000))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return "image/jpeg", out.getvalue()


def estrai(materiale: Materiale, reparti: list[str], tag_esistenti: list[str], client: anthropic.Anthropic | None = None) -> RicettaEstratta:
    client = client or anthropic.Anthropic()
    contenuto: list[dict] = []
    for media_type, dati in materiale.immagini:
        media_type, dati = _riduci(media_type, dati)
        contenuto.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(dati).decode()}})
    contesto = (
        f"Reparti disponibili: {', '.join(reparti)}\n"
        f"Tag già in uso nel ricettario: {', '.join(tag_esistenti) if tag_esistenti else 'nessuno'}\n"
        f"Tipo di fonte: {materiale.tipo}" + (f" (autore: {materiale.autore})" if materiale.autore else "")
    )
    testo = materiale.testo.strip() or "(nessun testo: usa gli screenshot)"
    contenuto.append({"type": "text", "text": f"{contesto}\n\n<materiale>\n{testo}\n</materiale>"})

    try:
        risposta = client.messages.parse(
            model=MODELLO,
            max_tokens=16000,
            system=ISTRUZIONI,
            output_config={"effort": "medium"},
            messages=[{"role": "user", "content": contenuto}],
            output_format=RicettaEstratta,
        )
    except anthropic.AuthenticationError as e:
        raise ErroreImport("La chiave Anthropic non è valida: controlla il segreto ANTHROPIC_API_KEY del repo dati.") from e
    except anthropic.PermissionDeniedError as e:
        raise ErroreImport("La chiave Anthropic non ha accesso al modello o il tetto di spesa è stato raggiunto.") from e
    except anthropic.RateLimitError as e:
        raise ErroreImport("Troppe richieste all'AI in questo momento: riprova tra qualche minuto.") from e
    except anthropic.BadRequestError as e:
        messaggio = str(e)
        if "credit" in messaggio.lower() or "billing" in messaggio.lower():
            raise ErroreImport("Credito Anthropic esaurito o tetto di spesa raggiunto.") from e
        raise ErroreImport(f"L'AI ha rifiutato la richiesta: {messaggio[:200]}") from e

    if risposta.stop_reason == "refusal":
        raise ErroreImport("L'AI non ha voluto elaborare questo contenuto. Prova a incollare solo la ricetta.")
    if risposta.stop_reason == "max_tokens" or risposta.parsed_output is None:
        raise ErroreImport("La ricetta è troppo lunga o confusa da estrarre: prova a incollare solo ingredienti e passaggi.")
    r = risposta.parsed_output
    pulisci(r, reparti)
    return r


ACQUA = {"acqua", "acqua del rubinetto", "acqua calda", "acqua fredda", "acqua tiepida", "ghiaccio", "acqua bollente"}


def pulisci(r: RicettaEstratta, reparti: list[str]) -> None:
    """Corregge quello che il modello a volte sbaglia, così la lista della spesa resta pulita."""
    r.ingredienti = [i for i in r.ingredienti if i.nome.strip().lower() not in ACQUA]
    for i in r.ingredienti:
        i.nome = i.nome.strip().lower()
        if i.reparto not in reparti:
            i.reparto = "altro" if "altro" in reparti else reparti[-1]
        if i.unita == "pizzico":
            i.nota = i.nota or "un pizzico"
            i.quantita = None
        if i.qb or i.quantita is None:
            i.qb, i.quantita, i.unita = True, None, None
    r.tag = list(dict.fromkeys(t.strip().lower() for t in r.tag if t.strip()))[:4]
