"""Shared constants of the Cove Sports Park (docs/sports/MASTER_PLAN.md § 6 and § 8).

Owned by the core session (build_sports_site.py). Venue build scripts (build_sports_<id>*.py) import it read-only:
a footprint, a door stub or a material setting changes only through MASTER_PLAN.md and this file.
Game space: x east, z south (north = -Z), y up, metres. Rectangles are (minX, maxX, minZ, maxZ).
"""
import lib_common as L

FOOTPRINTS = {
    "sports_gym": (-467.0, -404.0, -231.0, -191.0),
    "sports_pool": (-537.0, -481.0, -233.0, -191.0),
    "sports_ice_rink": (-562.0, -481.0, -301.0, -250.0),
    "sports_boxing": (-398.0, -368.0, -240.0, -216.0),
    "sports_climbing": (-580.0, -543.0, -216.0, -191.0),
    "sports_dance": (-398.0, -372.0, -210.0, -191.0),
    "sports_tennis": (-467.0, -420.0, -293.0, -250.0),
    "sports_petanque": (-414.0, -386.0, -275.0, -250.0),
    "sports_athletics": (-566.5, -381.5, -420.0, -310.0),
}

DOOR_STUBS = {
    "sports_pool": (-481.0, -478.0, -214.0, -210.0),
    "sports_gym": (-470.0, -467.0, -213.0, -209.0),
    "sports_ice_rink": (-481.0, -478.0, -277.5, -273.5),
    "sports_tennis": (-470.0, -467.0, -273.5, -269.5),
}

Y = {
    "lawn": 0.02,
    "verge": 0.03,
    "asphalt": 0.04,
    "paving": 0.06,
    "plaza": 0.08,
    "walk": 0.12,
    "curb": 0.14,
}


def site_materials():
    """The two ground materials every sports zone lays with the same settings, so the seams at the footprint edges match."""
    return {
        "lawn": L.make_mat("TW_SportsLawn", "#7db45a", 1.0, "noise", 0.06),
        "paving": L.make_mat("TW_SportsPaving", "#cfc8b8", 0.9, "tiles", 0.04, accent="#bdb5a3"),
    }
