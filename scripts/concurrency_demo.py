"""
Concurrency demo for assignment section 9.

Two users try to buy the same remaining stock at the same instant:
    stock = 5, User A (admin) orders 4, User B (staff) orders 3.
Exactly one order must succeed; the other is rejected with 409.

Uses only the Python standard library, so it runs anywhere with Python 3.8+:

    python scripts/concurrency_demo.py                         # against the live demo
    python scripts/concurrency_demo.py http://localhost:8000   # against a local backend

Each run creates one real order (orders are immutable) on a dedicated
"Concurrency Demo Item" product, which is set back to inactive afterwards.
"""

import json
import sys
import threading
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://bms.52-62-250-109.sslip.io").rstrip("/") + "/api"
DEMO_SKU = "CONC-DEMO"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def login(username, password):
    status, body = call("POST", "/auth/login", {"username": username, "password": password})
    if status != 200:
        sys.exit(f"Login failed for {username}: {status} {body}")
    return body["access"]


def main():
    print(f"Target: {BASE}\n")
    admin = login("admin", "Admin@12345")
    staff = login("staff", "Staff@12345")

    # A dedicated product, so real catalogue stock is never touched.
    found = call("GET", f"/products/?search={DEMO_SKU}", token=admin)[1]["results"]
    if found:
        product = found[0]
    else:
        category = call("GET", "/categories/", token=admin)[1][0]["id"]
        product = call("POST", "/products/", {"name": "Concurrency Demo Item", "sku": DEMO_SKU, "category": category,
                                              "price": "100.00", "stock_quantity": 5}, token=admin)[1]
    call("PATCH", f"/products/{product['id']}/", {"stock_quantity": 5, "status": "active"}, token=admin)
    customer = call("GET", "/customers/?status=active&page_size=1", token=admin)[1]["results"][0]

    print("Available stock = 5")
    print("User A (admin) orders 4  |  User B (staff) orders 3  -> sent at the same instant\n")

    barrier = threading.Barrier(2)
    results = {}

    def buyer(label, token, qty):
        barrier.wait()  # release both requests together
        results[label] = call("POST", "/orders/", {"customer": customer["id"],
                                                   "items": [{"product": product["id"], "quantity": qty}]}, token=token)

    threads = [threading.Thread(target=buyer, args=("User A", admin, 4)),
               threading.Thread(target=buyer, args=("User B", staff, 3))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    for label in ("User A", "User B"):
        status, body = results[label]
        outcome = f"order {body['order_number']} created" if status == 201 else body.get("detail")
        print(f"  {label}: HTTP {status} - {outcome}")

    final = call("GET", f"/products/{product['id']}/", token=admin)[1]["stock_quantity"]
    succeeded = sum(1 for s, _ in results.values() if s == 201)
    print(f"\nFinal stock = {final}")
    print("PASS: exactly one order succeeded and stock never went negative."
          if succeeded == 1 and final >= 0 else "FAIL: unexpected result!")

    # Keep the demo product out of the order screen until the next run.
    call("PATCH", f"/products/{product['id']}/", {"status": "inactive"}, token=admin)


if __name__ == "__main__":
    main()
