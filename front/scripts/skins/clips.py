if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

import math
S_ = math.sin

def neon_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    base = 4 + 22 * energy
    P.rx('Cape1', base * 0.5 + 3 * S_(a - 0.2))
    P.rx('Cape2', base * 0.8 + 5 * S_(a - 0.8))
    P.rx('Cape3', base * 1.0 + 7 * S_(a - 1.4))
    P.rx('Sash1', (2 + 10 * energy) + 4 * S_(a - 0.3))
    P.rx('Sash2', (3 + 14 * energy) + 6 * S_(a - 1.0))

def street_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    P.rx('Pend', (-1 if False else 1) * (6 + 28 * energy) * 0.0 + 8 * S_(a - 0.6) * (0.4 + energy))
    P.rx('Head', 2.0 * energy * S_(a * 2))

def oracle_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    base = 3 + 20 * energy
    P.rx('Cape1', base * 0.5 + 3 * S_(a - 0.2))
    P.rx('Cape2', base * 0.8 + 5 * S_(a - 0.8))
    P.rx('Cape3', base * 1.0 + 8 * S_(a - 1.4))
    k = round(speed)
    P.ry('Halo1', 60 * k * ph)
    P.rz('Halo2', 60 * k * ph)
    for i, nm in enumerate(('Orb1', 'Orb2', 'Orb3')):
        P.rz(nm, 360.0 * ph)
        P.move(nm, 0, 0, 0.03 * S_(2 * math.pi * ph * (1 if k == 1 else 1) + i * 2.1))

def make_clips(extras):
    return {
        "Idle": (60, gait_idle(None, extras)),
        "Walk": (30, gait_walk(extras)),
        "Run": (20, gait_run(extras)),
    }
