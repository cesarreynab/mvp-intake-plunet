"""Conteo de palabras y plazo estimado (estimacion.py). Aritmética pura: sin modelo."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

import app as proxy
from casos import P1, P3
from estimacion import estimar, habiles_entre, sumar_habiles, volumen_de_adjuntos, volumen_de_texto


def test_dias_habiles_saltan_el_fin_de_semana():
    viernes = date(2026, 10, 23)
    assert sumar_habiles(viernes, 1) == date(2026, 10, 26)          # lunes
    assert habiles_entre(viernes, date(2026, 10, 30)) == 5          # lunes a viernes siguientes
    assert habiles_entre(viernes, viernes) == 0


def test_p1_back_translation_queda_ajustado():
    vol = {"palabras": 4820, "paginas": 14}
    e = estimar(vol, "traduccion_back_translation", 2, date(2026, 9, 15), date(2026, 9, 22))
    # 2 días de traducción + 2 de back-translation + 1 de conciliación; el cliente da 5 días hábiles
    assert (e["dias_habiles"], e["plazo_cliente_dias_habiles"], e["holgura_dias"], e["semaforo"]) == (5, 5, 0, "ajustado")
    assert e["esfuerzo_dias_persona"] == 10          # dos idiomas en paralelo
    assert e["entrega_estimada"] == "2026-09-22"


@pytest.mark.parametrize("servicio,palabras,paginas,dias", [
    ("traduccion", 14350, 48, 7), ("revision", 960, None, 1), ("dtp", 4820, 14, 2), ("traduccion", 62, 1, 2),
])
def test_rendimientos(servicio, palabras, paginas, dias):
    e = estimar({"palabras": palabras, "paginas": paginas}, servicio, 1, date(2026, 10, 26), None)
    assert e["dias_habiles"] == dias and e["semaforo"] == "sin_fecha"


def test_no_estima_sin_servicio_idiomas_o_volumen():
    vol = {"palabras": 1000, "paginas": 4}
    assert estimar(vol, None, 1, None, None) is None
    assert estimar(vol, "traduccion", 0, None, None) is None
    assert estimar(None, "traduccion", 1, None, None) is None
    assert estimar({"palabras": 500, "paginas": None}, "dtp", 1, None, None) is None   # DTP necesita páginas


def test_no_alcanza():
    e = estimar({"palabras": 20000, "paginas": 60}, "traduccion", 1, date(2026, 10, 26), date(2026, 10, 28))
    assert e["semaforo"] == "no_alcanza" and e["holgura_dias"] < 0


def test_volumen_de_texto_pegado_usa_paginas_si_no_hay_palabras():
    v = volumen_de_texto(P1)
    assert v["palabras"] == 14 * 250 and "estimado" in v["archivos"][0]["fuente"]
    assert volumen_de_texto(P3) is None                       # sin adjuntos
    v = volumen_de_texto("De: a@b.com\nFecha: 2026-10-26 10:00\n\nHola\n\n--- Adjunto: x.docx (3.200 palabras) ---\n[p.1] Hola")
    assert v["palabras"] == 3200 and v["archivos"][0]["fuente"] == "palabras declaradas en el adjunto"


def test_volumen_de_la_bandeja_usa_el_conteo_del_extractor():
    v = volumen_de_adjuntos([{"nombre": "a.pdf", "detalle": "14 páginas, PDF nativo", "palabras": 4820}])
    assert (v["palabras"], v["paginas"]) == (4820, 14)


@pytest.fixture
def cliente(monkeypatch, modelo_simulado):
    monkeypatch.setenv("OPENROUTER_API_KEY", "clave-de-prueba")
    monkeypatch.delenv("ACCESS_CODE", raising=False)
    proxy._visitas.clear()
    return TestClient(proxy.app)


def test_intake_trae_volumen_estimacion_y_wordcount(cliente):
    d = cliente.post("/api/intake", json={"message_id": "msg-20260915-0912-phx"}).json()
    assert d["volumen"]["palabras"] == 4820 and d["request_plunet"]["wordCount"] == 4820
    assert d["estimacion"]["semaforo"] == "ajustado" and d["fecha_correo"] == "2026-09-15"


def test_reestimar_cuando_el_pm_cambia_el_servicio(cliente, modelo_simulado):
    cuerpo = {"message_id": "msg-20260915-0912-phx", "service": "traduccion", "targetLanguage": ["es-MX", "pt-BR"],
              "deliveryDeadline": "2026-09-22"}
    d = cliente.post("/api/estimacion", json=cuerpo).json()
    assert d["estimacion"]["dias_habiles"] == 3 and d["estimacion"]["semaforo"] == "alcanza"
    assert modelo_simulado.llamadas == 0


def test_reestimar_correo_pegado_con_sus_numeros(cliente):
    cuerpo = {"palabras": 6000, "fecha_correo": "2026-10-26", "service": "revision", "targetLanguage": "fr", "deliveryDeadline": "2026-10-27"}
    assert cliente.post("/api/estimacion", json=cuerpo).json()["estimacion"]["semaforo"] == "ajustado"
    assert cliente.post("/api/estimacion", json={"service": "revision"}).status_code == 400


def test_request_creado_guarda_wordcount_y_plazo(cliente):
    borrador = {"customerID": "PHX-0148", "contrato": "CTR-2026-031", "sourceLanguage": "en", "targetLanguage": ["es-MX", "pt-BR"],
                "service": "traduccion_back_translation", "subject": "consentimiento_informado", "deliveryDeadline": "2026-09-22"}
    d = cliente.post("/api/plunet/requests", json={"message_id": "msg-20260915-0912-phx", "request": borrador}).json()
    assert d["request"]["wordCount"] == 4820 and d["estimacion"]["dias_habiles"] == 5
