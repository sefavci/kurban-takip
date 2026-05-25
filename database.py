import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "kurban_takip.db"

KATEGORILER = {
    "erkek": [
        {"agirlik": 33, "fiyat": 29000},
        {"agirlik": 40, "fiyat": 34000},
        {"agirlik": 45, "fiyat": 38000},
        {"agirlik": 50, "fiyat": 42000},
        {"agirlik": 60, "fiyat": 50000},
    ],
    "disi": [
        {"agirlik": 36, "fiyat": 30000},
    ],
}


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS kisiler (
                kisi_id INTEGER PRIMARY KEY AUTOINCREMENT,
                ad_soyad TEXT NOT NULL,
                telefon TEXT,
                pesinat REAL DEFAULT 0,
                toplam_odenen REAL DEFAULT 0,
                vekalet_durumu INTEGER DEFAULT 0,
                kategori_cinsiyet TEXT,
                kategori_kg INTEGER,
                kategori_fiyat REAL DEFAULT 0
            )
            """
        )

        cols = conn.execute("PRAGMA table_info(kisiler)").fetchall()
        col_names = {c["name"] for c in cols}
        if "kategori_cinsiyet" not in col_names:
            conn.execute("ALTER TABLE kisiler ADD COLUMN kategori_cinsiyet TEXT")
        if "kategori_kg" not in col_names:
            conn.execute("ALTER TABLE kisiler ADD COLUMN kategori_kg INTEGER")
        if "kategori_fiyat" not in col_names:
            conn.execute("ALTER TABLE kisiler ADD COLUMN kategori_fiyat REAL DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hayvanlar (
                hayvan_id INTEGER PRIMARY KEY AUTOINCREMENT,
                kupe_no TEXT NOT NULL,
                grup TEXT,
                toplam_fiyat REAL,
                kilo REAL,
                hisse_adedi INTEGER DEFAULT 7,
                kesim_sirasi INTEGER,
                kesim_durumu INTEGER DEFAULT 0,
                kesim_saati TIMESTAMP
            )
            """
        )

        cols = conn.execute("PRAGMA table_info(hayvanlar)").fetchall()
        col_names = {c["name"] for c in cols}
        if "kilo" not in col_names:
            conn.execute("ALTER TABLE hayvanlar ADD COLUMN kilo REAL")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hisse_atamalari (
                atama_id INTEGER PRIMARY KEY AUTOINCREMENT,
                hayvan_id INTEGER,
                kisi_id INTEGER,
                FOREIGN KEY (hayvan_id) REFERENCES hayvanlar(hayvan_id) ON DELETE CASCADE,
                FOREIGN KEY (kisi_id) REFERENCES kisiler(kisi_id) ON DELETE CASCADE
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS odemeler (
                odeme_id INTEGER PRIMARY KEY AUTOINCREMENT,
                kisi_id INTEGER NOT NULL,
                tutar REAL NOT NULL DEFAULT 0,
                tarih TEXT,
                aciklama TEXT,
                FOREIGN KEY (kisi_id) REFERENCES kisiler(kisi_id) ON DELETE CASCADE
            )
            """
        )


def kategori_fiyat_bul(cinsiyet, agirlik_kg):
    """Verilen cinsiyet ve agirlik kategorisine gore fiyati dondur."""
    kategoriler = KATEGORILER.get(cinsiyet, [])
    for kat in kategoriler:
        if kat["agirlik"] == agirlik_kg:
            return kat["fiyat"]
    return None


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)
