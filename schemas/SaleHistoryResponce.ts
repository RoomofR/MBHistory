import { z } from "zod";

// ItemEntry schema
export const ItemEntrySchema = z.object({
    itemID: z.number(),
    lastUploadTime: z.number(),
    entries: z.any(), //todo any
    regionName: z.string(),
    stackSizeHistogram: z.any(),
    stackSizeHistogramNQ: z.any(), //todo any
    stackSizeHistogramHQ: z.any(), //todo any
    regularSaleVelocity: z.number(),
    nqSaleVelocity: z.number(),
    hqSaleVelocity: z.number(),
});

// SaleHistoryResponse schema
export const SaleHistoryResponseSchema = z.object({
    itemIDs: z.array(z.number()),
    items: z.record(z.string(),ItemEntrySchema),
});

// Infer TS types directly from schema
export type ItemEntry = z.infer<typeof ItemEntrySchema>;
export type SaleHistoryResponse = z.infer<typeof SaleHistoryResponseSchema>;
