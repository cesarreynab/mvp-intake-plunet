"""Volumen de palabras y plazo estimado de producción. Sin modelo: reglas y aritmética.

El volumen es un conteo preliminar sobre el texto extraído de los adjuntos (RF01). El análisis oficial, con
repeticiones y coincidencias de memoria, sigue siendo el de memoQ y está fuera del alcance de este sistema.

El plazo usa los rendimientos de datos.RENDIMIENTO (supuestos declarados, editables) y días hábiles de lunes a
viernes, sin feriados. Los idiomas se trabajan en paralelo: el plazo no crece con el número de idiomas, el esfuerzo sí.
No calcula precios: cotizar está fuera de alcance.
"""
from __future__ import annotations

import math
import re
from datetime import date, timedelta
from typing import Any, Optional

from datos import PALABRAS_POR_PAGINA, RENDIMIENTO

_ADJUNTO = re.compile(r"^---\s*Adjunto:\s*(.+?)\s*(?:\((.*?)\))?\s*---\s*$", re.MULTILINE)
_PAGINAS = re.compile(r"(\d[\d.]*)\s*(?:páginas|página|diapositivas|diapositiva|paginas|pagina)", re.IGNORECASE)
_PALABRAS = re.compile(r"(\d[\d.]*)\s*palabras", re.IGNORECASE)
_MARCA = re.compile(r"^\[[^\]]*\]\s*")


def _entero(texto: str) -> int:
    return int(texto.replace(".", ""))


def volumen_de_adjuntos(adjuntos: list[dict]) -> Optional[dict]:
    """Volumen de los adjuntos de la bandeja: el extractor ya contó las palabras de cada archivo completo."""
    archivos = []
    for a in adjuntos or []:
        paginas = _PAGINAS.search(a.get("detalle") or "")
        archivos.append({"nombre": a["nombre"], "palabras": int(a.get("palabras") or 0),
                         "paginas": _entero(paginas.group(1)) if paginas else None,
                         "fuente": "conteo del extractor sobre el archivo completo"})
    return _total(archivos)


def volumen_de_texto(texto: str) -> Optional[dict]:
    """Volumen de un correo pegado: palabras declaradas en la marca del adjunto, o páginas × palabras por página,
    o, si no hay ninguna de las dos, las palabras del extracto pegado (que suele ser parcial)."""
    marcas = list(_ADJUNTO.finditer(texto or ""))
    archivos = []
    for i, m in enumerate(marcas):
        detalle = m.group(2) or ""
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        paginas = _PAGINAS.search(detalle)
        paginas = _entero(paginas.group(1)) if paginas else None
        palabras = _PALABRAS.search(detalle)
        if palabras:
            n, fuente = _entero(palabras.group(1)), "palabras declaradas en el adjunto"
        elif paginas:
            n, fuente = paginas * PALABRAS_POR_PAGINA, f"estimado: {paginas} páginas × {PALABRAS_POR_PAGINA} palabras"
        else:
            cuerpo = texto[m.end():fin]
            n = sum(len(_MARCA.sub("", linea).split()) for linea in cuerpo.splitlines())
            fuente = "palabras del extracto pegado (puede ser parcial)"
        archivos.append({"nombre": m.group(1).strip(), "palabras": n, "paginas": paginas, "fuente": fuente})
    return _total(archivos)


def _total(archivos: list[dict]) -> Optional[dict]:
    if not archivos:
        return None
    paginas = [a["paginas"] for a in archivos if a["paginas"]]
    return {"palabras": sum(a["palabras"] for a in archivos), "paginas": sum(paginas) if paginas else None,
            "archivos": archivos,
            "nota": "Conteo preliminar sobre el texto extraído. El análisis oficial (repeticiones y coincidencias) es el de memoQ."}


# ----------------------------------------------------------------------------- días hábiles
def sumar_habiles(desde: date, dias: int) -> date:
    """La fecha que resulta de trabajar `dias` días hábiles empezando el día hábil siguiente a `desde`."""
    actual = desde
    while dias > 0:
        actual += timedelta(days=1)
        if actual.weekday() < 5:
            dias -= 1
    return actual


def habiles_entre(desde: date, hasta: date) -> int:
    """Días hábiles disponibles después de `desde` y hasta `hasta` inclusive."""
    if hasta <= desde:
        return 0
    return sum(1 for i in range(1, (hasta - desde).days + 1) if (desde + timedelta(days=i)).weekday() < 5)


# ----------------------------------------------------------------------------- plazo
def estimar(volumen: Optional[dict], servicio: Optional[str], idiomas: int, recibido: Optional[date],
            entrega: Optional[date]) -> Optional[dict]:
    """Plazo estimado en días hábiles y comparación con la fecha pedida. None si faltan datos para estimar."""
    regla = RENDIMIENTO.get(servicio or "")
    if not volumen or not regla or idiomas < 1:
        return None
    if regla["unidad"] == "paginas":
        cantidad = volumen.get("paginas") or 0
        unidad = "páginas"
    else:
        cantidad = volumen.get("palabras") or 0
        unidad = "palabras"
    if cantidad <= 0:
        return None
    pasos, dias = [], 0
    for nombre, por_dia in regla["fases"]:
        d = max(1, math.ceil(cantidad / por_dia))
        pasos.append(f"{nombre}: {cantidad:,} {unidad} ÷ {por_dia:,} por día = {d} {'día' if d == 1 else 'días'}".replace(",", "."))
        dias += d
    for nombre, d in regla.get("extra", []):
        pasos.append(f"{nombre}: {d} {'día' if d == 1 else 'días'}")
        dias += d
    esfuerzo = dias * idiomas
    resultado = {
        "servicio": servicio, "idiomas": idiomas, "dias_habiles": dias, "esfuerzo_dias_persona": esfuerzo,
        "pasos": pasos, "supuesto": regla["supuesto"],
        "entrega_estimada": None, "plazo_cliente_dias_habiles": None, "holgura_dias": None, "semaforo": "sin_fecha",
    }
    if recibido:
        resultado["entrega_estimada"] = sumar_habiles(recibido, dias).isoformat()
    if recibido and entrega:
        disponibles = habiles_entre(recibido, entrega)
        holgura = disponibles - dias
        resultado.update({"plazo_cliente_dias_habiles": disponibles, "holgura_dias": holgura,
                          "semaforo": "alcanza" if holgura >= 2 else "ajustado" if holgura >= 0 else "no_alcanza"})
    return resultado


def fecha(valor: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(valor)[:10])
    except (TypeError, ValueError):
        return None


# ----------------------------------------------------------------------------- el borrador que edita el PM
def estimar_borrador(cuerpo: Any) -> dict:
    """Recalcula volumen y plazo con los valores que el PM tiene en pantalla.

    Si el correo es de la bandeja, el volumen y la fecha de recepción salen del servidor (message_id); si se pegó,
    se usan los números que devolvió /api/intake. Lanza ErrorContrato si no hay con qué estimar.
    """
    from contrato import ErrorContrato, normalizar_estimacion, normalizar_volumen
    from datos import BANDEJA_POR_ID

    if not isinstance(cuerpo, dict):
        raise ErrorContrato("validacion", "Faltan los datos para estimar.", 400, "cuerpo vacío")
    correo = BANDEJA_POR_ID.get(str(cuerpo.get("message_id") or ""))
    if correo:
        volumen, recibido = volumen_de_adjuntos(correo["adjuntos"]), fecha(correo["fecha"])
    else:
        palabras = cuerpo.get("palabras")
        paginas = cuerpo.get("paginas")
        if not isinstance(palabras, int) or isinstance(palabras, bool) or not 0 <= palabras <= 5_000_000:
            raise ErrorContrato("validacion", "Faltan las palabras del documento.", 400, "palabras inválidas")
        volumen = {"palabras": palabras, "paginas": paginas if isinstance(paginas, int) and paginas > 0 else None, "archivos": []}
        recibido = fecha(cuerpo.get("fecha_correo"))
    destinos = cuerpo.get("targetLanguage") or []
    if isinstance(destinos, str):
        destinos = [x for x in re.split(r"[,;\s]+", destinos) if x]
    idiomas = len([d for d in destinos if isinstance(d, str) and d.strip()][:20])
    plazo = estimar(volumen, cuerpo.get("service"), idiomas, recibido, fecha(cuerpo.get("deliveryDeadline")))
    return {"ok": True, "volumen": normalizar_volumen(volumen), "estimacion": normalizar_estimacion(plazo)}
