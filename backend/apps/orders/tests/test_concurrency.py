"""
Concurrency test for assignment section 9: two users must never be able to buy
the same remaining stock.

This uses real threads and real database connections, so it needs PostgreSQL
(SQLite has no row-level locking and the test is skipped there).
"""

import threading
import unittest

from django.db import connection, connections
from django.test import TransactionTestCase

from apps.core.exceptions import InsufficientStock
from apps.core.testing import make_customer, make_product
from apps.orders.models import Order
from apps.orders.services import create_order


@unittest.skipUnless(connection.vendor == "postgresql", "Row-level locking test requires PostgreSQL")
class ConcurrentOrderTests(TransactionTestCase):
    def run_concurrently(self, quantities):
        """Start one thread per quantity, release them at the same instant, collect outcomes."""
        barrier = threading.Barrier(len(quantities))
        outcomes = []
        lock = threading.Lock()

        def worker(qty):
            try:
                barrier.wait()
                create_order(customer=self.customer, items=[{"product": self.product.pk, "quantity": qty}])
                result = ("ok", qty)
            except InsufficientStock:
                result = ("rejected", qty)
            except Exception as exc:  # surface anything unexpected
                result = ("error", repr(exc))
            finally:
                connections.close_all()
            with lock:
                outcomes.append(result)

        threads = [threading.Thread(target=worker, args=(q,)) for q in quantities]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return outcomes

    def setUp(self):
        self.customer = make_customer()

    def test_stock_5_orders_4_and_3_only_one_succeeds(self):
        self.product = make_product(stock=5)
        outcomes = self.run_concurrently([4, 3])

        self.assertNotIn("error", [o[0] for o in outcomes], outcomes)
        self.assertEqual(sorted(o[0] for o in outcomes), ["ok", "rejected"], outcomes)
        self.product.refresh_from_db()
        sold = next(q for status, q in outcomes if status == "ok")
        self.assertEqual(self.product.stock_quantity, 5 - sold)
        self.assertEqual(Order.objects.count(), 1)

    def test_many_buyers_never_oversell(self):
        self.product = make_product(stock=10)
        outcomes = self.run_concurrently([1] * 25)

        self.assertNotIn("error", [o[0] for o in outcomes], outcomes)
        self.assertEqual(sum(1 for o in outcomes if o[0] == "ok"), 10)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 0)
        self.assertEqual(Order.objects.count(), 10)
