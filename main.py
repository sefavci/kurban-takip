import threading
import time

import webview

from app import create_app


def run_flask():
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)


if __name__ == "__main__":
    t = threading.Thread(target=run_flask, daemon=True)
    t.start()

    time.sleep(0.8)

    webview.create_window(
        "Kurban Kesim ve Hisse Takip Sistemi",
        "http://127.0.0.1:5000",
        width=1280,
        height=800,
    )
    webview.start()
