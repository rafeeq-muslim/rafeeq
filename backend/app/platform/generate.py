"""PLT-02 rule 3: every account field can be generated at random.

Display names are neutral, nature-inspired and carry nothing that reveals
religion, nationality or gender."""

import secrets

_AR = ["نخلة", "غيمة", "نجمة", "قمر", "واحة", "نسيم", "زهرة", "فجر", "ندى", "سنبلة", "نهر", "جبل", "ضياء", "ريحانة", "سحاب", "ربيع"]
_AR_ADJ = ["الهادئ", "المضيء", "البعيد", "الأخضر", "الصافي", "الجميل", "الدافئ", "الرحب"]
_EN = ["River", "Cedar", "Willow", "Harbor", "Meadow", "Falcon", "Breeze", "Summit", "Lantern", "Orchard", "Dune", "Comet"]
_EN_ADJ = ["Calm", "Bright", "Quiet", "Gentle", "Steady", "Kind", "Clear", "Warm"]
_TL = ["Ilog", "Ulap", "Bituin", "Buwan", "Hangin", "Bundok", "Dagat", "Bulaklak", "Liwanag", "Sapa"]
_TL_ADJ = ["Tahimik", "Maliwanag", "Mabait", "Payapa", "Masaya", "Matatag"]

_USER_WORDS = [
    "river",
    "cedar",
    "willow",
    "harbor",
    "meadow",
    "breeze",
    "summit",
    "lantern",
    "orchard",
    "dune",
    "comet",
    "oasis",
    "palm",
    "cloud",
    "star",
    "moon",
    "dawn",
    "spring",
]
_PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def display_name(locale: str) -> str:
    if locale == "ar":
        return f"{secrets.choice(_AR)} {secrets.choice(_AR_ADJ)}"
    if locale == "tl":
        return f"{secrets.choice(_TL_ADJ)} na {secrets.choice(_TL)}"
    return f"{secrets.choice(_EN_ADJ)} {secrets.choice(_EN)}"


def username() -> str:
    return f"{secrets.choice(_USER_WORDS)}-{secrets.choice(_USER_WORDS)}-{secrets.randbelow(9000) + 1000}"


def password() -> str:
    raw = "".join(secrets.choice(_PW_ALPHABET) for _ in range(16))
    return "-".join(raw[i : i + 4] for i in range(0, 16, 4))
