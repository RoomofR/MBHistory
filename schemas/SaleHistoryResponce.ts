import { z } from "zod";

// entries of each sale of the item
export const SaleHistoryEntrySchema = z.object({
  hq: z.boolean(),
  pricePerUnit: z.number(),
  quantity: z.number(),
  buyerName: z.string(),
  onMannequin: z.boolean(),
  timestamp: z.number(),   // API gives UNIX seconds
  worldName: z.string(),
  worldID: z.number(),
});

// entries of each item in the main history responce
export const ItemEntrySchema = z.object({
    itemID: z.number(),
    lastUploadTime: z.number(),
    entries: z.array(SaleHistoryEntrySchema),
    regionName: z.string(),
    stackSizeHistogram: z.any(),
    stackSizeHistogramNQ: z.any(), //todo any
    stackSizeHistogramHQ: z.any(), //todo any
    regularSaleVelocity: z.number(),
    nqSaleVelocity: z.number(),
    hqSaleVelocity: z.number(),
});

// Main responce of sale history query from univeralis api
export const SaleHistoryResponseSchema = z.union([
    //Multiple items response
    z.object({
        itemIDs: z.array(z.number()),
        items: z.record(z.string(),ItemEntrySchema),
    }),

    //Single item response
    z.object({
        itemIDs: z.array(z.number()).optional(),
        items: ItemEntrySchema
    })
]).transform((data) => {
    if("itemID" in data.items){ //if single entry transform
        const entry = data.items;
        return {
            itemIDs: [entry.itemID],
            items: {[String(entry.itemID)]: entry},
        }
    }

    return {
        itemIDs: data.itemIDs,
        items: Object.fromEntries(
            Object.entries(data.items).map(([k, v]) => [String(k), v])
        ),
    }
});

/* const SingleItemSaleHistoryResponce = ItemEntrySchema;

const MultiItemSaleHistoryResponse= z.object({
    itemIDs: z.array(z.number()),
    items: z.record(z.string(),ItemEntrySchema),
});

export const UnionSaleHistoryResponseSchema = z.union([
    SingleItemSaleHistoryResponce,
    MultiItemSaleHistoryResponse
]) */

// Infer TS types directly from schema
export type ItemEntry = z.infer<typeof ItemEntrySchema>;
export type SaleHistoryResponse = z.infer<typeof SaleHistoryResponseSchema>;
export type SaleHistoryEntry = z.infer<typeof SaleHistoryEntrySchema>;
