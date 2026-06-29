#!/usr/bin/env python3
"""
Voice Feminizer — alterador de voz em tempo real
=====================================================
INSTALAR (uma vez):
    pip install sounddevice numpy scipy

RODAR:
    python voice_fem.py

AJUSTE FINO (edite as constantes abaixo):
    SEMITONES  — semitons pra cima (3 = suave, 4-5 = feminino, 6 = bem agudo)
    BRIGHTNESS — quanto enfatizar frequências altas (0.0 = desligado, 0.4 = padrão)
    GAIN       — volume de saída (1.0 = normal)

DICA (Discord/Meet/Teams):
    Instale o VB-Audio Virtual Cable (gratuito), defina CABLE Input como
    saída deste script e CABLE Output como microfone no app de chamada.
"""

import numpy as np
import sounddevice as sd
from scipy import signal as sg
import sys
import time

# ── Parâmetros ──────────────────────────────────────────────────────────────
SEMITONES   = 4      # 3–6 recomendado para voz feminina
BRIGHTNESS  = 0.35   # blend de brilho nas altas frequências (0.0 – 1.0)
GAIN        = 1.0    # ganho de saída
SAMPLE_RATE = 44100
BLOCK       = 2048   # menor = menos latência, mais CPU; maior = ao contrário
# ───────────────────────────────────────────────────────────────────────────

FACTOR = 2.0 ** (SEMITONES / 12.0)

# Filtro high-shelf para brilho (enfatiza 2kHz+)
_b, _a = sg.butter(2, 2000 / (SAMPLE_RATE / 2), btype='high')
_zi    = sg.lfilter_zi(_b, _a).copy()


def pitch_shift(frame: np.ndarray, factor: float) -> np.ndarray:
    """
    Pitch shift via interpolação + recorte.
    Comprime o frame (pitch sobe) e reaproveita o tamanho original.
    """
    n      = len(frame)
    n_comp = max(1, int(n / factor))
    xi     = np.linspace(0, n - 1, n_comp)
    comp   = np.interp(xi, np.arange(n), frame)
    out    = np.zeros(n, dtype=np.float32)
    # overlap-add simples: cola o começo do próximo frame no final
    take = min(n_comp, n)
    out[:take] = comp[:take]
    return out


def callback(indata, outdata, frames, time_info, status):
    global _zi
    if status:
        print(status, file=sys.stderr)

    mono = indata[:, 0].astype(np.float64)

    # 1. Pitch shift
    shifted = pitch_shift(mono, FACTOR).astype(np.float64)

    # 2. Camada de brilho (high-shelf)
    bright, _zi = sg.lfilter(_b, _a, shifted, zi=_zi)

    # 3. Mix e ganho
    result = ((1.0 - BRIGHTNESS) * shifted + BRIGHTNESS * bright) * GAIN

    # Clip suave para evitar distorção
    result = np.clip(result, -1.0, 1.0).astype(np.float32)

    outdata[:, 0] = result
    if outdata.shape[1] == 2:
        outdata[:, 1] = result


def list_devices():
    devs = sd.query_devices()
    ins, outs = [], []
    for i, d in enumerate(devs):
        if d['max_input_channels'] > 0:
            ins.append((i, d['name']))
        if d['max_output_channels'] > 0:
            outs.append((i, d['name']))
    return ins, outs


def choose_device(devs, label):
    if len(devs) == 1:
        return devs[0][0]
    print(f"\n{label}:")
    for i, (idx, name) in enumerate(devs):
        print(f"  [{i}] {name}")
    while True:
        try:
            choice = int(input(f"Escolha (Enter = 0): ") or "0")
            if 0 <= choice < len(devs):
                return devs[choice][0]
        except (ValueError, EOFError):
            return devs[0][0]


def main():
    print("=" * 52)
    print("   VOICE FEMINIZER — tempo real")
    print(f"   Pitch: +{SEMITONES} semitons  |  Brilho: {int(BRIGHTNESS*100)}%")
    print("=" * 52)

    ins, outs = list_devices()

    in_dev  = choose_device(ins,  "Microfone (entrada)")
    out_dev = choose_device(outs, "Saída de áudio (fone/VB-Cable)")

    print(f"\nUsando:\n  Entrada → {sd.query_devices(in_dev)['name']}")
    print(f"  Saída   → {sd.query_devices(out_dev)['name']}\n")

    try:
        with sd.Stream(
            samplerate=SAMPLE_RATE,
            blocksize=BLOCK,
            channels=(1, 2),
            dtype='float32',
            device=(in_dev, out_dev),
            callback=callback,
            latency='low',
        ):
            print("Ativo! Fale no microfone.  (Ctrl+C para sair)\n")
            while True:
                time.sleep(0.5)

    except KeyboardInterrupt:
        print("\nEncerrado.")
    except Exception as e:
        print(f"\nErro: {e}")
        print("Verifique se o dispositivo está disponível e tente novamente.")
        sys.exit(1)


if __name__ == '__main__':
    main()
