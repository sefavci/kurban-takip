from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, render_template, request

from database import KATEGORILER, get_connection, init_db, kategori_fiyat_bul, row_to_dict


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")

    init_db()

    @app.get("/")
    def index():
        return render_template("index.html")

    # -----------------
    # KATEGORILER API
    # -----------------
    @app.get("/api/kategoriler")
    def api_kategoriler():
        return jsonify(KATEGORILER)

    # -----------------
    # KISILER
    # -----------------
    @app.get("/api/kisiler")
    def api_kisiler_list():
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    k.*, 
                    COALESCE(COUNT(ha.atama_id), 0) as hisse_sayisi,
                    COALESCE(SUM(COALESCE(h.toplam_fiyat, 0) / COALESCE(NULLIF(h.hisse_adedi, 0), 1)), 0) as toplam_hisse_bedeli
                FROM kisiler k
                LEFT JOIN hisse_atamalari ha ON ha.kisi_id = k.kisi_id
                LEFT JOIN hayvanlar h ON h.hayvan_id = ha.hayvan_id
                GROUP BY k.kisi_id
                ORDER BY k.kisi_id DESC
                """
            ).fetchall()

        result = []
        for r in rows:
            d = row_to_dict(r)
            hisse_sayisi = int(d.get("hisse_sayisi") or 0)
            toplam_hisse_bedeli = float(d.get("toplam_hisse_bedeli") or 0)
            pesinat = float(d.get("pesinat") or 0)
            toplam_odenen = float(d.get("toplam_odenen") or 0)
            d["kalan_borc"] = round(toplam_hisse_bedeli - (pesinat + toplam_odenen), 2) if hisse_sayisi > 0 else None
            result.append(d)

        return jsonify(result)

    @app.post("/api/kisiler")
    def api_kisi_create():
        data = request.get_json(force=True) or {}
        ad_soyad = (data.get("ad_soyad") or "").strip()
        if not ad_soyad:
            return jsonify({"error": "ad_soyad zorunlu"}), 400

        telefon = (data.get("telefon") or "").strip() or None
        pesinat = float(data.get("pesinat") or 0)
        toplam_odenen = float(data.get("toplam_odenen") or 0)
        vekalet_durumu = int(data.get("vekalet_durumu") or 0)

        kategori_cinsiyet = (data.get("kategori_cinsiyet") or "").strip() or None
        kategori_kg = data.get("kategori_kg")
        kategori_kg = int(kategori_kg) if kategori_kg not in (None, "", 0) else None

        kategori_fiyat = 0
        if kategori_cinsiyet and kategori_kg:
            fiyat = kategori_fiyat_bul(kategori_cinsiyet, kategori_kg)
            if fiyat is not None:
                kategori_fiyat = fiyat

        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO kisiler (ad_soyad, telefon, pesinat, toplam_odenen, vekalet_durumu,
                                     kategori_cinsiyet, kategori_kg, kategori_fiyat)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (ad_soyad, telefon, pesinat, toplam_odenen, vekalet_durumu,
                 kategori_cinsiyet, kategori_kg, kategori_fiyat),
            )
            kisi_id = cur.lastrowid
            row = conn.execute("SELECT * FROM kisiler WHERE kisi_id = ?", (kisi_id,)).fetchone()

        return jsonify(row_to_dict(row)), 201

    @app.put("/api/hayvanlar/<int:hayvan_id>")
    def api_hayvan_update(hayvan_id: int):
        data = request.get_json(force=True) or {}

        with get_connection() as conn:
            existing = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not existing:
                return jsonify({"error": "Hayvan bulunamadı"}), 404

            kupe_no = (data.get("kupe_no") if data.get("kupe_no") is not None else existing["kupe_no"]) or ""
            kupe_no = kupe_no.strip()
            if not kupe_no:
                return jsonify({"error": "kupe_no zorunlu"}), 400

            grup = data.get("grup") if data.get("grup") is not None else existing["grup"]
            grup = (grup or "").strip() or None

            toplam_fiyat_raw = data.get("toplam_fiyat") if data.get("toplam_fiyat") is not None else existing["toplam_fiyat"]
            toplam_fiyat = float(toplam_fiyat_raw) if toplam_fiyat_raw not in (None, "") else None

            kilo_raw = data.get("kilo") if data.get("kilo") is not None else existing["kilo"]
            kilo = float(kilo_raw) if kilo_raw not in (None, "") else None

            hisse_adedi_raw = data.get("hisse_adedi") if data.get("hisse_adedi") is not None else existing["hisse_adedi"]
            hisse_adedi = int(hisse_adedi_raw or 7)
            if hisse_adedi < 1:
                return jsonify({"error": "hisse_adedi 1 veya daha büyük olmalı"}), 400

            conn.execute(
                """
                UPDATE hayvanlar
                SET kupe_no = ?, grup = ?, toplam_fiyat = ?, kilo = ?, hisse_adedi = ?
                WHERE hayvan_id = ?
                """,
                (kupe_no, grup, toplam_fiyat, kilo, hisse_adedi, hayvan_id),
            )
            row = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()

        return jsonify(row_to_dict(row))

    @app.put("/api/kisiler/<int:kisi_id>")
    def api_kisi_update(kisi_id: int):
        data = request.get_json(force=True) or {}

        with get_connection() as conn:
            existing = conn.execute("SELECT * FROM kisiler WHERE kisi_id = ?", (kisi_id,)).fetchone()
            if not existing:
                return jsonify({"error": "Kişi bulunamadı"}), 404

            ad_soyad = (data.get("ad_soyad") if data.get("ad_soyad") is not None else existing["ad_soyad"]).strip()
            if not ad_soyad:
                return jsonify({"error": "ad_soyad zorunlu"}), 400

            telefon_raw = data.get("telefon") if data.get("telefon") is not None else existing["telefon"]
            telefon = (telefon_raw or "").strip() or None

            pesinat = float(data.get("pesinat") if data.get("pesinat") is not None else existing["pesinat"] or 0)
            toplam_odenen = float(
                data.get("toplam_odenen") if data.get("toplam_odenen") is not None else existing["toplam_odenen"] or 0
            )
            vekalet_durumu = int(
                data.get("vekalet_durumu") if data.get("vekalet_durumu") is not None else existing["vekalet_durumu"] or 0
            )

            kategori_cinsiyet = data.get("kategori_cinsiyet") if data.get("kategori_cinsiyet") is not None else existing["kategori_cinsiyet"]
            kategori_cinsiyet = (kategori_cinsiyet or "").strip() or None

            kategori_kg_raw = data.get("kategori_kg") if data.get("kategori_kg") is not None else existing["kategori_kg"]
            kategori_kg = int(kategori_kg_raw) if kategori_kg_raw not in (None, "", 0) else None

            kategori_fiyat = float(existing["kategori_fiyat"] or 0)
            if kategori_cinsiyet and kategori_kg:
                fiyat = kategori_fiyat_bul(kategori_cinsiyet, kategori_kg)
                if fiyat is not None:
                    kategori_fiyat = fiyat

            conn.execute(
                """
                UPDATE kisiler
                SET ad_soyad = ?, telefon = ?, pesinat = ?, toplam_odenen = ?, vekalet_durumu = ?,
                    kategori_cinsiyet = ?, kategori_kg = ?, kategori_fiyat = ?
                WHERE kisi_id = ?
                """,
                (ad_soyad, telefon, pesinat, toplam_odenen, vekalet_durumu,
                 kategori_cinsiyet, kategori_kg, kategori_fiyat, kisi_id),
            )
            row = conn.execute("SELECT * FROM kisiler WHERE kisi_id = ?", (kisi_id,)).fetchone()

        return jsonify(row_to_dict(row))

    @app.delete("/api/kisiler/<int:kisi_id>")
    def api_kisi_delete(kisi_id: int):
        with get_connection() as conn:
            existing = conn.execute("SELECT * FROM kisiler WHERE kisi_id = ?", (kisi_id,)).fetchone()
            if not existing:
                return jsonify({"error": "Kişi bulunamadı"}), 404
            conn.execute("DELETE FROM kisiler WHERE kisi_id = ?", (kisi_id,))
        return jsonify({"ok": True})

    # -----------------
    # HAYVANLAR
    # -----------------
    @app.get("/api/hayvanlar")
    def api_hayvanlar_list():
        with get_connection() as conn:
            rows = conn.execute("SELECT * FROM hayvanlar ORDER BY kesim_sirasi ASC, hayvan_id ASC").fetchall()

            counts = conn.execute(
                """
                SELECT hayvan_id, COUNT(*) as dolu
                FROM hisse_atamalari
                GROUP BY hayvan_id
                """
            ).fetchall()
            dolu_map = {r["hayvan_id"]: r["dolu"] for r in counts}

        result = []
        for r in rows:
            d = row_to_dict(r)
            dolu = int(dolu_map.get(r["hayvan_id"], 0) or 0)
            hisse_adedi = int(r["hisse_adedi"] or 0)
            d["dolu_hisse"] = dolu
            d["bos_hisse"] = max(hisse_adedi - dolu, 0)
            kilo = float(r["kilo"] or 0) if r["kilo"] is not None else None
            d["kisi_basi_et"] = round((kilo / hisse_adedi), 2) if kilo is not None and hisse_adedi else None
            result.append(d)
        return jsonify(result)

    @app.post("/api/hayvanlar")
    def api_hayvan_create():
        data = request.get_json(force=True) or {}
        kupe_no = (data.get("kupe_no") or "").strip()
        if not kupe_no:
            return jsonify({"error": "kupe_no zorunlu"}), 400

        grup = (data.get("grup") or "").strip() or None
        toplam_fiyat = data.get("toplam_fiyat")
        toplam_fiyat = float(toplam_fiyat) if toplam_fiyat not in (None, "") else None
        kilo = data.get("kilo")
        kilo = float(kilo) if kilo not in (None, "") else None
        hisse_adedi = int(data.get("hisse_adedi") or 7)

        with get_connection() as conn:
            max_row = conn.execute("SELECT COALESCE(MAX(kesim_sirasi), 0) as mx FROM hayvanlar").fetchone()
            next_sira = int(max_row["mx"] or 0) + 1

            cur = conn.execute(
                """
                INSERT INTO hayvanlar (kupe_no, grup, toplam_fiyat, kilo, hisse_adedi, kesim_sirasi)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (kupe_no, grup, toplam_fiyat, kilo, hisse_adedi, next_sira),
            )
            hayvan_id = cur.lastrowid
            row = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()

        return jsonify(row_to_dict(row)), 201

    @app.put("/api/hayvanlar/<int:hayvan_id>/sira")
    def api_hayvan_sira_update(hayvan_id: int):
        data = request.get_json(force=True) or {}
        new_sira = data.get("kesim_sirasi")
        if new_sira is None:
            return jsonify({"error": "kesim_sirasi zorunlu"}), 400
        new_sira = int(new_sira)
        if new_sira < 1:
            return jsonify({"error": "kesim_sirasi 1 veya daha büyük olmalı"}), 400

        with get_connection() as conn:
            row = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not row:
                return jsonify({"error": "Hayvan bulunamadı"}), 404

            old_sira = int(row["kesim_sirasi"] or 0)
            if old_sira == 0:
                old_sira = new_sira

            max_row = conn.execute("SELECT COALESCE(MAX(kesim_sirasi), 1) as mx FROM hayvanlar").fetchone()
            mx = int(max_row["mx"] or 1)
            if new_sira > mx:
                new_sira = mx

            if new_sira == old_sira:
                updated = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
                return jsonify(row_to_dict(updated))

            if new_sira < old_sira:
                conn.execute(
                    """
                    UPDATE hayvanlar
                    SET kesim_sirasi = kesim_sirasi + 1
                    WHERE kesim_sirasi >= ? AND kesim_sirasi < ? AND hayvan_id != ?
                    """,
                    (new_sira, old_sira, hayvan_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE hayvanlar
                    SET kesim_sirasi = kesim_sirasi - 1
                    WHERE kesim_sirasi <= ? AND kesim_sirasi > ? AND hayvan_id != ?
                    """,
                    (new_sira, old_sira, hayvan_id),
                )

            conn.execute("UPDATE hayvanlar SET kesim_sirasi = ? WHERE hayvan_id = ?", (new_sira, hayvan_id))
            updated = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()

        return jsonify(row_to_dict(updated))

    @app.post("/api/hayvanlar/<int:hayvan_id>/kesim")
    def api_hayvan_kesim(hayvan_id: int):
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not row:
                return jsonify({"error": "Hayvan bulunamadı"}), 404

            conn.execute(
                """
                UPDATE hayvanlar
                SET kesim_durumu = 1,
                    kesim_saati = CURRENT_TIMESTAMP
                WHERE hayvan_id = ?
                """,
                (hayvan_id,),
            )
            updated = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()

        return jsonify(row_to_dict(updated))

    # -----------------
    # HISSE ATAMALARI
    # -----------------
    @app.get("/api/hayvanlar/<int:hayvan_id>/hissedarlar")
    def api_hissedarlar(hayvan_id: int):
        with get_connection() as conn:
            hayvan = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not hayvan:
                return jsonify({"error": "Hayvan bulunamadı"}), 404

            rows = conn.execute(
                """
                SELECT ha.atama_id, k.*
                FROM hisse_atamalari ha
                JOIN kisiler k ON k.kisi_id = ha.kisi_id
                WHERE ha.hayvan_id = ?
                ORDER BY ha.atama_id ASC
                """,
                (hayvan_id,),
            ).fetchall()

        toplam_fiyat = float(hayvan["toplam_fiyat"] or 0)
        hisse_adedi = int(hayvan["hisse_adedi"] or 1)
        birim = (toplam_fiyat / hisse_adedi) if hisse_adedi else 0

        result = []
        for r in rows:
            pesinat = float(r["pesinat"] or 0)
            toplam_odenen = float(r["toplam_odenen"] or 0)
            kalan = birim - (pesinat + toplam_odenen)
            d = row_to_dict(r)
            d["kalan_borc"] = round(kalan, 2)
            d["birim_hisse_fiyati"] = round(birim, 2)
            result.append(d)

        return jsonify({
            "hayvan": row_to_dict(hayvan),
            "hissedarlar": result,
        })

    @app.post("/api/atama")
    def api_atama_create():
        data = request.get_json(force=True) or {}
        hayvan_id = data.get("hayvan_id")
        kisi_id = data.get("kisi_id")
        if hayvan_id is None or kisi_id is None:
            return jsonify({"error": "hayvan_id ve kisi_id zorunlu"}), 400
        hayvan_id = int(hayvan_id)
        kisi_id = int(kisi_id)

        with get_connection() as conn:
            hayvan = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not hayvan:
                return jsonify({"error": "Hayvan bulunamadı"}), 404
            kisi = conn.execute("SELECT * FROM kisiler WHERE kisi_id = ?", (kisi_id,)).fetchone()
            if not kisi:
                return jsonify({"error": "Kişi bulunamadı"}), 404

            existing = conn.execute(
                "SELECT 1 FROM hisse_atamalari WHERE hayvan_id = ? AND kisi_id = ?",
                (hayvan_id, kisi_id),
            ).fetchone()
            if existing:
                return jsonify({"error": "Bu kişi zaten bu hayvana atanmış"}), 400

            dolu = conn.execute(
                "SELECT COUNT(*) as c FROM hisse_atamalari WHERE hayvan_id = ?",
                (hayvan_id,),
            ).fetchone()["c"]
            kapasite = int(hayvan["hisse_adedi"] or 0)
            if int(dolu or 0) >= kapasite:
                return jsonify({"error": "Hisse kapasitesi dolu"}), 400

            cur = conn.execute(
                "INSERT INTO hisse_atamalari (hayvan_id, kisi_id) VALUES (?, ?)",
                (hayvan_id, kisi_id),
            )
            atama_id = cur.lastrowid

        return jsonify({"atama_id": atama_id, "hayvan_id": hayvan_id, "kisi_id": kisi_id}), 201

    @app.delete("/api/atama/<int:atama_id>")
    def api_atama_delete(atama_id: int):
        with get_connection() as conn:
            existing = conn.execute("SELECT * FROM hisse_atamalari WHERE atama_id = ?", (atama_id,)).fetchone()
            if not existing:
                return jsonify({"error": "Atama bulunamadı"}), 404
            conn.execute("DELETE FROM hisse_atamalari WHERE atama_id = ?", (atama_id,))
        return jsonify({"ok": True})

    # -----------------
    # KONTROL / DASHBOARD
    # -----------------
    @app.get("/api/hayvanlar/<int:hayvan_id>/kesim_kontrol")
    def api_kesim_kontrol(hayvan_id: int):
        with get_connection() as conn:
            hayvan = conn.execute("SELECT * FROM hayvanlar WHERE hayvan_id = ?", (hayvan_id,)).fetchone()
            if not hayvan:
                return jsonify({"error": "Hayvan bulunamadı"}), 404

            rows = conn.execute(
                """
                SELECT ha.atama_id, k.*
                FROM hisse_atamalari ha
                JOIN kisiler k ON k.kisi_id = ha.kisi_id
                WHERE ha.hayvan_id = ? AND COALESCE(k.vekalet_durumu, 0) = 0
                ORDER BY ha.atama_id ASC
                """,
                (hayvan_id,),
            ).fetchall()

        return jsonify({
            "hayvan": row_to_dict(hayvan),
            "eksik_vekalet": [row_to_dict(r) for r in rows],
            "kesime_uygun": len(rows) == 0,
        })

    @app.get("/api/dashboard")
    def api_dashboard():
        with get_connection() as conn:
            toplam_hayvan = conn.execute("SELECT COUNT(*) as c FROM hayvanlar").fetchone()["c"]
            kesilen = conn.execute("SELECT COUNT(*) as c FROM hayvanlar WHERE kesim_durumu = 1").fetchone()["c"]
            kalan = int(toplam_hayvan or 0) - int(kesilen or 0)

            para = conn.execute(
                "SELECT COALESCE(SUM(COALESCE(pesinat,0) + COALESCE(toplam_odenen,0)), 0) as t FROM kisiler"
            ).fetchone()["t"]

            siradaki = conn.execute(
                """
                SELECT * FROM hayvanlar
                WHERE kesim_durumu = 0
                ORDER BY kesim_sirasi ASC, hayvan_id ASC
                LIMIT 1
                """
            ).fetchone()

            hissedar_rows = conn.execute(
                """
                SELECT
                    k.kisi_id as kisi_id,
                    COALESCE(SUM(COALESCE(h.toplam_fiyat, 0) / COALESCE(NULLIF(h.hisse_adedi, 0), 1)), 0) as toplam_hisse_bedeli,
                    COALESCE(k.pesinat, 0) as pesinat,
                    COALESCE(k.toplam_odenen, 0) as toplam_odenen,
                    MAX(CASE WHEN COALESCE(h.kesim_durumu, 0) = 1 THEN 1 ELSE 0 END) as kesilen_mi
                FROM kisiler k
                JOIN hisse_atamalari ha ON ha.kisi_id = k.kisi_id
                JOIN hayvanlar h ON h.hayvan_id = ha.hayvan_id
                GROUP BY k.kisi_id
                """
            ).fetchall()

        toplam_hissedar_ids: List[int] = []
        kesilen_hissedar_ids: List[int] = []
        odemesi_tamamlanan_ids: List[int] = []
        borclu_ids: List[int] = []

        for r in hissedar_rows:
            kisi_id = int(r["kisi_id"])
            toplam_hissedar_ids.append(kisi_id)
            kesilen_mi = int(r["kesilen_mi"] or 0) == 1

            bedel = float(r["toplam_hisse_bedeli"] or 0)
            odenen = float(r["pesinat"] or 0) + float(r["toplam_odenen"] or 0)
            kalan_borc = bedel - odenen

            if kesilen_mi:
                kesilen_hissedar_ids.append(kisi_id)
            if kalan_borc <= 0:
                odemesi_tamamlanan_ids.append(kisi_id)
            else:
                borclu_ids.append(kisi_id)

        return jsonify({
            "toplam_hayvan": int(toplam_hayvan or 0),
            "kesilen": int(kesilen or 0),
            "kalan": int(kalan or 0),
            "toplam_para": float(para or 0),
            "siradaki_hayvan": row_to_dict(siradaki),
            "hissedar_istatistik": {
                "toplam_hissedar": len(toplam_hissedar_ids),
                "kesilen_hissedar": len(kesilen_hissedar_ids),
                "odemesi_tamamlanan": len(odemesi_tamamlanan_ids),
                "borclu": len(borclu_ids),
                "ids": {
                    "toplam_hissedar": toplam_hissedar_ids,
                    "kesilen_hissedar": kesilen_hissedar_ids,
                    "odemesi_tamamlanan": odemesi_tamamlanan_ids,
                    "borclu": borclu_ids,
                },
            },
        })

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
