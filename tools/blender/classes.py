"""Starting-gear designs for each class (the Vanguard has its own script).

Each entry: base body, recolors for the body's own materials, a palette, and
the kit calls that dress it. Palette values are (hex, metalness, roughness, glow).
"""


def M(color, metal=0.0, rough=0.6, glow=False):
    return (color, metal, rough, glow)


BASE = {
    "plate": M("#5a6070", 0.6, 0.4), "dark": M("#22252c", 0.5, 0.5), "trim": M("#c9a45a", 0.8, 0.3),
    "metal": M("#b8bcc6", 0.85, 0.3), "steel": M("#d0d5de", 0.9, 0.22), "glow": M("#ffd27a", glow=True),
    "cloth": M("#6a6a6a", 0.0, 0.85), "leather": M("#5a3d28", 0.0, 0.75), "leather2": M("#3a281a", 0.0, 0.8),
    "bone": M("#e2d6bc", 0.0, 0.55), "fur": M("#c9b48e", 0.0, 0.95), "leaf": M("#5c8f3a", 0.0, 0.65),
    "antler": M("#e2d3b0", 0.0, 0.55), "wood": M("#5a3d24", 0.0, 0.7), "string": M("#e8e0c8", 0.0, 0.6),
    "page": M("#efe4c8", 0.0, 0.8), "sash": M("#8f1d22", 0.0, 0.7), "straw": M("#c9a860", 0.0, 0.85),
}


def channeler(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.pauldrons("crystal", size=1.25, main="plate", alt="dark", trim="trim", lames=1)
    k.belt(main="trim", buckle="metal", gem="glow", sash="dark")
    k.skirt("cloth", trim="trim", length=1.0, flare=1.5)
    k.arms("plate", main="cloth", trim="trim", glove=None, upper=True)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.head("hood", main="cloth", trim="trim", circlet=True)
    k.staff(-1, head="crystal", shaft="wood", metal="trim", accent="glow")


def cleric(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.pauldrons("wing", size=1.25, main="plate", alt="cloth", trim="cloth", lames=1)
    k.belt(main="dark", buckle="trim", gem="glow", sash="cloth")
    k.skirt("cloth", trim="trim", length=1.05, flare=1.7)
    k.tabard("dark", length=0.85, width=0.45, back=False)
    k.arms("plate", main="cloth", trim="trim", glove=None, upper=True)
    k.legs("cloth", main="cloth", trim="trim", boot="plate", knee=False, height=1.0)
    k.head("mitre", main="cloth", trim="trim", accent="glow", halo=True)
    k.staff(-1, head="sun", shaft="wood", metal="trim", accent="glow")


def hexer(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.pauldrons("skull", size=1.35, main="plate", alt="dark", trim="trim", accent="glow", lames=1)
    k.belt(main="dark", buckle="metal", gem="glow")
    k.skirt("cloth", trim="trim", length=1.05, flare=1.75)
    k.arms("plate", main="plate", trim="trim", glove=None, upper=True, fins=2)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.head("horned_hood", main="cloth", trim="trim", accent="glow", eyes=True)
    k.staff(-1, head="skull", shaft="dark", metal="trim", accent="glow")
    k.tome(1, cover="dark", page="page", metal="trim", accent="glow")


def shade(k):
    k.chest("leather", main="leather", trim="metal", collar=True)
    k.pauldrons("dome", size=0.95, spikes=2, main="leather", alt="dark", trim="metal", lames=1)
    k.belt(main="leather2", buckle="metal", gem="glow", sash="sash")
    k.arms("leather", main="leather", trim="metal", glove="dark", upper=False, fins=2)
    k.legs("leather", main="leather", trim="metal", boot="dark", knee=False, height=1.0, cuff=True)
    k.head("cowl", main="cloth", trim="sash", mask=True, mask_mat="cloth", mantle=True)
    k.blade(-1, kind="dagger", metal="steel", grip="leather2", guard="dark", accent="glow")
    k.blade(1, kind="dagger", metal="steel", grip="leather2", guard="dark", accent="glow")


def binder(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.pauldrons("disc", size=1.35, main="plate", trim="dark", accent="glow")
    k.belt(main="dark", buckle="trim", gem="glow", sash="cloth")
    k.skirt("cloth", trim="trim", length=0.95, flare=1.8)
    k.tabard("dark", length=0.7, width=0.45, back=False)
    k.arms("plate", main="dark", trim="trim", glove=None, upper=True)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.head("circlet", trim="trim", accent="glow", halo=True)
    k.orb(-1, core="glow", cage="trim")
    k.tome(1, cover="leather", page="page", metal="trim", accent="glow")


def vow(k):
    k.chest("plate", main="plate", trim="trim", panel="trim")
    k.pauldrons("wing", size=1.3, main="plate", alt="dark", trim="metal", lames=2)
    k.belt(main="dark", buckle="metal", gem="glow")
    k.skirt("cloth", trim="trim", length=0.85, flare=1.6)
    k.arms("plate", main="plate", trim="trim", glove="plate", upper=True)
    k.legs("plate", main="plate", trim="trim", boot="plate", knee=True)
    k.head("circlet", trim="metal", accent="glow")
    k.staff(-1, head="mace", shaft="dark", metal="metal", accent="glow", length=0.42)
    k.shield(1, face="plate", rim="trim", boss="glow", emblem="metal")


def ranger(k):
    k.chest("leather", main="leather", trim="trim")
    k.belly(main="plate", alt="leather2", bands=2)
    k.pauldrons("fur", size=1.05, main="leather")
    k.belt(main="leather2", buckle="trim", gem=None)
    k.tabard("cloth", length=0.75, width=0.55)
    k.arms("leather", main="leather", trim="trim", glove="leather2", upper=True)
    k.legs("leather", main="leather", trim="trim", boot="leather2", knee=True)
    k.head("hood", main="cloth", trim="leather", mantle=True)
    k.bow(1, wood="wood", grip="leather2", string="string", tip="trim")
    k.quiver(body="leather2", trim="trim", fletch="cloth")


def grovekeeper(k):
    k.chest("leather", main="leather", trim="trim")
    k.pauldrons("leaf", size=1.15, main="plate", alt="leather2", trim="trim", lames=1)
    k.belt(main="leather2", buckle="trim", gem="glow", sash="leaf")
    k.tabard("cloth", length=1.0, width=0.6)
    k.arms("wrap", main="leather2", trim="trim", glove="leather2", upper=True)
    k.legs("leather", main="leather", trim="trim", boot="leather2", knee=False, height=0.7, cuff=True)
    k.head("antlers", main="leather", band="leather2")
    k.staff(-1, head="gnarl", shaft="wood", metal="trim", accent="glow")


def warden(k):
    k.chest("lamellar", main="plate", trim="trim")
    k.pauldrons("disc", size=1.2, main="trim", trim="dark", accent="glow")
    k.belt(main="dark", buckle="trim", gem="glow", sash="cloth")
    k.tabard("cloth", length=1.0, width=0.5)
    k.arms("wrap", main="leather2", trim="trim", glove="leather2", upper=True)
    k.legs("cloth", main="leather2", trim="trim", boot="leather", knee=False, height=0.6)
    k.head("kasa", main="straw", trim="trim", accent="glow")
    k.staff(-1, head="jade", shaft="wood", metal="trim", accent="glow")


def duelist(k):
    k.chest("coat", main="cloth", trim="trim")
    k.pauldrons("dome", size=0.6, main="cloth", alt="dark", trim="trim", lames=1)
    k.belt(main="leather", buckle="trim", gem="glow", sash="sash")
    k.cape("cloth", trim="trim", length=0.8, width=0.95)
    k.arms("leather", main="cloth", trim="trim", glove="leather", upper=False)
    k.legs("leather", main="leather2", trim="trim", boot="leather2", knee=False, cuff=True)
    k.head("tricorne", main="dark", trim="trim", accent="sash")
    k.blade(-1, kind="rapier", metal="steel", grip="leather", guard="trim", accent="glow")
    k.blade(1, kind="dagger", metal="steel", grip="leather", guard="trim", accent="glow")


# ---------------------------------------------------------------- level 10 champion sets
# Same bodies, richer silhouettes: crowns, wings, hovering shards, rune bands, and glowing weapons.

def channeler_champion(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.sigil("glow", "trim")
    k.pauldrons("crystal", size=1.45, main="plate", alt="dark", trim="trim", lames=2)
    k.shards("glow", count=3, size=1.45, lift=2.2)
    k.belt(main="trim", buckle="metal", gem="glow", sash="dark")
    k.skirt("cloth", trim="glow", length=1.05, flare=1.7)
    k.cape("dark", trim="trim", length=1.0, width=1.05)
    k.arms("plate", main="cloth", trim="trim", glove=None, upper=True, fins=1)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.bands("glow", legs=False)
    k.head("hood", main="cloth", trim="trim")
    k.crown("trim", "glow", spikes=5, height=1.3, lift=0.75, size=1.2)
    k.staff(-1, head="crystal", shaft="dark", metal="trim", accent="glow", length=0.86, extra="halo")


def cleric_champion(k):
    k.chest("robe", main="cloth", trim="trim", panel="plate")
    k.sigil("glow", "trim")
    k.pauldrons("wing", size=1.4, main="plate", alt="cloth", trim="trim", lames=2)
    k.wings("glow", "trim", span=0.4, feathers=7)
    k.belt(main="plate", buckle="trim", gem="glow", sash="cloth")
    k.skirt("cloth", trim="trim", length=1.08, flare=1.8)
    k.tabard("dark", length=0.95, width=0.45, back=False)
    k.arms("plate", main="cloth", trim="trim", glove=None, upper=True)
    k.legs("cloth", main="cloth", trim="trim", boot="plate", knee=False, height=1.0)
    k.bands("glow", legs=False)
    k.head("mitre", main="cloth", trim="trim", accent="glow", halo=True)
    k.staff(-1, head="sun", shaft="plate", metal="trim", accent="glow", length=0.86, extra="halo")


def hexer_champion(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.sigil("glow", "metal")
    k.pauldrons("skull", size=1.55, spikes=2, main="plate", alt="dark", trim="trim", accent="glow", lames=2)
    k.shards("glow", count=4, size=1.4, lift=2.0)
    k.belt(main="dark", buckle="metal", gem="glow", sash="cloth")
    k.skirt("cloth", trim="glow", length=1.08, flare=1.85)
    k.cape("dark", trim="trim", length=1.0, width=1.1)
    k.arms("plate", main="plate", trim="trim", glove=None, upper=True, fins=3)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.bands("glow", legs=False)
    k.head("horned_hood", main="cloth", trim="trim", accent="glow", eyes=True, horns2=True)
    k.staff(-1, head="skull", shaft="dark", metal="trim", accent="glow", length=0.86, extra="spires")
    k.tome(1, cover="dark", page="glow", metal="trim", accent="glow")


def shade_champion(k):
    k.chest("leather", main="leather", trim="metal", collar=True)
    k.sigil("glow", "metal")
    k.pauldrons("dome", size=1.1, spikes=4, main="leather", alt="dark", trim="metal", lames=2)
    k.belt(main="leather2", buckle="metal", gem="glow", sash="sash")
    k.cape("cloth", trim="glow", length=0.75, width=0.9)
    k.arms("leather", main="leather", trim="metal", glove="dark", upper=True, fins=3)
    k.legs("leather", main="leather", trim="metal", boot="dark", knee=True, knee_spike=True, height=1.0, cuff=True)
    k.bands("glow", belt=False)
    k.head("cowl", main="cloth", trim="glow", mask=True, mask_mat="dark", mantle=True, eyes=True)
    k.blade(-1, kind="dagger", metal="edge", grip="leather2", guard="dark", accent="glow")
    k.blade(1, kind="dagger", metal="edge", grip="leather2", guard="dark", accent="glow")


def binder_champion(k):
    k.chest("robe", main="cloth", trim="trim", panel="dark")
    k.sigil("glow", "trim")
    k.pauldrons("disc", size=1.6, main="plate", trim="dark", accent="glow")
    k.shards("glow", count=5, size=1.5, lift=1.9)
    k.belt(main="dark", buckle="trim", gem="glow", sash="cloth")
    k.skirt("cloth", trim="glow", length=1.0, flare=1.9)
    k.tabard("dark", length=0.85, width=0.45, back=False)
    k.cape("dark", trim="trim", length=1.0, width=1.05)
    k.arms("plate", main="dark", trim="trim", glove=None, upper=True)
    k.legs("cloth", main="dark", trim="trim", boot="dark", knee=False, height=1.0)
    k.bands("glow", legs=False)
    k.head("circlet", trim="trim", accent="glow", halo=True)
    k.crown("trim", "glow", spikes=9, height=1.1, lift=0.2, size=1.06, back=True)
    k.orb(-1, core="glow", cage="trim")
    k.orb(1, core="glow", cage="trim")


def vow_champion(k):
    k.chest("plate", main="plate", trim="trim", panel="trim")
    k.sigil("glow", "metal")
    k.pauldrons("wing", size=1.45, main="plate", alt="dark", trim="metal", lames=2)
    k.wings("glow", "metal", span=0.42, feathers=7)
    k.belt(main="dark", buckle="metal", gem="glow")
    k.skirt("cloth", trim="trim", length=0.95, flare=1.7)
    k.arms("plate", main="plate", trim="trim", glove="plate", upper=True, fins=1)
    k.legs("plate", main="plate", trim="trim", boot="plate", knee=True, knee_spike=True)
    k.bands("glow", belt=False)
    k.head("circlet", trim="metal", accent="glow")
    k.crown("metal", "glow", spikes=7, height=1.4, lift=0.15, size=1.05)
    k.staff(-1, head="mace", shaft="dark", metal="metal", accent="glow", length=0.46)
    k.shield(1, face="plate", rim="metal", boss="glow", emblem="glow")


def ranger_champion(k):
    k.chest("leather", main="leather", trim="trim")
    k.sigil("glow", "trim")
    k.belly(main="plate", alt="leather2", bands=3)
    k.pauldrons("fur", size=1.25, main="plate")
    k.pauldrons("dome", size=0.85, spikes=3, main="plate", alt="bone", trim="trim", lames=0)
    k.belt(main="leather2", buckle="trim", gem="glow")
    k.tabard("cloth", length=0.95, width=0.6)
    k.cape("cloth", trim="trim", length=0.9, width=1.0)
    k.arms("leather", main="leather", trim="trim", glove="leather2", upper=True, fins=2)
    k.legs("leather", main="leather", trim="trim", boot="leather2", knee=True, knee_spike=True, thigh="leather2")
    k.bands("glow", belt=False)
    k.head("hood", main="cloth", trim="trim", mantle=True, eyes=True)
    k.bow(1, wood="dark", grip="leather2", string="glow", tip="glow")
    k.quiver(body="leather2", trim="trim", fletch="glow")


def grovekeeper_champion(k):
    k.chest("leather", main="leather", trim="trim")
    k.sigil("glow", "trim")
    k.pauldrons("leaf", size=1.15, main="leaf", alt="plate", trim="trim", lames=2)
    k.shards("glow", count=3, size=1.15, lift=2.0)
    k.belt(main="leather2", buckle="trim", gem="glow", sash="leaf")
    k.tabard("leaf", length=1.1, width=0.65)
    k.cape("leaf", trim="trim", length=1.0, width=1.05)
    k.arms("wrap", main="leather2", trim="trim", glove="leather2", upper=True, fins=2)
    k.legs("leather", main="leather", trim="trim", boot="leather2", knee=True, height=1.0, cuff=True)
    k.bands("glow", belt=False)
    k.head("antlers", main="leather", band="trim")
    k.crown("antler", "glow", spikes=5, height=0.9, lift=0.18, size=1.08)
    k.staff(-1, head="gnarl", shaft="wood", metal="trim", accent="glow", length=0.9, extra="halo")


def warden_champion(k):
    k.chest("lamellar", main="plate", trim="trim")
    k.sigil("glow", "trim")
    k.pauldrons("disc", size=1.25, main="trim", trim="dark", accent="glow")
    k.shards("glow", count=3, size=1.2, lift=1.9)
    k.belt(main="dark", buckle="trim", gem="glow", sash="cloth")
    k.tabard("cloth", length=1.15, width=0.55)
    k.cape("cloth", trim="trim", length=1.0, width=1.0)
    k.arms("wrap", main="leather2", trim="trim", glove="leather2", upper=True)
    k.legs("cloth", main="leather2", trim="trim", boot="leather", knee=False, height=0.8)
    k.bands("glow", belt=False)
    k.head("kasa", main="straw", trim="glow", accent="glow")
    k.staff(-1, head="jade", shaft="dark", metal="trim", accent="glow", length=0.9, extra="halo")


def duelist_champion(k):
    k.chest("coat", main="cloth", trim="trim")
    k.sigil("glow", "trim")
    k.pauldrons("dome", size=0.8, spikes=2, main="cloth", alt="trim", trim="trim", lames=2)
    k.belt(main="leather", buckle="trim", gem="glow", sash="sash")
    k.cape("cloth", trim="glow", length=1.0, width=1.05)
    k.arms("leather", main="cloth", trim="trim", glove="leather", upper=True)
    k.legs("leather", main="leather2", trim="trim", boot="leather2", knee=True, cuff=True)
    k.bands("glow", belt=False)
    k.head("tricorne", main="dark", trim="trim", accent="glow")
    k.blade(-1, kind="rapier", metal="edge", grip="leather", guard="trim", accent="glow")
    k.blade(1, kind="dagger", metal="edge", grip="leather", guard="trim", accent="glow")


CHAMPIONS = {
    "mage": dict(build=channeler_champion,
                 recolor={"Red": "#f2f4ff", "Brown": "#f2f4ff", "LimeGreen": "#16205a", "Gold": "#e8f0ff"},
                 palette={"cloth": M("#f0f2fa", 0, 0.75), "plate": M("#1f2d78", 0.5, 0.35), "dark": M("#121a4a", 0.2, 0.6),
                          "trim": M("#e7eefc", 0.9, 0.2), "glow": M("#5ad8ff", glow=4.0), "metal": M("#9fb4ff", 0.85, 0.25)}),
    "priest": dict(build=cleric_champion,
                   recolor={"Red": "#f0d690", "Brown": "#f0d690", "LimeGreen": "#fffaf0", "Gold": "#f0c050"},
                   palette={"cloth": M("#fbf7ec", 0, 0.75), "plate": M("#e8b840", 0.9, 0.22), "dark": M("#2a4a9a", 0, 0.65),
                            "trim": M("#f4c858", 0.9, 0.22), "glow": M("#fff0b0", glow=4.0)}),
    "warlock": dict(build=hexer_champion,
                    recolor={"Red": "#0c0a10", "Brown": "#0c0a10", "LimeGreen": "#120a1a", "Gold": "#3a8a2a"},
                    palette={"cloth": M("#140c1c", 0, 0.8), "plate": M("#241634", 0.5, 0.4), "dark": M("#08060c", 0.3, 0.55),
                             "trim": M("#5fae3a", 0.7, 0.3), "glow": M("#8cff4a", glow=4.5), "metal": M("#3a2a4a", 0.85, 0.3)}),
    "rogue": dict(build=shade_champion,
                  recolor={"Red": "#0a0a0c", "Brown": "#0a0a0c", "LimeGreen": "#101016", "Gold": "#6a2a9a"},
                  palette={"leather": M("#16161c", 0, 0.65), "leather2": M("#24182c", 0, 0.7), "dark": M("#08080a", 0.3, 0.5),
                           "cloth": M("#121218", 0, 0.8), "metal": M("#b0a0d0", 0.9, 0.22), "glow": M("#b06aff", glow=4.5),
                           "sash": M("#4a1a7a", 0, 0.7), "edge": M("#d8c8ff", glow=1.6)}),
    "binder": dict(build=binder_champion,
                   recolor={"Red": "#1a0e0c", "Brown": "#1a0e0c", "LimeGreen": "#8a1a20", "Gold": "#ffd890"},
                   palette={"cloth": M("#8a1a20", 0, 0.75), "plate": M("#f0c060", 0.9, 0.2), "dark": M("#200a0c", 0.2, 0.6),
                            "trim": M("#ffd27a", 0.9, 0.2), "glow": M("#ff8a2a", glow=4.5)}),
    "vow": dict(build=vow_champion,
                recolor={"Red": "#f4e2b8", "Brown": "#f4e2b8", "LimeGreen": "#fff4f6", "Gold": "#e86a98"},
                palette={"cloth": M("#fff4f6", 0, 0.75), "plate": M("#eef2fa", 0.9, 0.18), "dark": M("#8a2a50", 0.2, 0.55),
                         "trim": M("#e86a98", 0.6, 0.3), "glow": M("#ff9ac8", glow=4.0), "metal": M("#f2d27a", 0.9, 0.2)}),
    "hunter": dict(build=ranger_champion,
                   recolor={"Shirt": "#24402a", "Pants": "#2e2216", "Socks": "#1e160e"},
                   palette={"leather": M("#3e2c1c", 0, 0.7), "leather2": M("#24180e", 0, 0.8), "cloth": M("#24402a", 0, 0.85),
                            "trim": M("#c8963a", 0.85, 0.28), "plate": M("#4a5248", 0.75, 0.32), "fur": M("#e4dccc", 0, 0.95),
                            "dark": M("#1a140e", 0.2, 0.6), "glow": M("#ffb84a", glow=4.0), "bone": M("#efe6cf", 0, 0.5)}),
    "druid": dict(build=grovekeeper_champion,
                  recolor={"Shirt": "#2a5a2a", "Pants": "#3a2814", "Socks": "#2a1e10"},
                  palette={"leather": M("#4a3018", 0, 0.75), "leather2": M("#2a1e10", 0, 0.8), "cloth": M("#2a5a2a", 0, 0.85),
                           "plate": M("#5a3a1e", 0, 0.8), "trim": M("#d0a848", 0.85, 0.3), "leaf": M("#3f9a3a", 0, 0.6),
                           "antler": M("#f0e6c8", 0, 0.5), "glow": M("#9aff6a", glow=4.5)}),
    "warden": dict(build=warden_champion,
                   recolor={"Shirt": "#1e5a52", "Pants": "#ece2c4", "Socks": "#ece2c4"},
                   palette={"cloth": M("#1e5a52", 0, 0.75), "plate": M("#1e6a5e", 0.4, 0.4), "trim": M("#e0b04a", 0.9, 0.22),
                            "dark": M("#0e2a26", 0.2, 0.55), "glow": M("#6affd8", glow=4.5), "leather2": M("#f4ecd4", 0, 0.8),
                            "straw": M("#e0c070", 0, 0.75)}),
    "duelist": dict(build=duelist_champion,
                    recolor={"Shirt": "#f4efe6", "Pants": "#121a30", "Socks": "#121a30"},
                    palette={"cloth": M("#121a38", 0, 0.7), "trim": M("#f0cc70", 0.9, 0.2), "dark": M("#0a0e1e", 0.2, 0.55),
                             "leather": M("#2a1e18", 0, 0.65), "leather2": M("#1a120e", 0, 0.7), "glow": M("#7fb0ff", glow=4.5),
                             "sash": M("#3a5adf", 0, 0.65), "edge": M("#d8e6ff", glow=1.6)}),
}


SETS = {
    "mage": dict(body="woman", build=channeler,
                 recolor={"Skin": "#efc8aa", "Red": "#e6e2ee", "Brown": "#e6e2ee", "LimeGreen": "#2c3f8a", "Gold": "#d8dff0"},
                 palette={"cloth": M("#2c3f8a", 0, 0.8), "plate": M("#3b4f9e", 0.4, 0.45), "dark": M("#1b2450", 0.1, 0.7),
                          "trim": M("#dfe6f5", 0.85, 0.25), "glow": M("#6fd0ff", glow=True), "wood": M("#3a2a4a", 0, 0.6)}),
    "priest": dict(body="woman", build=cleric,
                   recolor={"Skin": "#f2d2b8", "Red": "#d9b070", "Brown": "#d9b070", "LimeGreen": "#f4efe4", "Gold": "#d7a945"},
                   palette={"cloth": M("#f1ece0", 0, 0.8), "plate": M("#d7a945", 0.85, 0.3), "dark": M("#3a5a9a", 0, 0.7),
                            "trim": M("#e0b450", 0.85, 0.28), "glow": M("#ffe39a", glow=True), "wood": M("#e8e0cc", 0, 0.6)}),
    "warlock": dict(body="woman", build=hexer,
                    recolor={"Skin": "#c8b4a8", "Red": "#141018", "Brown": "#141018", "LimeGreen": "#2a1838", "Gold": "#6a3a8a"},
                    palette={"cloth": M("#2a1838", 0, 0.8), "plate": M("#3a2450", 0.4, 0.45), "dark": M("#140c1c", 0.2, 0.6),
                             "trim": M("#9a6ac0", 0.7, 0.3), "glow": M("#8cff4a", glow=True), "metal": M("#5a4a6a", 0.8, 0.35)}),
    "rogue": dict(body="woman", build=shade,
                  recolor={"Skin": "#e0b898", "Red": "#141210", "Brown": "#141210", "LimeGreen": "#1e1f24", "Gold": "#8f1d22"},
                  palette={"leather": M("#2a2a31", 0, 0.7), "leather2": M("#3a2a20", 0, 0.75), "dark": M("#121316", 0.2, 0.6),
                           "cloth": M("#1a1b20", 0, 0.85), "metal": M("#8e96a3", 0.85, 0.3), "glow": M("#7dff6a", glow=True)}),
    "binder": dict(body="woman", build=binder,
                   recolor={"Skin": "#c99878", "Red": "#241816", "Brown": "#241816", "LimeGreen": "#6e2430", "Gold": "#e8d0a0"},
                   palette={"cloth": M("#6e2430", 0, 0.8), "plate": M("#d9b56a", 0.85, 0.28), "dark": M("#2a1418", 0.1, 0.7),
                            "trim": M("#e8c878", 0.85, 0.25), "glow": M("#ff9a4a", glow=True), "leather": M("#3a1e1a", 0, 0.75)}),
    "vow": dict(body="woman", build=vow,
                recolor={"Skin": "#f3d2bc", "Red": "#e8d9b0", "Brown": "#e8d9b0", "LimeGreen": "#f4ecee", "Gold": "#c45a78"},
                palette={"cloth": M("#f4ecee", 0, 0.8), "plate": M("#cfd5e0", 0.8, 0.28), "dark": M("#7a3048", 0.1, 0.65),
                         "trim": M("#c45a78", 0.5, 0.35), "glow": M("#ffc0d8", glow=True), "metal": M("#e0c87a", 0.85, 0.28)}),
    "hunter": dict(body="man", build=ranger,
                   recolor={"Shirt": "#3d6b35", "Pants": "#4a3624", "Hair": "#3a2818", "Socks": "#2a1e14", "Skin": "#c9a27c"},
                   palette={"leather": M("#6b4a2c", 0, 0.72), "leather2": M("#3e2a1a", 0, 0.8), "cloth": M("#3d6b35", 0, 0.85),
                            "trim": M("#a07a3a", 0.8, 0.32), "plate": M("#6a6f62", 0.7, 0.4), "fur": M("#cbb89a", 0, 0.95)}),
    "druid": dict(body="man", build=grovekeeper,
                  recolor={"Shirt": "#3e6a34", "Pants": "#4a3420", "Hair": "#6a3a22", "Socks": "#3a2a18", "Skin": "#b88a64"},
                  palette={"leather": M("#5a3d24", 0, 0.75), "leather2": M("#3a2a18", 0, 0.8), "cloth": M("#3e6a34", 0, 0.85),
                           "plate": M("#6a4a2c", 0, 0.8), "trim": M("#a8873a", 0.75, 0.35), "glow": M("#b6ff7a", glow=True)}),
    "warden": dict(body="man", build=warden,
                   recolor={"Shirt": "#2f7a6e", "Pants": "#d9cfb2", "Hair": "#2a1e18", "Socks": "#d9cfb2", "Skin": "#c9a27c"},
                   palette={"cloth": M("#2f7a6e", 0, 0.8), "plate": M("#2f7a6e", 0.3, 0.5), "trim": M("#b07a3a", 0.8, 0.32),
                            "dark": M("#1e3a36", 0.1, 0.6), "glow": M("#8fffe0", glow=True), "leather2": M("#e8e0c8", 0, 0.85)}),
    "duelist": dict(body="man", build=duelist,
                    recolor={"Shirt": "#e8e2d6", "Pants": "#2a3144", "Hair": "#2a2420", "Socks": "#2a2420", "Skin": "#d9b08c"},
                    palette={"cloth": M("#24365c", 0, 0.75), "trim": M("#d2b26a", 0.85, 0.28), "dark": M("#1a2238", 0.1, 0.6),
                             "leather": M("#3a2a22", 0, 0.7), "leather2": M("#2a1e18", 0, 0.75), "glow": M("#9fb8ff", glow=True),
                             "sash": M("#7f9cff", 0, 0.7)}),
}
