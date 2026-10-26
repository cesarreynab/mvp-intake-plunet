"""El proxy (app.py) y el contrato, con el modelo simulado. Cero llamadas a OpenRouter."""
import pytest
from fastapi.testclient import TestClient

import app as proxy
import intake
from casos import P1, P3


@pytest.fixture
def cliente(monkeypatch, modelo_simulado):
    monkeypatch.setenv("OPENROUTER_API_KEY", "clave-de-prueba")
    monkeypatch.delenv("ACCESS_CODE", raising=False)
    proxy._visitas.clear()
    return TestClient(proxy.app)


def test_health_no_revela_secretos(cliente):
    d = cliente.get("/api/health").json()
    assert d == {"ok": True, "version": "1.0-plunet", "backend": "langchain", "ruta": "B",
                 "configurado": True, "requiere_codigo": False}


def test_sin_clave_responde_sin_configurar(cliente, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY")
    r = cliente.post("/api/intake", json={"mensaje": P1})
    assert r.status_code == 503 and r.json()["error"]["codigo"] == "sin_configurar"


def test_p1_respeta_el_contrato(cliente):
    r = cliente.post("/api/intake", json={"mensaje": P1})
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True and d["estado"] == "pendiente_revision"
    assert set(d) == {"ok", "message_id", "fecha_correo", "estado", "razon", "alerta", "score_global", "campos", "confianza_por_campo",
                      "campos_baja_confianza", "evidencia", "archivos", "volumen", "estimacion", "request_plunet", "escrituras_plunet",
                      "pasos", "meta"}
    assert d["escrituras_plunet"] == 0
    assert d["meta"]["version"] == "1.0-plunet" and d["meta"]["ruta"] == "B"
    assert d["meta"]["llamadas_modelo"] == 1 and isinstance(d["meta"]["latencia_ms"], int)


def test_p3_no_trae_request(cliente):
    d = cliente.post("/api/intake", json={"mensaje": P3}).json()
    assert d["estado"] == "fuera_de_alcance" and d["request_plunet"] is None


@pytest.mark.parametrize("cuerpo", [{"mensaje": "hola"}, {"mensaje": "x" * 6001}, {"texto": P1}, {"mensaje": 123}])
def test_validacion_corta_antes_del_modelo(cliente, cuerpo, modelo_simulado):
    r = cliente.post("/api/intake", json=cuerpo)
    assert r.status_code == 400 and r.json()["error"]["codigo"] == "validacion"
    assert modelo_simulado.llamadas == 0


def test_codigo_de_acceso(cliente, monkeypatch, modelo_simulado):
    monkeypatch.setenv("ACCESS_CODE", "secreto-demo")
    assert cliente.get("/api/health").json()["requiere_codigo"] is True
    r = cliente.post("/api/intake", json={"mensaje": P1}, headers={"x-access-code": "otro"})
    assert r.status_code == 401 and r.json()["error"]["codigo"] == "acceso"
    assert modelo_simulado.llamadas == 0
    r = cliente.post("/api/intake", json={"mensaje": P1}, headers={"x-access-code": "secreto-demo"})
    assert r.status_code == 200


def test_limite_por_minuto(cliente, monkeypatch):
    monkeypatch.setattr(proxy, "MAX_POR_MINUTO", 2)
    estados = [cliente.post("/api/intake", json={"mensaje": P3}).status_code for _ in range(3)]
    assert estados == [200, 200, 429]


def test_salida_invalida_del_backend(cliente, monkeypatch):
    async def roto(*_):
        return {"estado": "aprobado_y_cargado"}
    monkeypatch.setattr(intake, "ejecutar_intake", roto)
    r = cliente.post("/api/intake", json={"mensaje": P1})
    assert r.status_code == 502 and r.json()["error"]["codigo"] == "respuesta_invalida"


def test_el_contrato_nunca_reporta_escrituras(cliente, monkeypatch):
    original = intake.ejecutar_intake

    async def mentiroso(*args):
        r = await original(*args)
        return {**r, "escrituras_plunet": 5}
    monkeypatch.setattr(intake, "ejecutar_intake", mentiroso)
    assert cliente.post("/api/intake", json={"mensaje": P1}).json()["escrituras_plunet"] == 0


def test_error_no_expone_traceback(cliente, monkeypatch):
    async def explota(*_):
        raise RuntimeError("detalle interno con sk-or-secreto")
    monkeypatch.setattr(intake, "ejecutar_intake", explota)
    r = cliente.post("/api/intake", json={"mensaje": P1})
    assert r.status_code == 500
    assert "sk-or" not in r.text and "Traceback" not in r.text


def test_bandeja_lista_correos_y_clientes(cliente):
    d = cliente.get("/api/bandeja").json()
    assert d["ok"] and d["buzon"] == "projects@lilt.com"
    assert len(d["correos"]) == 9 and {"id", "de", "asunto", "cuerpo", "adjuntos"} <= set(d["correos"][0])
    assert {c["cliente_id"] for c in d["clientes"]} >= {"PHX-0148", "MDL-0310"}


def test_intake_por_message_id(cliente):
    r = cliente.post("/api/intake", json={"message_id": "msg-20260915-0912-phx"})
    d = r.json()
    assert r.status_code == 200 and d["message_id"] == "msg-20260915-0912-phx"
    assert d["campos"]["cliente_id"] == "PHX-0148"


def test_intake_message_id_desconocido_no_llama_al_modelo(cliente, modelo_simulado):
    r = cliente.post("/api/intake", json={"message_id": "msg-no-existe"})
    assert r.status_code == 404 and r.json()["error"]["codigo"] == "validacion"
    assert modelo_simulado.llamadas == 0
    assert cliente.post("/api/intake", json={"message_id": "../../etc"}).status_code == 400


def test_intake_pegado_no_trae_message_id(cliente):
    assert cliente.post("/api/intake", json={"mensaje": P1}).json()["message_id"] is None


BORRADOR = {"customerID": "MDL-0310", "contrato": "CTR-2026-022", "sourceLanguage": "es", "targetLanguage": ["pt-BR"],
            "service": "revision", "subject": "etiquetado", "deliveryDeadline": "2026-10-30", "briefDescription": None}


def test_crear_request_en_sandbox(cliente, modelo_simulado):
    r = cliente.post("/api/plunet/requests", json={"message_id": "msg-20261026-1015-mdl", "request": BORRADOR})
    d = r.json()
    assert r.status_code == 201 and d["estado"] == "creado_sandbox" and d["request_id"].startswith("R-")
    assert d["request"]["targetLanguage"] == ["pt-BR"] and d["message_id"] == "msg-20261026-1015-mdl"
    assert modelo_simulado.llamadas == 0   # confirmar no usa el modelo


@pytest.mark.parametrize("cambio,campo", [
    ({"customerID": "XXX-0000"}, "customerID"), ({"contrato": "CTR-2026-009"}, "contrato"),
    ({"targetLanguage": []}, "targetLanguage"), ({"targetLanguage": ["es"]}, "targetLanguage"),
    ({"service": "cotizar"}, "service"), ({"subject": None}, "subject"), ({"deliveryDeadline": "30/10/2026"}, "deliveryDeadline"),
])
def test_crear_request_valida_cada_campo(cliente, cambio, campo):
    r = cliente.post("/api/plunet/requests", json={"request": {**BORRADOR, **cambio}})
    assert r.status_code == 400 and campo in r.json()["error"]["detalle"]


def test_crear_request_respeta_el_codigo_de_acceso(cliente, monkeypatch):
    monkeypatch.setenv("ACCESS_CODE", "secreto-demo")
    assert cliente.post("/api/plunet/requests", json={"request": BORRADOR}).status_code == 401
