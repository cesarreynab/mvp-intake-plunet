import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import intake  # noqa: E402
from casos import ExtractorSimulado  # noqa: E402


@pytest.fixture
def modelo_simulado(monkeypatch):
    """Reemplaza el modelo por la extracción guardada: las pruebas no gastan cuota ni necesitan clave."""
    simulado = ExtractorSimulado()
    monkeypatch.setattr(intake, "_extractor", simulado)
    monkeypatch.setattr(intake, "PAUSA_503_S", 0)
    return simulado


class _RespaldoQueDelegaAlPrincipal:
    """El modelo de respaldo, en pruebas: responde lo mismo que el simulado principal vigente. Nunca toca la red."""

    async def ainvoke(self, mensajes):
        return await intake._extractor.ainvoke(mensajes)


@pytest.fixture(autouse=True)
def respaldo_simulado(monkeypatch):
    monkeypatch.setattr(intake, "_extractores_respaldo", {"respaldo/simulado": _RespaldoQueDelegaAlPrincipal()})
    monkeypatch.setattr(intake, "MODELOS_RESPALDO", ["respaldo/simulado"])
