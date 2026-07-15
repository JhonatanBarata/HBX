import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeVendasBoardForClient } from "./vendas-types.ts";

test("sanitizador remove Radar sem prova antes do state e preserva manual", () => {
  const board = {
    summary: { total: 3, today: 3, overdue: 0, scheduled: 0, closed: 0 },
    blocks: {
      today: [
        { id: "manual", sourceType: "manual", name: "Manual", phone: "11900000000" },
        { id: "legacy", sourceHistoryId: "radar:pool-1", name: "Vaza", phone: "11999999999" },
        {
          id: "paid",
          sourceType: "webscraping",
          radarOrigin: true,
          contactAccessGranted: true,
          name: "Pago",
          phone: "11888888888",
        },
      ],
      overdue: [],
      scheduled: [],
      closed: [],
    },
  };

  const safe = sanitizeVendasBoardForClient(board)!;
  assert.deepEqual(safe.blocks.today.map(row => row.id), ["manual", "paid"]);
  assert.equal(safe.summary.total, 2);
  assert.equal(JSON.stringify(safe).includes("11999999999"), false);
});
