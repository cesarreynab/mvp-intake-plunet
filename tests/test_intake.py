"""Reglas del workflow (validar y derivar) con el modelo simulado. Cero llamadas a OpenRouter."""
import asyncio

import openai
import pytest

import intake
from casos import EXTRACCIONES, P1, P2, P3, P4, ExtractorSimulado
from contrato import ErrorContrato
from datos import SolicitudTraduccion


def correr(mensaje):
    return asyncio.run(intake.ejecutar_intake(mensaje))


def test_p1_camino_feliz(modelo_simulado):
    r = correr(P1)
    assert r["estado"] == "pendiente_revision"
    c = r["campos"]
    assert c["cliente_id"] == "PHX-0148"
    assert c["idioma_origen"] == "en"
    assert c["idiomas_destino"] == ["es-MX", "pt-BR"]
    assert c["tipo_documento"] == "consentimiento_informado"
    assert c["servicio"] == "traduccion_back_translation"
    assert c["deadline_solicitado"] == "2026-09-22"
    # PharmaXYZ tiene dos contratos activos: el contrato no se adivina
    assert c["contrato_id"] is None and "contrato_id" in r["campos_baja_confianza"]
    assert r["request_plunet"]["customerID"] == "PHX-0148"
    assert r["request_plunet"]["targetLanguage (por item)"] == ["es-MX", "pt-BR"]
    assert r["escrituras_plunet"] == 0
    assert r["archivos"] == [{"nombre": "ICF_PX4471_EN.pdf", "detalle": "14 páginas, PDF nativo"}]
    assert [p["nombre"] for p in r["pasos"]] == ["extraer", "validar", "derivar"]
    assert r["llamadas_modelo"] == 1


def test_p2_no_deduce_idiomas_ni_fecha(modelo_simulado):
    r = correr(P2)
    assert r["campos"]["idiomas_destino"] == []
    assert r["campos"]["deadline_solicitado"] is None
    assert {"idiomas_destino", "deadline_solicitado"} <= set(r["campos_baja_confianza"])
    assert r["estado"] in ("pendiente_revision", "cola_manual")
    assert r["score_global"] == 0.64


def test_p3_fuera_de_alcance_sin_request(modelo_simulado):
    r = correr(P3)
    assert r["estado"] == "fuera_de_alcance"
    assert r["request_plunet"] is None
    assert r["escrituras_plunet"] == 0


def test_p4_gmail_no_asigna_cliente_por_razon_social(modelo_simulado):
    r = correr(P4)
    assert r["campos"]["cliente_id"] is None
    assert "cliente_id" in r["campos_baja_confianza"]
    assert "MDL-0310" in r["alerta"] and "dominio público" in r["alerta"]
    assert r["confianza_por_campo"]["cliente_id"] < 0.75


def _extraccion_con(**cambios):
    base = EXTRACCIONES[P1].model_dump()
    base.update(cambios)
    return SolicitudTraduccion(**base)


def test_cita_inventada_deja_el_campo_en_null(monkeypatch):
    evidencia = [e for e in EXTRACCIONES[P1].model_dump()["evidencia"] if e["campo"] != "servicio"]
    evidencia.append({"campo": "servicio", "fuente": "correo", "fragmento": "servicio de DTP completo", "confianza": 0.99})
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado({P1: _extraccion_con(servicio="dtp", evidencia=evidencia)}))
    r = correr(P1)
    assert r["campos"]["servicio"] is None
    assert "servicio" in r["campos_baja_confianza"]
    assert all(e["campo"] != "servicio" for e in r["evidencia"])


def test_confianza_bajo_umbral_deja_el_campo_en_null(monkeypatch):
    evidencia = EXTRACCIONES[P1].model_dump()["evidencia"]
    for e in evidencia:
        if e["campo"] == "tipo_documento":
            e["confianza"] = 0.6
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado({P1: _extraccion_con(evidencia=evidencia)}))
    r = correr(P1)
    assert r["campos"]["tipo_documento"] is None
    assert "tipo_documento" in r["campos_baja_confianza"]


def test_deadline_anterior_al_correo_se_descarta(monkeypatch):
    evidencia = EXTRACCIONES[P1].model_dump()["evidencia"]
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado({P1: _extraccion_con(deadline_solicitado="2026-09-01", evidencia=evidencia)}))
    assert correr(P1)["campos"]["deadline_solicitado"] is None


def test_score_bajo_va_a_cola_manual(monkeypatch):
    vacia = SolicitudTraduccion(es_solicitud_nueva=True, evidencia=[])
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado({P1: vacia}))
    r = correr(P1)
    assert r["estado"] == "cola_manual"
    assert r["request_plunet"] is None


@pytest.mark.parametrize("valor,con_region,esperado", [
    ("es-MX", True, "es-MX"), ("ES_mx", True, "es-MX"), ("pt-br", True, "pt-BR"), ("fr", True, "fr"),
    ("es-MX", False, "es"), ("xx", True, None), ("español", True, None), (None, True, None),
])
def test_normalizar_idioma(valor, con_region, esperado):
    assert intake.normalizar_idioma(valor, con_region) == esperado


def test_reintenta_una_vez_ante_503(monkeypatch):
    simulado = ExtractorSimulado(fallas=[ValueError("Error code: 503 - provider overloaded")])
    monkeypatch.setattr(intake, "_extractor", simulado)
    monkeypatch.setattr(intake, "PAUSA_503_S", 0)
    r = correr(P1)
    assert r["estado"] == "pendiente_revision"
    assert r["llamadas_modelo"] == 2


@pytest.mark.parametrize("campo,valor", [("tipo_documento", "modificacion_proyecto"), ("tipo_documento", ""),
                                         ("servicio", "interpretacion"), ("servicio", None)])
def test_valor_fuera_del_enum_queda_en_null(campo, valor):
    s = SolicitudTraduccion(es_solicitud_nueva=False, **{campo: valor})
    assert getattr(s, campo) is None


def test_valor_del_enum_se_conserva():
    s = SolicitudTraduccion(es_solicitud_nueva=True, tipo_documento="etiquetado", servicio="dtp")
    assert (s.tipo_documento, s.servicio) == ("etiquetado", "dtp")


def test_salida_fuera_de_esquema_se_reintenta_una_vez(monkeypatch):
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado(fuera_de_esquema=1))
    r = correr(P1)
    assert r["estado"] == "pendiente_revision"
    assert r["llamadas_modelo"] == 2
    assert "reintento" in r["pasos"][0]["detalle"]


def test_salida_fuera_de_esquema_dos_veces_da_error_claro(monkeypatch):
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado(fuera_de_esquema=2))
    with pytest.raises(ErrorContrato) as e:
        correr(P1)
    assert e.value.codigo == "backend" and e.value.reintentable
    assert e.value.detalle.startswith("es_solicitud_nueva")   # dice qué campo falló, sin copiar el valor
    assert "tal vez" not in e.value.detalle


def test_429_se_traduce_a_cuota_ia(monkeypatch):
    respuesta = type("R", (), {"status_code": 429, "headers": {}, "request": None})()
    error = openai.RateLimitError("rate limit", response=respuesta, body=None)
    monkeypatch.setattr(intake, "_extractor", ExtractorSimulado(fallas=[error]))
    with pytest.raises(ErrorContrato) as e:
        correr(P1)
    assert e.value.codigo == "cuota_ia"
